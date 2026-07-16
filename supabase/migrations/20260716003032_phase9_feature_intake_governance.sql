-- Staffer Phase 9 Feature Intake + Phase 3/5/10 governance foundations.
-- Adds live feature intake workflow records, task templates/notifications,
-- richer tool contracts, tool execution telemetry and governance summaries.

alter table staffer.tools
  add column if not exists timeout_seconds integer not null default 30 check (timeout_seconds > 0 and timeout_seconds <= 900),
  add column if not exists rate_limit_per_minute integer check (rate_limit_per_minute is null or rate_limit_per_minute > 0),
  add column if not exists circuit_breaker jsonb not null default '{}'::jsonb,
  add column if not exists redaction_policy jsonb not null default '{}'::jsonb;

alter table staffer.tools
  drop constraint if exists tools_circuit_breaker_object,
  add constraint tools_circuit_breaker_object check (jsonb_typeof(circuit_breaker) = 'object'),
  drop constraint if exists tools_redaction_policy_object,
  add constraint tools_redaction_policy_object check (jsonb_typeof(redaction_policy) = 'object');

create table if not exists staffer.tool_execution_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  tool_id uuid references staffer.tools(id) on delete set null,
  agent_id uuid references staffer.agents(id) on delete set null,
  task_id uuid references staffer.tasks(id) on delete set null,
  workflow_run_id uuid references staffer.workflow_runs(id) on delete set null,
  approval_id uuid references staffer.approvals(id) on delete set null,
  action_key text not null,
  status text not null default 'queued',
  risk_class smallint not null default 1 check (risk_class between 0 and 5),
  input_summary text,
  output_summary text,
  redaction_summary text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  cost_usd numeric(12,6),
  error_code text,
  error_message text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tool_execution_logs_status_check check (status in ('queued','running','succeeded','failed','blocked','approval_required')),
  constraint tool_execution_logs_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (organisation_id, idempotency_key)
);

create index if not exists tool_execution_logs_org_created_idx
  on staffer.tool_execution_logs (organisation_id, created_at desc);

create index if not exists tool_execution_logs_org_status_idx
  on staffer.tool_execution_logs (organisation_id, status, created_at desc);

alter table staffer.tool_execution_logs enable row level security;

grant select, insert on staffer.tool_execution_logs to authenticated;
grant select, insert, update, delete on staffer.tool_execution_logs to service_role;

drop policy if exists tool_execution_logs_member_select on staffer.tool_execution_logs;
drop policy if exists tool_execution_logs_operator_insert on staffer.tool_execution_logs;

create policy tool_execution_logs_member_select on staffer.tool_execution_logs
for select to authenticated
using (staffer.is_member(organisation_id));

create policy tool_execution_logs_operator_insert on staffer.tool_execution_logs
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
);

create table if not exists staffer.task_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  project_key text,
  default_priority smallint not null default 2 check (default_priority between 0 and 4),
  default_status staffer.task_status not null default 'queued',
  default_assigned_agent_key text,
  schedule_hint text,
  checklist jsonb not null default '[]'::jsonb,
  retry_policy jsonb not null default '{}'::jsonb,
  notification_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key),
  constraint task_templates_checklist_array check (jsonb_typeof(checklist) = 'array'),
  constraint task_templates_retry_policy_object check (jsonb_typeof(retry_policy) = 'object'),
  constraint task_templates_notification_rules_object check (jsonb_typeof(notification_rules) = 'object')
);

create table if not exists staffer.task_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  notification_type text not null,
  channel text not null default 'in_app',
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_agent_id uuid references staffer.agents(id) on delete set null,
  status text not null default 'pending',
  title text not null,
  body text,
  scheduled_for timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint task_notifications_status_check check (status in ('pending','delivered','failed','cancelled')),
  constraint task_notifications_channel_check check (channel in ('in_app','email','webhook','calendar','slack','teams')),
  constraint task_notifications_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists task_templates_org_active_idx
  on staffer.task_templates (organisation_id, is_active, created_at desc);

create index if not exists task_notifications_org_status_idx
  on staffer.task_notifications (organisation_id, status, scheduled_for nulls first, created_at desc);

create index if not exists task_notifications_task_idx
  on staffer.task_notifications (task_id, created_at desc);

alter table staffer.task_templates enable row level security;
alter table staffer.task_notifications enable row level security;

grant select, insert, update, delete on staffer.task_templates to authenticated;
grant select, insert, update on staffer.task_notifications to authenticated;
grant select, insert, update, delete on staffer.task_templates, staffer.task_notifications to service_role;

