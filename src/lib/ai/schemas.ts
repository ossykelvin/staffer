import { z } from "zod";

export const aiRuntimeRiskFlagSchema = z.object({
  code: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string().trim().min(1),
});

export const aiRuntimeActionSchema = z.object({
  title: z.string().trim().min(1),
  ownerRole: z.string().trim().min(1).optional(),
  requiresApproval: z.boolean(),
  rationale: z.string().trim().min(1),
});

export const aiRuntimeEvidenceSchema = z.object({
  label: z.string().trim().min(1),
  source: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
});

export const governedStructuredOutputSchema = z.object({
  summary: z.string().trim().min(1),
  decision: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  escalationRequired: z.boolean(),
  escalationReason: z.string().trim().min(1).nullable(),
  riskFlags: z.array(aiRuntimeRiskFlagSchema),
  recommendedActions: z.array(aiRuntimeActionSchema),
  evidence: z.array(aiRuntimeEvidenceSchema),
});

export const aiRuntimeRequestSchema = z.object({
  taskType: z.string().trim().min(1),
  roleKey: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  system: z.string().trim().min(1).optional(),
  organisationId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
});

export type AiRuntimeRiskFlag = z.infer<typeof aiRuntimeRiskFlagSchema>;
export type GovernedStructuredOutput = z.infer<typeof governedStructuredOutputSchema>;
export type AiRuntimeRequest = z.infer<typeof aiRuntimeRequestSchema>;
