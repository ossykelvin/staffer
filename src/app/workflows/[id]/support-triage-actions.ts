"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithParams(path: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params);
  redirect(`${path}?${search.toString()}`);
}

function isRedirectError(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function workflowRunIdFromResult(value: unknown) {
  const record = asRecord(Array.isArray(value) ? value[0] : value);
  const id = record.run_id ?? record.workflow_run_id ?? record.id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function includesAnyKeyword(haystack: string, keywords: unknown) {
  return asStringArray(keywords).some((keyword) => haystack.includes(keyword.toLowerCase()));
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

function buildDraftResponse(input: {
  customerName: string;
  subject: string;
  classification: Classification;
  citations: JsonRecord[];
}) {
  const greetingName = input.customerName || "there";
  const citedSources = input.citations
    .slice(0, 3)
    .map((citation, index) => `${index + 1}. ${String(citation.documentTitle ?? citation.document_title ?? "Approved support source")}`)
    .join("\n");
  const specialistNote =
    input.classification.severity === "critical" || ["security", "data_protection", "compliance", "banking_application"].includes(input.classification.category)
      ? "I’m also routing this for specialist review before anything customer-visible is sent."
      : "I’ll keep this moving and make sure the next action is clear.";

  return `Hi ${greetingName},

Thanks for reaching out — I’ve picked this up and classified it as ${input.classification.severity} priority under ${input.classification.category.replace(/_/g, " ")}.

${specialistNote}

Based on the approved knowledge available, the safe next step is to confirm the issue details, avoid unsupported commitments, and provide a clear follow-up path. I’ll share the verified troubleshooting or account-specific guidance once the support evidence has been reviewed.

Sources checked:
${citedSources || "- No approved knowledge source matched yet; human review should confirm the response before external use."}

Kind regards,
Anna`;
}

function responsePolicy(settings: JsonRecord) {
  return asRecord(settings.response_policy);
}

async function liveContext() {
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();
  const supabase = await getSupabaseServerClient();

  if (!user || !membership?.organisation_id || !supabase) {
    throw new Error("Customer Support Triage requires an authenticated organisation member.");
  }

  return { user, membership, supabase };
}

type LiveContext = Awaited<ReturnType<typeof liveContext>>;
type CreatedTask = { id: string; reference: string };

async function recordSupportTriageFailure(context: LiveContext, task: CreatedTask, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown support triage failure.";

  await Promise.allSettled([
    context.supabase
      .schema("staffer")
      .from("tasks")
      .update({ status: "failed" })
      .eq("organisation_id", context.membership.organisation_id)
      .eq("id", task.id),
    context.supabase.schema("staffer").from("task_evidence_events").insert({
      organisation_id: context.membership.organisation_id,
      task_id: task.id,
      event_type: "system",
      title: "Support triage workflow failed",
      body: message,
      metadata: {
        workflowEventType: "support_triage.workflow_failed",
        taskReference: task.reference,
      },
      created_by: context.user.id,
    }),
    recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "system",
      actorId: "support-triage",
      eventType: "support_triage.workflow_failed",
      entityType: "task",
      entityId: task.id,
      summary: "Customer Support Triage failed after task creation.",
      details: {
        taskReference: task.reference,
        error: message,
      },
    }),
  ]);
}

export async function startSupportTriageAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey") || "support-triage";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo support triage staged. Live cases are saved when demo mode is disabled." });
  }

  let contextForFailure: LiveContext | null = null;
  let createdTask: CreatedTask | null = null;

  try {
    const subject = text(formData, "subject");
    const messageBody = text(formData, "messageBody");
    const customerName = text(formData, "customerName");
    const customerEmail = text(formData, "customerEmail");
    const productArea = text(formData, "productArea");
    const sourceType = text(formData, "sourceType") || "manual";
    const sourceMessageId = text(formData, "sourceMessageId");

    if (!subject || !messageBody) {
      throw new Error("Subject and message body are required.");
    }

    const context = await liveContext();
    contextForFailure = context;
    const settingsResult = await context.supabase.schema("staffer").rpc("ensure_support_triage_settings", {
      target_organisation_id: context.membership.organisation_id,
    });
    if (settingsResult.error) {
      throw new Error(settingsResult.error.message);
    }

    const workflowResult = await context.supabase.schema("staffer").rpc("ensure_support_triage_workflow", {
      target_organisation_id: context.membership.organisation_id,
    });
    if (workflowResult.error) {
      throw new Error(workflowResult.error.message);
    }

    const settings = asRecord(settingsResult.data);
    const policy = responsePolicy(settings);
    const classification = classifySupportMessage({ subject, body: messageBody, settings });
    const routingRules = asRecord(settings.routing_rules);
    const escalationTargets = asStringArray(routingRules[classification.category]).length ? asStringArray(routingRules[classification.category]) : ["anna"];
    const knowledgeCollectionKeys = asStringArray(policy.knowledgeCollectionKeys);
    const responseAction = typeof policy.defaultResponseAction === "string" ? policy.defaultResponseAction : "create_draft_after_approval";

    const { data: annaAgent } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("id, key, name")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("key", "anna")
      .maybeSingle();

    const now = new Date();
    const slaTargetAt = classification.slaHours ? new Date(now.getTime() + classification.slaHours * 60 * 60 * 1000).toISOString() : null;
    const reference = `SUP-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const taskInput = {
      sourceType,
      sourceMessageId: sourceMessageId || null,
      customerName,
      customerEmail,
      subject,
      productArea,
      classification,
    };

    const { data: task, error: taskError } = await context.supabase
      .schema("staffer")
      .from("tasks")
      .insert({
        organisation_id: context.membership.organisation_id,
        reference,
        title: `Support triage: ${subject}`,
        description: messageBody,
        project_key: "customer-support",
        priority: Math.min(4, Math.max(1, classification.riskClass - 1)),
        status: "approval",
        assigned_agent_id: typeof annaAgent?.id === "string" ? annaAgent.id : null,
        due_at: slaTargetAt,
        input: taskInput,
        idempotency_key: sourceMessageId ? `support-triage:${sourceType}:${sourceMessageId}` : `support-triage:${reference}`,
        created_by: context.user.id,
      })
      .select("id, reference")
      .single();

    if (taskError || !task?.id) {
      throw new Error(taskError?.message ?? "Unable to create support task.");
    }
    createdTask = { id: task.id, reference: task.reference };

    const workflowRunResult = await context.supabase.schema("staffer").rpc("start_workflow_run", {
      target_workflow_key: workflowKey,
      target_task_id: task.id,
      target_trigger_type: sourceType === "gmail" ? "gmail_event" : "manual_support_intake",
      target_trigger_payload: taskInput,
      target_idempotency_key: sourceMessageId ? `${workflowKey}:${sourceType}:${sourceMessageId}` : `${workflowKey}:${task.id}`,
    });
    if (workflowRunResult.error) {
      throw new Error(workflowRunResult.error.message);
    }
    const workflowRunId = workflowRunIdFromResult(workflowRunResult.data);
    if (!workflowRunId) {
      throw new Error("Workflow run was not created for the support triage task.");
    }

    const knowledgeQuery = buildKnowledgeQuery(subject, messageBody, classification);
    const { data: searchData } = await context.supabase.schema("staffer").rpc("search_knowledge_chunks", {
      target_query: knowledgeQuery,
      target_agent_id: typeof annaAgent?.id === "string" ? annaAgent.id : null,
      target_collection_keys: knowledgeCollectionKeys.length ? knowledgeCollectionKeys : null,
      target_limit: 4,
    });
    const searchResults = Array.isArray(searchData) ? (searchData as JsonRecord[]) : [];
    const retrievedChunkIds = searchResults.map((result) => String(result.chunk_id)).filter(Boolean);
    const citations = searchResults.map((result) => ({
      chunkId: result.chunk_id,
      documentId: result.document_id,
      documentTitle: result.document_title,
      collectionKey: result.collection_key,
      citation: result.citation,
      excerpt: result.excerpt,
    }));
    const draftResponse = buildDraftResponse({ customerName, subject, classification, citations });
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
      externalSendBlocked: true,
    };
    const hashResult = await context.supabase.schema("staffer").rpc("approval_payload_hash", {
      target_payload: actionPayload,
    });
    if (hashResult.error || typeof hashResult.data !== "string") {
      throw new Error(hashResult.error?.message ?? "Unable to hash approval payload.");
    }

    const { data: approval, error: approvalError } = await context.supabase
      .schema("staffer")
      .from("approvals")
      .insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        requested_by_agent_id: typeof annaAgent?.id === "string" ? annaAgent.id : null,
        requested_by_user_id: context.user.id,
        action_key: "support.response_draft",
        action_payload: actionPayload,
        payload_hash: hashResult.data,
        risk_class: classification.riskClass,
        status: "pending",
        required_reviewer_count: classification.riskClass >= 4 ? 2 : 1,
        policy_snapshot: {
          source: "PB-025 Customer Support Triage",
          externalSendRequiresApproval: policy.externalSendRequiresApproval !== false,
          responseAction,
          escalationTargets,
        },
      })
      .select("id")
      .single();

    if (approvalError || !approval?.id) {
      throw new Error(approvalError?.message ?? "Unable to create approval request.");
    }

    const { data: supportCase, error: caseError } = await context.supabase
      .schema("staffer")
      .from("support_triage_cases")
      .insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approval.id,
        source_type: sourceType,
        source_message_id: sourceMessageId || null,
        customer_name: customerName || null,
        customer_email: customerEmail || null,
        subject,
        message_body: messageBody,
        product_area: productArea || null,
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
        created_by: context.user.id,
      })
      .select("id")
      .single();

    if (caseError || !supportCase?.id) {
      throw new Error(caseError?.message ?? "Unable to create support triage case.");
    }

    await Promise.all([
      context.supabase.schema("staffer").from("task_evidence_events").insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        event_type: "system",
        title: "Support triage case created",
        body: `Anna classified this as ${classification.severity} / ${classification.category.replace(/_/g, " ")} and prepared an approval-gated draft response.`,
        metadata: { workflowEventType: "support_triage.case_created", supportCaseId: supportCase.id, approvalId: approval.id, citations },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").rpc("record_workflow_run_event", {
        target_organisation_id: context.membership.organisation_id,
        target_workflow_run_id: workflowRunId,
        target_step_run_id: null,
        target_event_type: "support_triage.draft_approval_requested",
        target_title: "Support draft approval requested",
        target_body: "Customer-visible response remains blocked pending human approval.",
        target_metadata: { supportCaseId: supportCase.id, taskId: task.id, approvalId: approval.id },
      }),
      recordAuditEvent({
        organisationId: context.membership.organisation_id,
        actorType: "user",
        actorId: context.user.id,
        eventType: "support_triage.case_created",
        entityType: "support_triage_case",
        entityId: supportCase.id,
        summary: "Customer Support Triage case created with approval-gated draft response.",
        details: {
          taskId: task.id,
          taskReference: task.reference,
          workflowRunId,
          approvalId: approval.id,
          classification,
          escalationTargets,
          retrievedChunkCount: retrievedChunkIds.length,
        },
      }),
    ]);

    revalidatePath(`/workflows/${workflowKey}`);
    revalidatePath("/tasks");
    revalidatePath("/approvals");
    redirectWithParams(`/workflows/${workflowKey}`, { message: `Support triage case ${reference} created. Draft response is waiting for approval.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (contextForFailure && createdTask) {
      await recordSupportTriageFailure(contextForFailure, createdTask, error);
    }
    redirectWithParams(`/workflows/${workflowKey}`, { error: error instanceof Error ? error.message : "Unable to create support triage case." });
  }
}
