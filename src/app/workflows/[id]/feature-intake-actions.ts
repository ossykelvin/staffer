"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentMembership, getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

export async function startFeatureIntakeAction(formData: FormData) {
  const workflowKey = text(formData, "workflowKey") || "feature-intake";

  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirectWithParams(`/workflows/${workflowKey}`, { message: "Demo feature intake staged. Live requests are saved when demo mode is disabled." });
  }

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
        requested_by_agent_id: typeof nancyAgent?.id === "string" ? nancyAgent.id : null,
        requested_by_user_id: context.user.id,
        action_key: "github.issue_draft",
        action_payload: actionPayload,
        payload_hash: hashResult.data,
        risk_class: classification.riskClass,
        status: "pending",
        required_reviewer_count: classification.riskClass >= 4 ? 2 : 1,
        policy_snapshot: {
          source: "PB-026 Feature Intake to Engineering",
          createIssueRequiresApproval: githubPolicy.createIssueRequiresApproval !== false,
          repository,
          labels,
        },
      })
      .select("id")
      .single();

    if (approvalError || !approval?.id) {
      throw new Error(approvalError?.message ?? "Unable to create feature approval request.");
    }

    const { data: featureRequest, error: featureError } = await context.supabase
      .schema("staffer")
      .from("feature_intake_requests")
      .insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approval.id,
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
        ...artifacts,
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
        agent_id: typeof nancyAgent?.id === "string" ? nancyAgent.id : null,
        task_id: task.id,
        workflow_run_id: workflowRunId,
        approval_id: approval.id,
        action_key: "github.issue_draft",
        status: "approval_required",
        risk_class: classification.riskClass,
        input_summary: title,
        output_summary: "GitHub issue payload drafted but not created.",
        redaction_summary: "Customer/requester details remain in Staffer approval evidence; public issue body must be reviewed before creation.",
        idempotency_key: `feature-intake:github-draft:${featureRequest.id}`,
        metadata: { repository, labels, payloadHash: hashResult.data },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").from("task_evidence_events").insert({
        organisation_id: context.membership.organisation_id,
        task_id: task.id,
        event_type: "system",
        title: "Feature intake package drafted",
        body: "Nancy, Mobola, Anderson, Raj, Nakamura and Lawal outputs were generated into an approval-gated GitHub issue payload.",
        metadata: { featureRequestId: featureRequest.id, approvalId: approval.id, priority: classification.priority, riskClass: classification.riskClass },
        created_by: context.user.id,
      }),
      context.supabase.schema("staffer").rpc("record_workflow_run_event", {
        target_organisation_id: context.membership.organisation_id,
        target_workflow_run_id: workflowRunId,
        target_step_run_id: null,
        target_event_type: "feature_intake.approval_requested",
        target_title: "Feature intake approval requested",
        target_body: "GitHub issue creation remains blocked pending exact-payload approval.",
        target_metadata: { featureRequestId: featureRequest.id, taskId: task.id, approvalId: approval.id },
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
          approvalId: approval.id,
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
    redirectWithParams(`/workflows/${workflowKey}`, { error: error instanceof Error ? error.message : "Unable to create feature intake request." });
  }
}
