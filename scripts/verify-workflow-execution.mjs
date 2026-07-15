import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "supabase/migrations/20260715203228_phase6_workflow_execution.sql",
  "src/app/workflows/[id]/actions.ts",
  "src/app/workflows/[id]/page.tsx",
  "src/lib/repositories/staffer.ts",
  "src/lib/schemas.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing workflow execution file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260715203228_phase6_workflow_execution.sql", "utf8").toLowerCase();
for (const phrase of [
  "create table if not exists staffer.workflow_run_steps",
  "create table if not exists staffer.workflow_run_events",
  "alter table staffer.workflow_run_steps enable row level security",
  "alter table staffer.workflow_run_events enable row level security",
  "grant select, insert, update on staffer.workflow_runs to authenticated",
  "grant select, insert, update on staffer.workflow_run_steps to authenticated",
  "grant select, insert on staffer.workflow_run_events to authenticated",
  "create policy workflow_run_steps_member_select",
  "create policy workflow_run_events_operator_insert",
  "create or replace function staffer.start_workflow_run",
  "create or replace function staffer.transition_workflow_run",
  "create or replace function staffer.replay_workflow_run",
  "workflow_runs_org_idempotency_key_idx",
  "idempotency_key",
  "replay_of_run_id",
  "resume_token",
]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing workflow execution migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/workflows/[id]/actions.ts", "utf8");
for (const phrase of [
  "startWorkflowRunAction",
  "transitionWorkflowRunAction",
  "replayWorkflowRunAction",
  "start_workflow_run",
  "transition_workflow_run",
  "replay_workflow_run",
  "workflow.run_started",
  "workflow.replay_requested",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing workflow execution action phrase: ${phrase}`);
  }
}

const repository = readFileSync("src/lib/repositories/staffer.ts", "utf8");
for (const phrase of ["getWorkflowExecutionDetail", "mapWorkflowRun", "mapWorkflowRunStep", "mapWorkflowRunEvent", "demoWorkflowExecutionDetail"]) {
  if (!repository.includes(phrase)) {
    throw new Error(`Missing workflow execution repository phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/workflows/[id]/page.tsx", "utf8");
for (const phrase of ["Durable execution", "Durable step ledger", "Append-only run events", "Start durable run", "Replay from snapshot"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing workflow execution UI phrase: ${phrase}`);
  }
}

console.log("Workflow execution static verification passed.");
