import { agents as demoAgents, approvals as demoApprovals, tasks as demoTasks, workflows as demoWorkflows } from "@/lib/data";
import { evaluateApprovalPolicy } from "@/lib/approvals/policy";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AgentProfile,
  AgentSkill,
  AgentTool,
  AgentVersion,
  ApprovalDecision,
  ApprovalDetailRecord,
  ApprovalExecutionCheck,
  ApprovalRecord,
  FeatureIntakeData,
  FeatureIntakeRequest,
  GovernanceDashboard,
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeHubData,
  KnowledgeSearchResult,
  SupportTriageCase,
  SupportTriageData,
  TaskCollaboration,
  TaskDependency,
  TaskRecord,
  WorkflowDefinition,
  WorkflowExecutionDetail,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunStep,
} from "@/lib/types";

type JsonRecord = Record<string, unknown>;

const priorityLabels = ["Low", "Medium", "High", "High", "Critical"];
const riskLabels = ["Low", "Low", "Medium", "High", "Critical", "Critical"];

function isDemoMode() {
  return publicEnv.NEXT_PUBLIC_DEMO_MODE === "true";
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function asOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asAvatarMode(value: unknown) {
  return value === "initials" || value === "generated" || value === "image_path" ? value : undefined;
}

function asProfile(record: JsonRecord) {
  return (record.profile && typeof record.profile === "object" ? record.profile : {}) as JsonRecord;
}

function asNestedRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as JsonRecord;
}

function mapAgentSkill(record: JsonRecord): AgentSkill | null {
  const skill = asNestedRecord(record.skills);
  if (!skill) {
    return null;
  }

  return {
    id: typeof skill.id === "string" ? skill.id : undefined,
    key: String(skill.key ?? skill.id),
    name: String(skill.name ?? skill.key ?? "Unnamed skill"),
    description: typeof skill.description === "string" ? skill.description : undefined,
    proficiency: typeof record.proficiency === "number" ? record.proficiency : undefined,
  };
}

function asJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function riskClassFromLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "critical") {
    return 4;
  }
  if (normalized === "high") {
    return 3;
  }
  if (normalized === "medium") {
    return 2;
  }
  return 1;
}

function mapAgentTool(record: JsonRecord): AgentTool | null {
  const tool = asNestedRecord(record.tools);
  if (!tool) {
    return null;
  }

  return {
    id: typeof tool.id === "string" ? tool.id : undefined,
    key: String(tool.key ?? tool.id),
    name: String(tool.name ?? tool.key ?? "Unnamed tool"),
    description: typeof tool.description === "string" ? tool.description : undefined,
    riskClass: Number(tool.risk_class ?? 1),
    requiresApproval: Boolean(tool.requires_approval),
    isActive: tool.is_active !== false,
    constraints: asJsonObject(record.constraints),
  };
}

function mapAgent(record: JsonRecord): AgentProfile {
  const profile = asProfile(record);
  const skillDetails = Array.isArray(record.agent_skills)
    ? record.agent_skills.map((item) => mapAgentSkill(item as JsonRecord)).filter((item): item is AgentSkill => Boolean(item))
    : [];
  const toolDetails = Array.isArray(record.agent_tools)
    ? record.agent_tools.map((item) => mapAgentTool(item as JsonRecord)).filter((item): item is AgentTool => Boolean(item))
    : [];
  const skills = skillDetails.length ? skillDetails.map((skill) => skill.name) : asStringArray(profile.skills);
  const tools = toolDetails.length ? toolDetails.map((tool) => tool.key) : asStringArray(profile.tools);

  return {
    id: String(record.key ?? record.id),
    databaseId: typeof record.id === "string" ? record.id : undefined,
    name: String(record.name ?? "Unnamed agent"),
    jobTitle: String(record.job_title ?? profile.jobTitle ?? "Agent"),
    department: String(record.department ?? profile.department ?? "Operations"),
    pronouns: String(profile.pronouns ?? "they/them"),
    location: String(profile.location ?? "Configured by organisation"),
    timezone: String(profile.timezone ?? "Configured by organisation"),
    age: typeof profile.age === "number" ? profile.age : undefined,
    experienceYears: typeof profile.experienceYears === "number" ? profile.experienceYears : 0,
    status: String(record.status ?? "draft"),
    profileStatus: String(profile.profileStatus ?? "live"),
    autonomyLevel: Number(record.autonomy_level ?? 1),
    version: typeof record.version === "number" ? record.version : 1,
    primaryModel: typeof record.primary_model === "string" ? record.primary_model : undefined,
    fallbackModel: typeof record.fallback_model === "string" ? record.fallback_model : undefined,
    maximumSteps: asOptionalNumber(record.maximum_steps),
    maximumCostUsd: asOptionalNumber(record.maximum_cost_usd),
    maximumInputTokens: asOptionalNumber(record.maximum_input_tokens),
    maximumOutputTokens: asOptionalNumber(record.maximum_output_tokens),
    initials: String(profile.initials ?? String(record.name ?? "A").slice(0, 2).toUpperCase()),
    accent: String(profile.accent ?? "blue"),
    avatarPath: typeof profile.avatarPath === "string" ? profile.avatarPath : undefined,
    avatarMode: asAvatarMode(profile.avatarMode),
    avatarStyle: typeof profile.avatarStyle === "string" ? profile.avatarStyle : undefined,
    avatarSeed: typeof profile.avatarSeed === "string" ? profile.avatarSeed : undefined,
    avatarPrompt: typeof profile.avatarPrompt === "string" ? profile.avatarPrompt : undefined,
    founderConfirmedAt: typeof profile.founderConfirmedAt === "string" ? profile.founderConfirmedAt : undefined,
    founderConfirmedBy: typeof profile.founderConfirmedBy === "string" ? profile.founderConfirmedBy : undefined,
    founderConfirmationNotes: typeof profile.founderConfirmationNotes === "string" ? profile.founderConfirmationNotes : undefined,
    summary: String(record.biography ?? profile.summary ?? "Live agent profile."),
    personality: asStringArray(profile.personality),
    communicationStyle: String(profile.communicationStyle ?? "Configured by organisation"),
    background: typeof profile.background === "string" ? profile.background : undefined,
    personalDetail: typeof profile.personalDetail === "string" ? profile.personalDetail : undefined,
    signatureHabit: typeof profile.signatureHabit === "string" ? profile.signatureHabit : undefined,
    skills,
    skillDetails,
    tools,
    toolDetails,
    requiresApproval: asStringArray(profile.requiresApproval),
    prohibitedActions: asStringArray(record.prohibited_actions),
    approvalRules: asStringArray(record.approval_rules),
  };
}

