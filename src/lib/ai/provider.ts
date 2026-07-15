import "server-only";

import { createHash } from "node:crypto";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  Output,
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
  type LanguageModelUsage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import {
  classifyProviderError,
  estimateRunCost,
  estimateTextTokens,
  inspectPromptForGuardrails,
  redactSensitiveText,
  type ClassifiedProviderError,
} from "@/lib/ai/guardrails";
import { governedStructuredOutputSchema, type GovernedStructuredOutput } from "@/lib/ai/schemas";
import { recordAuditEvent } from "@/lib/audit";
import { publicEnv, type AiProvider, getAiEnv } from "@/lib/env";

type ProviderRoute = {
  label: "primary" | "fallback";
  provider: AiProvider;
  modelId: string;
  model: LanguageModel | null;
};

export type AiModelSelectionSetting = {
  roleKey?: string;
  taskType?: string;
  primaryProvider?: AiProvider;
  primaryModel?: string;
  fallbackProvider?: AiProvider;
  fallbackModel?: string;
  maxSteps?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  confidenceThreshold?: number;
  maxCostUsd?: number;
};

export type AiRuntimeAuditContext = {
  organisationId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  actorId?: string | null;
  roleKey?: string;
  taskType?: string;
};

export type AiProviderAttempt = {
  route: "primary" | "fallback";
  provider: AiProvider;
  modelId: string;
  status: "skipped" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  finishReason?: string;
  error?: ClassifiedProviderError;
  usage?: Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens">;
};

export type AiRuntimeAuditRecord<TOutput> = {
  eventType: "ai.run.completed" | "ai.run.blocked" | "ai.run.failed" | "ai.run.escalated";
  promptHash: string;
  redactedPrompt: string;
  redactedSystem?: string;
  output: TOutput | null;
  riskFlags: Array<{ code: string; severity: string; message: string }>;
  toolCalls: Array<{ toolName: string; callId: string }>;
  providerAttempts: AiProviderAttempt[];
  selectedRoute?: "primary" | "fallback";
  tokenUsage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens">;
  latencyMs: number;
  costUsd: number;
  confidence: number | null;
  escalationRequired: boolean;
  escalationReason: string | null;
  modelSelection: {
    roleKey: string;
    taskType: string;
    primaryProvider: AiProvider;
    primaryModel: string;
    fallbackProvider: AiProvider;
    fallbackModel: string;
    maxSteps: number;
    timeoutMs: number;
    maxOutputTokens: number;
    confidenceThreshold: number;
    maxCostUsd: number;
  };
};

export type AiRuntimeResult<TOutput> = {
  status: "completed" | "blocked" | "failed" | "escalated" | "demo";
  output: TOutput | null;
  auditRecord: AiRuntimeAuditRecord<TOutput>;
  persistedAuditEvent: Awaited<ReturnType<typeof recordAuditEvent>> | null;
};

export type RunGovernedAiGenerationInput<TOutput> = {
  roleKey: string;
  taskType: string;
  prompt: string;
  system?: string;
  outputSchema: z.ZodType<TOutput>;
  outputName?: string;
  outputDescription?: string;
  demoOutput?: TOutput;
  modelSelectionSettings?: AiModelSelectionSetting[];
  auditContext?: AiRuntimeAuditContext;
  persistAudit?: boolean;
};

function createProviderModel(provider: AiProvider, modelId: string, env = getAiEnv()): LanguageModel | null {
  if (provider === "google") {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return null;
    }

    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }).languageModel(modelId);
  }

  if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_BASE_URL || !env.OPENROUTER_PROVIDER_NAME) {
    return null;
  }

  return createOpenAICompatible({
    name: env.OPENROUTER_PROVIDER_NAME,
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
  }).languageModel(modelId);
}

function selectModelSetting(input: {
  roleKey: string;
  taskType: string;
  settings?: AiModelSelectionSetting[];
}) {
  return input.settings?.find((setting) => {
    const roleMatches = !setting.roleKey || setting.roleKey === input.roleKey;
    const taskMatches = !setting.taskType || setting.taskType === input.taskType;

    return roleMatches && taskMatches;
  });
}

