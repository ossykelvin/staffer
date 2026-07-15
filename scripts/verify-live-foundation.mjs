import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "supabase/migrations/20260715082325_staffer_live_foundation.sql",
  "supabase/migrations/20260715183241_phase2_agent_registry_skills.sql",
  "supabase/migrations/20260715184936_phase2_tool_registry_permissions.sql",
  "src/proxy.ts",
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
  "src/components/agent-profile-form.tsx",
  "src/app/settings/actions.ts",
  "src/app/approvals/[id]/actions.ts",
  "src/app/tasks/[id]/actions.ts",
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

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const exportedName of ["getAgents", "getAgentVersions", "getSkills", "getTools", "getTasks", "getApprovals", "getWorkflows", "getDashboardData"]) {
  if (!repository.includes(`export async function ${exportedName}`)) {
    throw new Error(`Missing repository export: ${exportedName}`);
  }
}

const agentActions = readFileSync("src/app/agents/actions.ts", "utf8");
for (const phrase of ["createAgentAction", "updateAgentAction", "setAgentStatusAction", "createSkillAction", "assignAgentSkillAction", "removeAgentSkillAction", "createToolAction", "assignAgentToolAction", "removeAgentToolAction", "agent.skill_mapped", "agent.tool_mapped"]) {
  if (!agentActions.includes(phrase)) {
    throw new Error(`Missing agent registry action phrase: ${phrase}`);
  }
}

const taskAction = readFileSync("src/app/tasks/[id]/actions.ts", "utf8");
if (!taskAction.includes("task.status_changed")) {
  throw new Error("Missing task transition audit event.");
}

const settingsActions = readFileSync("src/app/settings/actions.ts", "utf8");
for (const phrase of ["createInvitationAction", "storeIntegrationSecretAction", "encryptIntegrationSecret", "organisation.settings_updated"]) {
  if (!settingsActions.includes(phrase)) {
    throw new Error(`Missing settings action phrase: ${phrase}`);
  }
}

console.log("Live foundation static verification passed.");
