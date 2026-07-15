import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(nonEmptyString);

export const agentSkillSchema = z.object({
  id: nonEmptyString.optional(),
  key: nonEmptyString,
  name: nonEmptyString,
  description: z.string().trim().optional(),
  proficiency: z.number().int().min(1).max(5).optional(),
});

export const agentToolSchema = z.object({
  id: nonEmptyString.optional(),
  key: nonEmptyString,
  name: nonEmptyString,
  description: z.string().trim().optional(),
  riskClass: z.number().int().min(0).max(5),
  requiresApproval: z.boolean(),
  isActive: z.boolean(),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

export const agentVersionSchema = z.object({
  id: nonEmptyString,
  agentId: nonEmptyString,
  version: z.number().int().positive(),
  changeSummary: nonEmptyString,
  createdBy: nonEmptyString.optional(),
  createdAt: nonEmptyString,
});

export const agentProfileSchema = z.object({
  id: nonEmptyString,
  databaseId: nonEmptyString.optional(),
  name: nonEmptyString,
  jobTitle: nonEmptyString,
  department: nonEmptyString,
  pronouns: nonEmptyString,
  location: nonEmptyString,
  timezone: nonEmptyString,
  age: z.number().int().positive().optional(),
  experienceYears: z.number().int().nonnegative(),
  status: nonEmptyString,
  profileStatus: nonEmptyString,
  autonomyLevel: z.number().int().min(0).max(5),
  version: z.number().int().positive().optional(),
  primaryModel: z.string().trim().optional(),
  fallbackModel: z.string().trim().optional(),
  maximumSteps: z.number().int().positive().optional(),
  maximumCostUsd: z.number().nonnegative().optional(),
  maximumInputTokens: z.number().int().positive().optional(),
  maximumOutputTokens: z.number().int().positive().optional(),
  initials: nonEmptyString,
  accent: nonEmptyString,
  avatarPath: z.string().startsWith("/").optional(),
  avatarMode: z.enum(["initials", "generated", "image_path"]).optional(),
  avatarStyle: nonEmptyString.optional(),
  avatarSeed: z.string().trim().optional(),
  avatarPrompt: z.string().trim().optional(),
  founderConfirmedAt: z.string().trim().optional(),
  founderConfirmedBy: z.string().trim().optional(),
  founderConfirmationNotes: z.string().trim().optional(),
  summary: nonEmptyString,
  personality: stringList,
  communicationStyle: nonEmptyString,
  background: nonEmptyString.optional(),
  personalDetail: nonEmptyString.optional(),
  signatureHabit: nonEmptyString.optional(),
  skills: stringList,
  skillDetails: z.array(agentSkillSchema).optional(),
  tools: stringList,
  toolDetails: z.array(agentToolSchema).optional(),
  requiresApproval: stringList,
  prohibitedActions: stringList.optional(),
  approvalRules: stringList.optional(),
});

export const workflowDefinitionSchema = z.object({
  id: nonEmptyString,
  databaseId: nonEmptyString.optional(),
  name: nonEmptyString,
  department: nonEmptyString,
  trigger: nonEmptyString,
  status: nonEmptyString,
  steps: stringList,
  approval: nonEmptyString,
  sla: nonEmptyString,
});

export const workflowRunStepSchema = z.object({
  id: nonEmptyString,
  workflowRunId: nonEmptyString,
  stepIndex: z.number().int().positive(),
  stepKey: nonEmptyString,
  stepName: nonEmptyString,
  stepType: nonEmptyString,
  status: nonEmptyString,
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  idempotencyKey: nonEmptyString,
  startedAt: z.string().trim().nullable().optional(),
  completedAt: z.string().trim().nullable().optional(),
  nextRetryAt: z.string().trim().nullable().optional(),
  errorPayload: z.record(z.string(), z.unknown()).optional(),
});

export const workflowRunEventSchema = z.object({
  id: nonEmptyString,
  workflowRunId: nonEmptyString,
  stepRunId: nonEmptyString.nullable().optional(),
  eventType: nonEmptyString,
  title: nonEmptyString,
  body: z.string().trim().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdBy: nonEmptyString.nullable().optional(),
  createdAt: nonEmptyString,
});

export const workflowRunSchema = z.object({
  id: nonEmptyString,
  workflowId: nonEmptyString,
  taskId: nonEmptyString.nullable().optional(),
  status: nonEmptyString,
  currentStep: z.string().trim().nullable().optional(),
  currentStepIndex: z.number().int().nonnegative(),
  triggerType: nonEmptyString,
  idempotencyKey: nonEmptyString.nullable().optional(),
  runKind: nonEmptyString,
  retryCount: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  pauseReason: z.string().trim().nullable().optional(),
  startedAt: z.string().trim().nullable().optional(),
  completedAt: z.string().trim().nullable().optional(),
  failedAt: z.string().trim().nullable().optional(),
  cancelledAt: z.string().trim().nullable().optional(),
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
  steps: z.array(workflowRunStepSchema).optional(),
  events: z.array(workflowRunEventSchema).optional(),
});

export const workflowExecutionDetailSchema = z.object({
  runs: z.array(workflowRunSchema),
  latestRun: workflowRunSchema.nullable(),
});

export const taskRecordSchema = z.object({
  id: nonEmptyString,
  databaseId: nonEmptyString.optional(),
  title: nonEmptyString,
  description: z.string().trim().optional(),
  owner: nonEmptyString,
  priority: nonEmptyString,
  status: nonEmptyString,
  due: nonEmptyString,
  project: nonEmptyString,
  retryCount: z.number().int().nonnegative().optional(),
  retryPolicy: z.record(z.string(), z.unknown()).optional(),
  lastRetryAt: z.string().trim().optional(),
  nextRetryAt: z.string().trim().optional(),
  retryReason: z.string().trim().optional(),
});

export const taskCommentSchema = z.object({
  id: nonEmptyString,
  body: nonEmptyString,
  visibility: nonEmptyString,
  createdBy: nonEmptyString.optional(),
  createdAt: nonEmptyString,
});

export const taskWatcherSchema = z.object({
  userId: nonEmptyString,
  createdBy: nonEmptyString.optional(),
  createdAt: nonEmptyString,
});

export const taskDependencySchema = z.object({
  id: nonEmptyString,
  taskId: nonEmptyString,
  dependsOnTaskId: nonEmptyString,
  dependsOnReference: nonEmptyString,
  dependsOnTitle: nonEmptyString,
  dependencyType: nonEmptyString,
  notes: z.string().trim().optional(),
  createdAt: nonEmptyString,
});

export const taskEvidenceEventSchema = z.object({
  id: nonEmptyString,
  eventType: nonEmptyString,
  title: nonEmptyString,
  body: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdBy: nonEmptyString.optional(),
  createdAt: nonEmptyString,
});

export const taskCollaborationSchema = z.object({
  comments: z.array(taskCommentSchema),
  watchers: z.array(taskWatcherSchema),
  dependencies: z.array(taskDependencySchema),
  evidenceEvents: z.array(taskEvidenceEventSchema),
});

export const knowledgeCollectionSchema = z.object({
  id: nonEmptyString,
  key: nonEmptyString,
  name: nonEmptyString,
  description: z.string().trim().nullable().optional(),
  sensitivity: nonEmptyString,
  accessMode: nonEmptyString,
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  retrievalCount: z.number().int().nonnegative().optional(),
  reviewDueCount: z.number().int().nonnegative().optional(),
  retentionDays: z.number().int().positive().nullable().optional(),
  reviewIntervalDays: z.number().int().positive().nullable().optional(),
});

export const knowledgeDocumentSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  collectionId: nonEmptyString.nullable().optional(),
  collectionName: nonEmptyString.nullable().optional(),
  sourceUrl: z.string().trim().nullable().optional(),
  sensitivity: nonEmptyString,
  status: nonEmptyString,
  version: z.number().int().positive(),
  scanStatus: nonEmptyString,
  extractionStatus: nonEmptyString,
  embeddingStatus: nonEmptyString,
  reviewDueAt: z.string().trim().nullable().optional(),
  retentionUntil: z.string().trim().nullable().optional(),
  legalHold: z.boolean(),
  updatedAt: nonEmptyString,
});