function buildRoutes(input: Pick<RunGovernedAiGenerationInput<unknown>, "roleKey" | "taskType" | "modelSelectionSettings">) {
  const env = getAiEnv();
  const selected = selectModelSetting(input);
  const primaryProvider = selected?.primaryProvider ?? env.AI_PRIMARY_PROVIDER;
  const fallbackProvider = selected?.fallbackProvider ?? env.AI_FALLBACK_PROVIDER;
  const primaryModel = selected?.primaryModel ?? env.AI_PRIMARY_MODEL;
  const fallbackModel = selected?.fallbackModel ?? env.AI_FALLBACK_MODEL;

  return {
    config: {
      roleKey: input.roleKey,
      taskType: input.taskType,
      primaryProvider,
      primaryModel,
      fallbackProvider,
      fallbackModel,
      maxSteps: selected?.maxSteps ?? env.AI_DEFAULT_MAX_STEPS,
      timeoutMs: selected?.timeoutMs ?? env.AI_DEFAULT_TIMEOUT_MS,
      maxOutputTokens: selected?.maxOutputTokens ?? env.AI_DEFAULT_MAX_OUTPUT_TOKENS,
      confidenceThreshold: selected?.confidenceThreshold ?? env.AI_CONFIDENCE_THRESHOLD,
      maxCostUsd: selected?.maxCostUsd ?? env.AI_MAX_COST_PER_RUN_USD,
      inputTokenPricePerThousand: env.AI_COST_PER_1K_INPUT_TOKENS_USD,
      outputTokenPricePerThousand: env.AI_COST_PER_1K_OUTPUT_TOKENS_USD,
    },
    routes: [
      {
        label: "primary" as const,
        provider: primaryProvider,
        modelId: primaryModel,
        model: createProviderModel(primaryProvider, primaryModel, env),
      },
      {
        label: "fallback" as const,
        provider: fallbackProvider,
        modelId: fallbackModel,
        model: createProviderModel(fallbackProvider, fallbackModel, env),
      },
    ],
  };
}

function getUsageSummary(usage?: LanguageModelUsage) {
  return {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
  };
}

function hashPrompt(prompt: string, system?: string) {
  return createHash("sha256").update(`${system ?? ""}\n${prompt}`).digest("hex");
}

function emptyUsage(): Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens"> {
  return { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined };
}

function makeAuditRecord<TOutput>(input: {
  eventType: AiRuntimeAuditRecord<TOutput>["eventType"];
  prompt: string;
  system?: string;
  output: TOutput | null;
  attempts: AiProviderAttempt[];
  selectedRoute?: "primary" | "fallback";
  riskFlags: AiRuntimeAuditRecord<TOutput>["riskFlags"];
  tokenUsage?: Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens">;
  latencyMs: number;
  costUsd: number;
  confidence: number | null;
  escalationRequired: boolean;
  escalationReason: string | null;
  modelSelection: AiRuntimeAuditRecord<TOutput>["modelSelection"];
}): AiRuntimeAuditRecord<TOutput> {
  return {
    eventType: input.eventType,
    promptHash: hashPrompt(input.prompt, input.system),
    redactedPrompt: redactSensitiveText(input.prompt),
    redactedSystem: input.system ? redactSensitiveText(input.system) : undefined,
    output: input.output,
    riskFlags: input.riskFlags,
    toolCalls: [],
    providerAttempts: input.attempts,
    selectedRoute: input.selectedRoute,
    tokenUsage: input.tokenUsage ?? emptyUsage(),
    latencyMs: input.latencyMs,
    costUsd: input.costUsd,
    confidence: input.confidence,
    escalationRequired: input.escalationRequired,
    escalationReason: input.escalationReason,
    modelSelection: input.modelSelection,
  };
}