drop policy if exists task_templates_member_select on staffer.task_templates;
drop policy if exists task_templates_admin_insert on staffer.task_templates;
drop policy if exists task_templates_admin_update on staffer.task_templates;
drop policy if exists task_templates_admin_delete on staffer.task_templates;
drop policy if exists task_notifications_member_select on staffer.task_notifications;
drop policy if exists task_notifications_operator_insert on staffer.task_notifications;
drop policy if exists task_notifications_operator_update on staffer.task_notifications;

create policy task_templates_member_select on staffer.task_templates
for select to authenticated
using (staffer.is_member(organisation_id));

create policy task_templates_admin_insert on staffer.task_templates
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
);

create policy task_templates_admin_update on staffer.task_templates
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy task_templates_admin_delete on staffer.task_templates
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy task_notifications_member_select on staffer.task_notifications
for select to authenticated
using (staffer.is_member(organisation_id));

create policy task_notifications_operator_insert on staffer.task_notifications
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.tasks t
    where t.id = task_id
      and t.organisation_id = task_notifications.organisation_id
  )
);

create policy task_notifications_operator_update on staffer.task_notifications
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]));

create table if not exists staffer.feature_intake_settings (
  organisation_id uuid primary key references staffer.organisations(id) on delete cascade,
  workflow_key text not null default 'feature-intake',
  priority_rules jsonb not null default '{
    "critical": {"targetDays": 2, "riskClass": 5, "keywords": ["regulatory", "security", "outage", "blocked revenue", "critical customer"]},
    "high": {"targetDays": 5, "riskClass": 4, "keywords": ["pilot", "enterprise", "contract", "revenue", "retention", "banking"]},
    "medium": {"targetDays": 10, "riskClass": 3, "keywords": ["workflow", "integration", "report", "dashboard", "mobile"]},
    "low": {"targetDays": 20, "riskClass": 2, "keywords": ["nice to have", "cosmetic", "copy", "minor"]}
  }'::jsonb,
  routing_rules jsonb not null default '{
    "product": ["nancy", "mobola"],
    "architecture": ["anderson", "raj"],
    "quality": ["nakamura"],
    "compliance": ["lawal"],
    "documentation": ["kristin"]
  }'::jsonb,
  github_policy jsonb not null default '{
    "createIssueRequiresApproval": true,
    "defaultRepository": "ossykelvin/staffer",
    "issueMode": "draft_payload_only",
    "labels": ["feature-intake", "needs-founder-approval"]
  }'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_intake_settings_priority_rules_object check (jsonb_typeof(priority_rules) = 'object'),
  constraint feature_intake_settings_routing_rules_object check (jsonb_typeof(routing_rules) = 'object'),
  constraint feature_intake_settings_github_policy_object check (jsonb_typeof(github_policy) = 'object')
);

create table if not exists staffer.feature_intake_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  workflow_run_id uuid references staffer.workflow_runs(id) on delete set null,
  approval_id uuid references staffer.approvals(id) on delete set null,
  source_type text not null default 'manual',
  source_reference text,
  requester_name text,
  requester_email text,
  customer_segment text,
  product_area text,
  title text not null,
  problem_statement text not null,
  expected_outcome text not null,
  evidence text,
  priority text not null default 'medium',
  risk_class smallint not null default 3 check (risk_class between 0 and 5),
  target_decision_at timestamptz,
  nancy_summary jsonb not null default '{}'::jsonb,
  mobola_requirements jsonb not null default '{}'::jsonb,
  anderson_architecture jsonb not null default '{}'::jsonb,
  raj_delivery_plan jsonb not null default '{}'::jsonb,
  nakamura_test_plan jsonb not null default '{}'::jsonb,
  lawal_compliance_review jsonb not null default '{}'::jsonb,
  github_issue_payload jsonb not null default '{}'::jsonb,
  status text not null default 'approval_requested',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_intake_source_type_check check (source_type in ('manual','email','form','api','demo')),
  constraint feature_intake_priority_check check (priority in ('low','medium','high','critical')),
  constraint feature_intake_status_check check (status in ('drafted','approval_requested','approved','github_issue_ready','github_issue_created','changes_requested','cancelled')),
  constraint feature_intake_nancy_summary_object check (jsonb_typeof(nancy_summary) = 'object'),
  constraint feature_intake_mobola_requirements_object check (jsonb_typeof(mobola_requirements) = 'object'),
  constraint feature_intake_anderson_architecture_object check (jsonb_typeof(anderson_architecture) = 'object'),
  constraint feature_intake_raj_delivery_plan_object check (jsonb_typeof(raj_delivery_plan) = 'object'),
  constraint feature_intake_nakamura_test_plan_object check (jsonb_typeof(nakamura_test_plan) = 'object'),
  constraint feature_intake_lawal_compliance_review_object check (jsonb_typeof(lawal_compliance_review) = 'object'),
  constraint feature_intake_github_issue_payload_object check (jsonb_typeof(github_issue_payload) = 'object')
);