function mapSkill(record: JsonRecord): AgentSkill {
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    key: String(record.key ?? record.id),
    name: String(record.name ?? record.key ?? "Unnamed skill"),
    description: typeof record.description === "string" ? record.description : undefined,
  };
}

function mapTool(record: JsonRecord): AgentTool {
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    key: String(record.key ?? record.id),
    name: String(record.name ?? record.key ?? "Unnamed tool"),
    description: typeof record.description === "string" ? record.description : undefined,
    riskClass: Number(record.risk_class ?? 1),
    requiresApproval: Boolean(record.requires_approval),
    isActive: record.is_active !== false,
  };
}

function mapAgentVersion(record: JsonRecord): AgentVersion {
  return {
    id: String(record.id),
    agentId: String(record.agent_id),
    version: Number(record.version ?? 1),
    changeSummary: String(record.change_summary ?? "Agent profile version recorded."),
    createdBy: typeof record.created_by === "string" ? record.created_by : undefined,
    createdAt: String(record.created_at ?? new Date().toISOString()),
  };
}

function mapTask(record: JsonRecord): TaskRecord {
  const priority = typeof record.priority === "number" ? priorityLabels[record.priority] ?? "Medium" : String(record.priority ?? "Medium");

  return {
    id: String(record.reference ?? record.id),
    databaseId: typeof record.id === "string" ? record.id : undefined,
    title: String(record.title ?? "Untitled task"),
    description: typeof record.description === "string" ? record.description : undefined,
    owner: String(record.owner ?? "Unassigned"),
    priority,
    status: titleCase(String(record.status ?? "draft")),
    due: record.due_at ? new Date(String(record.due_at)).toLocaleDateString("en-GB") : "Unscheduled",
    project: String(record.project_key ?? "Staffer"),
    retryCount: typeof record.retry_count === "number" ? record.retry_count : undefined,
    retryPolicy: asJsonObject(record.retry_policy),
    lastRetryAt: typeof record.last_retry_at === "string" ? record.last_retry_at : undefined,
    nextRetryAt: typeof record.next_retry_at === "string" ? record.next_retry_at : undefined,
    retryReason: typeof record.retry_reason === "string" ? record.retry_reason : undefined,
  };
}

function mapTaskComment(record: JsonRecord) {
  return {
    id: String(record.id),
    body: String(record.body ?? ""),
    visibility: String(record.visibility ?? "internal"),
    createdBy: typeof record.created_by === "string" ? record.created_by : undefined,
    createdAt: String(record.created_at ?? new Date().toISOString()),
  };
}

function mapTaskWatcher(record: JsonRecord) {
  return {
    userId: String(record.user_id),
    createdBy: typeof record.created_by === "string" ? record.created_by : undefined,
    createdAt: String(record.created_at ?? new Date().toISOString()),
  };
}

function mapTaskEvidenceEvent(record: JsonRecord) {
  return {
    id: String(record.id),
    eventType: String(record.event_type ?? "evidence"),
    title: String(record.title ?? "Evidence recorded"),
    body: typeof record.body === "string" ? record.body : undefined,
    metadata: asJsonObject(record.metadata),
    createdBy: typeof record.created_by === "string" ? record.created_by : undefined,
    createdAt: String(record.created_at ?? new Date().toISOString()),
  };
}

function mapTaskDependency(record: JsonRecord, tasksById: Map<string, TaskRecord>): TaskDependency {
  const dependsOnTaskId = String(record.depends_on_task_id);
  const dependsOnTask = tasksById.get(dependsOnTaskId);

  return {
    id: String(record.id),
    taskId: String(record.task_id),
    dependsOnTaskId,
    dependsOnReference: dependsOnTask?.id ?? dependsOnTaskId,
    dependsOnTitle: dependsOnTask?.title ?? "Dependency task",
    dependencyType: String(record.dependency_type ?? "blocks"),
    notes: typeof record.notes === "string" ? record.notes : undefined,
    createdAt: String(record.created_at ?? new Date().toISOString()),
  };
}

function mapKnowledgeCollection(record: JsonRecord, counts: { documentCount?: number; chunkCount?: number; retrievalCount?: number; reviewDueCount?: number } = {}): KnowledgeCollection {
  return {
    id: String(record.id),
    key: String(record.key ?? record.id),
    name: String(record.name ?? record.key ?? "Knowledge collection"),
    description: typeof record.description === "string" ? record.description : null,
    sensitivity: String(record.sensitivity ?? "internal"),
    accessMode: String(record.access_mode ?? "organisation"),
    documentCount: counts.documentCount ?? 0,
    chunkCount: counts.chunkCount ?? 0,
    retrievalCount: counts.retrievalCount,
    reviewDueCount: counts.reviewDueCount,
    retentionDays: typeof record.retention_days === "number" ? record.retention_days : null,
    reviewIntervalDays: typeof record.review_interval_days === "number" ? record.review_interval_days : null,
  };
}

function mapKnowledgeDocument(record: JsonRecord): KnowledgeDocument {
  const collection = asNestedRecord(record.knowledge_collections);

  return {
    id: String(record.id),
    title: String(record.title ?? "Untitled document"),
    collectionId: typeof record.collection_id === "string" ? record.collection_id : null,
    collectionName: collection ? String(collection.name ?? collection.key ?? "Collection") : null,
    sourceUrl: typeof record.source_url === "string" ? record.source_url : null,
    sensitivity: String(record.sensitivity ?? "internal"),
    status: String(record.status ?? "draft"),
    version: Number(record.version ?? 1),
    scanStatus: String(record.scan_status ?? "pending"),
    extractionStatus: String(record.extraction_status ?? "pending"),
    embeddingStatus: String(record.embedding_status ?? "not_requested"),
    reviewDueAt: typeof record.review_due_at === "string" ? record.review_due_at : null,
    retentionUntil: typeof record.retention_until === "string" ? record.retention_until : null,
    legalHold: Boolean(record.legal_hold),
    updatedAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
  };
}