async function persistAiAudit<TOutput>(input: {
  auditRecord: AiRuntimeAuditRecord<TOutput>;
  auditContext?: AiRuntimeAuditContext;
}) {
  return recordAuditEvent({
    organisationId: input.auditContext?.organisationId ?? null,
    actorType: "agent_runtime",
    actorId: input.auditContext?.actorId ?? input.auditContext?.agentId ?? null,
    eventType: input.auditRecord.eventType,
    entityType: input.auditContext?.taskId ? "task" : "ai_run",
    entityId: input.auditContext?.taskId ?? null,
    summary:
      input.auditRecord.eventType === "ai.run.completed"
        ? "Governed AI run completed with validated structured output."
        : input.auditRecord.escalationReason ?? "Governed AI run did not complete automatically.",
    details: input.auditRecord as unknown as Record<string, unknown>,
  });
}

async function attemptStructuredGeneration<TOutput>(input: {
  route: ProviderRoute;
  prompt: string;
  system?: string;
  outputSchema: z.ZodType<TOutput>;
  outputName?: string;
  outputDescription?: string;
  maxSteps: number;
  timeoutMs: number;
  maxOutputTokens: number;
}) {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  if (!input.route.model) {
    const finished = Date.now();

    return {
      attempt: {
        route: input.route.label,
        provider: input.route.provider,
        modelId: input.route.modelId,
        status: "skipped",
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        latencyMs: finished - started,
        error: {
          category: "authentication",
          retryable: true,
          safeMessage: "The provider route is not configured with server-side credentials.",
        },
      } satisfies AiProviderAttempt,
      output: null,
      usage: undefined,
      toolCalls: [],
    };
  }

  try {
    const result = await generateText({
      model: input.route.model,
      system: input.system,
      prompt: input.prompt,
      output: Output.object({
        schema: input.outputSchema,
        name: input.outputName ?? "staffer_structured_output",
        description: input.outputDescription ?? "Validated Staffer runtime output.",
      }),
      maxRetries: 0,
      maxOutputTokens: input.maxOutputTokens,
      timeout: { totalMs: input.timeoutMs },
      stopWhen: stepCountIs(input.maxSteps),
    });
    const finished = Date.now();
    const parsedOutput = input.outputSchema.parse(result.output);

    return {
      attempt: {
        route: input.route.label,
        provider: input.route.provider,
        modelId: input.route.modelId,
        status: "succeeded",
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        latencyMs: finished - started,
        finishReason: result.finishReason,
        usage: getUsageSummary(result.totalUsage),
      } satisfies AiProviderAttempt,
      output: parsedOutput,
      usage: result.totalUsage,
      toolCalls: result.toolCalls.map((toolCall) => ({
        toolName: toolCall.toolName,
        callId: toolCall.toolCallId,
      })),
    };
  } catch (error) {
    const finished = Date.now();

    return {
      attempt: {
        route: input.route.label,
        provider: input.route.provider,
        modelId: input.route.modelId,
        status: "failed",
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        latencyMs: finished - started,
        error: classifyProviderError(error),
      } satisfies AiProviderAttempt,
      output: null,
      usage: undefined,
      toolCalls: [],
    };
  }
}

export function getConfiguredModels() {
  const { config, routes } = buildRoutes({ roleKey: "default", taskType: "default" });

  return {
    primary: routes[0]?.model ?? null,
    fallback: routes[1]?.model ?? null,
    configuration: {
      primaryProvider: config.primaryProvider,
      fallbackProvider: config.fallbackProvider,
      primaryModel: config.primaryModel,
      fallbackModel: config.fallbackModel,
      maxSteps: config.maxSteps,
      timeoutMs: config.timeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      confidenceThreshold: config.confidenceThreshold,
      maxCostUsd: config.maxCostUsd,
    },
  };
}

