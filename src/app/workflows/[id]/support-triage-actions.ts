"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertAgentToolPermission } from "@/lib/tools/permissions";
import { runApprovalRequestTool, runDocumentDraftTool, runKnowledgeSearchTool } from "@/lib/tools/internal";

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
    const searchResults = await runKnowledgeSearchTool({
      supabase: context.supabase,
      organisationId: context.membership.organisation_id,
      agentId: typeof annaAgent?.id === "string" ? annaAgent.id : null,
      actorUserId: context.user.id,
      taskId: task.id,
      workflowRunId,
      query: knowledgeQuery,
      collectionKeys: knowledgeCollectionKeys,
      limit: 4,
      riskClass: classification.riskClass,
      metadata: {
        workflowKey,
        source: "support_triage",
        replacesDirectRpc: "search_knowledge_chunks",
      },
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
    await assertAgentToolPermission({
      supabase: context.supabase,
      organisationId: context.membership.organisation_id,
      agentId: typeof annaAgent?.id === "string" ? annaAgent.id : null,
      toolKey: "email_draft",
      actionKey: "support.response_draft",
      actorUserId: context.user.id,
      taskId: task.id,
      workflowRunId,
      approvalMode: "approval_request",
      workflowAllowedActions: ["support.response_draft"],
      workflowRequiresApproval: true,
      integrationKey: "email",
      inputSummary: subject.slice(0, 240),
      riskClass: classification.riskClass,
      metadata: {
        workflowKey,
        source: "support_triage",
        responseAction,
      },
    });

    const approval = await runApprovalRequestTool({
      supabase: context.supabase,
      organisationId: context.membership.organisation_id,
      agentId: typeof annaAgent?.id === "string" ? annaAgent.id : null,
      actorUserId: context.user.id,
      taskId: task.id,
      workflowRunId,
      actionKey: "support.response_draft",
      actionPayload,
      riskClass: classification.riskClass,
      requiredReviewerCount: classification.riskClass >= 4 ? 2 : 1,
      policySnapshot: {
        source: "PB-025 Customer Support Triage",
        externalSendRequiresApproval: policy.externalSendRequiresApproval !== false,
        responseAction,
        escalationTargets,
      },
      metadata: {
        workflowKey,
        source: "support_triage",
      },
    });

    const approvalId = typeof approval.id === "string" ? approval.id : "";
    if (!approvalId) {
      throw new Error("Unable to create approval request.");
    }

    const { data: supportCase, error: caseError } = await context.supabase
      .schema("staffer")
      .from("support_triage_cases")
      .insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approvalId,
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
        metadata: { workflowEventType: "support_triage.case_created", supportCaseId: supportCase.id, approvalId, citations },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").rpc("record_workflow_run_event", {
        target_organisation_id: context.membership.organisation_id,
        target_workflow_run_id: workflowRunId,
        target_step_run_id: null,
        target_event_type: "support_triage.draft_approval_requested",
        target_title: "Support draft approval requested",
        target_body: "Customer-visible response remains blocked pending human approval.",
        target_metadata: { supportCaseId: supportCase.id, taskId: task.id, approvalId },
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
          approvalId,
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

function specialistConfig(specialistKey: string) {
  if (specialistKey === "nakamura") {
    return {
      reviewType: "technical_security_release",
      title: "Nakamura technical/security review completed",
      body: "Technical accuracy, security, testing and release-risk review was recorded for this support case.",
    };
  }

  if (specialistKey === "lawal") {
    return {
      reviewType: "data_protection_compliance",
      title: "Lawal compliance review completed",
      body: "Data-protection, regulated-industry, policy, evidence and reportability review was recorded for this support case.",
    };
  }

  throw new Error("Specialist review must be for Nakamura or Lawal.");
}

export async function completeSupportSpecialistReviewAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey") || "support-triage";
  const supportCaseId = text(formData, "supportCaseId");
  const specialistKey = text(formData, "specialistKey").toLowerCase();
  const reviewerComment = text(formData, "reviewerComment");
  const status = text(formData, "status") || "completed";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: `Demo ${specialistKey || "specialist"} review recorded.` });
  }

  try {
    if (!supportCaseId || !specialistKey || !reviewerComment) {
      throw new Error("Support case, specialist and reviewer comment are required.");
    }

    const review = specialistConfig(specialistKey);
    const context = await liveContext();
    const { data: supportCase, error: caseError } = await context.supabase
      .schema("staffer")
      .from("support_triage_cases")
      .select("id, task_id, workflow_run_id, subject, risk_class, escalation_targets, specialist_review_status")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("id", supportCaseId)
      .maybeSingle();
    if (caseError || !supportCase) {
      throw new Error(caseError?.message ?? "Support case was not found.");
    }

    const { data: specialistAgent } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("id")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("key", specialistKey)
      .maybeSingle();

    const now = new Date().toISOString();
    const findings = {
      specialistKey,
      reviewType: review.reviewType,
      subject: String(supportCase.subject ?? "Support case"),
      comment: reviewerComment,
      riskClass: Number(supportCase.risk_class ?? 3),
      reviewedAt: now,
    };
    const reviewStatus = status === "changes_requested" ? "changes_requested" : status === "blocked" ? "blocked" : "completed";
    const writeResults = await Promise.all([
      context.supabase.schema("staffer").from("support_specialist_reviews").upsert(
        {
          organisation_id: context.membership.organisation_id,
          support_case_id: supportCase.id,
          task_id: supportCase.task_id ?? null,
          workflow_run_id: supportCase.workflow_run_id ?? null,
          specialist_agent_id: typeof specialistAgent?.id === "string" ? specialistAgent.id : null,
          specialist_key: specialistKey,
          review_type: review.reviewType,
          status: reviewStatus,
          findings,
          reviewer_comment: reviewerComment,
          reviewed_by: context.user.id,
          created_by: context.user.id,
          reviewed_at: now,
          updated_at: now,
        },
        { onConflict: "organisation_id,support_case_id,specialist_key,review_type" },
      ),
      context.supabase
        .schema("staffer")
        .from("support_triage_cases")
        .update({
          specialist_review_status: reviewStatus === "completed" ? "completed" : "blocked",
          updated_at: now,
        })
        .eq("organisation_id", context.membership.organisation_id)
        .eq("id", supportCase.id),
      supportCase.task_id
        ? context.supabase.schema("staffer").from("task_evidence_events").insert({
            organisation_id: context.membership.organisation_id,
            task_id: supportCase.task_id,
            event_type: "specialist_review",
            title: review.title,
            body: reviewerComment,
            metadata: { workflowEventType: "support_triage.specialist_review_completed", supportCaseId: supportCase.id, specialistKey, reviewType: review.reviewType, findings },
            created_by: context.user.id,
          })
        : Promise.resolve({ error: null }),
      supportCase.workflow_run_id
        ? context.supabase.schema("staffer").rpc("record_workflow_run_event", {
            target_organisation_id: context.membership.organisation_id,
            target_workflow_run_id: supportCase.workflow_run_id,
            target_step_run_id: null,
            target_event_type: "support_triage.specialist_review_completed",
            target_title: review.title,
            target_body: review.body,
            target_metadata: { supportCaseId: supportCase.id, specialistKey, reviewType: review.reviewType, reviewStatus },
          })
        : Promise.resolve({ error: null }),
    ]);
    const failedWrite = writeResults.find((result) => result?.error);
    if (failedWrite?.error) {
      throw new Error(failedWrite.error.message);
    }

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "support_triage.specialist_review_completed",
      entityType: "support_triage_case",
      entityId: supportCase.id,
      summary: `${specialistKey} completed a governed support specialist review.`,
      details: { supportCaseId: supportCase.id, specialistKey, reviewType: review.reviewType, reviewStatus, findings },
    });

    revalidatePath(`/workflows/${workflowKey}`);
    revalidatePath("/tasks");
    redirectWithParams(`/workflows/${workflowKey}`, { message: `${specialistKey} review recorded for support case.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/workflows/${workflowKey}`, { error: error instanceof Error ? error.message : "Unable to record specialist review." });
  }
}

export async function createSupportKnowledgeFollowupAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey") || "support-triage";
  const supportCaseId = text(formData, "supportCaseId");
  const reusableFinding = text(formData, "reusableFinding");
  const draftTitle = text(formData, "draftTitle");
  const draftContent = text(formData, "draftContent");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo Kristin knowledge follow-up draft created." });
  }

  try {
    if (!supportCaseId || !reusableFinding || !draftTitle || !draftContent) {
      throw new Error("Support case, reusable finding, draft title and draft content are required.");
    }

    const context = await liveContext();
    const { data: supportCase, error: caseError } = await context.supabase
      .schema("staffer")
      .from("support_triage_cases")
      .select("id, task_id, workflow_run_id, subject, customer_email, citations")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("id", supportCaseId)
      .maybeSingle();
    if (caseError || !supportCase) {
      throw new Error(caseError?.message ?? "Support case was not found.");
    }

    const { data: kristinAgent } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("id")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("key", "kristin")
      .maybeSingle();

    const citations = Array.isArray(supportCase.citations) ? (supportCase.citations as JsonRecord[]) : [];
    const draft = await runDocumentDraftTool({
      supabase: context.supabase,
      organisationId: context.membership.organisation_id,
      agentId: typeof kristinAgent?.id === "string" ? kristinAgent.id : null,
      actorUserId: context.user.id,
      taskId: supportCase.task_id ?? null,
      workflowRunId: supportCase.workflow_run_id ?? null,
      title: draftTitle,
      content: draftContent,
      memoryScope: "company",
      projectKey: "customer-support",
      customerKey: null,
      sensitivity: "internal",
      riskClass: 2,
      metadata: {
        source: "support_triage",
        supportCaseId: supportCase.id,
        reusableFinding,
        citations,
      },
    });

    const documentId = typeof draft.id === "string" ? draft.id : null;
    const now = new Date().toISOString();
    const writeResults = await Promise.all([
      context.supabase.schema("staffer").from("support_knowledge_followups").insert({
        organisation_id: context.membership.organisation_id,
        support_case_id: supportCase.id,
        task_id: supportCase.task_id ?? null,
        document_id: documentId,
        status: documentId ? "draft_created" : "draft_requested",
        reusable_finding: reusableFinding,
        draft_title: draftTitle,
        draft_content: draftContent,
        citations,
        created_by: context.user.id,
        updated_at: now,
      }),
      context.supabase.schema("staffer").from("support_specialist_reviews").upsert(
        {
          organisation_id: context.membership.organisation_id,
          support_case_id: supportCase.id,
          task_id: supportCase.task_id ?? null,
          workflow_run_id: supportCase.workflow_run_id ?? null,
          specialist_agent_id: typeof kristinAgent?.id === "string" ? kristinAgent.id : null,
          specialist_key: "kristin",
          review_type: "knowledge_follow_up",
          status: "completed",
          findings: { reusableFinding, draftTitle, documentId, citations },
          reviewer_comment: reusableFinding,
          reviewed_by: context.user.id,
          created_by: context.user.id,
          reviewed_at: now,
          updated_at: now,
        },
        { onConflict: "organisation_id,support_case_id,specialist_key,review_type" },
      ),
      context.supabase
        .schema("staffer")
        .from("support_triage_cases")
        .update({ knowledge_followup_status: documentId ? "draft_created" : "draft_requested", updated_at: now })
        .eq("organisation_id", context.membership.organisation_id)
        .eq("id", supportCase.id),
      supportCase.task_id
        ? context.supabase.schema("staffer").from("task_evidence_events").insert({
            organisation_id: context.membership.organisation_id,
            task_id: supportCase.task_id,
            event_type: "knowledge_followup",
            title: "Kristin knowledge follow-up draft created",
            body: reusableFinding,
            metadata: { workflowEventType: "support_triage.knowledge_followup_created", supportCaseId: supportCase.id, documentId, draftTitle },
            created_by: context.user.id,
          })
        : Promise.resolve({ error: null }),
      supportCase.workflow_run_id
        ? context.supabase.schema("staffer").rpc("record_workflow_run_event", {
            target_organisation_id: context.membership.organisation_id,
            target_workflow_run_id: supportCase.workflow_run_id,
            target_step_run_id: null,
            target_event_type: "support_triage.knowledge_followup_created",
            target_title: "Kristin knowledge follow-up drafted",
            target_body: "A reusable support finding was turned into a governed draft knowledge artifact.",
            target_metadata: { supportCaseId: supportCase.id, documentId, draftTitle },
          })
        : Promise.resolve({ error: null }),
    ]);
    const failedWrite = writeResults.find((result) => result?.error);
    if (failedWrite?.error) {
      throw new Error(failedWrite.error.message);
    }

    await recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "user",
      actorId: context.user.id,
      eventType: "support_triage.knowledge_followup_created",
      entityType: "support_triage_case",
      entityId: supportCase.id,
      summary: "Reusable support finding was converted into a governed knowledge draft.",
      details: { supportCaseId: supportCase.id, documentId, reusableFinding, draftTitle },
    });

    revalidatePath(`/workflows/${workflowKey}`);
    revalidatePath("/knowledge");
    revalidatePath("/tasks");
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Kristin knowledge follow-up draft created from support case." });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/workflows/${workflowKey}`, { error: error instanceof Error ? error.message : "Unable to create knowledge follow-up." });
  }
}
