import { readFileSync } from "node:fs";

const requiredFiles = [
  "src/lib/ai/provider.ts",
  "src/lib/ai/guardrails.ts",
  "src/lib/ai/schemas.ts",
  "src/config/ai-evaluations.seed.json",
  ".env.local.example",
];

for (const file of requiredFiles) {
  readFileSync(file, "utf8");
}

const provider = readFileSync("src/lib/ai/provider.ts", "utf8");
for (const phrase of [
  'import "server-only"',
  "generateText",
  "Output.object",
  "stepCountIs",
  "ToolLoopAgent",
  "createGoogleGenerativeAI",
  "createOpenAICompatible",
  "runGovernedAiGeneration",
  "runGovernedStafferGeneration",
  "createBoundedToolLoopAgent",
  "classifyProviderError",
  "inspectPromptForGuardrails",
  "estimateRunCost",
  "recordAuditEvent",
  "AI_MAX_COST_PER_RUN_USD",
  "AI_DEFAULT_TIMEOUT_MS",
  "AI_DEFAULT_MAX_OUTPUT_TOKENS",
]) {
  if (!provider.includes(phrase)) {
    throw new Error(`Missing provider runtime phrase: ${phrase}`);
  }
}

const guardrails = readFileSync("src/lib/ai/guardrails.ts", "utf8");
for (const phrase of [
  "redactSensitiveText",
  "prompt_injection",
  "data_exfiltration",
  "classifyProviderError",
  "retryable",
  "rate_limit",
  "timeout",
  "authentication",
]) {
  if (!guardrails.includes(phrase)) {
    throw new Error(`Missing guardrail phrase: ${phrase}`);
  }
}

const schemas = readFileSync("src/lib/ai/schemas.ts", "utf8");
for (const phrase of [
  "governedStructuredOutputSchema",
  "confidence",
  "escalationRequired",
  "riskFlags",
  "recommendedActions",
  "evidence",
]) {
  if (!schemas.includes(phrase)) {
    throw new Error(`Missing structured output schema phrase: ${phrase}`);
  }
}

const envExample = readFileSync(".env.local.example", "utf8");
for (const phrase of [
  "AI_PRIMARY_PROVIDER=google",
  "AI_FALLBACK_PROVIDER=openrouter",
  "AI_DEFAULT_MAX_STEPS=",
  "AI_DEFAULT_TIMEOUT_MS=",
  "AI_DEFAULT_MAX_OUTPUT_TOKENS=",
  "AI_CONFIDENCE_THRESHOLD=",
  "AI_MAX_COST_PER_RUN_USD=",
  "AI_COST_PER_1K_INPUT_TOKENS_USD=",
  "AI_COST_PER_1K_OUTPUT_TOKENS_USD=",
]) {
  if (!envExample.includes(phrase)) {
    throw new Error(`Missing AI runtime env example phrase: ${phrase}`);
  }
}

const agents = JSON.parse(readFileSync("src/config/agents.seed.json", "utf8"));
const evaluations = JSON.parse(readFileSync("src/config/ai-evaluations.seed.json", "utf8"));
const agentIds = new Set(agents.map((agent) => agent.id));
const evaluationAgentIds = new Set(evaluations.map((evaluation) => evaluation.agentKey));

for (const agentId of agentIds) {
  if (!evaluationAgentIds.has(agentId)) {
    throw new Error(`Missing AI evaluation fixture for agent: ${agentId}`);
  }
}

for (const evaluation of evaluations) {
  if (!agentIds.has(evaluation.agentKey)) {
    throw new Error(`Evaluation fixture references unknown agent: ${evaluation.agentKey}`);
  }

  for (const field of ["summary", "decision", "confidence", "escalationRequired"]) {
    if (!evaluation.expectedSignals.includes(field) && !["confidence"].includes(field)) {
      throw new Error(`Evaluation fixture ${evaluation.id} is missing required expected signal: ${field}`);
    }
  }
}

console.log("AI runtime static verification passed.");
