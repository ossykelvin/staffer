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
  riskClass: number;
  requiresApproval: boolean;
  constraints: JsonRecord;
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

function actionMatches(candidate: string, actionKey: string, toolKey: string) {
  return candidate === actionKey || candidate === toolKey;
}

async function recordBlockedToolUse(input: ToolPermissionInput, reason: string, toolId?: string | null, riskClass?: number | null) {
  const safeRisk = safeRiskClass(riskClass ?? input.riskClass ?? 1);

  await Promise.allSettled([
    input.supabase.schema("staffer").from("tool_execution_logs").insert({
      organisation_id: input.organisationId,
      tool_id: toolId ?? null,
      agent_id: input.agentId ?? null,
      task_id: input.taskId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
      approval_id: input.approvalId ?? null,
      action_key: input.actionKey,
      status: "blocked",
      risk_class: safeRisk,
      input_summary: input.inputSummary ?? `${input.toolKey} requested for ${input.actionKey}`,
      output_summary: "Tool use was blocked by Staffer permission enforcement.",
      redaction_summary: "Blocked permission telemetry stores only tool, action, task, workflow, approval and safe metadata.",
      error_code: "tool_permission_blocked",
      error_message: reason,
      metadata: {
        pb: "PB-028",
        toolKey: input.toolKey,
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
      eventType: "tool.permission_blocked",
      entityType: input.approvalId ? "approval" : input.taskId ? "task" : "tool",
      entityId: input.approvalId ?? input.taskId ?? toolId ?? null,
      summary: `Tool use blocked for ${input.toolKey}.`,
      details: {
        source: "PB-028",
        toolKey: input.toolKey,
        actionKey: input.actionKey,
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

  return {
    toolId,
    toolKey: input.toolKey,
    actionKey: input.actionKey,
    agentId: input.agentId,
    riskClass: toolRiskClass,
    requiresApproval,
    constraints,
  };
}
