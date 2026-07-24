-- Staffer Phase 5 PB-029/PB-030/PB-031.
-- Adds server-enforced tool throttling, durable circuit-breaker state,
-- first-class safe internal tool registry coverage, and Gmail ingestion/draft
-- telemetry foundations.

alter table staffer.tool_execution_logs
  add column if not exists integration_key text not null default 'internal',
  add column if not exists rate_limit_key text,
  add column if not exists circuit_breaker_key text,
  add column if not exists retry_after_at timestamptz,
  add column if not exists attempt_count integer not null default 1 check (attempt_count > 0);

alter table staffer.tool_execution_logs
  drop constraint if exists tool_execution_logs_status_check,
  add constraint tool_execution_logs_status_check
    check (status in ('queued','running','succeeded','failed','blocked','approval_required','rate_limited','circuit_open'));

create table if not exists staffer.tool_runtime_policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  tool_id uuid references staffer.tools(id) on delete cascade,
  tool_key text not null,
  integration_key text not null default 'internal',
  scope_key text not null default 'organisation',
  window_seconds integer not null default 60 check (window_seconds > 0 and window_seconds <= 86400),
  max_attempts integer not null default 30 check (max_attempts > 0),
  failure_threshold integer not null default 5 check (failure_threshold > 0),
  recovery_seconds integer not null default 300 check (recovery_seconds > 0 and recovery_seconds <= 86400),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, tool_key, integration_key, scope_key),
  constraint tool_runtime_policies_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists staffer.tool_circuit_breaker_states (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  tool_id uuid references staffer.tools(id) on delete set null,
  tool_key text not null,
  integration_key text not null default 'internal',
  breaker_key text not null,
  state text not null default 'closed' check (state in ('closed','open','half_open')),
  failure_count integer not null default 0 check (failure_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failure_threshold integer not null default 5 check (failure_threshold > 0),
  recovery_seconds integer not null default 300 check (recovery_seconds > 0),
  opened_at timestamptz,
  half_opened_at timestamptz,
  retry_after_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, breaker_key),
  constraint tool_circuit_breaker_states_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists staffer.gmail_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid references staffer.tasks(id) on delete set null,
  support_case_id uuid references staffer.support_triage_cases(id) on delete set null,
  gmail_message_id text,
  gmail_thread_id text,
  gmail_history_id text,
  source_event_id text,
  status text not null default 'queued' check (status in ('queued','processed','duplicate','failed')),
  event_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organisation_id, gmail_message_id),
  unique (organisation_id, source_event_id),
  constraint gmail_ingestion_events_payload_object check (jsonb_typeof(event_payload) = 'object')
);

create index if not exists tool_execution_logs_runtime_idx
  on staffer.tool_execution_logs (organisation_id, tool_id, integration_key, action_key, created_at desc);

create index if not exists tool_execution_logs_rate_limit_idx
  on staffer.tool_execution_logs (organisation_id, rate_limit_key, created_at desc)
  where rate_limit_key is not null;

create index if not exists tool_runtime_policies_org_tool_idx
  on staffer.tool_runtime_policies (organisation_id, tool_key, integration_key, is_active);

create index if not exists tool_circuit_breaker_states_org_state_idx
  on staffer.tool_circuit_breaker_states (organisation_id, state, retry_after_at);

create index if not exists gmail_ingestion_events_org_status_idx
  on staffer.gmail_ingestion_events (organisation_id, status, created_at desc);

create index if not exists gmail_ingestion_events_message_idx
  on staffer.gmail_ingestion_events (organisation_id, gmail_message_id)
  where gmail_message_id is not null;

alter table staffer.tool_runtime_policies enable row level security;
alter table staffer.tool_circuit_breaker_states enable row level security;
alter table staffer.gmail_ingestion_events enable row level security;

