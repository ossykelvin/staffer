import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "supabase/migrations/20260715082325_staffer_live_foundation.sql",
  "supabase/migrations/20260715183241_phase2_agent_registry_skills.sql",
  "supabase/migrations/20260715184936_phase2_tool_registry_permissions.sql",
  "supabase/migrations/20260715191154_phase2_agent_guardrails.sql",
  "supabase/migrations/20260715193703_phase3_task_collaboration.sql",
  "supabase/migrations/20260715195016_phase7_approval_policy_engine.sql",
  "supabase/migrations/20260715203228_phase6_workflow_execution.sql",
  "supabase/migrations/20260715205737_phase8_knowledge_ingestion_retrieval.sql",
  "src/proxy.ts",
  "src/lib/approvals/policy.ts",
  "src/lib/ai/provider.ts",
  "src/lib/ai/guardrails.ts",
  "src/lib/ai/schemas.ts",
  "src/config/ai-evaluations.seed.json",
  "src/lib/repositories/staffer.ts",
  "src/lib/audit.ts",
  "src/app/login/page.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/auth/reset-password/page.tsx",
  "src/app/auth/confirm/route.ts",
  "src/app/account/update-password/page.tsx",
  "src/app/invite/[token]/page.tsx",
  "src/app/agents/actions.ts",
  "src/app/agents/new/page.tsx",
  "src/components/agent-avatar.tsx",
  "src/components/agent-profile-form.tsx",
  "src/app/settings/actions.ts",
  "src/app/approvals/[id]/actions.ts",
  "src/app/tasks/[id]/actions.ts",
  "src/app/workflows/[id]/actions.ts",
  "src/app/knowledge/actions.ts",
];

const requiredSql = [
  "create or replace function staffer.is_member",
  "security definer",
  "create or replace function staffer.has_role",
  "create or replace function staffer.record_audit_event",
  "create or replace function staffer.create_organisation_for_current_user",
  "grant usage on schema staffer to authenticated",
  "grant select on",
  "create policy memberships_member_select",
  "create policy approvals_reviewer_update",
  "create policy audit_member_select",
  "revoke all on function staffer.record_audit_event",
];

const requiredPhaseOneSql = [
  "create table if not exists staffer.organisation_invitations",
  "create table if not exists staffer.integration_secrets",
  "alter table staffer.organisation_invitations enable row level security",
  "alter table staffer.integration_secrets enable row level security",
  "create policy organisation_invitations_admin_select",
  "create policy integration_secrets_admin_write",
  "create or replace function staffer.accept_invitation_for_current_user",
  "grant execute on function staffer.accept_invitation_for_current_user(text) to authenticated",
];

const requiredPhaseTwoSql = [
  "create table if not exists staffer.agent_versions",
  "alter table staffer.agent_versions enable row level security",
  "create policy agent_versions_member_select",
  "create policy agent_versions_admin_insert",
  "drop policy if exists agent_skills_admin_insert",
  "join staffer.skills s on s.id = skill_id",
  "s.organisation_id = a.organisation_id",
];

const requiredToolRegistrySql = [
  "drop policy if exists agent_tools_admin_insert",
  "create policy agent_tools_admin_insert",
  "create policy agent_tools_admin_update",
  "create policy agent_tools_admin_delete",
  "join staffer.tools t on t.id = tool_id",
  "t.organisation_id = a.organisation_id",
];

const requiredAgentGuardrailsSql = [
  "maximum_input_tokens",
  "maximum_output_tokens",
  "prohibited_actions",
  "approval_rules",
  "agents_prohibited_actions_array",
  "agents_approval_rules_array",
];

const requiredTaskCollaborationSql = [
  "retry_policy",
  "retry_count",
  "tasks_retry_policy_object",
  "create table if not exists staffer.task_comments",
  "create table if not exists staffer.task_watchers",
  "create table if not exists staffer.task_dependencies",
  "create table if not exists staffer.task_evidence_events",
  "alter table staffer.task_comments enable row level security",
  "alter table staffer.task_watchers enable row level security",
  "alter table staffer.task_dependencies enable row level security",
  "alter table staffer.task_evidence_events enable row level security",
  "grant select, insert on",
  "create policy task_comments_member_select",
  "create policy task_comments_member_insert",
  "create policy task_watchers_self_insert",
  "create policy task_dependencies_operator_insert",
  "create policy task_evidence_events_operator_insert",
];

