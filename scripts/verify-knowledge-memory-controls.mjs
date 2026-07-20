import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260720071739_phase8_knowledge_memory_controls.sql",
  "src/lib/knowledge/processing.ts",
  "src/app/knowledge/actions.ts",
  "src/app/knowledge/page.tsx",
  "src/app/approvals/[id]/actions.ts",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-033 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260720071739_phase8_knowledge_memory_controls.sql", "utf8").toLowerCase();
for (const phrase of [
  "create extension if not exists vector",
  "insert into storage.buckets",
  "staffer-knowledge",
  "memory_scope",
  "embedding extensions.vector(64)",
  "knowledge_memory_promotions",
  "knowledge_retention_actions",
  "alter table staffer.knowledge_memory_promotions enable row level security",
  "alter table staffer.knowledge_retention_actions enable row level security",
  "create policy staffer_knowledge_storage_select",
  "create policy staffer_knowledge_storage_insert",
  "target_memory_scopes text[] default null",
  "target_project_key text default null",
  "target_customer_key text default null",
  "target_sensitivity text[] default null",
  "target_query_embedding extensions.vector(64) default null",
  "knowledge_retrieval_events",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-033 migration phrase: ${phrase}`);
  }
}

const processing = readFileSync("src/lib/knowledge/processing.ts", "utf8");
for (const phrase of [
  "scanKnowledgeUpload",
  "EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
  "extractKnowledgeText",
  "createKnowledgeEmbedding",
  "normaliseMemoryScope",
  "KNOWLEDGE_UPLOAD_BUCKET",
]) {
  if (!processing.includes(phrase)) {
    throw new Error(`Missing PB-033 processing phrase: ${phrase}`);
  }
}

const knowledgeActions = readFileSync("src/app/knowledge/actions.ts", "utf8");
for (const phrase of [
  "documentFile",
  "supabase.storage.from(KNOWLEDGE_UPLOAD_BUCKET).upload",
  "scanKnowledgeUpload",
  "extractKnowledgeText",
  "createKnowledgeEmbedding",
  "requestKnowledgeMemoryPromotionAction",
  "knowledge.memory_promotion",
  "requestKnowledgeRetentionDeletionAction",
  "knowledge.retention_delete",
  "setKnowledgeLegalHoldAction",
  "retireKnowledgeDocumentAction",
  "knowledge.document_upload_flagged",
]) {
  if (!knowledgeActions.includes(phrase)) {
    throw new Error(`Missing PB-033 knowledge action phrase: ${phrase}`);
  }
}

const approvalActions = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of [
  "knowledge.memory_promotion",
  "knowledge.memory_promoted",
  "knowledge.retention_delete",
  "knowledge.retention_delete_executed",
  "deleted_at",
]) {
  if (!approvalActions.includes(phrase)) {
    throw new Error(`Missing PB-033 approval phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of [
  "KnowledgeHubFilters",
  "target_memory_scopes",
  "target_project_key",
  "target_customer_key",
  "target_sensitivity",
  "target_query_embedding",
  "semanticSimilarity",
  "createKnowledgeEmbedding",
]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing PB-033 repository phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/knowledge/page.tsx", "utf8");
for (const phrase of [
  "Upload document",
  "Memory scope",
  "Citation-aware filtered search",
  "Request promotion approval",
  "Request deletion approval",
  "Enable legal hold",
  "Retire expired document",
]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing PB-033 UI phrase: ${phrase}`);
  }
}

const backlog = readFileSync("PRODUCT_BACKLOG.md", "utf8");
if (!backlog.includes("PB-033: Knowledge upload and memory controls")) {
  throw new Error("PRODUCT_BACKLOG.md must include completed PB-033.");
}

const roadmap = readFileSync("ROADMAP.md", "utf8");
if (!roadmap.includes("PB-033 completed")) {
  throw new Error("ROADMAP.md must include PB-033 completion notes.");
}

console.log("Knowledge upload and memory controls static verification passed.");
