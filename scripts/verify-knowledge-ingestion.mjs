import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "supabase/migrations/20260715205737_phase8_knowledge_ingestion_retrieval.sql",
  "src/app/knowledge/actions.ts",
  "src/app/knowledge/page.tsx",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing knowledge ingestion file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260715205737_phase8_knowledge_ingestion_retrieval.sql", "utf8").toLowerCase();
for (const phrase of [
  "create table if not exists staffer.knowledge_collections",
  "create table if not exists staffer.knowledge_collection_agents",
  "create table if not exists staffer.document_versions",
  "create table if not exists staffer.document_chunks",
  "create table if not exists staffer.knowledge_retrieval_events",
  "alter table staffer.knowledge_collections enable row level security",
  "alter table staffer.document_chunks enable row level security",
  "grant select, insert, update on staffer.knowledge_collections to authenticated",
  "grant select, insert on staffer.document_chunks to authenticated",
  "create policy knowledge_collection_agents_admin_write",
  "create policy document_chunks_operator_insert",
  "create or replace function staffer.agent_can_retrieve_collection",
  "create or replace function staffer.search_knowledge_chunks",
  "to_tsvector",
  "citation jsonb",
  "retention_until",
  "legal_hold",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing knowledge migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/knowledge/actions.ts", "utf8");
for (const phrase of [
  "ingestKnowledgeDocumentAction",
  "document_versions",
  "document_chunks",
  "knowledge_collection_agents",
  "knowledge.document_ingested",
  "contentHash",
  "chunkText",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing knowledge action phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of ["getKnowledgeHubData", "mapKnowledgeCollection", "mapKnowledgeDocument", "mapKnowledgeSearchResult", "search_knowledge_chunks"]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing knowledge repository phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/knowledge/page.tsx", "utf8");
for (const phrase of ["Ingest approved source text", "Citation-aware search", "Recent source documents", "Ingest, version and chunk"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing knowledge UI phrase: ${phrase}`);
  }
}

console.log("Knowledge ingestion static verification passed.");
