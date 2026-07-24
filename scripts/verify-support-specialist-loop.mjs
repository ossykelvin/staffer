import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql",
  "src/app/workflows/[id]/support-triage-actions.ts",
  "src/app/workflows/[id]/page.tsx",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-034 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql", "utf8");
for (const phrase of [
  "create table if not exists staffer.support_specialist_reviews",
  "create table if not exists staffer.support_knowledge_followups",
  "specialist_review_status",
  "knowledge_followup_status",
  "support_specialist_reviews_operator_write",
  "support_knowledge_followups_operator_write",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-034 migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/workflows/[id]/support-triage-actions.ts", "utf8");
for (const phrase of [
  "completeSupportSpecialistReviewAction",
  "createSupportKnowledgeFollowupAction",
  "technical_security_release",
  "data_protection_compliance",
  "knowledge_follow_up",
  "runDocumentDraftTool",
  "support_triage.specialist_review_completed",
  "support_triage.knowledge_followup_created",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing PB-034 action phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/workflows/[id]/page.tsx", "utf8");
for (const phrase of ["Nakamura technical review", "Lawal compliance review", "Kristin knowledge follow-up", "Create Kristin draft"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing PB-034 UI phrase: ${phrase}`);
  }
}

console.log("Support specialist loop static verification passed.");