grant select, insert, update on staffer.tool_runtime_policies to authenticated;
grant select, insert, update on staffer.tool_circuit_breaker_states to authenticated;
grant select, insert, update on staffer.gmail_ingestion_events to authenticated;
grant select, insert, update, delete on staffer.tool_runtime_policies to service_role;
grant select, insert, update, delete on staffer.tool_circuit_breaker_states to service_role;
grant select, insert, update, delete on staffer.gmail_ingestion_events to service_role;

drop policy if exists tool_runtime_policies_member_select on staffer.tool_runtime_policies;
drop policy if exists tool_runtime_policies_admin_write on staffer.tool_runtime_policies;
drop policy if exists tool_circuit_breaker_states_member_select on staffer.tool_circuit_breaker_states;
drop policy if exists tool_circuit_breaker_states_operator_write on staffer.tool_circuit_breaker_states;
drop policy if exists gmail_ingestion_events_member_select on staffer.gmail_ingestion_events;
drop policy if exists gmail_ingestion_events_operator_write on staffer.gmail_ingestion_events;

create policy tool_runtime_policies_member_select on staffer.tool_runtime_policies
for select to authenticated
using (staffer.is_member(organisation_id));

create policy tool_runtime_policies_admin_write on staffer.tool_runtime_policies
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tool_circuit_breaker_states_member_select on staffer.tool_circuit_breaker_states
for select to authenticated
using (staffer.is_member(organisation_id));

create policy tool_circuit_breaker_states_operator_write on staffer.tool_circuit_breaker_states
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy gmail_ingestion_events_member_select on staffer.gmail_ingestion_events
for select to authenticated
using (staffer.is_member(organisation_id));

create policy gmail_ingestion_events_operator_write on staffer.gmail_ingestion_events
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

with desired_tools as (
  select
    o.id as organisation_id,
    tool.key,
    tool.name,
    tool.description,
    tool.risk_class,
    tool.requires_approval,
    tool.rate_limit_per_minute,
    tool.circuit_breaker
  from staffer.organisations o
  cross join (
    values
      ('task_read', 'Task read', 'Read tenant-scoped task records through a narrow server tool.', 1, false, 120, '{"failureThreshold":6,"recoverySeconds":120}'::jsonb),
      ('task_update', 'Task update', 'Update allow-listed task fields through a governed server tool.', 3, true, 30, '{"failureThreshold":4,"recoverySeconds":180}'::jsonb),
      ('approval_request', 'Approval request', 'Create exact-payload approval requests without executing the protected action.', 3, false, 45, '{"failureThreshold":4,"recoverySeconds":180}'::jsonb),
      ('document_draft', 'Document draft', 'Create draft internal documents without publishing or deletion privileges.', 2, false, 30, '{"failureThreshold":4,"recoverySeconds":180}'::jsonb),
      ('gmail_read', 'Gmail read', 'Read allow-listed Gmail messages for Support Triage ingestion.', 3, false, 60, '{"failureThreshold":5,"recoverySeconds":300}'::jsonb),
      ('gmail_draft', 'Gmail draft', 'Create Gmail drafts only; sending remains separately approval-gated.', 4, true, 20, '{"failureThreshold":3,"recoverySeconds":300}'::jsonb)
  ) as tool(key, name, description, risk_class, requires_approval, rate_limit_per_minute, circuit_breaker)
)
insert into staffer.tools (
  organisation_id,
  key,
  name,
  description,
  risk_class,
  requires_approval,
  rate_limit_per_minute,
  circuit_breaker,
  redaction_policy
)
select
  organisation_id,
  key,
  name,
  description,
  risk_class,
  requires_approval,
  rate_limit_per_minute,
  circuit_breaker,
  '{"logRawPayload":false,"storeSummariesOnly":true}'::jsonb
from desired_tools
on conflict (organisation_id, key) do update
set
  name = excluded.name,
  description = excluded.description,
  rate_limit_per_minute = excluded.rate_limit_per_minute,
  circuit_breaker = excluded.circuit_breaker,
  redaction_policy = excluded.redaction_policy;

