import "server-only";

import { z } from "zod";
import { createGmailDraft, parseGmailAddress, readGmailMessage } from "@/lib/gmail/client";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertAgentToolPermission, recordToolRuntimeOutcome, type ToolPermissionDecision } from "@/lib/tools/permissions";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
type JsonRecord = Record<string, unknown>;

const uuidSchema = z.string().uuid();
const optionalUuidSchema = uuidSchema.nullish();
const metadataSchema = z.record(z.string(), z.unknown()).default({});

const gmailToolContextSchema = z.object({
  supabase: z.custom<SupabaseServerClient>(),
  organisationId: uuidSchema,
  agentId: optionalUuidSchema,
  actorUserId: optionalUuidSchema,
  taskId: optionalUuidSchema,
  workflowRunId: optionalUuidSchema,
  approvalId: optionalUuidSchema,
  riskClass: z.coerce.number().int().min(0).max(5).default(3),
  metadata: metadataSchema,
});

const readInputSchema = gmailToolContextSchema.extend({
  messageId: z.string().trim().min(1).max(240),
});

const draftInputSchema = gmailToolContextSchema.extend({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(998),
  textBody: z.string().trim().min(1).max(60_000),
  threadId: z.string().trim().max(240).optional().nullable(),
  inReplyTo: z.string().trim().max(240).optional().nullable(),
});

function outputSummary(value: string, max = 240) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function recordGmailToolLog(input: {
  supabase: SupabaseServerClient;
  organisationId: string;
  decision: ToolPermissionDecision;
  actorUserId?: string | null;
  taskId?: string | null;
  workflowRunId?: string | null;
  approvalId?: string | null;
  status: "succeeded" | "failed";
  inputSummary: string;
  outputSummary: string;
  errorMessage?: string | null;
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
      status: input.status,
      risk_class: input.decision.riskClass,
      input_summary: outputSummary(input.inputSummary),
      output_summary: outputSummary(input.outputSummary),
      redaction_summary: "Gmail telemetry stores message/draft ids, domains and summaries only; raw message bodies remain in workflow evidence.",
      error_code: input.errorMessage ? "gmail_tool_failed" : null,
      error_message: input.errorMessage ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      metadata: {
        pb: "PB-031",
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
      status: input.status,
      errorMessage: input.errorMessage,
      metadata: input.metadata,
    }),
  ]);
}

export async function runGmailMessageReadTool(input: z.input<typeof readInputSchema>) {
  const parsed = readInputSchema.parse(input);
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "gmail_read",
    actionKey: "gmail.message_read",
    integrationKey: "gmail",
    actorUserId: parsed.actorUserId,
    taskId: parsed.taskId,
    workflowRunId: parsed.workflowRunId,
    approvalMode: "none",
    workflowAllowedActions: ["gmail.message_read", "gmail.event_ingest"],
    inputSummary: parsed.messageId,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    const message = await readGmailMessage(parsed.messageId);
    await recordGmailToolLog({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      status: "succeeded",
      inputSummary: parsed.messageId,
      outputSummary: `Gmail message ${message.id} read for Support Triage.`,
      idempotencyKey: `gmail-read:${parsed.organisationId}:${message.id}`,
      metadata: {
        messageId: message.id,
        threadId: message.threadId,
        fromDomain: parseGmailAddress(message.from).split("@")[1]?.toLowerCase() ?? "unknown",
        ...parsed.metadata,
      },
    });
    return message;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Gmail read failure.";
    await recordGmailToolLog({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      status: "failed",
      inputSummary: parsed.messageId,
      outputSummary: "Gmail message read failed.",
      errorMessage,
      metadata: parsed.metadata,
    });
    throw error;
  }
}

export async function runGmailDraftCreateTool(input: z.input<typeof draftInputSchema>) {
  const parsed = draftInputSchema.parse(input);
  const decision = await assertAgentToolPermission({
    supabase: parsed.supabase,
    organisationId: parsed.organisationId,
    agentId: parsed.agentId,
    toolKey: "gmail_draft",
    actionKey: "gmail.draft_create",
    integrationKey: "gmail",
    actorUserId: parsed.actorUserId,
    taskId: parsed.taskId,
    workflowRunId: parsed.workflowRunId,
    approvalId: parsed.approvalId,
    approvalMode: "approved_execution",
    workflowAllowedActions: ["gmail.draft_create"],
    workflowRequiresApproval: true,
    inputSummary: parsed.subject,
    riskClass: parsed.riskClass,
    metadata: parsed.metadata,
  });

  try {
    const draft = await createGmailDraft({
      to: parsed.to,
      subject: parsed.subject,
      textBody: parsed.textBody,
      threadId: parsed.threadId,
      inReplyTo: parsed.inReplyTo,
    });
    await recordGmailToolLog({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      approvalId: parsed.approvalId,
      status: "succeeded",
      inputSummary: parsed.subject,
      outputSummary: draft.id ? `Gmail draft ${draft.id} created.` : "Gmail draft created.",
      idempotencyKey: parsed.approvalId ? `gmail-draft:${parsed.organisationId}:${parsed.approvalId}` : null,
      metadata: {
        draftId: draft.id,
        messageId: draft.messageId,
        threadId: draft.threadId,
        recipientDomain: parsed.to.split("@")[1]?.toLowerCase() ?? "unknown",
        ...parsed.metadata,
      },
    });
    return draft;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Gmail draft failure.";
    await recordGmailToolLog({
      supabase: parsed.supabase,
      organisationId: parsed.organisationId,
      decision,
      actorUserId: parsed.actorUserId,
      taskId: parsed.taskId,
      workflowRunId: parsed.workflowRunId,
      approvalId: parsed.approvalId,
      status: "failed",
      inputSummary: parsed.subject,
      outputSummary: "Gmail draft creation failed.",
      errorMessage,
      metadata: parsed.metadata,
    });
    throw error;
  }
}