create index if not exists feature_intake_requests_org_created_idx
  on staffer.feature_intake_requests (organisation_id, created_at desc);

create index if not exists feature_intake_requests_org_priority_idx
  on staffer.feature_intake_requests (organisation_id, priority, status, updated_at desc);

create unique index if not exists feature_intake_requests_org_source_reference_idx
  on staffer.feature_intake_requests (organisation_id, source_type, source_reference)
  where source_reference is not null;

alter table staffer.feature_intake_settings enable row level security;
alter table staffer.feature_intake_requests enable row level security;

grant select, insert, update on staffer.feature_intake_settings to authenticated;
grant select, insert, update on staffer.feature_intake_requests to authenticated;
grant select, insert, update on staffer.feature_intake_settings, staffer.feature_intake_requests to service_role;

drop policy if exists feature_intake_settings_member_select on staffer.feature_intake_settings;
drop policy if exists feature_intake_settings_admin_insert on staffer.feature_intake_settings;
drop policy if exists feature_intake_settings_admin_update on staffer.feature_intake_settings;
drop policy if exists feature_intake_requests_member_select on staffer.feature_intake_requests;
drop policy if exists feature_intake_requests_operator_insert on staffer.feature_intake_requests;
drop policy if exists feature_intake_requests_operator_update on staffer.feature_intake_requests;

create policy feature_intake_settings_member_select on staffer.feature_intake_settings
for select to authenticated
using (staffer.is_member(organisation_id));

create policy feature_intake_settings_admin_insert on staffer.feature_intake_settings
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
);

create policy feature_intake_settings_admin_update on staffer.feature_intake_settings
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy feature_intake_requests_member_select on staffer.feature_intake_requests
for select to authenticated
using (staffer.is_member(organisation_id));

create policy feature_intake_requests_operator_insert on staffer.feature_intake_requests
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.tasks t
    where t.id = task_id
      and t.organisation_id = feature_intake_requests.organisation_id
  )
);

create policy feature_intake_requests_operator_update on staffer.feature_intake_requests
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]));

create or replace function staffer.ensure_feature_intake_settings(target_organisation_id uuid)
returns staffer.feature_intake_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row staffer.feature_intake_settings;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to initialise feature intake settings.';
  end if;

  insert into staffer.feature_intake_settings (organisation_id, created_by)
  values (target_organisation_id, current_user_id)
  on conflict (organisation_id) do update
    set updated_at = staffer.feature_intake_settings.updated_at
  returning * into settings_row;

  return settings_row;
end;
$$;

