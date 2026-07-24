import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { parseGmailAddress } from "@/lib/gmail/client";
import type { GmailMessageSummary } from "@/lib/gmail/client";
import type { getSupabaseServiceClient } from "@/lib/supabase/server";
import { runGmailMessageReadTool } from "@/lib/tools/gmail";
import { runApprovalRequestTool, runKnowledgeSearchTool } from "@/lib/tools/internal";
import { assertAgentToolPermission } from "@/lib/tools/permissions";

type SupabaseServiceClient = NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
type JsonRecord = Record<string, unknown>;

type Classification = {
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  onboardingState: "unknown" | "new" | "active" | "blocked" | "complete";
  riskClass: number;
  slaHours: number | null;
  rationale: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function includesAnyKeyword(haystack: string, keywords: unknown) {
  return asStringArray(keywords).some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function workflowRunIdFromResult(value: unknown) {
  const record = asRecord(Array.isArray(value) ? value[0] : value);
  const id = record.run_id ?? record.workflow_run_id ?? record.id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

function classifySupportMessage(input: { subject: string; body: string; settings: JsonRecord }): Classification {
  const combined = `${input.subject}\n${input.body}`.toLowerCase();
  const severityRules = asRecord(input.settings.severity_rules);
  const categoryRules = asRecord(input.settings.category_rules);
  const rationale: string[] = [];
  let severity: Classification["severity"] = "medium";
  let riskClass = 3;
  let slaHours: number | null = 24;

  for (const candidate of ["critical", "high", "medium", "low"] as const) {
    const rule = asRecord(severityRules[candidate]);
    if (includesAnyKeyword(combined, rule.keywords)) {
      severity = candidate;
      riskClass = typeof rule.riskClass === "number" ? rule.riskClass : riskClass;
      slaHours = typeof rule.targetHours === "number" ? rule.targetHours : slaHours;
      rationale.push(`Matched ${candidate} severity support keywords.`);
      break;
    }
  }

  let category = "general";
  for (const [candidate, keywords] of Object.entries(categoryRules)) {
    if (includesAnyKeyword(combined, keywords)) {
      category = candidate;
      rationale.push(`Matched ${candidate.replace(/_/g, " ")} routing keywords.`);
      break;
    }
  }

  const sentiment = /urgent|asap|immediately|angry|furious|frustrated|unhappy|not acceptable/i.test(combined)
    ? "urgent"
    : /thank|great|appreciate|helpful/i.test(combined)
      ? "positive"
      : /problem|issue|failed|error|blocked|cannot|can't|angry|frustrated/i.test(combined)
        ? "negative"
        : "neutral";
  const onboardingState = /onboarding|setup|first time|new user/i.test(combined)
    ? "new"
    : /blocked|stuck|cannot proceed|can't proceed/i.test(combined)
      ? "blocked"
      : /completed|all set|working now/i.test(combined)
        ? "complete"
        : "unknown";

  if (!rationale.length) {
    rationale.push("No configured high-risk keywords matched; defaulted to medium/general triage.");
  }

  return { category, severity, sentiment, onboardingState, riskClass, slaHours, rationale };
}

function buildKnowledgeQuery(subject: string, body: string, classification: Classification) {
  return `${classification.category.replace(/_/g, " ")} ${classification.severity} ${subject} ${body.slice(0, 240)}`.trim();
}

function buildDraftResponse(input: { customerName: string; classification: Classification; citations: JsonRecord[] }) {
  const greetingName = input.customerName || "there";
  const citedSources = input.citations
    .slice(0, 3)
    .map((citation, index) => `${index + 1}. ${String(citation.documentTitle ?? citation.document_title ?? "Approved support source")}`)
    .join("\n");
  const specialistNote =
    input.classification.severity === "critical" || ["security", "data_protection", "compliance", "banking_application"].includes(input.classification.category)
      ? "I'm also routing this for specialist review before anything customer-visible is sent."
      : "I'll keep this moving and make sure the next action is clear.";

  return `Hi ${greetingName},

Thanks for reaching out — I've picked this up and classified it as ${input.classification.severity} priority under ${input.classification.category.replace(/_/g, " ")}.

${specialistNote}

Based on the approved knowledge available, the safe next step is to confirm the issue details, avoid unsupported commitments, and provide a clear follow-up path. I'll share the verified troubleshooting or account-specific guidance once the support evidence has been reviewed.

Sources checked:
${citedSources || "- No approved knowledge source matched yet; human review should confirm the response before external use."}

Kind regards,
Anna`;
}

function customerNameFromFromHeader(from: string) {
  const email = parseGmailAddress(from);
  const withoutAddress = from.replace(/<[^>]+>/g, "").replace(/"/g, "").trim();
  return withoutAddress && withoutAddress !== email ? withoutAddress : "";
}

export async function ingestGmailSupportMessage(input: {
  supabase: SupabaseServiceClient;
  organisationId: string;
  messageId: string;
  sourceEventId?: string | null;
}) {
  const { data: existingCase } = await input.supabase
    .schema("staffer")
    .from("support_triage_cases")
    .select("id, task_id")
    .eq("organisation_id", input.organisationId)
    .eq("source_type", "gmail")
    .eq("source_message_id", input.messageId)
    .maybeSingle();

  if (existingCase?.id) {
    await input.supabase.schema("staffer").from("gmail_ingestion_events").upsert(
      {
        organisation_id: input.organisationId,
        support_case_id: existingCase.id,
        task_id: existingCase.task_id ?? null,
        gmail_message_id: input.messageId,
        source_event_id: input.sourceEventId ?? `gmail-message:${input.messageId}`,
        status: "duplicate",
        event_payload: { messageId: input.messageId, duplicate: true },
        processed_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,source_event_id" },
    );
    return { status: "duplicate", supportCaseId: String(existingCase.id), taskId: String(existingCase.task_id ?? "") };
  }

  const { data: settingsData, error: settingsError } = await input.supabase.schema("staffer").rpc("ensure_support_triage_settings", {
    target_organisation_id: input.organisationId,
  });
  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const workflowResult = await input.supabase.schema("staffer").rpc("ensure_support_triage_workflow", {
    target_organisation_id: input.organisationId,
  });
  if (workflowResult.error) {
    throw new Error(workflowResult.error.message);
  }

  const { data: annaAgent } = await input.supabase
    .schema("staffer")
    .from("agents")
    .select("id")
    .eq("organisation_id", input.organisationId)
    .eq("key", "anna")
    .maybeSingle();
  const agentId = typeof annaAgent?.id === "string" ? annaAgent.id : null;

  const gmailMessage: GmailMessageSummary = await runGmailMessageReadTool({
    supabase: input.supabase,
    organisationId: input.organisationId,
    agentId,
    messageId: input.messageId,
    riskClass: 3,
    metadata: {
      source: "support_triage",
      eventSource: "gmail",
      sourceEventId: input.sourceEventId ?? null,
    },
  });

  const settings = asRecord(settingsData);
  const policy = asRecord(settings.response_policy);
  const subject = gmailMessage.subject || "(no subject)";
  const messageBody = gmailMessage.textBody || gmailMessage.snippet;
  const customerEmail = parseGmailAddress(gmailMessage.from);
  const customerName = customerNameFromFromHeader(gmailMessage.from);
  const classification = classifySupportMessage({ subject, body: messageBody, settings });
  const routingRules = asRecord(settings.routing_rules);
  const escalationTargets = asStringArray(routingRules[classification.category]).length ? asStringArray(routingRules[classification.category]) : ["anna"];
  const knowledgeCollectionKeys = asStringArray(policy.knowledgeCollectionKeys);
  const responseAction = typeof policy.defaultResponseAction === "string" ? policy.defaultResponseAction : "create_draft_after_approval";
  const now = new Date();
  const slaTargetAt = classification.slaHours ? new Date(now.getTime() + classification.slaHours * 60 * 60 * 1000).toISOString() : null;
  const reference = `SUP-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${input.messageId.slice(-5).toUpperCase()}`;
  const taskInput = {
    sourceType: "gmail",
    sourceMessageId: input.messageId,
    gmailThreadId: gmailMessage.threadId,
    customerName,
    customerEmail,
    subject,
    classification,
  };

  const { data: task, error: taskError } = await input.supabase
    .schema("staffer")
    .from("tasks")
    .insert({
      organisation_id: input.organisationId,
      reference,
      title: `Support triage: ${subject}`,
      description: messageBody,
      project_key: "customer-support",
      priority: Math.min(4, Math.max(1, classification.riskClass - 1)),
      status: "approval",
      assigned_agent_id: agentId,
      due_at: slaTargetAt,
      input: taskInput,
      idempotency_key: `support-triage:gmail:${input.messageId}`,
    })
    .select("id, reference")
    .single();
  if (taskError || !task?.id) {
    throw new Error(taskError?.message ?? "Unable to create Gmail support task.");
  }

  try {
    const workflowRunResult = await input.supabase.schema("staffer").rpc("start_workflow_run", {
      target_workflow_key: "support-triage",
      target_task_id: task.id,
      target_trigger_type: "gmail_event",
      target_trigger_payload: taskInput,
      target_idempotency_key: `support-triage:gmail:${input.messageId}`,
    });
    if (workflowRunResult.error) {
      throw new Error(workflowRunResult.error.message);
    }
    const workflowRunId = workflowRunIdFromResult(workflowRunResult.data);
    if (!workflowRunId) {
      throw new Error("Workflow run was not created for the Gmail support triage task.");
    }

    const knowledgeQuery = buildKnowledgeQuery(subject, messageBody, classification);
    const searchResults = await runKnowledgeSearchTool({
      supabase: input.supabase,
      organisationId: input.organisationId,
      agentId,
      taskId: task.id,
      workflowRunId,
      query: knowledgeQuery,
      collectionKeys: knowledgeCollectionKeys,
      limit: 4,
      riskClass: classification.riskClass,
      metadata: { source: "support_triage", eventSource: "gmail" },
    });
    const retrievedChunkIds = searchResults.map((result) => String(result.chunk_id)).filter(Boolean);
    const citations = searchResults.map((result) => ({
      chunkId: result.chunk_id,
      documentId: result.document_id,
      documentTitle: result.document_title,
      collectionKey: result.collection_key,
      citation: result.citation,
      excerpt: result.excerpt,
    }));
    const draftResponse = buildDraftResponse({ customerName, classification, citations });
    const actionPayload = {
      action: "support.response_draft",
      responseAction,
      taskId: task.id,
      taskReference: task.reference,
      workflowRunId,
      recipient: customerEmail || null,
      subject: `Re: ${subject}`,
      draftResponse,
      citations,
      gmailThreadId: gmailMessage.threadId,
      gmailMessageId: gmailMessage.id,
      externalSendBlocked: true,
    };

    await assertAgentToolPermission({
      supabase: input.supabase,
      organisationId: input.organisationId,
      agentId,
      toolKey: "email_draft",
      actionKey: "support.response_draft",
      integrationKey: "email",
      taskId: task.id,
      workflowRunId,
      approvalMode: "approval_request",
      workflowAllowedActions: ["support.response_draft"],
      workflowRequiresApproval: true,
      inputSummary: subject,
      riskClass: classification.riskClass,
      metadata: { source: "support_triage", eventSource: "gmail", responseAction },
    });

    const approval = await runApprovalRequestTool({
      supabase: input.supabase,
      organisationId: input.organisationId,
      agentId,
      taskId: task.id,
      workflowRunId,
      actionKey: "support.response_draft",
      actionPayload,
      riskClass: classification.riskClass,
      requiredReviewerCount: classification.riskClass >= 4 ? 2 : 1,
      policySnapshot: {
        source: "PB-031 Gmail Support Triage",
        externalSendRequiresApproval: policy.externalSendRequiresApproval !== false,
        responseAction,
        escalationTargets,
      },
      metadata: { source: "support_triage", eventSource: "gmail" },
    });
    const approvalId = typeof approval.id === "string" ? approval.id : "";
    if (!approvalId) {
      throw new Error("Unable to create Gmail support approval request.");
    }

    const { data: supportCase, error: caseError } = await input.supabase
      .schema("staffer")
      .from("support_triage_cases")
      .insert({
        organisation_id: input.organisationId,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approvalId,
        source_type: "gmail",
        source_message_id: gmailMessage.id,
        customer_name: customerName || null,
        customer_email: customerEmail || null,
        subject,
        message_body: messageBody,
        category: classification.category,
        severity: classification.severity,
        sentiment: classification.sentiment,
        onboarding_state: classification.onboardingState,
        sla_target_at: slaTargetAt,
        risk_class: classification.riskClass,
        classification,
        knowledge_query: knowledgeQuery,
        retrieved_chunk_ids: retrievedChunkIds,
        citations,
        draft_response: draftResponse,
        draft_status: "needs_review",
        escalation_targets: escalationTargets,
        specialist_reviews: {
          nakamura: escalationTargets.includes("nakamura") ? "review_required" : "not_required",
          lawal: escalationTargets.includes("lawal") ? "review_required" : "not_required",
        },
        response_action: responseAction,
        external_action_status: "approval_requested",
      })
      .select("id")
      .single();
    if (caseError || !supportCase?.id) {
      throw new Error(caseError?.message ?? "Unable to create Gmail support triage case.");
    }

    await Promise.allSettled([
      input.supabase.schema("staffer").from("gmail_ingestion_events").upsert(
        {
          organisation_id: input.organisationId,
          task_id: task.id,
          support_case_id: supportCase.id,
          gmail_message_id: gmailMessage.id,
          gmail_thread_id: gmailMessage.threadId,
          source_event_id: input.sourceEventId ?? `gmail-message:${gmailMessage.id}`,
          status: "processed",
          event_payload: { messageId: gmailMessage.id, threadId: gmailMessage.threadId },
          processed_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,source_event_id" },
      ),
      input.supabase.schema("staffer").from("task_evidence_events").insert({
        organisation_id: input.organisationId,
        task_id: task.id,
        event_type: "system",
        title: "Gmail support triage case created",
        body: "Anna ingested a Gmail message and prepared an approval-gated support draft.",
        metadata: { workflowEventType: "support_triage.gmail_case_created", supportCaseId: supportCase.id, approvalId, citations },
      }),
      input.supabase.schema("staffer").rpc("record_workflow_run_event", {
        target_organisation_id: input.organisationId,
        target_workflow_run_id: workflowRunId,
        target_step_run_id: null,
        target_event_type: "support_triage.gmail_ingested",
        target_title: "Gmail support message ingested",
        target_body: "Gmail message created a Support Triage case with a draft approval request.",
        target_metadata: { supportCaseId: supportCase.id, taskId: task.id, approvalId, gmailMessageId: gmailMessage.id },
      }),
      recordAuditEvent({
        organisationId: input.organisationId,
        actorType: "system",
        actorId: "gmail-ingestion",
        eventType: "support_triage.gmail_case_created",
        entityType: "support_triage_case",
        entityId: supportCase.id,
        summary: "Gmail message created a Customer Support Triage case.",
        details: {
          source: "PB-031",
          taskId: task.id,
          workflowRunId,
          approvalId,
          gmailMessageId: gmailMessage.id,
          gmailThreadId: gmailMessage.threadId,
          classification,
        },
      }),
    ]);

    return { status: "processed", supportCaseId: String(supportCase.id), taskId: String(task.id), approvalId };
  } catch (error) {
    await Promise.allSettled([
      input.supabase.schema("staffer").from("tasks").update({ status: "failed" }).eq("organisation_id", input.organisationId).eq("id", task.id),
      input.supabase.schema("staffer").from("gmail_ingestion_events").upsert(
        {
          organisation_id: input.organisationId,
          task_id: task.id,
          gmail_message_id: input.messageId,
          source_event_id: input.sourceEventId ?? `gmail-message:${input.messageId}`,
          status: "failed",
          event_payload: { messageId: input.messageId },
          error_message: error instanceof Error ? error.message : "Unknown Gmail ingestion failure.",
          processed_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,source_event_id" },
      ),
    ]);
    throw error;
  }
}