function mapKnowledgeSearchResult(record: JsonRecord): KnowledgeSearchResult {
  return {
    chunkId: String(record.chunk_id),
    documentId: String(record.document_id),
    collectionId: String(record.collection_id),
    collectionKey: String(record.collection_key),
    collectionName: String(record.collection_name),
    documentTitle: String(record.document_title),
    chunkIndex: Number(record.chunk_index ?? 1),
    excerpt: String(record.excerpt ?? ""),
    citation: asJsonObject(record.citation),
    rank: Number(record.rank ?? 0),
  };
}

function mapSupportTriageCase(record: JsonRecord): SupportTriageCase {
  const task = asNestedRecord(record.tasks);

  return {
    id: String(record.id),
    taskId: String(record.task_id),
    taskReference: task ? String(task.reference ?? record.task_id) : undefined,
    workflowRunId: typeof record.workflow_run_id === "string" ? record.workflow_run_id : null,
    approvalId: typeof record.approval_id === "string" ? record.approval_id : null,
    sourceType: String(record.source_type ?? "manual"),
    customerName: typeof record.customer_name === "string" ? record.customer_name : null,
    customerEmail: typeof record.customer_email === "string" ? record.customer_email : null,
    subject: String(record.subject ?? "Support request"),
    productArea: typeof record.product_area === "string" ? record.product_area : null,
    category: String(record.category ?? "general"),
    severity: String(record.severity ?? "medium"),
    sentiment: String(record.sentiment ?? "neutral"),
    onboardingState: String(record.onboarding_state ?? "unknown"),
    slaTargetAt: typeof record.sla_target_at === "string" ? record.sla_target_at : null,
    riskClass: Number(record.risk_class ?? 3),
    classification: asJsonObject(record.classification),
    knowledgeQuery: typeof record.knowledge_query === "string" ? record.knowledge_query : null,
    citations: Array.isArray(record.citations) ? (record.citations as Record<string, unknown>[]) : [],
    draftResponse: typeof record.draft_response === "string" ? record.draft_response : null,
    draftStatus: String(record.draft_status ?? "not_started"),
    escalationTargets: asStringArray(record.escalation_targets),
    externalActionStatus: String(record.external_action_status ?? "pending_approval"),
    createdAt: String(record.created_at ?? new Date().toISOString()),
    updatedAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
  };
}

function mapFeatureIntakeRequest(record: JsonRecord): FeatureIntakeRequest {
  const task = asNestedRecord(record.tasks);

  return {
    id: String(record.id),
    taskId: String(record.task_id),
    taskReference: task ? String(task.reference ?? record.task_id) : undefined,
    workflowRunId: typeof record.workflow_run_id === "string" ? record.workflow_run_id : null,
    approvalId: typeof record.approval_id === "string" ? record.approval_id : null,
    sourceType: String(record.source_type ?? "manual"),
    sourceReference: typeof record.source_reference === "string" ? record.source_reference : null,
    requesterName: typeof record.requester_name === "string" ? record.requester_name : null,
    requesterEmail: typeof record.requester_email === "string" ? record.requester_email : null,
    customerSegment: typeof record.customer_segment === "string" ? record.customer_segment : null,
    productArea: typeof record.product_area === "string" ? record.product_area : null,
    title: String(record.title ?? "Feature request"),
    problemStatement: String(record.problem_statement ?? ""),
    expectedOutcome: String(record.expected_outcome ?? ""),
    evidence: typeof record.evidence === "string" ? record.evidence : null,
    priority: String(record.priority ?? "medium"),
    riskClass: Number(record.risk_class ?? 3),
    targetDecisionAt: typeof record.target_decision_at === "string" ? record.target_decision_at : null,
    nancySummary: asJsonObject(record.nancy_summary),
    mobolaRequirements: asJsonObject(record.mobola_requirements),
    andersonArchitecture: asJsonObject(record.anderson_architecture),
    rajDeliveryPlan: asJsonObject(record.raj_delivery_plan),
    nakamuraTestPlan: asJsonObject(record.nakamura_test_plan),
    lawalComplianceReview: asJsonObject(record.lawal_compliance_review),
    githubIssuePayload: asJsonObject(record.github_issue_payload),
    status: String(record.status ?? "approval_requested"),
    createdAt: String(record.created_at ?? new Date().toISOString()),
    updatedAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
  };
}