export const knowledgeSearchResultSchema = z.object({
  chunkId: nonEmptyString,
  documentId: nonEmptyString,
  collectionId: nonEmptyString,
  collectionKey: nonEmptyString,
  collectionName: nonEmptyString,
  documentTitle: nonEmptyString,
  chunkIndex: z.number().int().positive(),
  excerpt: nonEmptyString,
  citation: z.record(z.string(), z.unknown()),
  rank: z.number(),
});

export const knowledgeHubDataSchema = z.object({
  collections: z.array(knowledgeCollectionSchema),
  documents: z.array(knowledgeDocumentSchema),
  searchResults: z.array(knowledgeSearchResultSchema),
  query: z.string(),
});

export const approvalRecordSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  requester: nonEmptyString,
  type: nonEmptyString,
  risk: nonEmptyString,
  submitted: nonEmptyString,
  status: nonEmptyString.optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  payloadHash: nonEmptyString.optional(),
  policyKey: nonEmptyString.optional(),
  policyName: nonEmptyString.optional(),
  requiredReviewerCount: z.number().int().positive().optional(),
  approvedReviewerCount: z.number().int().nonnegative().optional(),
  executionStatus: nonEmptyString.optional(),
  executionPayloadHash: z.string().trim().optional(),
  executionVerifiedAt: z.string().trim().optional(),
});