const requiredApprovalPolicySql = [
  "create table if not exists staffer.approval_policies",
  "create table if not exists staffer.approval_decisions",
  "create table if not exists staffer.approval_execution_checks",
  "alter table staffer.approval_policies enable row level security",
  "alter table staffer.approval_decisions enable row level security",
  "alter table staffer.approval_execution_checks enable row level security",
  "create policy approval_policies_member_select",
  "create policy approval_decisions_reviewer_insert",
  "create policy approval_execution_checks_operator_insert",
  "create or replace function staffer.approval_payload_hash",
  "create or replace function staffer.verify_approval_execution",
  "revoke all on function staffer.verify_approval_execution",
  "grant execute on function staffer.verify_approval_execution",
  "payload_hash = staffer.approval_payload_hash(action_payload)",
];

const requiredAiRuntimePhrases = [
  'import "server-only"',
  "runGovernedAiGeneration",
  "runGovernedStafferGeneration",
  "createBoundedToolLoopAgent",
  "Output.object",
  "generateText",
  "stepCountIs",
  "classifyProviderError",
  "inspectPromptForGuardrails",
  "recordAuditEvent",
  "AI_MAX_COST_PER_RUN_USD",
];

const requiredWorkflowExecutionSql = [
  "create table if not exists staffer.workflow_run_steps",
  "create table if not exists staffer.workflow_run_events",
  "alter table staffer.workflow_run_steps enable row level security",
  "alter table staffer.workflow_run_events enable row level security",
  "grant select, insert, update on staffer.workflow_runs to authenticated",
  "create policy workflow_run_steps_member_select",
  "create policy workflow_run_events_operator_insert",
  "create or replace function staffer.start_workflow_run",
  "create or replace function staffer.transition_workflow_run",
  "create or replace function staffer.replay_workflow_run",
  "workflow_runs_org_idempotency_key_idx",
  "resume_token",
  "replay_of_run_id",
];

const requiredKnowledgeIngestionSql = [
  "create table if not exists staffer.knowledge_collections",
  "create table if not exists staffer.knowledge_collection_agents",
  "create table if not exists staffer.document_versions",
  "create table if not exists staffer.document_chunks",
  "create table if not exists staffer.knowledge_retrieval_events",
  "alter table staffer.knowledge_collections enable row level security",
  "alter table staffer.document_chunks enable row level security",
  "grant select, insert, update on staffer.knowledge_collections to authenticated",
  "create policy knowledge_collection_agents_admin_write",
  "create or replace function staffer.search_knowledge_chunks",
  "create or replace function staffer.agent_can_retrieve_collection",
  "citation jsonb",
  "retention_until",
  "legal_hold",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing required live-foundation file: ${file}`);
  }
}

const sql = readFileSync("supabase/migrations/20260715082325_staffer_live_foundation.sql", "utf8").toLowerCase();
for (const phrase of requiredSql) {
  if (!sql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required SQL phrase: ${phrase}`);
  }
}

const phaseOneSql = readFileSync("supabase/migrations/20260715171316_phase1_identity_completion.sql", "utf8").toLowerCase();
for (const phrase of requiredPhaseOneSql) {
  if (!phaseOneSql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required Phase 1 SQL phrase: ${phrase}`);
  }
}

const phaseTwoSql = readFileSync("supabase/migrations/20260715183241_phase2_agent_registry_skills.sql", "utf8").toLowerCase();
for (const phrase of requiredPhaseTwoSql) {
  if (!phaseTwoSql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required Phase 2 SQL phrase: ${phrase}`);
  }
}

const toolRegistrySql = readFileSync("supabase/migrations/20260715184936_phase2_tool_registry_permissions.sql", "utf8").toLowerCase();
for (const phrase of requiredToolRegistrySql) {
  if (!toolRegistrySql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required tool registry SQL phrase: ${phrase}`);
  }
}

const agentGuardrailsSql = readFileSync("supabase/migrations/20260715191154_phase2_agent_guardrails.sql", "utf8").toLowerCase();
for (const phrase of requiredAgentGuardrailsSql) {
  if (!agentGuardrailsSql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required agent guardrails SQL phrase: ${phrase}`);
  }
}

const taskCollaborationSql = readFileSync("supabase/migrations/20260715193703_phase3_task_collaboration.sql", "utf8").toLowerCase();
for (const phrase of requiredTaskCollaborationSql) {
  if (!taskCollaborationSql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required task collaboration SQL phrase: ${phrase}`);
  }
}

const approvalPolicySql = readFileSync("supabase/migrations/20260715195016_phase7_approval_policy_engine.sql", "utf8").toLowerCase();
for (const phrase of requiredApprovalPolicySql) {
  if (!approvalPolicySql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required approval policy SQL phrase: ${phrase}`);
  }
}

