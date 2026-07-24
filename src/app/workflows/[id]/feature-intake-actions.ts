"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { verifyGitHubIssueRepositoryReadiness } from "@/lib/github/issues";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { assertAgentToolPermission } from "@/lib/tools/permissions";
import { runApprovalRequestTool } from "@/lib/tools/internal";

type JsonRecord = Record<string, unknown>;

type FeaturePriority = "low" | "medium" | "high" | "critical";

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

function classifyFeature(input: { title: string; problem: string; outcome: string; evidence: string; settings: JsonRecord }) {
  const combined = `${input.title}\n${input.problem}\n${input.outcome}\n${input.evidence}`.toLowerCase();
  const priorityRules = asRecord(input.settings.priority_rules);

  for (const candidate of ["critical", "high", "medium", "low"] as const) {
    const rule = asRecord(priorityRules[candidate]);
    if (includesAnyKeyword(combined, rule.keywords)) {
      return {
        priority: candidate,
        riskClass: typeof rule.riskClass === "number" ? rule.riskClass : 3,
        targetDays: typeof rule.targetDays === "number" ? rule.targetDays : 10,
        rationale: [`Matched ${candidate} feature-intake keywords.`],
      };
    }
  }

  return {
    priority: "medium" as FeaturePriority,
    riskClass: 3,
    targetDays: 10,
    rationale: ["No high-risk feature keywords matched; defaulted to medium priority."],
  };
}

