import { existsSync, readFileSync } from "node:fs";

const files = [
  "src/lib/tools/internal.ts",
  "src/app/workflows/[id]/support-triage-actions.ts",
  "src/app/workflows/[id]/feature-intake-actions.ts",
  "supabase/migrations/20260720101548_phase5_tool_rate_limits_internal_tools_gmail.sql",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-030 file: ${file}`);
  }
}

const internalTools = readFileSync("src/lib/tools/internal.ts", "utf8");
for (const phrase of [
  "runKnowledgeSearchTool",
  "runTaskReadTool",
  "runTaskUpdateTool",
  "runApprovalRequestTool",
  "runDocumentDraftTool",
  "z.object",
  "assertAgentToolPermission",
  "recordToolRuntimeOutcome",
  "tool_execution_logs",
  "approval_payload_hash",
  "search_knowledge_chunks",
  "document.draft_created",
]) {
  if (!internalTools.includes(phrase)) {
    throw new Error(`Missing PB-030 internal tool phrase: ${phrase}`);
  }
}

const supportTriage = readFileSync("src/app/workflows/[id]/support-triage-actions.ts", "utf8");
for (const phrase of ["runKnowledgeSearchTool", "runApprovalRequestTool"]) {
  if (!supportTriage.includes(phrase)) {
    throw new Error(`Missing PB-030 support triage phrase: ${phrase}`);
  }
}

const featureIntake = readFileSync("src/app/workflows/[id]/feature-intake-actions.ts", "utf8");
if (!featureIntake.includes("runApprovalRequestTool")) {
  throw new Error("Feature Intake must use the governed approval request tool.");
}

const migration = readFileSync("supabase/migrations/20260720101548_phase5_tool_rate_limits_internal_tools_gmail.sql", "utf8");
for (const phrase of ["'task_read'", "'task_update'", "'approval_request'", "'document_draft'"]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-030 tool seed phrase: ${phrase}`);
  }
}

console.log("Safe internal tools static verification passed.");
