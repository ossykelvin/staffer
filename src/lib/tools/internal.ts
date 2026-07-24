import "server-only";

import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit";
import { createKnowledgeEmbedding } from "@/lib/knowledge/processing";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertAgentToolPermission, recordToolRuntimeOutcome, type ToolPermissionDecision } from "@/lib/tools/permissions";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
type JsonRecord = Record<string, unknown>;

const uuidSchema = z.string().uuid();
const optionalUuidSchema = uuidSchema.nullish();
const nonEmptyText = z.string().trim().min(1);
const riskClassSchema = z.coerce.number().int().min(0).max(5).default(1);
const metadataSchema = z.record(z.string(), z.unknown()).default({});
const safeStatusSchema = z.enum(["draft", "queued", "running", "review", "approval", "completed", "blocked", "failed"]);

const toolContextSchema = z.object({
  supabase: z.custom<SupabaseServerClient>(),
  organisationId: uuidSchema,
  agentId: optionalUuidSchema,
  actorUserId: optionalUuidSchema,
  taskId: optionalUuidSchema,
  workflowRunId: optionalUuidSchema,
  approvalId: optionalUuidSchema,
  riskClass: riskClassSchema,
  metadata: metadataSchema,
});

const knowledgeSearchInputSchema = toolContextSchema.extend({
  query: nonEmptyText.max(4_000),
  collectionKeys: z.array(nonEmptyText.max(80)).default([]),
  memoryScopes: z.array(z.enum(["task", "customer", "project", "company"])).default([]),
  projectKey: z.string().trim().max(120).optional().nullable(),
  customerKey: z.string().trim().max(120).optional().nullable(),
  sensitivity: z.array(z.string().trim().min(1).max(80)).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

const taskReadInputSchema = toolContextSchema.extend({
  targetTaskId: uuidSchema.optional(),
  reference: z.string().trim().min(1).max(80).optional(),
});

const taskUpdateInputSchema = toolContextSchema.extend({
  targetTaskId: uuidSchema,
  status: safeStatusSchema.optional(),
  assignedAgentId: optionalUuidSchema,
  assignedUserId: optionalUuidSchema,
  dueAt: z.string().datetime().optional().nullable(),
  outputPatch: z.record(z.string(), z.unknown()).optional(),
});

const approvalRequestInputSchema = toolContextSchema.extend({
  actionKey: nonEmptyText.max(120),
  actionPayload: z.record(z.string(), z.unknown()),
  requiredReviewerCount: z.coerce.number().int().min(1).max(5).default(1),
  policySnapshot: z.record(z.string(), z.unknown()).default({}),
  expiresAt: z.string().datetime().optional().nullable(),
});

const documentDraftInputSchema = toolContextSchema.extend({
  title: nonEmptyText.max(240),
  content: nonEmptyText.max(60_000),
  collectionId: optionalUuidSchema,
  memoryScope: z.enum(["task", "customer", "project", "company"]).default("company"),
  projectKey: z.string().trim().max(120).optional().nullable(),
  customerKey: z.string().trim().max(120).optional().nullable(),
  sensitivity: z.string().trim().min(1).max(80).default("internal"),
  metadata: metadataSchema,
});

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function outputSummary(value: string, max = 240) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function recordToolSuccess(input: {
  supabase: SupabaseServerClient;
  organisationId: string;
  decision: ToolPermissionDecision;
  actorUserId?: string | null;
  taskId?: string | null;
  workflowRunId?: string | null;
  approvalId?: string | null;
  inputSummary: string;
  outputSummary: string;
  idempotencyKey?: string | null;
  metadata?: JsonRecord;
}) {
  await Promise.allSettled([
    input.supabase.schema("staffer").from("tool_execution_logs").insert({
      organisation_id: input.organisationId,
      tool_id: input.decision.toolId,
      agent_id: input.decision.agentId,
      task_id: input.taskId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
      approval_id: input.approvalId ?? null,
      action_key: input.decision.actionKey,
      integration_key: input.decision.integrationKey,
      rate_limit_key: input.decision.rateLimitKey,
      circuit_breaker_key: input.decision.circuitBreakerKey,
      status: input.decision.requiresApproval ? "approval_required" : "succeeded",
      risk_class: input.decision.riskClass,
      input_summary: outputSummary(input.inputSummary),
      output_summary: outputSummary(input.outputSummary),
      redaction_summary: "Internal tool telemetry stores redacted summaries, IDs and safe metadata only.",
      idempotency_key: input.idempotencyKey ?? null,
      metadata: {
        pb: "PB-030",
        runtimePolicy: input.decision.runtimePolicy,
        circuitBreaker: input.decision.circuitBreaker,
        ...(input.metadata ?? {}),
      },
      created_by: input.actorUserId ?? null,
      completed_at: new Date().toISOString(),
    }),
    recordToolRuntimeOutcome({
      supabase: input.supabase,
      organisationId: input.organisationId,
      toolId: input.decision.toolId,
      toolKey: input.decision.toolKey,
      actionKey: input.decision.actionKey,
      integrationKey: input.decision.integrationKey,
      circuitBreakerKey: input.decision.circuitBreakerKey,
      status: "succeeded",
      metadata: input.metadata,
    }),
  ]);
}

async function recordToolFailure(input: {
  supabase: SupabaseServerClient;
  organisationId: string;
  decision: ToolPermissionDecision;
  actorUserId?: string | null;
  taskId?: string | null;
  workflowRunId?: string | null;
  approvalId?: string | null;
  inputSummary: string;
  error: unknown;
  metadata?: JsonRecord;
}) {
  const errorMessage = input.error instanceof Error ? input.error.message : "Unknown internal tool failure.";
  await Promise.allSettled([
    input.supabase.schema("staffer").from("tool_execution_logs").insert({
      organisation_id: input.organisationId,
      tool_id: input.decision.toolId,
      agent_id: input.decision.agentId,
      task_id: input.taskId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
      approval_id: input.approvalId ?? null,
      action_key: input.decision.actionKey,
      integration_key: input.decision.integrationKey,
      rate_limit_key: input.decision.rateLimitKey,
      circuit_breaker_key: input.decision.circuitBreakerKey,
      status: "failed",
      risk_class: input.decision.riskClass,
      input_summary: outputSummary(input.inputSummary),
      output_summary: "Internal tool execution failed before completion.",
      redaction_summary: "Failure telemetry stores the safe input summary and error message only.",
      error_code: "internal_tool_failed",
      error_message: errorMessage,
      metadata: {
        pb: "PB-030",
        ...(input.metadata ?? {}),
      },
      created_by: input.actorUserId ?? null,
      completed_at: new Date().toISOString(),
    }),
    recordToolRuntimeOutcome({
      supabase: input.supabase,
      organisationId: input.organisationId,
      toolId: input.decision.toolId,
      toolKey: input.decision.toolKey,
      actionKey: input.decision.actionKey,
      integrationKey: input.decision.integrationKey,
      circuitBreakerKey: input.decision.circuitBreakerKey,
      status: "failed",
      errorMessage,
      metadata: input.metadata,
    }),
  ]);
}

export async function runKnowledgeSearchTool(input: z.input<typeof knowledgeSearchInputSchema>) {
  const parsed = knowledgeSearchInputSchema.parse(input);
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "knowledge_search",
    actionKey: "knowledge.search",
    integrationKey: "internal",
    actorUserId: parsed.actorUserId,
    taskId: parsed.taskId,
    workflowRunId: parsed.workflowRunId,
    approvalMode: "none",
    workflowAllowedActions: ["knowledge.search"],
    inputSummary: parsed.query,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    const { data, error } = await parsed.supabase.schema("staffer").rpc("search_knowledge_chunks", {
      target_query: parsed.query,
      target_agent_id: parsed.agentId ?? null,
      target_collection_keys: parsed.collectionKeys.length ? parsed.collectionKeys : null,
      target_limit: parsed.limit,
      target_memory_scopes: parsed.memoryScopes.length ? parsed.memoryScopes : null,
      target_project_key: parsed.projectKey || null,
      target_customer_key: parsed.customerKey || null,
      target_sensitivity: parsed.sensitivity.length ? parsed.sensitivity : null,
      target_include_expired: false,
      target_query_embedding: createKnowledgeEmbedding(parsed.query),
    });
    if (error) {
      throw new Error(error.message);
    }

    const results = Array.isArray(data) ? (data as JsonRecord[]) : [];
    await recordToolSuccess({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      inputSummary: parsed.query,
      outputSummary: `${results.length} knowledge chunks returned.`,
      metadata: { resultCount: results.length, ...parsed.metadata },
    });

    return results;
  } catch (error) {
    await recordToolFailure({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      inputSummary: parsed.query,
      error,
      metadata: parsed.metadata,
    });
    throw error;
  }
}

export async function runTaskReadTool(input: z.input<typeof taskReadInputSchema>) {
  const parsed = taskReadInputSchema.parse(input);
  const targetDescription = parsed.targetTaskId ?? parsed.reference ?? "task";
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "task_read",
    actionKey: "task.read",
    integrationKey: "internal",
    actorUserId: parsed.actorUserId,
    taskId: parsed.taskId,
    workflowRunId: parsed.workflowRunId,
    approvalMode: "none",
    workflowAllowedActions: ["task.read"],
    inputSummary: targetDescription,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    let query = parsed.supabase
      .schema("staffer")
      .from("tasks")
      .select("id, reference, title, description, project_key, priority, status, assigned_agent_id, assigned_user_id, due_at, created_at, updated_at")
      .eq("organisation_id", parsed.organisationId);

    query = parsed.targetTaskId ? query.eq("id", parsed.targetTaskId) : query.eq("reference", parsed.reference);
    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Task was not found.");
    }

    await recordToolSuccess({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: String(asRecord(data).id),
      workflowRunId: parsed.workflowRunId,
      inputSummary: targetDescription,
      outputSummary: `Read task ${String(asRecord(data).reference ?? asRecord(data).id)}.`,
      metadata: parsed.metadata,
    });

    return data as JsonRecord;
  } catch (error) {
    await recordToolFailure({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      inputSummary: targetDescription,
      error,
      metadata: parsed.metadata,
    });
    throw error;
  }
}

