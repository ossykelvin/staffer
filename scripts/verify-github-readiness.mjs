import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql",
  "src/lib/github/issues.ts",
  "src/app/workflows/[id]/feature-intake-actions.ts",
  "src/app/workflows/[id]/page.tsx",
  "PRODUCT_BACKLOG.md",
  "ROADMAP.md",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing PB-035 file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260722010134_complete_outstanding_governance_workflows.sql", "utf8");
for (const phrase of [
  "create table if not exists staffer.github_readiness_checks",
  "token_configured",
  "repository_reachable",
  "evidence_links_verified",
  "duplicate_execution_blocked",
  "github_readiness_checks_operator_write",
  "github_ready_verified",
  "github_readiness_blocked",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing PB-035 migration phrase: ${phrase}`);
  }
}

const provider = readFileSync("src/lib/github/issues.ts", "utf8");
for (const phrase of ["verifyGitHubIssueRepositoryReadiness", "/repos/${owner}/${repo}", "GITHUB_ISSUE_TOKEN", "GITHUB_API_BASE_URL"]) {
  if (!provider.includes(phrase)) {
    throw new Error(`Missing PB-035 GitHub provider phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/workflows/[id]/feature-intake-actions.ts", "utf8");
for (const phrase of [
  "verifyFeatureIntakeGitHubReadinessAction",
  "issuePayloadHasEvidenceLinks",
  "github_readiness_checks",
  "github_ready_verified",
  "feature_intake.github_readiness_checked",
  "github_issue_payload: actionPayload",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing PB-035 action phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/workflows/[id]/page.tsx", "utf8");
for (const phrase of ["PB-035 production readiness", "Verify GitHub readiness"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing PB-035 UI phrase: ${phrase}`);
  }
}

console.log("GitHub readiness static verification passed.");
