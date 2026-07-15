import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "supabase/migrations/20260715082325_staffer_live_foundation.sql",
  "src/proxy.ts",
  "src/lib/repositories/staffer.ts",
  "src/lib/audit.ts",
  "src/app/login/page.tsx",
  "src/app/onboarding/page.tsx",
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

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const exportedName of ["getAgents", "getTasks", "getApprovals", "getWorkflows", "getDashboardData"]) {
  if (!repository.includes(`export async function ${exportedName}`)) {
    throw new Error(`Missing repository export: ${exportedName}`);
  }
}

const taskAction = readFileSync("src/app/tasks/[id]/actions.ts", "utf8");
if (!taskAction.includes("task.status_changed")) {
  throw new Error("Missing task transition audit event.");
}

console.log("Live foundation static verification passed.");