function demoSupportTriageData(): SupportTriageData {
  const now = new Date().toISOString();

  return {
    cases: [
      {
        id: "demo-support-case-1",
        taskId: "demo-task-support",
        taskReference: "SUP-DEMO-001",
        workflowRunId: "demo-support-run",
        approvalId: "APR-221",
        sourceType: "manual",
        customerName: "Demo customer",
        customerEmail: "customer@example.com",
        subject: "Cannot access banking dashboard",
        productArea: "Banking application",
        category: "banking_application",
        severity: "high",
        sentiment: "negative",
        onboardingState: "blocked",
        slaTargetAt: now,
        riskClass: 4,
        classification: { mode: "demo", rationale: ["Banking and access language require specialist review."] },
        knowledgeQuery: "banking application access blocked",
        citations: [{ documentTitle: "Demo support source", excerpt: "Approved knowledge is cited before the draft is sent." }],
        draftResponse: "Demo draft response pending human approval before customer-visible action.",
        draftStatus: "needs_review",
        escalationTargets: ["anna", "nakamura", "lawal"],
        externalActionStatus: "approval_requested",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function demoFeatureIntakeData(): FeatureIntakeData {
  const now = new Date().toISOString();

  return {
    requests: [
      {
        id: "demo-feature-intake-1",
        taskId: "demo-feature-task",
        taskReference: "FEAT-DEMO-001",
        workflowRunId: "demo-feature-run",
        approvalId: "APR-221",
        sourceType: "manual",
        sourceReference: "demo-founder-request",
        requesterName: "Founder",
        requesterEmail: null,
        customerSegment: "Pilot customer",
        productArea: "Workflow automation",
        title: "Add approval-gated feature intake workflow",
        problemStatement: "Feature requests need a governed path from feedback to engineering work.",
        expectedOutcome: "A founder can approve a complete engineering issue payload with requirements, architecture, QA and compliance notes.",
        evidence: "Demo request used for local fallback.",
        priority: "high",
        riskClass: 4,
        targetDecisionAt: now,
        nancySummary: { problem: "Unstructured feature ideas need product framing.", outcome: "Clear decision-ready intake." },
        mobolaRequirements: { requirements: ["Capture requester, problem, evidence and outcome", "Generate traceable acceptance criteria"] },
        andersonArchitecture: { options: ["Use existing workflow engine and approval tables"], risks: ["Do not auto-create GitHub issues before approval"] },
        rajDeliveryPlan: { slices: ["Schema", "Repository", "Workflow UI", "Approval payload"] },
        nakamuraTestPlan: { acceptance: ["Payload hash must match approved GitHub issue draft"] },
        lawalComplianceReview: { controls: ["Avoid personal data in public issue body", "Route regulated claims for review"] },
        githubIssuePayload: { repository: "ossykelvin/staffer", title: "Draft feature intake issue", labels: ["feature-intake"] },
        status: "approval_requested",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function demoGovernanceDashboard(): GovernanceDashboard {
  const completedTasks = demoTasks.filter((task) => task.status.toLowerCase().includes("completed")).length;
  const blockedTasks = demoTasks.filter((task) => task.status.toLowerCase().includes("blocked")).length;
  const failedTasks = demoTasks.filter((task) => task.status.toLowerCase().includes("failed")).length;

  return {
    audit: {
      events: 12,
      latestAt: new Date().toISOString(),
      materialMutations: 7,
    },
    cost: {
      taskRunCostUsd: 0,
      toolCostUsd: 0,
    },
    quality: {
      completedTasks,
      failedTasks,
      blockedTasks,
      pendingApprovals: demoApprovals.length,
    },
    latency: {
      averageTaskRunMs: null,
      averageToolMs: null,
    },
    failures: {
      workflowFailures: 0,
      toolFailures: 0,
      approvalBlocks: 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

function demoKnowledgeHubData(query = ""): KnowledgeHubData {
  const collections = [
    { key: "company-policies", name: "Company policies", documentCount: 3, chunkCount: 9, sensitivity: "internal", accessMode: "organisation" },
    { key: "product-documentation", name: "Product documentation", documentCount: 4, chunkCount: 16, sensitivity: "internal", accessMode: "organisation" },
    { key: "customer-support", name: "Customer support knowledge", documentCount: 5, chunkCount: 21, sensitivity: "restricted", accessMode: "restricted" },
    { key: "architecture-decisions", name: "Architecture decisions", documentCount: 2, chunkCount: 7, sensitivity: "confidential", accessMode: "restricted" },
  ].map((collection, index) =>
    mapKnowledgeCollection(
      {
        id: `demo-collection-${index + 1}`,
        key: collection.key,
        name: collection.name,
        sensitivity: collection.sensitivity,
        access_mode: collection.accessMode,
        retention_days: 365,
        review_interval_days: 90,
      },
      { documentCount: collection.documentCount, chunkCount: collection.chunkCount, retrievalCount: index + 1, reviewDueCount: index === 2 ? 1 : 0 },
    ),
  );
  const now = new Date().toISOString();
  const documents: KnowledgeDocument[] = collections.slice(0, 3).map((collection, index) => ({
    id: `demo-document-${index + 1}`,
    title: `${collection.name} starter source`,
    collectionId: collection.id,
    collectionName: collection.name,
    sourceUrl: null,
    sensitivity: collection.sensitivity,
    status: index === 2 ? "needs_review" : "approved",
    version: 1,
    scanStatus: "not_required",
    extractionStatus: "completed",
    embeddingStatus: "not_requested",
    reviewDueAt: now,
    retentionUntil: null,
    legalHold: false,
    updatedAt: now,
  }));

  return {
    collections,
    documents,
    query,
    searchResults: query
      ? [
          {
            chunkId: "demo-chunk-1",
            documentId: "demo-document-1",
            collectionId: "demo-collection-1",
            collectionKey: "company-policies",
            collectionName: "Company policies",
            documentTitle: "Company policies starter source",
            chunkIndex: 1,
            excerpt: `Demo citation-aware result for "${query}". Live search uses approved chunks and records retrieval evidence.`,
            citation: { documentTitle: "Company policies starter source", chunkIndex: 1, mode: "demo" },
            rank: 1,
          },
        ]
      : [],
  };
}

function demoTaskCollaboration(taskId: string): TaskCollaboration {
  const task = demoTasks.find((item) => item.id === taskId);
  const now = new Date().toISOString();

  return {
    comments: task
      ? [
          {
            id: `${task.id}-comment-demo`,
            body: `Demo note: ${task.title} is ready for live comments once demo mode is disabled.`,
            visibility: "internal",
            createdAt: now,
          },
        ]
      : [],
    watchers: task ? [{ userId: "demo-user", createdAt: now }] : [],
    dependencies: [],
    evidenceEvents: task
      ? [
          {
            id: `${task.id}-evidence-demo`,
            eventType: "system",
            title: "Demo task loaded",
            body: "Live evidence events are stored in tenant-scoped Supabase tables.",
            metadata: { mode: "demo" },
            createdAt: now,
          },
        ]
      : [],
  };
}

function mapWorkflow(record: JsonRecord): WorkflowDefinition {
  const definition = (record.definition && typeof record.definition === "object" ? record.definition : {}) as JsonRecord;

  return {
    id: String(record.key ?? record.id),
    databaseId: typeof record.id === "string" ? record.id : undefined,
    name: String(record.name ?? "Untitled workflow"),
    department: String(definition.department ?? "Operations"),
    trigger: String(definition.trigger ?? record.description ?? "Manual trigger"),
    status: String(record.status ?? "draft"),
    steps: asStringArray(definition.steps),
    approval: String(definition.approval ?? "Configured by workflow policy"),
    sla: String(definition.sla ?? "Configured by organisation"),
  };
}

function mapWorkflowRunStep(record: JsonRecord): WorkflowRunStep {
  return {
    id: String(record.id),
    workflowRunId: String(record.workflow_run_id),
    stepIndex: Number(record.step_index ?? 1),
    stepKey: String(record.step_key ?? `step-${record.step_index ?? 1}`),
    stepName: String(record.step_name ?? "Workflow step"),
    stepType: String(record.step_type ?? "agent"),
    status: String(record.status ?? "queued"),
    attempt: Number(record.attempt ?? 1),
    maxAttempts: Number(record.max_attempts ?? 3),
    idempotencyKey: String(record.idempotency_key ?? record.id),
    startedAt: typeof record.started_at === "string" ? record.started_at : null,
    completedAt: typeof record.completed_at === "string" ? record.completed_at : null,
    nextRetryAt: typeof record.next_retry_at === "string" ? record.next_retry_at : null,
    errorPayload: asJsonObject(record.error_payload),
  };
}

function mapWorkflowRunEvent(record: JsonRecord): WorkflowRunEvent {
  return {
    id: String(record.id),
    workflowRunId: String(record.workflow_run_id),
    stepRunId: typeof record.step_run_id === "string" ? record.step_run_id : null,
    eventType: String(record.event_type ?? "workflow.event"),
    title: String(record.title ?? "Workflow event"),
    body: typeof record.body === "string" ? record.body : null,
    metadata: asJsonObject(record.metadata),
    createdBy: typeof record.created_by === "string" ? record.created_by : null,
    createdAt: String(record.created_at ?? new Date().toISOString()),
  };
}

function mapWorkflowRun(record: JsonRecord): WorkflowRun {
  const steps = Array.isArray(record.workflow_run_steps)
    ? record.workflow_run_steps.map((item) => mapWorkflowRunStep(item as JsonRecord)).sort((a, b) => a.stepIndex - b.stepIndex || a.attempt - b.attempt)
    : undefined;
  const events = Array.isArray(record.workflow_run_events)
    ? record.workflow_run_events.map((item) => mapWorkflowRunEvent(item as JsonRecord))
    : undefined;

  return {
    id: String(record.id),
    workflowId: String(record.workflow_id),
    taskId: typeof record.task_id === "string" ? record.task_id : null,
    status: String(record.status ?? "queued"),
    currentStep: typeof record.current_step === "string" ? record.current_step : null,
    currentStepIndex: Number(record.current_step_index ?? 0),
    triggerType: String(record.trigger_type ?? "manual"),
    idempotencyKey: typeof record.idempotency_key === "string" ? record.idempotency_key : null,
    runKind: String(record.run_kind ?? "original"),
    retryCount: Number(record.retry_count ?? 0),
    maxRetries: Number(record.max_retries ?? 3),
    pauseReason: typeof record.pause_reason === "string" ? record.pause_reason : null,
    startedAt: typeof record.started_at === "string" ? record.started_at : null,
    completedAt: typeof record.completed_at === "string" ? record.completed_at : null,
    failedAt: typeof record.failed_at === "string" ? record.failed_at : null,
    cancelledAt: typeof record.cancelled_at === "string" ? record.cancelled_at : null,
    createdAt: String(record.created_at ?? new Date().toISOString()),
    updatedAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
    steps,
    events,
  };
}

function mapApproval(record: JsonRecord): ApprovalRecord {
  const riskClass = typeof record.risk_class === "number" ? record.risk_class : 1;
  const risk = riskLabels[riskClass] ?? "Low";
  const payload = asJsonObject(record.action_payload);
  const policySnapshot = asJsonObject(record.policy_snapshot);

  return {
    id: String(record.id),
    title: String(record.action_key ?? "Approval request"),
    requester: String(record.requested_by_user_id ?? record.requested_by_agent_id ?? "Unknown requester"),
    type: String(record.action_key ?? "Protected action"),
    risk,
    submitted: record.created_at ? new Date(String(record.created_at)).toLocaleString("en-GB") : "Pending",
    status: String(record.status ?? "pending"),
    payload,
    payloadHash: typeof record.payload_hash === "string" ? record.payload_hash : undefined,
    policyKey: typeof policySnapshot.policyKey === "string" ? policySnapshot.policyKey : undefined,
    policyName: typeof policySnapshot.policyName === "string" ? policySnapshot.policyName : undefined,
    requiredReviewerCount: typeof record.required_reviewer_count === "number" ? record.required_reviewer_count : undefined,
    approvedReviewerCount: typeof record.approved_reviewer_count === "number" ? record.approved_reviewer_count : undefined,
    executionStatus: typeof record.execution_status === "string" ? record.execution_status : undefined,
    executionPayloadHash: typeof record.execution_payload_hash === "string" ? record.execution_payload_hash : undefined,
    executionVerifiedAt: typeof record.execution_verified_at === "string" ? record.execution_verified_at : undefined,
  };
}

function mapApprovalDecision(record: JsonRecord): ApprovalDecision {
  return {
    id: String(record.id),
    decision: String(record.decision ?? "changes_requested"),
    comment: typeof record.comment === "string" ? record.comment : undefined,
    decidedBy: typeof record.decided_by === "string" ? record.decided_by : undefined,
    decidedAt: String(record.decided_at ?? new Date().toISOString()),
    payloadHashAtDecision: String(record.payload_hash_at_decision ?? ""),
  };
}

function mapApprovalExecutionCheck(record: JsonRecord): ApprovalExecutionCheck {
  return {
    id: String(record.id),
    expectedPayloadHash: String(record.expected_payload_hash ?? ""),
    actualPayloadHash: String(record.actual_payload_hash ?? ""),
    verified: Boolean(record.verified),
    status: String(record.status ?? "blocked"),
    failureReason: typeof record.failure_reason === "string" ? record.failure_reason : undefined,
    checkedBy: typeof record.checked_by === "string" ? record.checked_by : undefined,
    checkedAt: String(record.checked_at ?? new Date().toISOString()),
  };
}

function demoApprovalDetail(approvalId: string): ApprovalDetailRecord | null {
  const approval = demoApprovals.find((item) => item.id === approvalId);
  if (!approval) {
    return null;
  }

  const riskClass = riskClassFromLabel(approval.risk);
  const payload = {
    approvalId: approval.id,
    actionType: approval.type,
    requester: approval.requester,
    executionMode: "blocked_demo_only",
  };
  const policyEvaluation = evaluateApprovalPolicy({
    actionKey: approval.type,
    riskClass,
    payload,
    organisationSettings: { approval_mode: "demo_safe" },
  });

  return {
    approval: {
      ...approval,
      status: "pending",
      payload,
      payloadHash: policyEvaluation.payloadHash,
      policyKey: policyEvaluation.policyKey,
      policyName: policyEvaluation.policyName,
      requiredReviewerCount: policyEvaluation.requiredReviewerCount,
      approvedReviewerCount: 0,
      executionStatus: "not_requested",
    },
    policyEvaluation,
    decisions: [],
    executionChecks: [],
  };
}

function demoWorkflowExecutionDetail(workflow: WorkflowDefinition): WorkflowExecutionDetail {
  const now = new Date().toISOString();
  const runId = `${workflow.id}-demo-run`;
  const latestRun: WorkflowRun = {
    id: runId,
    workflowId: workflow.id,
    status: "queued",
    currentStep: workflow.steps[0] ?? null,
    currentStepIndex: 0,
    triggerType: "demo_manual",
    idempotencyKey: `${workflow.id}:demo`,
    runKind: "original",
    retryCount: 0,
    maxRetries: 3,
    pauseReason: null,
    startedAt: now,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    steps: workflow.steps.map((step, index) => ({
      id: `${runId}-step-${index + 1}`,
      workflowRunId: runId,
      stepIndex: index + 1,
      stepKey: step.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `step-${index + 1}`,
      stepName: step,
      stepType: index === workflow.steps.length - 1 ? "action" : "agent",
      status: index === 0 ? "queued" : "waiting",
      attempt: 1,
      maxAttempts: 3,
      idempotencyKey: `${workflow.id}:demo:step:${index + 1}`,
      startedAt: null,
      completedAt: null,
      nextRetryAt: null,
      errorPayload: {},
    })),
    events: [
      {
        id: `${runId}-event-1`,
        workflowRunId: runId,
        eventType: "workflow.demo_loaded",
        title: "Demo workflow execution preview",
        body: "Live durable workflow runs are stored in Supabase when demo mode is disabled.",
        metadata: { mode: "demo" },
        createdAt: now,
      },
    ],
  };

  return {
    latestRun,
    runs: [latestRun],
  };
}

async function getLiveContext() {
  if (isDemoMode()) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership } = await supabase
    .schema("staffer")
    .from("memberships")
    .select("organisation_id, role")
    .limit(1)
    .maybeSingle();

  if (!membership?.organisation_id) {
    return { supabase, user, organisationId: null as string | null };
  }

  return { supabase, user, organisationId: String(membership.organisation_id) };
}

export async function getAgents() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoAgents;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("agents")
    .select("*, agent_skills(proficiency, skills(id, key, name, description)), agent_tools(constraints, tools(id, key, name, description, risk_class, requires_approval, is_active))")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? demoAgents : data.map((record) => mapAgent(record as JsonRecord));
}

export async function getAgentById(id: string) {
  const allAgents = await getAgents();
  return allAgents.find((agent) => agent.id === id);
}

export async function getSkills() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    const skills = new Map<string, AgentSkill>();

    for (const agent of demoAgents) {
      for (const skill of agent.skills) {
        const key = skill.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        skills.set(key, { key, name: skill });
      }
    }

    return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("skills")
    .select("id, key, name, description")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? [] : data.map((record) => mapSkill(record as JsonRecord));
}

export async function getTools() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    const tools = new Map<string, AgentTool>();

    for (const agent of demoAgents) {
      for (const tool of agent.tools) {
        tools.set(tool, {
          key: tool,
          name: titleCase(tool),
          riskClass: agent.requiresApproval.some((boundary) => boundary.toLowerCase().includes(tool.toLowerCase())) ? 3 : 1,
          requiresApproval: false,
          isActive: true,
        });
      }
    }

    return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("tools")
    .select("id, key, name, description, risk_class, requires_approval, is_active")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? [] : data.map((record) => mapTool(record as JsonRecord));
}

export async function getAgentVersions(agentId: string) {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    const agent = demoAgents.find((item) => item.id === agentId);
    return agent
      ? [
          {
            id: `${agent.id}-v1`,
            agentId: agent.id,
            version: agent.version ?? 1,
            changeSummary: "Seed profile loaded for demo mode.",
            createdAt: new Date().toISOString(),
          },
        ]
      : [];
  }

  const { data: agent } = await context.supabase
    .schema("staffer")
    .from("agents")
    .select("id")
    .eq("organisation_id", context.organisationId)
    .eq("key", agentId)
    .maybeSingle();

  if (!agent?.id) {
    return [];
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("agent_versions")
    .select("id, agent_id, version, change_summary, created_by, created_at")
    .eq("organisation_id", context.organisationId)
    .eq("agent_id", agent.id)
    .order("version", { ascending: false });

  return error || !data ? [] : data.map((record) => mapAgentVersion(record as JsonRecord));
}

export async function getTasks() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoTasks;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("tasks")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false });

  return error || !data ? demoTasks : data.map((record) => mapTask(record as JsonRecord));
}

export async function getTaskById(id: string) {
  const allTasks = await getTasks();
  return allTasks.find((task) => task.id === id);
}

export async function getTaskCollaboration(taskReference: string): Promise<TaskCollaboration> {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoTaskCollaboration(taskReference);
  }

  const { data: task } = await context.supabase
    .schema("staffer")
    .from("tasks")
    .select("id")
    .eq("organisation_id", context.organisationId)
    .eq("reference", taskReference)
    .maybeSingle();

  if (!task?.id) {
    return { comments: [], watchers: [], dependencies: [], evidenceEvents: [] };
  }

  const taskId = String(task.id);
  const [commentsResult, watchersResult, dependenciesResult, evidenceResult] = await Promise.all([
    context.supabase
      .schema("staffer")
      .from("task_comments")
      .select("id, body, visibility, created_by, created_at")
      .eq("organisation_id", context.organisationId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    context.supabase
      .schema("staffer")
      .from("task_watchers")
      .select("user_id, created_by, created_at")
      .eq("organisation_id", context.organisationId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    context.supabase
      .schema("staffer")
      .from("task_dependencies")
      .select("id, task_id, depends_on_task_id, dependency_type, notes, created_at")
      .eq("organisation_id", context.organisationId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    context.supabase
      .schema("staffer")
      .from("task_evidence_events")
      .select("id, event_type, title, body, metadata, created_by, created_at")
      .eq("organisation_id", context.organisationId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
  ]);

  const dependencies = (dependenciesResult.data ?? []) as JsonRecord[];
  const dependencyTaskIds = [...new Set(dependencies.map((record) => String(record.depends_on_task_id)).filter(Boolean))];
  const tasksById = new Map<string, TaskRecord>();

  if (dependencyTaskIds.length) {
    const { data: dependencyTasks } = await context.supabase
      .schema("staffer")
      .from("tasks")
      .select("id, reference, title, project_key, priority, status, due_at")
      .eq("organisation_id", context.organisationId)
      .in("id", dependencyTaskIds);

    for (const dependencyTask of dependencyTasks ?? []) {
      const mapped = mapTask(dependencyTask as JsonRecord);
      if (mapped.databaseId) {
        tasksById.set(mapped.databaseId, mapped);
      }
    }
  }

  return {
    comments: (commentsResult.data ?? []).map((record) => mapTaskComment(record as JsonRecord)),
    watchers: (watchersResult.data ?? []).map((record) => mapTaskWatcher(record as JsonRecord)),
    dependencies: dependencies.map((record) => mapTaskDependency(record, tasksById)),
    evidenceEvents: (evidenceResult.data ?? []).map((record) => mapTaskEvidenceEvent(record as JsonRecord)),
  };
}

export async function getKnowledgeHubData(query = ""): Promise<KnowledgeHubData> {
  const context = await getLiveContext();
  const trimmedQuery = query.trim();

  if (!context?.organisationId) {
    return demoKnowledgeHubData(trimmedQuery);
  }

  const [collectionsResult, documentsResult, chunksResult, retrievalsResult] = await Promise.all([
    context.supabase
      .schema("staffer")
      .from("knowledge_collections")
      .select("id, key, name, description, sensitivity, access_mode, retention_days, review_interval_days")
      .eq("organisation_id", context.organisationId)
      .eq("is_active", true)
      .order("name"),
    context.supabase
      .schema("staffer")
      .from("documents")
      .select("id, title, collection_id, source_url, sensitivity, status, version, scan_status, extraction_status, embedding_status, review_due_at, retention_until, legal_hold, updated_at, created_at, knowledge_collections(name, key)")
      .eq("organisation_id", context.organisationId)
      .order("updated_at", { ascending: false })
      .limit(12),
    context.supabase
      .schema("staffer")
      .from("document_chunks")
      .select("id, collection_id")
      .eq("organisation_id", context.organisationId),
    context.supabase
      .schema("staffer")
      .from("knowledge_retrieval_events")
      .select("id")
      .eq("organisation_id", context.organisationId)
      .limit(1000),
  ]);

  if (collectionsResult.error || documentsResult.error) {
    return demoKnowledgeHubData(trimmedQuery);
  }

  const documents = (documentsResult.data ?? []).map((record) => mapKnowledgeDocument(record as JsonRecord));
  const documentsByCollection = new Map<string, number>();
  const reviewDueByCollection = new Map<string, number>();
  for (const document of documents) {
    if (!document.collectionId) {
      continue;
    }
    documentsByCollection.set(document.collectionId, (documentsByCollection.get(document.collectionId) ?? 0) + 1);
    if (document.reviewDueAt && new Date(document.reviewDueAt) <= new Date()) {
      reviewDueByCollection.set(document.collectionId, (reviewDueByCollection.get(document.collectionId) ?? 0) + 1);
    }
  }

  const chunksByCollection = new Map<string, number>();
  for (const chunk of chunksResult.data ?? []) {
    const collectionId = typeof chunk.collection_id === "string" ? chunk.collection_id : "";
    if (collectionId) {
      chunksByCollection.set(collectionId, (chunksByCollection.get(collectionId) ?? 0) + 1);
    }
  }

  const collections = (collectionsResult.data ?? []).map((record) =>
    mapKnowledgeCollection(record as JsonRecord, {
      documentCount: documentsByCollection.get(String(record.id)) ?? 0,
      chunkCount: chunksByCollection.get(String(record.id)) ?? 0,
      retrievalCount: retrievalsResult.data?.length ?? 0,
      reviewDueCount: reviewDueByCollection.get(String(record.id)) ?? 0,
    }),
  );

  let searchResults: KnowledgeSearchResult[] = [];
  if (trimmedQuery) {
    const { data } = await context.supabase.schema("staffer").rpc("search_knowledge_chunks", {
      target_query: trimmedQuery,
      target_agent_id: null,
      target_collection_keys: null,
      target_limit: 6,
    });
    searchResults = ((data ?? []) as JsonRecord[]).map((record) => mapKnowledgeSearchResult(record));
  }

  return {
    collections,
    documents,
    searchResults,
    query: trimmedQuery,
  };
}

export async function getSupportTriageData(): Promise<SupportTriageData> {
  const context = await getLiveContext();

  if (!context?.organisationId) {
    return demoSupportTriageData();
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("support_triage_cases")
    .select(
      "id, task_id, workflow_run_id, approval_id, source_type, customer_name, customer_email, subject, product_area, category, severity, sentiment, onboarding_state, sla_target_at, risk_class, classification, knowledge_query, citations, draft_response, draft_status, escalation_targets, external_action_status, created_at, updated_at, tasks(reference)",
    )
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !data) {
    return demoSupportTriageData();
  }

  return {
    cases: data.map((record) => mapSupportTriageCase(record as JsonRecord)),
  };
}

export async function getFeatureIntakeData(): Promise<FeatureIntakeData> {
  const context = await getLiveContext();

  if (!context?.organisationId) {
    return demoFeatureIntakeData();
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("feature_intake_requests")
    .select(
      "id, task_id, workflow_run_id, approval_id, source_type, source_reference, requester_name, requester_email, customer_segment, product_area, title, problem_statement, expected_outcome, evidence, priority, risk_class, target_decision_at, nancy_summary, mobola_requirements, anderson_architecture, raj_delivery_plan, nakamura_test_plan, lawal_compliance_review, github_issue_payload, status, created_at, updated_at, tasks(reference)",
    )
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !data) {
    return demoFeatureIntakeData();
  }

  return {
    requests: data.map((record) => mapFeatureIntakeRequest(record as JsonRecord)),
  };
}

export async function getGovernanceDashboard(): Promise<GovernanceDashboard> {
  const context = await getLiveContext();

  if (!context?.organisationId) {
    return demoGovernanceDashboard();
  }

  const { data, error } = await context.supabase.schema("staffer").rpc("get_governance_dashboard", {
    target_organisation_id: context.organisationId,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return demoGovernanceDashboard();
  }

  const raw = data as JsonRecord;
  const audit = asJsonObject(raw.audit);
  const cost = asJsonObject(raw.cost);
  const quality = asJsonObject(raw.quality);
  const latency = asJsonObject(raw.latency);
  const failures = asJsonObject(raw.failures);

  return {
    audit: {
      events: Number(audit.events ?? 0),
      latestAt: typeof audit.latestAt === "string" ? audit.latestAt : null,
      materialMutations: Number(audit.materialMutations ?? 0),
    },
    cost: {
      taskRunCostUsd: Number(cost.taskRunCostUsd ?? 0),
      toolCostUsd: Number(cost.toolCostUsd ?? 0),
    },
    quality: {
      completedTasks: Number(quality.completedTasks ?? 0),
      failedTasks: Number(quality.failedTasks ?? 0),
      blockedTasks: Number(quality.blockedTasks ?? 0),
      pendingApprovals: Number(quality.pendingApprovals ?? 0),
    },
    latency: {
      averageTaskRunMs: typeof latency.averageTaskRunMs === "number" ? latency.averageTaskRunMs : null,
      averageToolMs: typeof latency.averageToolMs === "number" ? latency.averageToolMs : null,
    },
    failures: {
      workflowFailures: Number(failures.workflowFailures ?? 0),
      toolFailures: Number(failures.toolFailures ?? 0),
      approvalBlocks: Number(failures.approvalBlocks ?? 0),
    },
    generatedAt: String(raw.generatedAt ?? new Date().toISOString()),
  };
}

export async function getWorkflows() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoWorkflows;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("workflows")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data || data.length === 0 ? demoWorkflows : data.map((record) => mapWorkflow(record as JsonRecord));
}

export async function getWorkflowById(id: string) {
  const allWorkflows = await getWorkflows();
  return allWorkflows.find((workflow) => workflow.id === id);
}

export async function getWorkflowExecutionDetail(workflowKey: string): Promise<WorkflowExecutionDetail> {
  const workflow = await getWorkflowById(workflowKey);
  const context = await getLiveContext();

  if (!workflow || !context?.organisationId) {
    return workflow ? demoWorkflowExecutionDetail(workflow) : { runs: [], latestRun: null };
  }

  const { data: workflowRecord, error: workflowError } = await context.supabase
    .schema("staffer")
    .from("workflows")
    .select("id")
    .eq("organisation_id", context.organisationId)
    .eq("key", workflowKey)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (workflowError || !workflowRecord?.id) {
    return { runs: [], latestRun: null };
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("workflow_runs")
    .select(
      "id, workflow_id, task_id, status, current_step, current_step_index, trigger_type, idempotency_key, run_kind, retry_count, max_retries, pause_reason, started_at, completed_at, failed_at, cancelled_at, created_at, updated_at, workflow_run_steps(id, workflow_run_id, step_index, step_key, step_name, step_type, status, attempt, max_attempts, idempotency_key, started_at, completed_at, next_retry_at, error_payload), workflow_run_events(id, workflow_run_id, step_run_id, event_type, title, body, metadata, created_by, created_at)",
    )
    .eq("organisation_id", context.organisationId)
    .eq("workflow_id", workflowRecord.id)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error || !data) {
    return { runs: [], latestRun: null };
  }

  const runs = data.map((record) => mapWorkflowRun(record as JsonRecord));
  return {
    runs,
    latestRun: runs[0] ?? null,
  };
}

export async function getApprovals() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoApprovals;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("approvals")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false });

  return error || !data ? demoApprovals : data.map((record) => mapApproval(record as JsonRecord));
}

export async function getApprovalById(id: string) {
  const allApprovals = await getApprovals();
  return allApprovals.find((approval) => approval.id === id);
}

export async function getApprovalDetailById(id: string): Promise<ApprovalDetailRecord | null> {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoApprovalDetail(id);
  }

  const [{ data: approvalRecord, error }, { data: organisation }] = await Promise.all([
    context.supabase
      .schema("staffer")
      .from("approvals")
      .select(
        "*, approval_policies(key, name, minimum_risk_class, required_reviewer_count, requires_separation_of_duties, exact_payload_required, expires_after_minutes)",
      )
      .eq("organisation_id", context.organisationId)
      .eq("id", id)
      .maybeSingle(),
    context.supabase
      .schema("staffer")
      .from("organisations")
      .select("settings")
      .eq("id", context.organisationId)
      .maybeSingle(),
  ]);

  if (error || !approvalRecord) {
    return null;
  }

  const approvalJson = approvalRecord as JsonRecord;
  const approval = mapApproval(approvalJson);
  const payload = approval.payload ?? {};
  const riskClass = typeof approvalJson.risk_class === "number" ? approvalJson.risk_class : riskClassFromLabel(approval.risk);
  const policyRecord = asNestedRecord(approvalJson.approval_policies);
  const policyEvaluation = evaluateApprovalPolicy({
    actionKey: approval.type,
    riskClass,
    payload,
    organisationSettings: asJsonObject(organisation?.settings),
    policy: policyRecord
      ? {
          key: String(policyRecord.key ?? "approval.policy"),
          name: String(policyRecord.name ?? "Approval policy"),
          minimumRiskClass: Number(policyRecord.minimum_risk_class ?? 1),
          requiredReviewerCount: Number(policyRecord.required_reviewer_count ?? approval.requiredReviewerCount ?? 1),
          requiresSeparationOfDuties: policyRecord.requires_separation_of_duties !== false,
          exactPayloadRequired: policyRecord.exact_payload_required !== false,
          expiresAfterMinutes: Number(policyRecord.expires_after_minutes ?? 1440),
        }
      : undefined,
  });

  const [decisionsResult, executionChecksResult] = await Promise.all([
    context.supabase
      .schema("staffer")
      .from("approval_decisions")
      .select("id, decision, comment, decided_by, decided_at, payload_hash_at_decision")
      .eq("organisation_id", context.organisationId)
      .eq("approval_id", approval.id)
      .order("decided_at", { ascending: false }),
    context.supabase
      .schema("staffer")
      .from("approval_execution_checks")
      .select("id, expected_payload_hash, actual_payload_hash, verified, status, failure_reason, checked_by, checked_at")
      .eq("organisation_id", context.organisationId)
      .eq("approval_id", approval.id)
      .order("checked_at", { ascending: false }),
  ]);

  return {
    approval,
    policyEvaluation: {
      ...policyEvaluation,
      payloadHash: approval.payloadHash ?? policyEvaluation.payloadHash,
      requiredReviewerCount: approval.requiredReviewerCount ?? policyEvaluation.requiredReviewerCount,
    },
    decisions: (decisionsResult.data ?? []).map((record) => mapApprovalDecision(record as JsonRecord)),
    executionChecks: (executionChecksResult.data ?? []).map((record) => mapApprovalExecutionCheck(record as JsonRecord)),
  };
}

export async function getDashboardData() {
  const [agents, tasks, approvals, workflows] = await Promise.all([getAgents(), getTasks(), getApprovals(), getWorkflows()]);

  return { agents, tasks, approvals, workflows };
}
