import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260716003032_phase9_feature_intake_governance.sql",
  "supabase/migrations/20260716004635_phase9_feature_intake_governance_indexes.sql",
  "supabase/migrations/20260716073234_phase9_github_issue_execution.sql",
  "src/app/workflows/[id]/feature-intake-actions.ts",
  "src/app/workflows/[id]/page.tsx",
  "src/app/governance/page.tsx",
  "src/app/tasks/new/actions.ts",
  "src/app/tasks/new/page.tsx",
  "src/app/approvals/[id]/actions.ts",
  "src/app/approvals/[id]/page.tsx",
  "src/lib/github/issues.ts",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-026/PB-027 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260716003032_phase9_feature_intake_governance.sql", "utf8").toLowerCase();
for (const phrase of [
  "create table if not exists staffer.feature_intake_settings",
  "create table if not exists staffer.feature_intake_requests",
  "create table if not exists staffer.task_templates",
  "create table if not exists staffer.task_notifications",
  "create table if not exists staffer.tool_execution_logs",
  "alter table staffer.feature_intake_requests enable row level security",
  "create policy feature_intake_requests_operator_insert",
  "create or replace function staffer.ensure_feature_intake_workflow",
  "create or replace function staffer.get_governance_dashboard",
  "queue_task_notifications",
]) {
  if (!migration.includes(phrase.toLowerCase())) {
    throw new Error(`Missing PB-026/PB-027 migration phrase: ${phrase}`);
  }
}

const indexMigration = readFileSync("supabase/migrations/20260716004635_phase9_feature_intake_governance_indexes.sql", "utf8");
for (const phrase of ["feature_intake_requests_task_idx", "tool_execution_logs_task_idx", "task_notifications_recipient_user_idx"]) {
  if (!indexMigration.includes(phrase)) {
    throw new Error(`Missing PB-026/PB-027 index phrase: ${phrase}`);
  }
}

const issueExecutionMigration = readFileSync("supabase/migrations/20260716073234_phase9_github_issue_execution.sql", "utf8");
for (const phrase of ["ossykelvin/staffer-product", "approval_gated_create", "feature_intake_settings.github_policy"]) {
  if (!issueExecutionMigration.includes(phrase)) {
    throw new Error(`Missing GitHub issue execution migration phrase: ${phrase}`);
  }
}

const featureAction = readFileSync("src/app/workflows/[id]/feature-intake-actions.ts", "utf8");
for (const phrase of [
  "startFeatureIntakeAction",
  "ensure_feature_intake_settings",
  "ensure_feature_intake_workflow",
  "approval_payload_hash",
  "feature_intake_requests",
  "tool_execution_logs",
  "github.issue_draft",
  "feature_intake.request_created",
  "Staffer evidence links",
]) {
  if (!featureAction.includes(phrase)) {
    throw new Error(`Missing PB-026 action phrase: ${phrase}`);
  }
}

const approvalAction = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of [
  "createApprovedGitHubIssueAction",
  "createApprovedGitHubIssue",
  "verify_approval_execution",
  "github.issue_create",
  "feature_intake.github_issue_created",
  "github_issue_created",
]) {
  if (!approvalAction.includes(phrase)) {
    throw new Error(`Missing approved GitHub issue execution phrase: ${phrase}`);
  }
}

const githubIssueProvider = readFileSync("src/lib/github/issues.ts", "utf8");
for (const phrase of ["GITHUB_API_BASE_URL", "GITHUB_ISSUE_TOKEN", "github.issue_draft", "/issues"]) {
  if (!githubIssueProvider.includes(phrase)) {
    throw new Error(`Missing GitHub issue provider phrase: ${phrase}`);
  }
}

const approvalPage = readFileSync("src/app/approvals/[id]/page.tsx", "utf8");
for (const phrase of ["Approved GitHub issue execution", "Create approved GitHub issue", "canCreateGitHubIssue"]) {
  if (!approvalPage.includes(phrase)) {
    throw new Error(`Missing approval UI phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of ["getFeatureIntakeData", "mapFeatureIntakeRequest", "demoFeatureIntakeData", "getGovernanceDashboard", "demoGovernanceDashboard"]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing PB-026/PB-027 repository phrase: ${phrase}`);
  }
}

const workflowPage = readFileSync("src/app/workflows/[id]/page.tsx", "utf8");
for (const phrase of ["Feature intake to engineering", "Create governed feature intake", "Recent feature intake packages", "Approval-gated GitHub issue"]) {
  if (!workflowPage.includes(phrase)) {
    throw new Error(`Missing PB-026 UI phrase: ${phrase}`);
  }
}

const governancePage = readFileSync("src/app/governance/page.tsx", "utf8");
for (const phrase of ["Governance dashboard", "Audit events", "Total cost", "Failure breakdown", "Audit chain"]) {
  if (!governancePage.includes(phrase)) {
    throw new Error(`Missing PB-027 UI phrase: ${phrase}`);
  }
}

console.log("Feature Intake and Governance static verification passed.");