function sentenceList(value: string) {
  return value
    .split(/\n|\. /)
    .map((item) => item.replace(/\.$/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildArtifacts(input: {
  title: string;
  problem: string;
  outcome: string;
  evidence: string;
  productArea: string;
  customerSegment: string;
  priority: FeaturePriority;
  riskClass: number;
  rationale: string[];
  repository: string;
  labels: string[];
}) {
  const problemPoints = sentenceList(input.problem);
  const outcomePoints = sentenceList(input.outcome);
  const evidencePoints = sentenceList(input.evidence);
  const productArea = input.productArea || "Product";
  const customerSegment = input.customerSegment || "Unspecified segment";

  const nancySummary = {
    problem: input.problem,
    expectedOutcome: input.outcome,
    productArea,
    customerSegment,
    priority: input.priority,
    rationale: input.rationale,
  };

  const mobolaRequirements = {
    userStories: [
      `As a ${customerSegment}, I need ${input.title.toLowerCase()} so that ${input.outcome.toLowerCase()}.`,
      "As an operator, I need the work to be traceable from request to approval so every decision has evidence.",
    ],
    acceptanceCriteria: [
      "Given a feature request, when it is submitted, then Staffer creates a task, workflow run and approval-gated GitHub issue payload.",
      "Given the payload is reviewed, when approval is granted, then exact-payload verification can be used before any GitHub issue is created.",
      "Given sensitive or regulated evidence is included, then public issue text must avoid unnecessary personal data.",
    ],
    traceability: {
      problemPoints,
      outcomePoints,
      evidencePoints,
    },
  };

  const andersonArchitecture = {
    recommendedOption: "Use the existing durable workflow, task, approval and audit primitives; do not introduce a separate feature-request engine.",
    securityImpact: input.riskClass >= 4 ? "High-risk request: require specialist review and exact-payload approval before public or external artifacts." : "Standard tenant-scoped request with approval before GitHub issue creation.",
    dependencies: ["staffer.tasks", "staffer.workflow_runs", "staffer.approvals", "staffer.feature_intake_requests"],
    risks: ["Public GitHub issue bodies can leak customer or regulated context if not redacted.", "Roadmap commitments must remain approval-gated."],
  };

  const rajDeliveryPlan = {
    slices: [
      "Persist the feature intake request and task.",
      "Generate specialist artifacts from captured evidence.",
      "Route founder approval on the GitHub issue payload.",
      "After approval, create or hand off the GitHub issue through a governed tool.",
    ],
    githubTasks: [
      "Implement the smallest vertical product change.",
      "Add tests for success, validation failure and approval-gated execution.",
      "Attach evidence, migration notes and rollback notes to the PR.",
    ],
  };

  const nakamuraTestPlan = {
    acceptanceTests: [
      "Submitting the form creates one task and one idempotent workflow run.",
      "Approval payload hash is stable and must match before GitHub execution.",
      "High-risk requests require the configured reviewer count.",
    ],
    releaseRisks: input.riskClass >= 4 ? ["High risk: add security and regression evidence before release."] : ["Normal regression risk."],
  };

  const lawalComplianceReview = {
    dataProtection: ["Redact customer personal data from public issue bodies unless explicitly approved.", "Retain source evidence in Staffer rather than external trackers when sensitive."],
    regulatedControls: input.riskClass >= 4 ? ["Founder approval", "Compliance review", "Audit evidence", "Exact-payload execution check"] : ["Founder approval", "Audit evidence"],
    residualRisk: input.riskClass >= 4 ? "Medium until sensitive details are redacted from external artifacts." : "Low with normal approval controls.",
  };

  const githubIssuePayload = {
    action: "github.issue_draft",
    repository: input.repository,
    title: `[Feature Intake] ${input.title}`,
    labels: input.labels,
    body: [
      "## Product problem",
      input.problem,
      "",
      "## Expected outcome",
      input.outcome,
      "",
      "## Evidence",
      input.evidence || "No additional evidence supplied.",
      "",
      "## Requirements",
      ...mobolaRequirements.acceptanceCriteria.map((criterion) => `- ${criterion}`),
      "",
      "## Architecture / risk",
      `- ${andersonArchitecture.recommendedOption}`,
      `- ${andersonArchitecture.securityImpact}`,
      "",
      "## QA and compliance",
      ...nakamuraTestPlan.acceptanceTests.map((test) => `- ${test}`),
      ...lawalComplianceReview.dataProtection.map((control) => `- ${control}`),
      "",
      "## Governance",
      "Do not create this GitHub issue until the Staffer approval payload is approved and exact-payload verified.",
    ].join("\n"),
  };

  return { nancySummary, mobolaRequirements, andersonArchitecture, rajDeliveryPlan, nakamuraTestPlan, lawalComplianceReview, githubIssuePayload };
}

async function liveContext() {
  const user = await getCurrentUser();
  const membership = await getCurrentMembership();
  const supabase = await getSupabaseServerClient();

  if (!user || !membership?.organisation_id || !supabase) {
    throw new Error("Feature Intake requires an authenticated organisation member.");
  }

  return { user, membership, supabase };
}

type LiveContext = Awaited<ReturnType<typeof liveContext>>;
type CreatedTask = { id: string; reference: string; workflowRunId: string | null };

async function recordFeatureIntakeFailure(context: LiveContext, task: CreatedTask, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown feature intake failure.";

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
      title: "Feature intake workflow failed",
      body: message,
      metadata: {
        workflowEventType: "feature_intake.workflow_failed",
        taskReference: task.reference,
        workflowRunId: task.workflowRunId,
      },
      created_by: context.user.id,
    }),
    task.workflowRunId
      ? context.supabase.schema("staffer").rpc("record_workflow_run_event", {
          target_organisation_id: context.membership.organisation_id,
          target_workflow_run_id: task.workflowRunId,
          target_step_run_id: null,
          target_event_type: "feature_intake.workflow_failed",
          target_title: "Feature intake workflow failed",
          target_body: message,
          target_metadata: { taskId: task.id, taskReference: task.reference },
        })
      : Promise.resolve(),
    recordAuditEvent({
      organisationId: context.membership.organisation_id,
      actorType: "system",
      actorId: "feature-intake",
      eventType: "feature_intake.workflow_failed",
      entityType: "task",
      entityId: task.id,
      summary: "Feature Intake failed after task creation.",
      details: {
        taskReference: task.reference,
        workflowRunId: task.workflowRunId,
        error: message,
      },
    }),
  ]);
}