export const approvalDecisionSchema = z.object({
  id: nonEmptyString,
  decision: nonEmptyString,
  comment: z.string().trim().optional(),
  decidedBy: nonEmptyString.optional(),
  decidedAt: nonEmptyString,
  payloadHashAtDecision: nonEmptyString,
});

export const approvalExecutionCheckSchema = z.object({
  id: nonEmptyString,
  expectedPayloadHash: nonEmptyString,
  actualPayloadHash: nonEmptyString,
  verified: z.boolean(),
  status: nonEmptyString,
  failureReason: z.string().trim().optional(),
  checkedBy: nonEmptyString.optional(),
  checkedAt: nonEmptyString,
});

export const approvalPolicyEvaluationSchema = z.object({
  policyKey: nonEmptyString,
  policyName: nonEmptyString,
  requiresApproval: z.boolean(),
  requiredReviewerCount: z.number().int().positive(),
  exactPayloadRequired: z.boolean(),
  requiresSeparationOfDuties: z.boolean(),
  expiresAfterMinutes: z.number().int().positive(),
  reasons: stringList,
  payloadHash: nonEmptyString,
});

export const approvalDetailRecordSchema = z.object({
  approval: approvalRecordSchema,
  policyEvaluation: approvalPolicyEvaluationSchema,
  decisions: z.array(approvalDecisionSchema),
  executionChecks: z.array(approvalExecutionCheckSchema),
});

export const agentProfilesSchema = z.array(agentProfileSchema);
export const workflowDefinitionsSchema = z.array(workflowDefinitionSchema);
export const taskRecordsSchema = z.array(taskRecordSchema);
export const approvalRecordsSchema = z.array(approvalRecordSchema);

export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type AgentSkill = z.infer<typeof agentSkillSchema>;
export type AgentTool = z.infer<typeof agentToolSchema>;
export type AgentVersion = z.infer<typeof agentVersionSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type WorkflowRunStep = z.infer<typeof workflowRunStepSchema>;
export type WorkflowRunEvent = z.infer<typeof workflowRunEventSchema>;
export type WorkflowExecutionDetail = z.infer<typeof workflowExecutionDetailSchema>;
export type TaskRecord = z.infer<typeof taskRecordSchema>;
export type TaskCollaboration = z.infer<typeof taskCollaborationSchema>;
export type TaskComment = z.infer<typeof taskCommentSchema>;
export type TaskDependency = z.infer<typeof taskDependencySchema>;
export type TaskEvidenceEvent = z.infer<typeof taskEvidenceEventSchema>;
export type TaskWatcher = z.infer<typeof taskWatcherSchema>;
export type KnowledgeCollection = z.infer<typeof knowledgeCollectionSchema>;
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;
export type KnowledgeHubData = z.infer<typeof knowledgeHubDataSchema>;
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type ApprovalDetailRecord = z.infer<typeof approvalDetailRecordSchema>;
export type ApprovalExecutionCheck = z.infer<typeof approvalExecutionCheckSchema>;
export type ApprovalPolicyEvaluation = z.infer<typeof approvalPolicyEvaluationSchema>;
