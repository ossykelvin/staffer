import { createHash } from "node:crypto";

export type ApprovalPolicyInput = {
  actionKey: string;
  riskClass: number;
  payload: Record<string, unknown>;
  organisationSettings?: Record<string, unknown>;
  policy?: {
    key: string;
    name: string;
    minimumRiskClass: number;
    requiredReviewerCount: number;
    requiresSeparationOfDuties: boolean;
    exactPayloadRequired: boolean;
    expiresAfterMinutes: number;
  };
};

export type ApprovalPolicyEvaluation = {
  policyKey: string;
  policyName: string;
  requiresApproval: boolean;
  requiredReviewerCount: number;
  exactPayloadRequired: boolean;
  requiresSeparationOfDuties: boolean;
  expiresAfterMinutes: number;
  reasons: string[];
  payloadHash: string;
};

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalise(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalise(item)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalise(value));
}

export function approvalPayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function settingString(settings: Record<string, unknown> | undefined, key: string) {
  const value = settings?.[key];
  return typeof value === "string" ? value : undefined;
}

export function evaluateApprovalPolicy(input: ApprovalPolicyInput): ApprovalPolicyEvaluation {
  const approvalMode = settingString(input.organisationSettings, "approval_mode") ?? "default";
  const configuredPolicy = input.policy;
  const strictMode = approvalMode === "strict";
  const defaultRequiredCount = strictMode ? 2 : 1;
  const minimumRiskClass = configuredPolicy?.minimumRiskClass ?? (strictMode ? 0 : 2);
  const requiresApproval = strictMode || input.riskClass >= minimumRiskClass || Boolean(configuredPolicy);
  const reasons = [
    `Risk class ${input.riskClass} ${requiresApproval ? "meets" : "does not meet"} approval threshold ${minimumRiskClass}.`,
  ];

  if (strictMode) {
    reasons.push("Organisation approval mode is strict.");
  }

  if (configuredPolicy) {
    reasons.push(`Matched approval policy ${configuredPolicy.key}.`);
  }

  return {
    policyKey: configuredPolicy?.key ?? (strictMode ? "organisation.strict_default" : "organisation.default"),
    policyName: configuredPolicy?.name ?? (strictMode ? "Strict organisation approval policy" : "Default governed approval policy"),
    requiresApproval,
    requiredReviewerCount: configuredPolicy?.requiredReviewerCount ?? defaultRequiredCount,
    exactPayloadRequired: configuredPolicy?.exactPayloadRequired ?? true,
    requiresSeparationOfDuties: configuredPolicy?.requiresSeparationOfDuties ?? true,
    expiresAfterMinutes: configuredPolicy?.expiresAfterMinutes ?? 1440,
    reasons,
    payloadHash: approvalPayloadHash(input.payload),
  };
}

export function verifyExactApprovalPayload({
  approvedPayloadHash,
  executionPayload,
}: {
  approvedPayloadHash: string;
  executionPayload: Record<string, unknown>;
}) {
  const executionPayloadHash = approvalPayloadHash(executionPayload);

  return {
    verified: executionPayloadHash === approvedPayloadHash,
    expectedHash: approvedPayloadHash,
    actualHash: executionPayloadHash,
  };
}