export async function runTaskUpdateTool(input: z.input<typeof taskUpdateInputSchema>) {
  const parsed = taskUpdateInputSchema.parse(input);
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "task_update",
    actionKey: parsed.status ? "task.update_status" : "task.update_assignment",
    integrationKey: "internal",
    actorUserId: parsed.actorUserId,
    taskId: parsed.targetTaskId,
    workflowRunId: parsed.workflowRunId,
    approvalId: parsed.approvalId,
    approvalMode: "approval_request",
    workflowAllowedActions: ["task.update_status", "task.update_assignment", "task.update_due_at"],
    workflowRequiresApproval: true,
    inputSummary: `Update task ${parsed.targetTaskId}`,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    const updatePatch: JsonRecord = { updated_at: new Date().toISOString() };
    if (parsed.status) {
      updatePatch.status = parsed.status;
      if (parsed.status === "completed") {
        updatePatch.completed_at = updatePatch.updated_at;
      }
    }
    if (parsed.assignedAgentId !== undefined) {
      updatePatch.assigned_agent_id = parsed.assignedAgentId;
    }
    if (parsed.assignedUserId !== undefined) {
      updatePatch.assigned_user_id = parsed.assignedUserId;
    }
    if (parsed.dueAt !== undefined) {
      updatePatch.due_at = parsed.dueAt;
    }
    if (parsed.outputPatch) {
      updatePatch.output = parsed.outputPatch;
    }

    const { data, error } = await parsed.supabase
      .schema("staffer")
      .from("tasks")
      .update(updatePatch)
      .eq("id", parsed.targetTaskId)
      .eq("organisation_id", parsed.organisationId)
      .select("id, reference, status, updated_at")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Task update failed.");
    }

    await recordToolSuccess({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.targetTaskId,
      workflowRunId: parsed.workflowRunId,
      approvalId: parsed.approvalId,
      inputSummary: `Update task ${parsed.targetTaskId}`,
      outputSummary: `Task ${String(asRecord(data).reference ?? parsed.targetTaskId)} updated.`,
      metadata: parsed.metadata,
    });

    return data as JsonRecord;
  } catch (error) {
    await recordToolFailure({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.targetTaskId,
      workflowRunId: parsed.workflowRunId,
      approvalId: parsed.approvalId,
      inputSummary: `Update task ${parsed.targetTaskId}`,
      error,
      metadata: parsed.metadata,
    });
    throw error;
  }
}

