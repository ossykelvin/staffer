-- Staffer Phase 9 Feature Intake / Governance index cleanup.
-- Covers foreign keys added by the PB-026/PB-027 migration.

create index if not exists tool_execution_logs_tool_idx
  on staffer.tool_execution_logs (tool_id)
  where tool_id is not null;

create index if not exists tool_execution_logs_agent_idx
  on staffer.tool_execution_logs (agent_id)
  where agent_id is not null;

create index if not exists tool_execution_logs_task_idx
  on staffer.tool_execution_logs (task_id)
  where task_id is not null;

create index if not exists tool_execution_logs_workflow_run_idx
  on staffer.tool_execution_logs (workflow_run_id)
  where workflow_run_id is not null;

create index if not exists tool_execution_logs_approval_idx
  on staffer.tool_execution_logs (approval_id)
  where approval_id is not null;

create index if not exists tool_execution_logs_created_by_idx
  on staffer.tool_execution_logs (created_by)
  where created_by is not null;

create index if not exists task_templates_created_by_idx
  on staffer.task_templates (created_by)
  where created_by is not null;

create index if not exists task_notifications_recipient_user_idx
  on staffer.task_notifications (recipient_user_id)
  where recipient_user_id is not null;

create index if not exists task_notifications_recipient_agent_idx
  on staffer.task_notifications (recipient_agent_id)
  where recipient_agent_id is not null;

create index if not exists task_notifications_created_by_idx
  on staffer.task_notifications (created_by)
  where created_by is not null;

create index if not exists feature_intake_settings_created_by_idx
  on staffer.feature_intake_settings (created_by)
  where created_by is not null;

create index if not exists feature_intake_requests_task_idx
  on staffer.feature_intake_requests (task_id);

create index if not exists feature_intake_requests_workflow_run_idx
  on staffer.feature_intake_requests (workflow_run_id)
  where workflow_run_id is not null;

create index if not exists feature_intake_requests_approval_idx
  on staffer.feature_intake_requests (approval_id)
  where approval_id is not null;

create index if not exists feature_intake_requests_created_by_idx
  on staffer.feature_intake_requests (created_by)
  where created_by is not null;
