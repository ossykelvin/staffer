import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql",
  "src/app/approvals/[id]/actions.ts",
  "src/app/approvals/[id]/page.tsx",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-032 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql", "utf8");
for (const phrase of [
  "approval_mode",
  "current_review_sequence",
  "separation_of_duties_enforced",
  "create table if not exists staffer.approval_review_steps",
  "create table if not exists staffer.approval_mobile_notifications",
  "enable row level security",
  "approval_review_steps_operator_write",
  "approval_mobile_notifications_operator_write",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-032 migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of [
  "delegateApprovalStepAction",
  "expireApprovalAction",
  "recordApprovalReviewerCommentAction",
  "Separation of duties blocks the requester",
  "approval_review_steps",
  "approval_mobile_notifications",
  "approval.delegated",
  "approval.expired",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing PB-032 action phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/approvals/[id]/page.tsx", "utf8");
for (const phrase of ["Sequential review steps", "Reviewer comment / delegate / expire", "Mobile-friendly notifications"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing PB-032 UI phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of ["mapApprovalReviewStep", "mapApprovalMobileNotification", "approval_review_steps", "approval_mobile_notifications"]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing PB-032 repository phrase: ${phrase}`);
  }
}

console.log("Approval centre completion static verification passed.");