const workflowExecutionSql = readFileSync("supabase/migrations/20260715203228_phase6_workflow_execution.sql", "utf8").toLowerCase();
for (const phrase of requiredWorkflowExecutionSql) {
  if (!workflowExecutionSql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required workflow execution SQL phrase: ${phrase}`);
  }
}

const knowledgeIngestionSql = readFileSync("supabase/migrations/20260715205737_phase8_knowledge_ingestion_retrieval.sql", "utf8").toLowerCase();
for (const phrase of requiredKnowledgeIngestionSql) {
  if (!knowledgeIngestionSql.includes(phrase.toLowerCase())) {
    throw new Error(`Missing required knowledge ingestion SQL phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const exportedName of ["getAgents", "getAgentVersions", "getSkills", "getTools", "getTasks", "getTaskCollaboration", "getKnowledgeHubData", "getApprovals", "getApprovalDetailById", "getWorkflows", "getWorkflowExecutionDetail", "getDashboardData"]) {
  if (!repository.includes(`export async function ${exportedName}`)) {
    throw new Error(`Missing repository export: ${exportedName}`);
  }
}

const agentActions = readFileSync("src/app/agents/actions.ts", "utf8");
for (const phrase of ["createAgentAction", "updateAgentAction", "setAgentStatusAction", "confirmAgentProfileAction", "rollbackAgentVersionAction", "createSkillAction", "assignAgentSkillAction", "removeAgentSkillAction", "createToolAction", "assignAgentToolAction", "removeAgentToolAction", "agent.skill_mapped", "agent.tool_mapped", "agent.profile_confirmed", "agent.version_rolled_back", "maximum_input_tokens", "prohibited_actions", "approval_rules"]) {
  if (!agentActions.includes(phrase)) {
    throw new Error(`Missing agent registry action phrase: ${phrase}`);
  }
}

const taskAction = readFileSync("src/app/tasks/[id]/actions.ts", "utf8");
for (const phrase of ["task.status_changed", "addTaskCommentAction", "addTaskWatcherAction", "addTaskDependencyAction", "addTaskEvidenceAction", "retryTaskAction", "task.comment_added", "task.watcher_added", "task.dependency_added", "task.evidence_added", "task.retry_requested"]) {
  if (!taskAction.includes(phrase)) {
    throw new Error(`Missing task collaboration action phrase: ${phrase}`);
  }
}

const settingsActions = readFileSync("src/app/settings/actions.ts", "utf8");
for (const phrase of ["createInvitationAction", "storeIntegrationSecretAction", "encryptIntegrationSecret", "organisation.settings_updated", "default_autonomy_level", "default_maximum_steps", "default_input_token_limit", "default_output_token_limit"]) {
  if (!settingsActions.includes(phrase)) {
    throw new Error(`Missing settings action phrase: ${phrase}`);
  }
}

const approvalActions = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of ["stageApprovalDecisionAction", "verifyApprovalExecutionAction", "approval_decisions", "verify_approval_execution", "approval.execution_verified", "approval.execution_blocked"]) {
  if (!approvalActions.includes(phrase)) {
    throw new Error(`Missing approval policy action phrase: ${phrase}`);
  }
}

const approvalPolicy = readFileSync("src/lib/approvals/policy.ts", "utf8");
for (const phrase of ["evaluateApprovalPolicy", "approvalPayloadHash", "verifyExactApprovalPayload", "canonicalJson"]) {
  if (!approvalPolicy.includes(phrase)) {
    throw new Error(`Missing approval policy helper phrase: ${phrase}`);
  }
}

const workflowActions = readFileSync("src/app/workflows/[id]/actions.ts", "utf8");
for (const phrase of ["startWorkflowRunAction", "transitionWorkflowRunAction", "replayWorkflowRunAction", "start_workflow_run", "transition_workflow_run", "replay_workflow_run", "workflow.run_started", "workflow.replay_requested"]) {
  if (!workflowActions.includes(phrase)) {
    throw new Error(`Missing workflow execution action phrase: ${phrase}`);
  }
}

const knowledgeActions = readFileSync("src/app/knowledge/actions.ts", "utf8");
for (const phrase of ["ingestKnowledgeDocumentAction", "document_versions", "document_chunks", "knowledge_collection_agents", "knowledge.document_ingested"]) {
  if (!knowledgeActions.includes(phrase)) {
    throw new Error(`Missing knowledge ingestion action phrase: ${phrase}`);
  }
}

const aiRuntime = readFileSync("src/lib/ai/provider.ts", "utf8");
for (const phrase of requiredAiRuntimePhrases) {
  if (!aiRuntime.includes(phrase)) {
    throw new Error(`Missing AI runtime phrase: ${phrase}`);
  }
}

console.log("Live foundation static verification passed.");