export async function startFeatureIntakeAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey") || "feature-intake";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo feature intake staged. Live requests are saved when demo mode is disabled." });
  }

  let contextForFailure: LiveContext | null = null;
  let createdTask: CreatedTask | null = null;

  try {
    const title = text(formData, "title");
    const problemStatement = text(formData, "problemStatement");
    const expectedOutcome = text(formData, "expectedOutcome");
    const evidence = text(formData, "evidence");
    const productArea = text(formData, "productArea");
    const customerSegment = text(formData, "customerSegment");
    const requesterName = text(formData, "requesterName");
    const requesterEmail = text(formData, "requesterEmail");
    const sourceType = text(formData, "sourceType") || "manual";
    const sourceReference = text(formData, "sourceReference");

    if (!title || !problemStatement || !expectedOutcome) {
      throw new Error("Title, product problem and expected outcome are required.");
    }

    const context = await liveContext();
    contextForFailure = context;
    const settingsResult = await context.supabase.schema("staffer").rpc("ensure_feature_intake_settings", {
      target_organisation_id: context.membership.organisation_id,
    });
    if (settingsResult.error) {
      throw new Error(settingsResult.error.message);
    }

    const workflowResult = await context.supabase.schema("staffer").rpc("ensure_feature_intake_workflow", {
      target_organisation_id: context.membership.organisation_id,
    });
    if (workflowResult.error) {
      throw new Error(workflowResult.error.message);
    }

    await context.supabase.schema("staffer").rpc("create_default_task_templates", {
      target_organisation_id: context.membership.organisation_id,
    });

    const settings = asRecord(settingsResult.data);
    const githubPolicy = asRecord(settings.github_policy);
    const repository = typeof githubPolicy.defaultRepository === "string" ? githubPolicy.defaultRepository : "";
    const labels = asStringArray(githubPolicy.labels);
    if (!repository || !labels.length) {
      throw new Error("Feature Intake GitHub policy must define a default repository and at least one label.");
    }
    const classification = classifyFeature({ title, problem: problemStatement, outcome: expectedOutcome, evidence, settings });
    const now = new Date();
    const targetDecisionAt = new Date(now.getTime() + classification.targetDays * 24 * 60 * 60 * 1000).toISOString();
    const reference = `FEAT-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const { data: nancyAgent } = await context.supabase
      .schema("staffer")
      .from("agents")
      .select("id, key, name")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("key", "nancy")
      .maybeSingle();

    const artifacts = buildArtifacts({
      title,
      problem: problemStatement,
      outcome: expectedOutcome,
      evidence,
      productArea,
      customerSegment,
      priority: classification.priority,
      riskClass: classification.riskClass,
      rationale: classification.rationale,
      repository,
      labels,
    });

    const taskInput = {
      sourceType,
      sourceReference: sourceReference || null,
      requesterName,
      requesterEmail,
      customerSegment,
      productArea,
      classification,
    };

    const { data: task, error: taskError } = await context.supabase
      .schema("staffer")
      .from("tasks")
      .insert({
        organisation_id: context.membership.organisation_id,
        reference,
        title: `Feature intake: ${title}`,
        description: `${problemStatement}\n\nExpected outcome:\n${expectedOutcome}`,
        project_key: productArea || "product-intake",
        priority: classification.priority === "critical" ? 4 : classification.priority === "high" ? 3 : classification.priority === "medium" ? 2 : 1,
        status: "approval",
        assigned_agent_id: typeof nancyAgent?.id === "string" ? nancyAgent.id : null,
        due_at: targetDecisionAt,
        input: taskInput,
        idempotency_key: sourceReference ? `feature-intake:${sourceType}:${sourceReference}` : `feature-intake:${reference}`,
        retry_policy: { maxRetries: 2, backoffHours: 4 },
        created_by: context.user.id,
      })
      .select("id, reference")
      .single();

    if (taskError || !task?.id) {
      throw new Error(taskError?.message ?? "Unable to create feature intake task.");
    }
    createdTask = { id: task.id, reference: task.reference, workflowRunId: null };

    const workflowRunResult = await context.supabase.schema("staffer").rpc("start_workflow_run", {
      target_workflow_key: workflowKey,
      target_task_id: task.id,
      target_trigger_type: sourceType === "manual" ? "manual_feature_intake" : sourceType,
      target_trigger_payload: taskInput,
      target_idempotency_key: sourceReference ? `${workflowKey}:${sourceType}:${sourceReference}` : `${workflowKey}:${task.id}`,
    });
    if (workflowRunResult.error) {
      throw new Error(workflowRunResult.error.message);
    }
    const workflowRunId = workflowRunIdFromResult(workflowRunResult.data);
    if (!workflowRunId) {
      throw new Error("Workflow run was not created for the feature intake task.");
    }
    createdTask = { ...createdTask, workflowRunId };

    const appBaseUrl = publicEnv.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    const evidenceLinks = [
      `- Staffer task: ${appBaseUrl ? `${appBaseUrl}/tasks/${task.id}` : `${task.reference} (${task.id})`}`,
      `- Workflow run: ${appBaseUrl ? `${appBaseUrl}/workflows/${workflowKey}` : workflowRunId}`,
    ].filter(Boolean);

    const actionPayload = {
      ...artifacts.githubIssuePayload,
      body: [
        artifacts.githubIssuePayload.body,
        "",
        "## Staffer evidence links",
        ...evidenceLinks,
        "- Approval: pending at payload creation; Staffer records the exact payload hash before execution.",
      ].join("\n"),
      taskId: task.id,
      taskReference: task.reference,
      workflowRunId,
      featureTitle: title,
      externalCreationBlocked: true,
    };
    const githubDraftPermission = await assertAgentToolPermission({
      supabase: context.supabase,
      organisationId: context.membership.organisation_id,
      agentId: typeof nancyAgent?.id === "string" ? nancyAgent.id : null,
      toolKey: "github_issue_draft",
      actionKey: "github.issue_draft",
      actorUserId: context.user.id,
      taskId: task.id,
      workflowRunId,
      approvalMode: "approval_request",
      workflowAllowedActions: ["github.issue_draft"],
      workflowRequiresApproval: true,
      integrationKey: "github",
      inputSummary: title.slice(0, 240),
      riskClass: classification.riskClass,
      metadata: {
        workflowKey,
        source: "feature_intake",
        repository,
      },
    });

    const approval = await runApprovalRequestTool({
      supabase: context.supabase,
      organisationId: context.membership.organisation_id,
      agentId: typeof nancyAgent?.id === "string" ? nancyAgent.id : null,
      actorUserId: context.user.id,
      taskId: task.id,
      workflowRunId,
      actionKey: "github.issue_draft",
      actionPayload,
      riskClass: classification.riskClass,
      requiredReviewerCount: classification.riskClass >= 4 ? 2 : 1,
      policySnapshot: {
        source: "PB-026 Feature Intake to Engineering",
        createIssueRequiresApproval: githubPolicy.createIssueRequiresApproval !== false,
        repository,
        labels,
      },
      metadata: {
        workflowKey,
        source: "feature_intake",
        repository,
      },
    });
    const approvalId = typeof approval.id === "string" ? approval.id : "";
    if (!approvalId) {
      throw new Error("Unable to create feature approval request.");
    }

    const { data: featureRequest, error: featureError } = await context.supabase
      .schema("staffer")
      .from("feature_intake_requests")
      .insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approvalId,
        source_type: sourceType,
        source_reference: sourceReference || null,
        requester_name: requesterName || null,
        requester_email: requesterEmail || null,
        customer_segment: customerSegment || null,
        product_area: productArea || null,
        title,
        problem_statement: problemStatement,
        expected_outcome: expectedOutcome,
        evidence: evidence || null,
        priority: classification.priority,
        risk_class: classification.riskClass,
        target_decision_at: targetDecisionAt,
        nancy_summary: artifacts.nancySummary,
        mobola_requirements: artifacts.mobolaRequirements,
        anderson_architecture: artifacts.andersonArchitecture,
        raj_delivery_plan: artifacts.rajDeliveryPlan,
        nakamura_test_plan: artifacts.nakamuraTestPlan,
        lawal_compliance_review: artifacts.lawalComplianceReview,
        github_issue_payload: actionPayload,
        status: "approval_requested",
        created_by: context.user.id,
      })
      .select("id")
      .single();

    if (featureError || !featureRequest?.id) {
      throw new Error(featureError?.message ?? "Unable to create feature intake request.");
    }

    await Promise.all([
      context.supabase.schema("staffer").from("tool_execution_logs").insert({
        organisation_id: context.membership.organisation_id,
        tool_id: githubDraftPermission.toolId,
        agent_id: typeof nancyAgent?.id === "string" ? nancyAgent.id : null,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approvalId,
        action_key: "github.issue_draft",
        status: "approval_required",
        risk_class: classification.riskClass,
        input_summary: title,
        output_summary: "GitHub issue payload drafted but not created.",
        redaction_summary: "Customer/requester details remain in Staffer approval evidence; public issue body must be reviewed before creation.",
        idempotency_key: `feature-intake:github-draft:${featureRequest.id}`,
        metadata: { repository, labels, payloadHash: approval.payload_hash, approvalPayloadHash: "approval_payload_hash" },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").from("task_evidence_events").insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        event_type: "system",
        title: "Feature intake package drafted",
        body: "Nancy, Mobola, Anderson, Raj, Nakamura and Lawal outputs were generated into an approval-gated GitHub issue payload.",
        metadata: { featureRequestId: featureRequest.id, approvalId, priority: classification.priority, riskClass: classification.riskClass },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").rpc("record_workflow_run_event", {
        target_organisation_id: context.membership.organisation_id,
        target_workflow_run_id: workflowRunId,
        target_step_run_id: null,
        target_event_type: "feature_intake.approval_requested",
        target_title: "Feature intake approval requested",
        target_body: "GitHub issue creation remains blocked pending exact-payload approval.",
        target_metadata: { featureRequestId: featureRequest.id, taskId: task.id, approvalId },
      }),
      context.supabase.schema("staffer").rpc("queue_task_notifications", {
        target_organisation_id: context.membership.organisation_id,
      }),
      recordAuditEvent({
        organisationId: context.membership.organisation_id,
        actorType: "user",
        actorId: context.user.id,
        eventType: "feature_intake.request_created",
        entityType: "feature_intake_request",
        entityId: featureRequest.id,
        summary: "Feature Intake request created with approval-gated GitHub issue payload.",
        details: {
          taskId: task.id,
          taskReference: task.reference,
          workflowRunId,
          approvalId,
          priority: classification.priority,
          riskClass: classification.riskClass,
          repository,
        },
      }),
    ]);

    revalidatePath(`/workflows/${workflowKey}`);
    revalidatePath("/tasks");
    revalidatePath("/approvals");
    revalidatePath("/governance");
    redirectWithParams(`/workflows/${workflowKey}`, { message: `Feature intake ${reference} created. GitHub issue payload is waiting for approval.` });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (contextForFailure && createdTask) {
      await recordFeatureIntakeFailure(contextForFailure, createdTask, error);
    }
    redirectWithParams(`/workflows/${workflowKey}`, { error: error instanceof Error ? error.message : "Unable to create feature intake request." });
  }
}

function issuePayloadHasEvidenceLinks(payload: JsonRecord) {
  const body = typeof payload.body === "string" ? payload.body : "";
  return body.includes("## Staffer evidence links") && /Staffer task|Workflow run|Approval/i.test(body);
}

export async function verifyFeatureIntakeGitHubReadinessAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey") || "feature-intake";
  const featureRequestId = text(formData, "featureRequestId");

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo GitHub readiness check passed for Feature Intake." });
  }

  try {
    if (!featureRequestId) {
      throw new Error("Feature request id is required.");
    }

    const context = await liveContext();
    const { data: featureRequest, error: requestError } = await context.supabase
      .schema("staffer")
      .from("feature_intake_requests")
      .select("id, task_id, workflow_run_id, approval_id, title, github_issue_payload, status")
      .eq("organisation_id", context.membership.organisation_id)
      .eq("id", featureRequestId)
      .maybeSingle();
    if (requestError || !featureRequest) {
      throw new Error(requestError?.message ?? "Feature request was not found.");
    }

    const payload = asRecord(featureRequest.github_issue_payload);
    const repository = typeof payload.repository === "string" ? payload.repository : "";
    if (!repository) {
      throw new Error("Feature request GitHub payload does not include a repository.");
    }

    const readiness = await verifyGitHubIssueRepositoryReadiness(repository);
    const evidenceLinksVerified = issuePayloadHasEvidenceLinks(payload);
    const duplicateExecutionBlocked = String(featureRequest.status ?? "") !== "github_issue_created";
    const finalStatus = readiness.status === "passed" && evidenceLinksVerified && duplicateExecutionBlocked ? "passed" : readiness.status === "blocked" ? "blocked" : "failed";
    const failureReason =
      finalStatus === "passed"
        ? null
        : readiness.failureReason ??
          (!evidenceLinksVerified
            ? "GitHub issue payload is missing Staffer evidence links."
            : !duplicateExecutionBlocked
              ? "Feature request has already created a GitHub issue; duplicate execution remains blocked."
              : "GitHub readiness check failed.");

    const now = new Date().toISOString();
    const writeResults = await Promise.all([
      context.supabase.schema("staffer").from("github_readiness_checks").insert({
        organisation_id: context.membership.organisation_id,
        feature_request_id: featureRequest.id,
        approval_id: featureRequest.approval_id ?? null,
        repository,
        token_configured: readiness.tokenConfigured,
        repository_reachable: readiness.repositoryReachable,
        evidence_links_verified: evidenceLinksVerified,
        duplicate_execution_blocked: duplicateExecutionBlocked,
        status: finalStatus,
        checked_by: context.user.id,
        check_payload: {
          provider: readiness.provider,
          mode: readiness.mode,
          title: featureRequest.title,
          approvalId: featureRequest.approval_id ?? null,
          featureStatus: featureRequest.status,
        },
        failure_reason: failureReason,
        checked_at: now,
      }),
      context.supabase
        .schema("staffer")
        .from("feature_intake_requests")
        .update({ status: finalStatus === "passed" ? "github_ready_verified" : "github_readiness_blocked", updated_at: now })
        .eq("organisation_id", context.membership.organisation_id)
        .eq("id", featureRequest.id),
      featureRequest.task_id
        ? context.supabase.schema("staffer").from("task_evidence_events").insert({
            organisation_id: context.membership.organisation_id,
            task_id: featureRequest.task_id,
            event_type: "github_readiness",
            title: finalStatus === "passed" ? "Feature Intake GitHub readiness passed" : "Feature Intake GitHub readiness blocked",
            body: finalStatus === "passed" ? `Repository ${repository} is reachable and evidence links are present.` : String(failureReason),
            metadata: { workflowEventType: "feature_intake.github_readiness_checked", featureRequestId: featureRequest.id, repository, readiness, evidenceLinksVerified, duplicateExecutionBlocked },
            created_by: context.user.id,
          })
        : Promise.resolve({ error: null }),
      featureRequest.workflow_run_id
        ? context.supabase.schema("staffer").rpc("record_workflow_run_event", {
            target_organisation_id: context.membership.organisation_id,
            target_workflow_run_id: featureRequest.workflow_run_id,
            target_step_run_id: null,
            target_event_type: "feature_intake.github_readiness_checked",
            target_title: finalStatus === "passed" ? "GitHub readiness passed" : "GitHub readiness blocked",
            target_body: finalStatus === "passed" ? `Repository ${repository} and evidence links are ready.` : String(failureReason),
            target_metadata: { featureRequestId: featureRequest.id, repository, readiness, evidenceLinksVerified, duplicateExecutionBlocked },
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
      eventType: finalStatus === "passed" ? "feature_intake.github_readiness_passed" : "feature_intake.github_readiness_blocked",
      entityType: "feature_intake_request",
      entityId: featureRequest.id,
      summary: finalStatus === "passed" ? "Feature Intake GitHub production readiness was verified." : "Feature Intake GitHub production readiness is blocked.",
      details: { featureRequestId: featureRequest.id, repository, readiness, evidenceLinksVerified, duplicateExecutionBlocked, failureReason },
    });

    revalidatePath(`/workflows/${workflowKey}`);
    revalidatePath("/tasks");
    redirectWithParams(`/workflows/${workflowKey}`, {
      message: finalStatus === "passed" ? `GitHub readiness verified for ${repository}.` : `GitHub readiness blocked: ${failureReason}`,
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectWithParams(`/workflows/${workflowKey}`, { error: error instanceof Error ? error.message : "Unable to verify GitHub readiness." });
  }
}
