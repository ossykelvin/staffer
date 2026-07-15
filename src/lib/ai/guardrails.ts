import type { AiRuntimeRiskFlag } from "@/lib/ai/schemas";

export type ClassifiedProviderError = {
  category: "rate_limit" | "timeout" | "authentication" | "provider_unavailable" | "content_filter" | "validation" | "unknown";
  retryable: boolean;
  safeMessage: string;
};

export type CostEstimateInput = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenPricePerThousand: number;
  outputTokenPricePerThousand: number;
};

const secretPatterns = [
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\b/g,
  /\b(?:sk|sb|ghp|gho|github_pat|xoxb|xoxp)_[A-Za-z0-9_=-]{16,}\b/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:password|passwd|secret|api[_-]?key|token|connection[_-]?string)\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\bpostgres(?:ql)?:\/\/[^\s]+/gi,
];

const promptInjectionPatterns = [
  /ignore (?:all )?(?:previous|above|prior) instructions/i,
  /disregard (?:all )?(?:previous|above|prior) instructions/i,
  /reveal (?:your )?(?:system|developer) (?:prompt|instructions)/i,
  /you are now (?:in|running) developer mode/i,
  /act as (?:an unrestricted|a jailbroken)/i,
  /do not follow (?:the )?(?:system|developer|policy) instructions/i,
];

const dataExfiltrationPatterns = [
  /send .* (?:secret|token|password|credential|private key)/i,
  /export .* (?:all|entire) .* (?:customer|user|patient|employee|banking|production) data/i,
  /dump .* (?:database|table|schema|secrets|credentials)/i,
  /bypass .* (?:rls|row level security|approval|permission|access control)/i,
  /copy .* (?:env|\.env|environment variables|secrets)/i,
];

export function redactSensitiveText(value: string) {
  return secretPatterns.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), value);
}

export function inspectPromptForGuardrails(input: { prompt: string; system?: string }) {
  const combined = `${input.system ?? ""}\n${input.prompt}`;
  const flags: AiRuntimeRiskFlag[] = [];

  for (const pattern of promptInjectionPatterns) {
    if (pattern.test(combined)) {
      flags.push({
        code: "prompt_injection",
        severity: "critical",
        message: "Prompt text appears to contain an instruction override or jailbreak attempt.",
      });
      break;
    }
  }

  for (const pattern of dataExfiltrationPatterns) {
    if (pattern.test(combined)) {
      flags.push({
        code: "data_exfiltration",
        severity: "critical",
        message: "Prompt text appears to request credential, private data, or access-control exfiltration.",
      });
      break;
    }
  }

  return {
    blocked: flags.some((flag) => flag.severity === "critical"),
    flags,
    redactedPrompt: redactSensitiveText(input.prompt),
    redactedSystem: input.system ? redactSensitiveText(input.system) : undefined,
  };
}

export function estimateTextTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateRunCost(input: CostEstimateInput) {
  const inputCost = ((input.inputTokens ?? 0) / 1_000) * input.inputTokenPricePerThousand;
  const outputCost = ((input.outputTokens ?? 0) / 1_000) * input.outputTokenPricePerThousand;

  return Number((inputCost + outputCost).toFixed(6));
}

export function classifyProviderError(error: unknown): ClassifiedProviderError {
  const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  if (status === 401 || status === 403 || lowered.includes("api key") || lowered.includes("unauthorized")) {
    return { category: "authentication", retryable: false, safeMessage: "The configured provider credentials were rejected." };
  }

  if (status === 429 || lowered.includes("rate limit") || lowered.includes("quota")) {
    return { category: "rate_limit", retryable: true, safeMessage: "The provider rate limit or quota was reached." };
  }

  if (status === 408 || lowered.includes("timeout") || lowered.includes("aborted")) {
    return { category: "timeout", retryable: true, safeMessage: "The provider call timed out." };
  }

  if (status && status >= 500) {
    return { category: "provider_unavailable", retryable: true, safeMessage: "The provider returned a transient server error." };
  }

  if (lowered.includes("content filter") || lowered.includes("safety")) {
    return { category: "content_filter", retryable: false, safeMessage: "The provider blocked the content for safety reasons." };
  }

  if (lowered.includes("schema") || lowered.includes("validate") || lowered.includes("parse")) {
    return { category: "validation", retryable: true, safeMessage: "The provider response did not match the required schema." };
  }

  return { category: "unknown", retryable: true, safeMessage: "The provider call failed unexpectedly." };
}