export async function runApprovalRequestTool(input: z.input<typeof approvalRequestInputSchema>) {
  const parsed = approvalRequestInputSchema.parse(input);
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "approval_request",
    actionKey: "approval.request",
    integrationKey: "internal",
    actorUserId: parsed.actorUserId,
    taskId: parsed.taskId,
    workflowRunId: parsed.workflowRunId,
    approvalMode: "none",
    workflowAllowedActions: ["approval.request"],
    inputSummary: parsed.actionKey,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    const hashResult = await parsed.supabase.schema("staffer").rpc("approval_payload_hash", {
      target_payload: parsed.actionPayload,
    });
    if (hashResult.error || typeof hashResult.data !== "string") {
      throw new Error(hashResult.error?.message ?? "Unable to hash approval payload.");
    }

    const { data, error } = await parsed.supabase
      .schema("staffer")
      .from("approvals")
      .insert({
        organisation_id: parsed.organisationId,
        task_id: parsed.taskId ?? null,
        workflow_run_id: parsed.workflowRunId ?? null,
        requested_by_agent_id: parsed.agentId ?? null,
        requested_by_user_id: parsed.actorUserId ?? null,
        action_key: parsed.actionKey,
        action_payload: parsed.actionPayload,
        payload_hash: hashResult.data,
        risk_class: parsed.riskClass,
        status: "pending",
        required_reviewer_count: parsed.requiredReviewerCount,
        policy_snapshot: parsed.policySnapshot,
        expires_at: parsed.expiresAt ?? null,
      })
      .select("id, payload_hash")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create approval request.");
    }

    await recordToolSuccess({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      approvalId: String(asRecord(data).id),
      inputSummary: parsed.actionKey,
      outputSummary: `Approval request created for ${parsed.actionKey}.`,
      metadata: parsed.metadata,
    });

    return data as JsonRecord;
  } catch (error) {
    await recordToolFailure({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      inputSummary: parsed.actionKey,
      error,
      metadata: parsed.metadata,
    });
    throw error;
  }
}

