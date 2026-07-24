import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql",
  "src/app/workflows/lifecycle-actions.ts",
  "src/app/workflows/page.tsx",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-036+ file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql", "utf8");
for (const phrase of [
  "create table if not exists staffer.workflow_lifecycles",
  "create table if not exists staffer.workflow_lifecycle_requests",
  "documentation-lifecycle",
  "growth-campaign-lifecycle",
  "compliance-assurance-lifecycle",
  "daily-command-brief",
  "development-delivery-lifecycle",
  "release-readiness-gate",
  "workflow_lifecycles_admin_write",
  "workflow_lifecycle_requests_operator_write",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-036+ migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/workflows/lifecycle-actions.ts", "utf8");
for (const phrase of ["createWorkflowLifecycleRequestAction", "workflow_lifecycle_requests", "task_evidence_events", "workflow_lifecycle.request_created"]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing PB-036+ action phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of ["getWorkflowLifecycleData", "mapWorkflowLifecycle", "demoWorkflowLifecycleData", "workflow_lifecycles", "workflow_lifecycle_requests"]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing PB-036+ repository phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/workflows/page.tsx", "utf8");
for (const phrase of ["PB-036+ lifecycle foundations", "Remaining operating lifecycles", "Queue lifecycle request", "Recent lifecycle requests"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing PB-036+ UI phrase: ${phrase}`);
  }
}

console.log("Workflow lifecycle foundations static verification passed.");