with tool_policies as (
  select
    t.organisation_id,
    t.id as tool_id,
    t.key as tool_key,
    case
      when t.key in ('gmail_read', 'gmail_draft') then 'gmail'
      when t.key = 'github_issue_draft' then 'github'
      when t.key = 'email_draft' then 'email'
      else 'internal'
    end as integration_key,
    coalesce(t.rate_limit_per_minute, 30) as max_attempts,
    coalesce((t.circuit_breaker->>'failureThreshold')::integer, 5) as failure_threshold,
    coalesce((t.circuit_breaker->>'recoverySeconds')::integer, 300) as recovery_seconds
  from staffer.tools t
  where t.key in (
    'knowledge_search',
    'task_read',
    'task_update',
    'approval_request',
    'document_draft',
    'email_draft',
    'gmail_read',
    'gmail_draft',
    'github_issue_draft'
  )
)
insert into staffer.tool_runtime_policies (
  organisation_id,
  tool_id,
  tool_key,
  integration_key,
  scope_key,
  window_seconds,
  max_attempts,
  failure_threshold,
  recovery_seconds,
  metadata
)
select
  organisation_id,
  tool_id,
  tool_key,
  integration_key,
  'organisation',
  60,
  max_attempts,
  failure_threshold,
  recovery_seconds,
  jsonb_build_object('source', 'PB-029', 'configuredFromToolContract', true)
from tool_policies
on conflict (organisation_id, tool_key, integration_key, scope_key) do update
set
  tool_id = excluded.tool_id,
  max_attempts = excluded.max_attempts,
  failure_threshold = excluded.failure_threshold,
  recovery_seconds = excluded.recovery_seconds,
  updated_at = now();

with support_agent as (
  select id, organisation_id
  from staffer.agents
  where key = 'anna'
),
gmail_tools as (
  select id, organisation_id, key
  from staffer.tools
  where key in ('gmail_read', 'gmail_draft')
)
insert into staffer.agent_tools (agent_id, tool_id, constraints)
select
  support_agent.id,
  gmail_tools.id,
  case
    when gmail_tools.key = 'gmail_read' then '{"allowedActions":["gmail.message_read","gmail.event_ingest"],"blockedActions":["gmail.send","gmail.delete"]}'::jsonb
    else '{"allowedActions":["gmail.draft_create"],"blockedActions":["gmail.send","gmail.delete"]}'::jsonb
  end
from support_agent
join gmail_tools on gmail_tools.organisation_id = support_agent.organisation_id
on conflict (agent_id, tool_id) do update
set constraints = excluded.constraints;

with internal_tools as (
  select id, organisation_id, key
  from staffer.tools
  where key in ('task_read', 'task_update', 'approval_request', 'document_draft')
),
agent_matches as (
  select a.id as agent_id, a.organisation_id, t.id as tool_id, t.key
  from staffer.agents a
  join internal_tools t on t.organisation_id = a.organisation_id
  where t.key in (
    select jsonb_array_elements_text(coalesce(a.profile->'tools', '[]'::jsonb))
  )
)
insert into staffer.agent_tools (agent_id, tool_id, constraints)
select
  agent_id,
  tool_id,
  case
    when key = 'task_read' then '{"allowedActions":["task.read"]}'::jsonb
    when key = 'task_update' then '{"allowedActions":["task.update_status","task.update_assignment","task.update_due_at"],"blockedActions":["task.delete"]}'::jsonb
    when key = 'approval_request' then '{"allowedActions":["approval.request"]}'::jsonb
    else '{"allowedActions":["document.draft_create"],"blockedActions":["document.publish","document.delete"]}'::jsonb
  end
from agent_matches
on conflict (agent_id, tool_id) do update
set constraints = excluded.constraints;

comment on table staffer.tool_runtime_policies is 'Tenant-owned runtime throttling and circuit breaker policy for governed Staffer tools.';
comment on table staffer.tool_circuit_breaker_states is 'Durable per-integration breaker state used before external or internal tool execution.';
comment on table staffer.gmail_ingestion_events is 'Idempotent Gmail Support Triage ingestion events, including Pub/Sub history notifications and processed message ids.';
