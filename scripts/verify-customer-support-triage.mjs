import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260715220229_phase9_customer_support_triage.sql",
  "supabase/migrations/20260715221219_phase9_support_triage_indexes.sql",
  "src/app/workflows/[id]/support-triage-actions.ts",
  "src/app/workflows/[id]/page.tsx",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-025 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260715220229_phase9_customer_support_triage.sql", "utf8").toLowerCase();
for (const phrase of [
  "create table if not exists staffer.support_triage_settings",
  "create table if not exists staffer.support_triage_cases",
  "alter table staffer.support_triage_settings enable row level security",
  "alter table staffer.support_triage_cases enable row level security",
  "create policy support_triage_cases_operator_insert",
  "create or replace function staffer.ensure_support_triage_settings",
  "create or replace function staffer.ensure_support_triage_workflow",
  "human approves external send or draft creation",
]) {
  if (!migration.includes(phrase.toLowerCase())) {
    throw new Error(`Missing PB-025 migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/workflows/[id]/support-triage-actions.ts", "utf8");
for (const phrase of [
  "startSupportTriageAction",
  "ensure_support_triage_settings",
  "ensure_support_triage_workflow",
  "runKnowledgeSearchTool",
  "runApprovalRequestTool",
  "support_triage_cases",
  "support_triage.case_created",
  "externalSendBlocked",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing PB-025 action phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of ["getSupportTriageData", "mapSupportTriageCase", "demoSupportTriageData", "support_triage_cases"]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing PB-025 repository phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/workflows/[id]/page.tsx", "utf8");
for (const phrase of ["Customer support intake", "Recent support triage cases", "Create governed support triage", "Review approval"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing PB-025 UI phrase: ${phrase}`);
  }
}

const indexes = readFileSync("supabase/migrations/20260715221219_phase9_support_triage_indexes.sql", "utf8");
for (const phrase of ["support_triage_cases_task_idx", "support_triage_cases_workflow_run_idx", "support_triage_cases_approval_idx"]) {
  if (!indexes.includes(phrase)) {
    throw new Error(`Missing PB-025 index phrase: ${phrase}`);
  }
}

console.log("Customer Support Triage static verification passed.");
