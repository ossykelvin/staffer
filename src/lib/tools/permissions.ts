import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import type { getSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
type JsonRecord = Record<string, unknown>;

export type ToolApprovalMode = "none" | "approval_request" | "approved_execution";

export type ToolPermissionInput = {
  supabase: SupabaseServerClient;
  organisationId: string;
  agentId: string | null | undefined;
  toolKey: string;
  actionKey: string;
  integrationKey?: string;
  rateLimitKey?: string;
  circuitBreakerKey?: string;
  actorUserId?: string | null;
  taskId?: string | null;
  workflowRunId?: string | null;
  approvalId?: string | null;
  approvalMode?: ToolApprovalMode;
  workflowAllowedActions?: string[];
  workflowRequiresApproval?: boolean;
  inputSummary?: string | null;
  riskClass?: number | null;
  metadata?: JsonRecord;
};

export type ToolPermissionDecision = {
  toolId: string;
  toolKey: string;
  actionKey: string;
  agentId: string;
  integrationKey: string;
  rateLimitKey: string;
  circuitBreakerKey: string;
  riskClass: number;
  requiresApproval: boolean;
  constraints: JsonRecord;
  runtimePolicy: {
    windowSeconds: number;
    maxAttempts: number;
    remainingAttempts: number;
    failureThreshold: number;
    recoverySeconds: number;
  } | null;
  circuitBreaker: {
    state: "closed" | "open" | "half_open";
    failureCount: number;
    retryAfterAt: string | null;
  } | null;
};

export class ToolPermissionError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = "ToolPermissionError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function safeRiskClass(value: unknown, fallback = 1) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(5, Math.max(0, Math.trunc(numeric))) : fallback;
}

