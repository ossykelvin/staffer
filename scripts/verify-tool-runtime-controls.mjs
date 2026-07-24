import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260720101548_phase5_tool_rate_limits_internal_tools_gmail.sql",
  "src/lib/tools/permissions.ts",
  "src/app/approvals/[id]/actions.ts",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-029 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260720101548_phase5_tool_rate_limits_internal_tools_gmail.sql", "utf8");
for (const phrase of [
  "create table if not exists staffer.tool_runtime_policies",
  "create table if not exists staffer.tool_circuit_breaker_states",
  "'rate_limited'",
  "'circuit_open'",
  "integration_key",
  "retry_after_at",
  "gmail",
  "github",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-029 migration phrase: ${phrase}`);
  }
}

const permissions = readFileSync("src/lib/tools/permissions.ts", "utf8");
for (const phrase of [
  "enforceRuntimeControls",
  "tool_runtime_policies",
  "tool_circuit_breaker_states",
  "recordToolRuntimeOutcome",
  "tool.rate_limited",
  "tool.circuit_open",
  "rate_limit_key",
  "circuitBreakerKey",
]) {
  if (!permissions.includes(phrase)) {
    throw new Error(`Missing PB-029 permission phrase: ${phrase}`);
  }
}

const approvals = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of ["integrationKey: \"github\"", "integrationKey: \"email\"", "recordToolRuntimeOutcome"]) {
  if (!approvals.includes(phrase)) {
    throw new Error(`Missing PB-029 approval action phrase: ${phrase}`);
  }
}

console.log("Tool runtime controls static verification passed.");
