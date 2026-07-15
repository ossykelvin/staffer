import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(nonEmptyString);

export const agentProfileSchema = z.object({
  id: nonEmptyString,
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
  initials: nonEmptyString,
  accent: nonEmptyString,
  avatarPath: z.string().startsWith("/").optional(),
  avatarStyle: nonEmptyString.optional(),
  summary: nonEmptyString,
  personality: stringList,
  communicationStyle: nonEmptyString,
  background: nonEmptyString.optional(),
  personalDetail: nonEmptyString.optional(),
  signatureHabit: nonEmptyString.optional(),
  skills: stringList,
  tools: stringList,
  requiresApproval: stringList,
});

export const workflowDefinitionSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  department: nonEmptyString,
  trigger: nonEmptyString,
  status: nonEmptyString,
  steps: stringList,
  approval: nonEmptyString,
  sla: nonEmptyString,
});

export const taskRecordSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  owner: nonEmptyString,
  priority: nonEmptyString,
  status: nonEmptyString,
  due: nonEmptyString,
  project: nonEmptyString,
});

export const approvalRecordSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  requester: nonEmptyString,
  type: nonEmptyString,
  risk: nonEmptyString,
  submitted: nonEmptyString,
});

export const agentProfilesSchema = z.array(agentProfileSchema);
export const workflowDefinitionsSchema = z.array(workflowDefinitionSchema);
export const taskRecordsSchema = z.array(taskRecordSchema);
export const approvalRecordsSchema = z.array(approvalRecordSchema);

export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type TaskRecord = z.infer<typeof taskRecordSchema>;
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
