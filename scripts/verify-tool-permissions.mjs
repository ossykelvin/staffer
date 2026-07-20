import { existsSync, readFileSync } from "node:fs";

const files = [
  "src/lib/tools/permissions.ts",
  "src/app/workflows/[id]/support-triage-actions.ts",
  "src/app/workflows/[id]/feature-intake-actions.ts",
  "src/app/approvals/[id]/actions.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-028 file: ${file}`);
  }
}

const permissions = readFileSync("src/lib/tools/permissions.ts", "utf8");
for (const phrase of [
  "assertAgentToolPermission",
  "ToolPermissionError",
  "tool_execution_logs",
  "status: \"blocked\"",
  "tool.permission_blocked",
  "agent_tools",
  "tools",
  "workflowAllowedActions",
  "approvalMode === \"approved_execution\"",
  "allowedActions",
  "blockedActions",
]) {
  if (!permissions.includes(phrase)) {
    throw new Error(`Missing PB-028 permission phrase: ${phrase}`);
  }
}

const supportTriage = readFileSync("src/app/workflows/[id]/support-triage-actions.ts", "utf8");
for (const phrase of [
  "assertAgentToolPermission",
  "toolKey: \"knowledge_search\"",
  "actionKey: \"knowledge.search\"",
  "toolKey: \"email_draft\"",
  "actionKey: \"support.response_draft\"",
  "approvalMode: \"approval_request\"",
  "workflowRequiresApproval: true",
]) {
  if (!supportTriage.includes(phrase)) {
    throw new Error(`Missing PB-028 support triage guard phrase: ${phrase}`);
  }
}

const featureIntake = readFileSync("src/app/workflows/[id]/feature-intake-actions.ts", "utf8");
for (const phrase of [
  "assertAgentToolPermission",
  "toolKey: \"github_issue_draft\"",
  "actionKey: \"github.issue_draft\"",
  "approvalMode: \"approval_request\"",
  "githubDraftPermission.toolId",
]) {
  if (!featureIntake.includes(phrase)) {
    throw new Error(`Missing PB-028 feature intake guard phrase: ${phrase}`);
  }
}

const approvals = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of [
  "requested_by_agent_id",
  "githubCreatePermission",
  "actionKey: \"github.issue_create\"",
  "supportSendPermission",
  "actionKey: \"support.response_send\"",
  "approvalMode: \"approved_execution\"",
  "tool_id: githubCreatePermission.toolId",
  "tool_id: supportSendPermission.toolId",
  "agent_id: supportSendPermission.agentId",
]) {
  if (!approvals.includes(phrase)) {
    throw new Error(`Missing PB-028 approval execution guard phrase: ${phrase}`);
  }
}

const backlog = readFileSync("PRODUCT_BACKLOG.md", "utf8");
if (!backlog.includes("PB-028: Implement safe internal tool permission enforcement")) {
  throw new Error("PRODUCT_BACKLOG.md must include completed PB-028.");
}

const roadmap = readFileSync("ROADMAP.md", "utf8");
if (!roadmap.includes("PB-028 enforces agent-tool permissions")) {
  throw new Error("ROADMAP.md must mark the tool permission checks complete with PB-028 notes.");
}

console.log("Tool permission enforcement static verification passed.");
