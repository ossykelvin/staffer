-- Staffer Phase 9 support triage performance indexes.
-- Adds covering indexes for foreign-key lookups introduced by PB-025.

create index if not exists support_triage_settings_created_by_idx
  on staffer.support_triage_settings (created_by)
  where created_by is not null;

create index if not exists support_triage_cases_task_idx
  on staffer.support_triage_cases (task_id);

create index if not exists support_triage_cases_workflow_run_idx
  on staffer.support_triage_cases (workflow_run_id)
  where workflow_run_id is not null;

create index if not exists support_triage_cases_approval_idx
  on staffer.support_triage_cases (approval_id)
  where approval_id is not null;

create index if not exists support_triage_cases_created_by_idx
  on staffer.support_triage_cases (created_by)
  where created_by is not null;