export function createBoundedToolLoopAgent<TOOLS extends ToolSet>(input: {
  id: string;
  roleKey: string;
  taskType: string;
  instructions: string;
  tools?: TOOLS;
  modelSelectionSettings?: AiModelSelectionSetting[];
}) {
  const { config, routes } = buildRoutes(input);
  const primaryRoute = routes[0];

  if (!primaryRoute?.model) {
    throw new Error("Cannot create ToolLoopAgent because the primary model route is not configured.");
  }

  return new ToolLoopAgent({
    id: input.id,
    model: primaryRoute.model,
    instructions: input.instructions,
    tools: input.tools,
    stopWhen: stepCountIs(config.maxSteps),
    timeout: { totalMs: config.timeoutMs },
    maxOutputTokens: config.maxOutputTokens,
  });
}

export async function runGovernedAiGeneration<TOutput>(
  input: RunGovernedAiGenerationInput<TOutput>,
): Promise<AiRuntimeResult<TOutput>> {
  const runStarted = Date.now();
  const guardrailInspection = inspectPromptForGuardrails({ prompt: input.prompt, system: input.system });
  const { config, routes } = buildRoutes(input);
  const modelSelection = {
    roleKey: config.roleKey,
    taskType: config.taskType,
    primaryProvider: config.primaryProvider,
    primaryModel: config.primaryModel,
    fallbackProvider: config.fallbackProvider,
    fallbackModel: config.fallbackModel,
    maxSteps: config.maxSteps,
    timeoutMs: config.timeoutMs,
    maxOutputTokens: config.maxOutputTokens,
    confidenceThreshold: config.confidenceThreshold,
    maxCostUsd: config.maxCostUsd,
  };

  const projectedCost = estimateRunCost({
    inputTokens: estimateTextTokens(`${input.system ?? ""}\n${input.prompt}`),
    outputTokens: config.maxOutputTokens,
    inputTokenPricePerThousand: config.inputTokenPricePerThousand,
    outputTokenPricePerThousand: config.outputTokenPricePerThousand,
  });

  if (guardrailInspection.blocked || projectedCost > config.maxCostUsd) {
    const escalationReason = guardrailInspection.blocked
      ? "Prompt injection or data-exfiltration guardrails blocked the run before provider access."
      : "Projected provider cost exceeds the configured per-run budget.";
    const auditRecord = makeAuditRecord<TOutput>({
      eventType: "ai.run.blocked",
      prompt: input.prompt,
      system: input.system,
      output: null,
      attempts: [],
      riskFlags: guardrailInspection.flags,
      latencyMs: Date.now() - runStarted,
      costUsd: 0,
      confidence: null,
      escalationRequired: true,
      escalationReason,
      modelSelection,
    });
    const persistedAuditEvent = input.persistAudit === false ? null : await persistAiAudit({ auditRecord, auditContext: input.auditContext });

    return { status: "blocked", output: null, auditRecord, persistedAuditEvent };
  }

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    const demoOutput =
      input.demoOutput ??
      (governedStructuredOutputSchema.parse({
        summary: "Demo AI runtime completed with deterministic structured output.",
        decision: "Proceed only after human review confirms the demo result.",
        confidence: config.confidenceThreshold,
        escalationRequired: true,
        escalationReason: "Demo mode always keeps execution behind review before live action.",
        riskFlags: guardrailInspection.flags,
        recommendedActions: [
          {
            title: "Review the generated recommendation",
            ownerRole: input.roleKey,
            requiresApproval: true,
            rationale: "Demo output is useful for workflow verification but must not trigger live external action.",
          },
        ],
        evidence: [
          {
            label: "Runtime mode",
            source: "NEXT_PUBLIC_DEMO_MODE",
            confidence: 1,
          },
        ],
      }) as TOutput);
    const parsedDemoOutput = input.outputSchema.parse(demoOutput);
    const auditRecord = makeAuditRecord({
      eventType: "ai.run.escalated",
      prompt: input.prompt,
      system: input.system,
      output: parsedDemoOutput,
      attempts: [],
      riskFlags: guardrailInspection.flags,
      latencyMs: Date.now() - runStarted,
      costUsd: 0,
      confidence: config.confidenceThreshold,
      escalationRequired: true,
      escalationReason: "Demo mode generated validated output without provider access.",
      modelSelection,
    });
    const persistedAuditEvent = input.persistAudit === false ? null : await persistAiAudit({ auditRecord, auditContext: input.auditContext });

    return { status: "demo", output: parsedDemoOutput, auditRecord, persistedAuditEvent };
  }

  const attempts: AiProviderAttempt[] = [];
  let lastRetryable = true;

  for (const route of routes) {
    if (!lastRetryable) {
      break;
    }

    const result = await attemptStructuredGeneration({
      route,
      prompt: guardrailInspection.redactedPrompt,
      system: guardrailInspection.redactedSystem,
      outputSchema: input.outputSchema,
      outputName: input.outputName,
      outputDescription: input.outputDescription,
      maxSteps: config.maxSteps,
      timeoutMs: config.timeoutMs,
      maxOutputTokens: config.maxOutputTokens,
    });
    attempts.push(result.attempt);

    if (result.output) {
      const outputRecord = result.output as Record<string, unknown>;
      const confidence = typeof outputRecord.confidence === "number" ? outputRecord.confidence : null;
      const costUsd = estimateRunCost({
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        inputTokenPricePerThousand: config.inputTokenPricePerThousand,
        outputTokenPricePerThousand: config.outputTokenPricePerThousand,
      });
      const budgetExceeded = costUsd > config.maxCostUsd;
      const lowConfidence = confidence !== null && confidence < config.confidenceThreshold;
      const escalationRequired = budgetExceeded || lowConfidence || Boolean(outputRecord.escalationRequired);
      const escalationReason =
        (typeof outputRecord.escalationReason === "string" && outputRecord.escalationReason) ||
        (budgetExceeded ? "Observed provider cost exceeds the configured per-run budget." : null) ||
        (lowConfidence ? "Model confidence is below the configured mandatory escalation threshold." : null);
      const eventType = escalationRequired ? "ai.run.escalated" : "ai.run.completed";
      const auditRecord = makeAuditRecord({
        eventType,
        prompt: input.prompt,
        system: input.system,
        output: result.output,
        attempts,
        selectedRoute: route.label,
        riskFlags: guardrailInspection.flags,
        tokenUsage: getUsageSummary(result.usage),
        latencyMs: Date.now() - runStarted,
        costUsd,
        confidence,
        escalationRequired,
        escalationReason,
        modelSelection,
      });
      auditRecord.toolCalls = result.toolCalls;
      const persistedAuditEvent = input.persistAudit === false ? null : await persistAiAudit({ auditRecord, auditContext: input.auditContext });

      return {
        status: escalationRequired ? "escalated" : "completed",
        output: result.output,
        auditRecord,
        persistedAuditEvent,
      };
    }

    lastRetryable = result.attempt.error?.retryable ?? false;
  }

  const auditRecord = makeAuditRecord<TOutput>({
    eventType: "ai.run.failed",
    prompt: input.prompt,
    system: input.system,
    output: null,
    attempts,
    riskFlags: guardrailInspection.flags,
    latencyMs: Date.now() - runStarted,
    costUsd: 0,
    confidence: null,
    escalationRequired: true,
    escalationReason: "All configured provider routes failed or were unavailable.",
    modelSelection,
  });
  const persistedAuditEvent = input.persistAudit === false ? null : await persistAiAudit({ auditRecord, auditContext: input.auditContext });

  return { status: "failed", output: null, auditRecord, persistedAuditEvent };
}

export function runGovernedStafferGeneration(input: Omit<RunGovernedAiGenerationInput<GovernedStructuredOutput>, "outputSchema">) {
  return runGovernedAiGeneration({
    ...input,
    outputSchema: governedStructuredOutputSchema,
    outputName: "staffer_governed_response",
    outputDescription: "Governed Staffer response with confidence, escalation, actions, risk flags and evidence.",
  });
}