create or replace function staffer.ensure_feature_intake_workflow(target_organisation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to initialise feature intake workflow.';
  end if;

  insert into staffer.workflows (
    organisation_id,
    key,
    name,
    description,
    definition,
    version,
    status,
    created_by,
    updated_at
  )
  values (
    target_organisation_id,
    'feature-intake',
    'Feature Intake to Engineering',
    'Manual, form, email or API-backed feature intake that converts evidence into product summary, requirements, architecture, delivery plan, QA plan, compliance review and an approval-gated GitHub issue payload.',
    jsonb_build_object(
      'department', 'Product',
      'trigger', 'Manual feature request now; form, email and API events share source_reference idempotency later.',
      'steps', jsonb_build_array(
        jsonb_build_object('key', 'intake', 'name', 'Capture feedback or founder request', 'type', 'trigger'),
        jsonb_build_object('key', 'nancy-summary', 'name', 'Nancy summarises product problem and expected outcome', 'type', 'agent'),
        jsonb_build_object('key', 'mobola-requirements', 'name', 'Mobola drafts requirements and traceability', 'type', 'agent'),
        jsonb_build_object('key', 'anderson-architecture', 'name', 'Anderson reviews architecture, security impact and options', 'type', 'agent'),
        jsonb_build_object('key', 'raj-delivery-plan', 'name', 'Raj drafts implementation slices and GitHub tasks', 'type', 'agent'),
        jsonb_build_object('key', 'nakamura-test-plan', 'name', 'Nakamura drafts acceptance, security and release-risk tests', 'type', 'agent'),
        jsonb_build_object('key', 'lawal-compliance', 'name', 'Lawal identifies data-protection and regulated-industry controls', 'type', 'agent'),
        jsonb_build_object('key', 'founder-approval', 'name', 'Founder approves roadmap or backlog outcome', 'type', 'approval'),
        jsonb_build_object('key', 'github-issue-draft', 'name', 'Create GitHub issue only after exact-payload approval', 'type', 'action')
      ),
      'approval', 'Required before roadmap commitment or GitHub issue creation',
      'sla', 'Driven by feature_intake_settings.priority_rules',
      'protectedActions', jsonb_build_array('github_issue_create', 'roadmap_commitment', 'external_commitment'),
      'pb', 'PB-026'
    ),
    1,
    'active',
    current_user_id,
    now()
  )
  on conflict (organisation_id, key, version) do update
    set name = excluded.name,
        description = excluded.description,
        definition = excluded.definition,
        status = excluded.status,
        updated_at = now()
  returning id into workflow_id;

  return workflow_id;
end;
$$;

create or replace function staffer.create_default_task_templates(target_organisation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to create task templates.';
  end if;

  insert into staffer.task_templates (
    organisation_id,
    key,
    name,
    description,
    project_key,
    default_priority,
    default_status,
    default_assigned_agent_key,
    schedule_hint,
    checklist,
    retry_policy,
    notification_rules,
    created_by
  )
  values
    (
      target_organisation_id,
      'feature-intake-review',
      'Feature intake review',
      'Review product feedback, draft requirements, assess risk and prepare approval-gated engineering issue payload.',
      'product-intake',
      3,
      'approval',
      'nancy',
      'Created from Feature Intake workflow',
      '["Summarise product problem","Draft requirements","Review architecture/security","Draft QA/compliance checks","Request founder approval"]'::jsonb,
      '{"maxRetries": 2, "backoffHours": 4}'::jsonb,
      '{"overdue": true, "approvalWaiting": true, "failed": true}'::jsonb,
      current_user_id
    ),
    (
      target_organisation_id,
      'documentation-follow-up',
      'Documentation follow-up',
      'Turn approved workflow or support findings into a source-cited knowledge improvement draft.',
      'documentation',
      2,
      'queued',
      'kristin',
      'Created after resolved case, approved feature or release',
      '["Identify audience","Collect approved sources","Draft article or SOP","Route required specialist review"]'::jsonb,
      '{"maxRetries": 2, "backoffHours": 8}'::jsonb,
      '{"overdue": true, "approvalWaiting": false, "failed": true}'::jsonb,
      current_user_id
    )
  on conflict (organisation_id, key) do update
    set name = excluded.name,
        description = excluded.description,
        project_key = excluded.project_key,
        default_priority = excluded.default_priority,
        default_status = excluded.default_status,
        default_assigned_agent_key = excluded.default_assigned_agent_key,
        schedule_hint = excluded.schedule_hint,
        checklist = excluded.checklist,
        retry_policy = excluded.retry_policy,
        notification_rules = excluded.notification_rules,
        updated_at = now();

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function staffer.queue_task_notifications(target_organisation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]) then
    raise exception 'You do not have permission to queue task notifications.';
  end if;

  insert into staffer.task_notifications (
    organisation_id,
    task_id,
    notification_type,
    channel,
    recipient_user_id,
    title,
    body,
    scheduled_for,
    metadata,
    created_by
  )
  select
    t.organisation_id,
    t.id,
    case
      when t.status in ('failed','blocked') then 'failed_or_blocked'
      when t.status = 'approval' then 'approval_waiting'
      when t.due_at is not null and t.due_at < now() and t.status <> 'completed' then 'overdue'
      else 'attention'
    end,
    'in_app',
    t.created_by,
    case
      when t.status in ('failed','blocked') then 'Task needs recovery'
      when t.status = 'approval' then 'Task is waiting for approval'
      else 'Task is overdue'
    end,
    t.title,
    now(),
    jsonb_build_object('taskReference', t.reference, 'status', t.status, 'dueAt', t.due_at),
    current_user_id
  from staffer.tasks t
  where t.organisation_id = target_organisation_id
    and t.status <> 'completed'
    and (
      t.status in ('failed','blocked','approval')
      or (t.due_at is not null and t.due_at < now())
    )
    and not exists (
      select 1
      from staffer.task_notifications n
      where n.task_id = t.id
        and n.notification_type = case
          when t.status in ('failed','blocked') then 'failed_or_blocked'
          when t.status = 'approval' then 'approval_waiting'
          when t.due_at is not null and t.due_at < now() and t.status <> 'completed' then 'overdue'
          else 'attention'
        end
        and n.status = 'pending'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function staffer.get_governance_dashboard(target_organisation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.is_member(target_organisation_id) then
    raise exception 'You do not have permission to view this governance dashboard.';
  end if;

  select jsonb_build_object(
    'audit', jsonb_build_object(
      'events', (select count(*) from staffer.audit_logs a where a.organisation_id = target_organisation_id),
      'latestAt', (select max(created_at) from staffer.audit_logs a where a.organisation_id = target_organisation_id),
      'materialMutations', (
        select count(*)
        from staffer.audit_logs a
        where a.organisation_id = target_organisation_id
          and (a.event_type like '%.created' or a.event_type like '%.updated' or a.event_type like '%.sent' or a.event_type like '%.requested')
      )
    ),
    'cost', jsonb_build_object(
      'taskRunCostUsd', coalesce((select sum(cost_usd) from staffer.task_runs tr where tr.organisation_id = target_organisation_id), 0),
      'toolCostUsd', coalesce((select sum(cost_usd) from staffer.tool_execution_logs tel where tel.organisation_id = target_organisation_id), 0)
    ),
    'quality', jsonb_build_object(
      'completedTasks', (select count(*) from staffer.tasks t where t.organisation_id = target_organisation_id and t.status = 'completed'),
      'failedTasks', (select count(*) from staffer.tasks t where t.organisation_id = target_organisation_id and t.status = 'failed'),
      'blockedTasks', (select count(*) from staffer.tasks t where t.organisation_id = target_organisation_id and t.status = 'blocked'),
      'pendingApprovals', (select count(*) from staffer.approvals ap where ap.organisation_id = target_organisation_id and ap.status = 'pending')
    ),
    'latency', jsonb_build_object(
      'averageTaskRunMs', (
        select avg(extract(epoch from (completed_at - started_at)) * 1000)
        from staffer.task_runs tr
        where tr.organisation_id = target_organisation_id
          and tr.started_at is not null
          and tr.completed_at is not null
      ),
      'averageToolMs', (select avg(latency_ms) from staffer.tool_execution_logs tel where tel.organisation_id = target_organisation_id and tel.latency_ms is not null)
    ),
    'failures', jsonb_build_object(
      'workflowFailures', (select count(*) from staffer.workflow_runs wr where wr.organisation_id = target_organisation_id and wr.status in ('failed','cancelled','blocked')),
      'toolFailures', (select count(*) from staffer.tool_execution_logs tel where tel.organisation_id = target_organisation_id and tel.status in ('failed','blocked')),
      'approvalBlocks', (select count(*) from staffer.approval_execution_checks aec where aec.organisation_id = target_organisation_id and aec.status = 'blocked')
    ),
    'generatedAt', now()
  ) into result;

  return result;
end;
$$;

revoke all on function staffer.ensure_feature_intake_settings(uuid) from public;
revoke all on function staffer.ensure_feature_intake_workflow(uuid) from public;
revoke all on function staffer.create_default_task_templates(uuid) from public;
revoke all on function staffer.queue_task_notifications(uuid) from public;
revoke all on function staffer.get_governance_dashboard(uuid) from public;

grant execute on function staffer.ensure_feature_intake_settings(uuid) to authenticated, service_role;
grant execute on function staffer.ensure_feature_intake_workflow(uuid) to authenticated, service_role;
grant execute on function staffer.create_default_task_templates(uuid) to authenticated, service_role;
grant execute on function staffer.queue_task_notifications(uuid) to authenticated, service_role;
grant execute on function staffer.get_governance_dashboard(uuid) to authenticated, service_role;

comment on table staffer.feature_intake_settings is 'Mutable tenant-owned settings for Feature Intake to Engineering.';
comment on table staffer.feature_intake_requests is 'Live feature intake records connecting product feedback, task, workflow run, agent reviews, approval and GitHub issue payload.';
comment on table staffer.task_templates is 'Tenant-owned task templates for recurring operations and workflow-generated work.';
comment on table staffer.task_notifications is 'Queued in-app/email/webhook notifications for overdue, failed and approval-waiting tasks.';
comment on table staffer.tool_execution_logs is 'Append-only governed tool execution telemetry with redacted summaries, approval links and failure metrics.';
comment on function staffer.get_governance_dashboard(uuid) is 'Aggregates audit, cost, quality, latency and failure metrics for a tenant governance dashboard.';
