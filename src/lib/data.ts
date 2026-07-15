import agentsJson from "@/config/agents.seed.json";
import approvalsJson from "@/config/approvals.seed.json";
import tasksJson from "@/config/tasks.seed.json";
import workflowsJson from "@/config/workflows.seed.json";
import {
  agentProfilesSchema,
  approvalRecordsSchema,
  taskRecordsSchema,
  workflowDefinitionsSchema,
} from "@/lib/schemas";

export const agents = agentProfilesSchema.parse(agentsJson);
export const workflows = workflowDefinitionsSchema.parse(workflowsJson);
export const tasks = taskRecordsSchema.parse(tasksJson);
export const approvals = approvalRecordsSchema.parse(approvalsJson);