export async function runDocumentDraftTool(input: z.input<typeof documentDraftInputSchema>) {
  const parsed = documentDraftInputSchema.parse(input);
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "document_draft",
    actionKey: "document.draft_create",
    integrationKey: "internal",
    actorUserId: parsed.actorUserId,
    taskId: parsed.taskId,
    workflowRunId: parsed.workflowRunId,
    approvalMode: "none",
    workflowAllowedActions: ["document.draft_create"],
    inputSummary: parsed.title,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    const { data, error } = await parsed.supabase
      .schema("staffer")
      .from("documents")
      .insert({
        organisation_id: parsed.organisationId,
        title: parsed.title,
        collection_id: parsed.collectionId ?? null,
        source_type: "tool_draft",
        status: "draft",
        extracted_text: parsed.content,
        extraction_status: "completed",
        scan_status: "not_required",
        embedding_status: "not_requested",
        memory_scope: parsed.memoryScope,
        project_key: parsed.projectKey || null,
        customer_key: parsed.customerKey || null,
        sensitivity: parsed.sensitivity,
        metadata: {
          pb: "PB-030",
          toolKey: "document_draft",
          taskId: parsed.taskId ?? null,
          workflowRunId: parsed.workflowRunId ?? null,
          ...parsed.metadata,
        },
        created_by: parsed.actorUserId ?? null,
      })
      .select("id, title, status")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create document draft.");
    }

    await Promise.allSettled([
      recordToolSuccess({
        supabase: parsed.supabase,
        organisationId: parsed.organisationId,
        decision,
        actorUserId: parsed.actorUserId,
        taskId: parsed.taskId,
        workflowRunId: parsed.workflowRunId,
        inputSummary: parsed.title,
        outputSummary: `Document draft ${String(asRecord(data).id)} created.`,
        metadata: parsed.metadata,
      }),
      recordAuditEvent({
        organisationId: parsed.organisationId,
        actorType: "agent",
        actorId: parsed.agentId ?? "unassigned",
        eventType: "document.draft_created",
        entityType: "document",
        entityId: String(asRecord(data).id),
        summary: "Governed document draft created by internal tool.",
        details: {
          source: "PB-030",
          taskId: parsed.taskId ?? null,
          workflowRunId: parsed.workflowRunId ?? null,
          title: parsed.title,
          memoryScope: parsed.memoryScope,
        },
      }),
    ]);

    return data as JsonRecord;
  } catch (error) {
    await recordToolFailure({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      inputSummary: parsed.title,
      error,
      metadata: parsed.metadata,
    });
    throw error;
  }
}
