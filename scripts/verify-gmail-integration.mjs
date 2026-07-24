import { existsSync, readFileSync } from "node:fs";

const files = [
  "src/lib/gmail/client.ts",
  "src/lib/gmail/support-triage.ts",
  "src/lib/tools/gmail.ts",
  "src/app/api/integrations/gmail/support-triage/route.ts",
  "src/app/approvals/[id]/actions.ts",
  "src/app/approvals/[id]/page.tsx",
  "src/lib/env.ts",
  ".env.local.example",
  "supabase/migrations/20260720101548_phase5_tool_rate_limits_internal_tools_gmail.sql",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-031 file: ${file}`);
  }
}

const gmailClient = readFileSync("src/lib/gmail/client.ts", "utf8");
for (const phrase of [
  "readGmailMessage",
  "createGmailDraft",
  "https://oauth2.googleapis.com/token",
  "https://gmail.googleapis.com/gmail/v1/users",
  "/drafts",
]) {
  if (!gmailClient.includes(phrase)) {
    throw new Error(`Missing PB-031 Gmail client phrase: ${phrase}`);
  }
}

const gmailTools = readFileSync("src/lib/tools/gmail.ts", "utf8");
for (const phrase of ["runGmailMessageReadTool", "runGmailDraftCreateTool", "gmail.message_read", "gmail.draft_create", "approvalMode: \"approved_execution\""]) {
  if (!gmailTools.includes(phrase)) {
    throw new Error(`Missing PB-031 Gmail tool phrase: ${phrase}`);
  }
}

const route = readFileSync("src/app/api/integrations/gmail/support-triage/route.ts", "utf8");
for (const phrase of ["gmail_ingestion_events", "historyId", "messageId", "ingestGmailSupportMessage"]) {
  if (!route.includes(phrase)) {
    throw new Error(`Missing PB-031 route phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of ["createApprovedGmailDraftAction", "runGmailDraftCreateTool", "external_action_status: \"draft_created\"", "support_triage.gmail_draft_created"]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing PB-031 approval action phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/approvals/[id]/page.tsx", "utf8");
if (!page.includes("Create approved Gmail draft")) {
  throw new Error("Approval page must expose Gmail draft creation.");
}

console.log("Gmail integration static verification passed.");