function safePositiveInteger(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function actionMatches(candidate: string, actionKey: string, toolKey: string) {
  return candidate === actionKey || candidate === toolKey;
}

function runtimeKeys(input: ToolPermissionInput) {
  const integrationKey = input.integrationKey?.trim() || "internal";
  const rateLimitKey = input.rateLimitKey?.trim() || `${integrationKey}:${input.toolKey}:${input.actionKey}:${input.agentId ?? "unassigned"}`;
  const circuitBreakerKey = input.circuitBreakerKey?.trim() || `${input.organisationId}:${integrationKey}:${input.toolKey}`;

  return { integrationKey, rateLimitKey, circuitBreakerKey };
}

async function recordBlockedToolUse(
  input: ToolPermissionInput,
  reason: string,
  toolId?: string | null,
  riskClass?: number | null,
  status: "blocked" | "rate_limited" | "circuit_open" = "blocked",
  retryAfterAt?: string | null,
) {
  const safeRisk = safeRiskClass(riskClass ?? input.riskClass ?? 1);
  const keys = runtimeKeys(input);
  const telemetrySource = status === "blocked" ? "PB-028" : "PB-029";
  const errorCode = status === "rate_limited" ? "tool_rate_limited" : status === "circuit_open" ? "tool_circuit_open" : "tool_permission_blocked";

  await Promise.allSettled([
    input.supabase.schema("staffer").from("tool_execution_logs").insert({
      organisation_id: input.organisationId,
      tool_id: toolId ?? null,
      agent_id: input.agentId ?? null,
      task_id: input.taskId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
      approval_id: input.approvalId ?? null,
      action_key: input.actionKey,
      integration_key: keys.integrationKey,
      rate_limit_key: keys.rateLimitKey,
      circuit_breaker_key: keys.circuitBreakerKey,
      retry_after_at: retryAfterAt ?? null,
      status,
      risk_class: safeRisk,
      input_summary: input.inputSummary ?? `${input.toolKey} requested for ${input.actionKey}`,
      output_summary:
        status === "rate_limited"
          ? "Tool use was blocked by Staffer runtime rate limiting."
          : status === "circuit_open"
            ? "Tool use was blocked because the integration circuit breaker is open."
            : "Tool use was blocked by Staffer permission enforcement.",
      redaction_summary: "Blocked permission telemetry stores only tool, action, task, workflow, approval and safe metadata.",
      error_code: errorCode,
      error_message: reason,
      metadata: {
        pb: telemetrySource,
        toolKey: input.toolKey,
        integrationKey: keys.integrationKey,
        approvalMode: input.approvalMode ?? "none",
        workflowRequiresApproval: Boolean(input.workflowRequiresApproval),
        reason,
        ...(input.metadata ?? {}),
      },
      created_by: input.actorUserId ?? null,
      completed_at: new Date().toISOString(),
    }),
    recordAuditEvent({
      organisationId: input.organisationId,
      actorType: "agent",
      actorId: input.agentId ?? "unassigned",
      eventType: status === "rate_limited" ? "tool.rate_limited" : status === "circuit_open" ? "tool.circuit_open" : "tool.permission_blocked",
      entityType: input.approvalId ? "approval" : input.taskId ? "task" : "tool",
      entityId: input.approvalId ?? input.taskId ?? toolId ?? null,
      summary:
        status === "rate_limited"
          ? `Tool use rate-limited for ${input.toolKey}.`
          : status === "circuit_open"
            ? `Tool circuit breaker open for ${input.toolKey}.`
            : `Tool use blocked for ${input.toolKey}.`,
      details: {
        source: telemetrySource,
        toolKey: input.toolKey,
        actionKey: input.actionKey,
        integrationKey: keys.integrationKey,
        rateLimitKey: keys.rateLimitKey,
        circuitBreakerKey: keys.circuitBreakerKey,
        retryAfterAt: retryAfterAt ?? null,
        taskId: input.taskId ?? null,
        workflowRunId: input.workflowRunId ?? null,
        approvalId: input.approvalId ?? null,
        approvalMode: input.approvalMode ?? "none",
        reason,
      },
    }),
  ]);
}

async function deny(input: ToolPermissionInput, reason: string, toolId?: string | null, riskClass?: number | null): Promise<never> {
  await recordBlockedToolUse(input, reason, toolId, riskClass);
  throw new ToolPermissionError(`Agent is not permitted to use tool "${input.toolKey}" for action "${input.actionKey}".`, reason);
}

async function denyRuntime(
  input: ToolPermissionInput,
  reason: string,
  status: "rate_limited" | "circuit_open",
  toolId: string,
  riskClass: number,
  retryAfterAt?: string | null,
): Promise<never> {
  await recordBlockedToolUse(input, reason, toolId, riskClass, status, retryAfterAt);
  throw new ToolPermissionError(`Tool "${input.toolKey}" is temporarily unavailable for action "${input.actionKey}".`, reason);
}

async function enforceRuntimeControls(input: ToolPermissionInput, toolId: string, riskClass: number) {
  const keys = runtimeKeys(input);
  const now = new Date();

  const { data: policy } = await input.supabase
    .schema("staffer")
    .from("tool_runtime_policies")
    .select("window_seconds, max_attempts, failure_threshold, recovery_seconds, is_active")
    .eq("organisation_id", input.organisationId)
    .eq("tool_key", input.toolKey)
    .eq("integration_key", keys.integrationKey)
    .eq("scope_key", "organisation")
    .eq("is_active", true)
    .maybeSingle();

  const policyRecord = asRecord(policy);
  const windowSeconds = safePositiveInteger(policyRecord.window_seconds, 60);
  const maxAttempts = safePositiveInteger(policyRecord.max_attempts, 0);
  const failureThreshold = safePositiveInteger(policyRecord.failure_threshold, 5);
  const recoverySeconds = safePositiveInteger(policyRecord.recovery_seconds, 300);

  let remainingAttempts = Number.POSITIVE_INFINITY;
  if (policyRecord.is_active === true && maxAttempts > 0) {
    const windowStart = new Date(now.getTime() - windowSeconds * 1000).toISOString();
    const { count } = await input.supabase
      .schema("staffer")
      .from("tool_execution_logs")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", input.organisationId)
      .eq("tool_id", toolId)
      .eq("integration_key", keys.integrationKey)
      .eq("rate_limit_key", keys.rateLimitKey)
      .gte("created_at", windowStart);

    const attempts = typeof count === "number" ? count : 0;
    remainingAttempts = Math.max(0, maxAttempts - attempts);
    if (attempts >= maxAttempts) {
      const retryAfterAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();
      return denyRuntime(input, `Rate limit exceeded for ${input.toolKey}. Retry after ${retryAfterAt}.`, "rate_limited", toolId, riskClass, retryAfterAt);
    }
  }

  const { data: breaker } = await input.supabase
    .schema("staffer")
    .from("tool_circuit_breaker_states")
    .select("id, state, failure_count, retry_after_at")
    .eq("organisation_id", input.organisationId)
    .eq("breaker_key", keys.circuitBreakerKey)
    .maybeSingle();

  const breakerRecord = asRecord(breaker);
  const breakerState: "closed" | "open" | "half_open" =
    breakerRecord.state === "open" || breakerRecord.state === "half_open" ? breakerRecord.state : "closed";
  const retryAfterAt = typeof breakerRecord.retry_after_at === "string" ? breakerRecord.retry_after_at : null;

  if (breakerState === "open" && retryAfterAt && new Date(retryAfterAt).getTime() > now.getTime()) {
    return denyRuntime(input, `Circuit breaker is open for ${keys.integrationKey}. Retry after ${retryAfterAt}.`, "circuit_open", toolId, riskClass, retryAfterAt);
  }

  if (breakerState === "open") {
    await input.supabase
      .schema("staffer")
      .from("tool_circuit_breaker_states")
      .update({ state: "half_open", half_opened_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("organisation_id", input.organisationId)
      .eq("breaker_key", keys.circuitBreakerKey);
  }

  return {
    keys,
    runtimePolicy:
      policyRecord.is_active === true && maxAttempts > 0
        ? {
            windowSeconds,
            maxAttempts,
            remainingAttempts: Number.isFinite(remainingAttempts) ? Math.max(0, remainingAttempts - 1) : maxAttempts,
            failureThreshold,
            recoverySeconds,
          }
        : null,
    circuitBreaker: breakerRecord.id
      ? {
          state: breakerState === "open" ? ("half_open" as const) : breakerState,
          failureCount: safePositiveInteger(breakerRecord.failure_count, 0),
          retryAfterAt,
        }
      : null,
  };
}

export async function recordToolRuntimeOutcome(input: {
  supabase: SupabaseServerClient;
  organisationId: string;
  toolId?: string | null;
  toolKey: string;
  actionKey: string;
  integrationKey?: string;
  circuitBreakerKey?: string;
  status: "succeeded" | "failed";
  errorMessage?: string | null;
  metadata?: JsonRecord;
}) {
  const keys = runtimeKeys({
    supabase: input.supabase,
    organisationId: input.organisationId,
    agentId: null,
    toolKey: input.toolKey,
    actionKey: input.actionKey,
    integrationKey: input.integrationKey,
    circuitBreakerKey: input.circuitBreakerKey,
  });
  const now = new Date();

  const { data: policy } = await input.supabase
    .schema("staffer")
    .from("tool_runtime_policies")
    .select("failure_threshold, recovery_seconds")
    .eq("organisation_id", input.organisationId)
    .eq("tool_key", input.toolKey)
    .eq("integration_key", keys.integrationKey)
    .eq("scope_key", "organisation")
    .eq("is_active", true)
    .maybeSingle();

  const policyRecord = asRecord(policy);
  const failureThreshold = safePositiveInteger(policyRecord.failure_threshold, 5);
  const recoverySeconds = safePositiveInteger(policyRecord.recovery_seconds, 300);

  const { data: existing } = await input.supabase
    .schema("staffer")
    .from("tool_circuit_breaker_states")
    .select("failure_count, success_count, state")
    .eq("organisation_id", input.organisationId)
    .eq("breaker_key", keys.circuitBreakerKey)
    .maybeSingle();

  const existingRecord = asRecord(existing);
  const currentFailureCount = safePositiveInteger(existingRecord.failure_count, 0);
  const currentSuccessCount = safePositiveInteger(existingRecord.success_count, 0);
  const nextFailureCount = input.status === "failed" ? currentFailureCount + 1 : 0;
  const shouldOpen = input.status === "failed" && nextFailureCount >= failureThreshold;
  const retryAfterAt = shouldOpen ? new Date(now.getTime() + recoverySeconds * 1000).toISOString() : null;

  await input.supabase.schema("staffer").from("tool_circuit_breaker_states").upsert(
    {
      organisation_id: input.organisationId,
      tool_id: input.toolId ?? null,
      tool_key: input.toolKey,
      integration_key: keys.integrationKey,
      breaker_key: keys.circuitBreakerKey,
      state: input.status === "succeeded" ? "closed" : shouldOpen ? "open" : (existingRecord.state as string) || "closed",
      failure_count: nextFailureCount,
      success_count: input.status === "succeeded" ? currentSuccessCount + 1 : currentSuccessCount,
      failure_threshold: failureThreshold,
      recovery_seconds: recoverySeconds,
      opened_at: shouldOpen ? now.toISOString() : null,
      retry_after_at: retryAfterAt,
      last_failure_at: input.status === "failed" ? now.toISOString() : null,
      last_success_at: input.status === "succeeded" ? now.toISOString() : null,
      last_error: input.status === "failed" ? input.errorMessage ?? "Tool execution failed." : null,
      metadata: {
        pb: "PB-029",
        actionKey: input.actionKey,
        ...(input.metadata ?? {}),
      },
      updated_at: now.toISOString(),
    },
    { onConflict: "organisation_id,breaker_key" },
  );
}

export async function assertAgentToolPermission(input: ToolPermissionInput): Promise<ToolPermissionDecision> {
  const approvalMode = input.approvalMode ?? "none";

  if (!input.agentId) {
    return deny(input, "No agent was assigned to the requested tool use.");
  }

  const { data: agent, error: agentError } = await input.supabase
    .schema("staffer")
    .from("agents")
    .select("id, key, name, status")
    .eq("organisation_id", input.organisationId)
    .eq("id", input.agentId)
    .maybeSingle();

  if (agentError || !agent) {
    return deny(input, agentError?.message ?? "The requesting agent does not belong to this organisation.");
  }

  const { data: tool, error: toolError } = await input.supabase
    .schema("staffer")
    .from("tools")
    .select("id, key, name, risk_class, requires_approval, is_active")
    .eq("organisation_id", input.organisationId)
    .eq("key", input.toolKey)
    .maybeSingle();

  const toolRecord = asRecord(tool);
  const toolId = typeof toolRecord.id === "string" ? toolRecord.id : null;
  const toolRiskClass = safeRiskClass(toolRecord.risk_class, input.riskClass ?? 1);

  if (toolError || !toolId) {
    return deny(input, toolError?.message ?? "The requested tool is not registered for this organisation.");
  }

  if (toolRecord.is_active !== true) {
    return deny(input, "The requested tool is inactive.", toolId, toolRiskClass);
  }

  const { data: mapping, error: mappingError } = await input.supabase
    .schema("staffer")
    .from("agent_tools")
    .select("constraints")
    .eq("agent_id", input.agentId)
    .eq("tool_id", toolId)
    .maybeSingle();

  if (mappingError || !mapping) {
    return deny(input, mappingError?.message ?? "The requesting agent is not mapped to this tool.", toolId, toolRiskClass);
  }

  const constraints = asRecord(asRecord(mapping).constraints);
  const workflowAllowedActions = input.workflowAllowedActions ?? [];
  if (workflowAllowedActions.length > 0 && !workflowAllowedActions.some((candidate) => actionMatches(candidate, input.actionKey, input.toolKey))) {
    return deny(input, "The workflow policy does not allow this action for the requested tool.", toolId, toolRiskClass);
  }

  const blockedActions = asStringArray(constraints.blockedActions);
  if (blockedActions.some((candidate) => actionMatches(candidate, input.actionKey, input.toolKey))) {
    return deny(input, "The agent-tool mapping constraints block this action.", toolId, toolRiskClass);
  }

  const allowedActions = asStringArray(constraints.allowedActions);
  if (allowedActions.length > 0 && !allowedActions.some((candidate) => actionMatches(candidate, input.actionKey, input.toolKey))) {
    return deny(input, "The agent-tool mapping constraints do not include this action.", toolId, toolRiskClass);
  }

  const requiresApproval = toolRecord.requires_approval === true || input.workflowRequiresApproval === true;
  if (requiresApproval && approvalMode === "none") {
    return deny(input, "This tool/action requires an approval request or approved execution context.", toolId, toolRiskClass);
  }

  if (approvalMode === "approved_execution" && !input.approvalId) {
    return deny(input, "Approved execution requires a linked approval id.", toolId, toolRiskClass);
  }

  const runtime = await enforceRuntimeControls(input, toolId, toolRiskClass);

  return {
    toolId,
    toolKey: input.toolKey,
    actionKey: input.actionKey,
    agentId: input.agentId,
    integrationKey: runtime.keys.integrationKey,
    rateLimitKey: runtime.keys.rateLimitKey,
    circuitBreakerKey: runtime.keys.circuitBreakerKey,
    riskClass: toolRiskClass,
    requiresApproval,
    constraints,
    runtimePolicy: runtime.runtimePolicy,
    circuitBreaker: runtime.circuitBreaker,
  };
}
