-- Staffer core schema. Review in a non-production project before applying.
create schema if not exists staffer;

create type staffer.membership_role as enum ('founder','administrator','reviewer','operator','viewer');
create type staffer.task_status as enum ('draft','queued','running','blocked','review','approval','completed','failed','cancelled');
create type staffer.approval_status as enum ('pending','approved','rejected','changes_requested','expired','cancelled');

create table staffer.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/London',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table staffer.memberships (
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role staffer.membership_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create table staffer.agents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  job_title text not null,
  department text not null,
  biography text,
  profile jsonb not null default '{}'::jsonb,
  autonomy_level smallint not null default 1 check (autonomy_level between 0 and 5),
  primary_model text,
  fallback_model text,
  maximum_steps integer not null default 8 check (maximum_steps > 0),
  maximum_cost_usd numeric(10,4),
  status text not null default 'draft',
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key)
);

create table staffer.skills (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (organisation_id, key)
);

create table staffer.agent_skills (
  agent_id uuid not null references staffer.agents(id) on delete cascade,
  skill_id uuid not null references staffer.skills(id) on delete cascade,
  proficiency smallint not null default 3 check (proficiency between 1 and 5),
  primary key (agent_id, skill_id)
);

create table staffer.tools (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  risk_class smallint not null default 1 check (risk_class between 0 and 5),
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default false,
  is_active boolean not null default true,
  unique (organisation_id, key)
);

create table staffer.agent_tools (
  agent_id uuid not null references staffer.agents(id) on delete cascade,
  tool_id uuid not null references staffer.tools(id) on delete cascade,
  constraints jsonb not null default '{}'::jsonb,
  primary key (agent_id, tool_id)
);

create table staffer.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  reference text not null,
  title text not null,
  description text,
  project_key text,
  priority smallint not null default 2 check (priority between 0 and 4),
  status staffer.task_status not null default 'draft',
  assigned_agent_id uuid references staffer.agents(id),
  assigned_user_id uuid references auth.users(id),
  due_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  idempotency_key text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, reference),
  unique (organisation_id, idempotency_key)
);

create table staffer.task_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  agent_id uuid references staffer.agents(id),
  status text not null default 'queued',
  provider text,
  model text,
  started_at timestamptz,
  completed_at timestamptz,
  input_tokens bigint,
  output_tokens bigint,
  cost_usd numeric(12,6),
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table staffer.workflows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  definition jsonb not null,
  version integer not null default 1,
  status text not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key, version)
);

create table staffer.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  workflow_id uuid not null references staffer.workflows(id),
  task_id uuid references staffer.tasks(id),
  status text not null default 'queued',
  current_step text,
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table staffer.approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid references staffer.tasks(id) on delete cascade,
  workflow_run_id uuid references staffer.workflow_runs(id) on delete cascade,
  requested_by_agent_id uuid references staffer.agents(id),
  requested_by_user_id uuid references auth.users(id),
  action_key text not null,
  action_payload jsonb not null,
  payload_hash text not null,
  risk_class smallint not null default 1 check (risk_class between 0 and 5),
  status staffer.approval_status not null default 'pending',
  decided_by uuid references auth.users(id),
  decision_comment text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table staffer.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  title text not null,
  storage_path text,
  mime_type text,
  sensitivity text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table staffer.audit_logs (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  actor_type text not null,
  actor_id text,
  event_type text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  previous_hash text,
  event_hash text,
  created_at timestamptz not null default now()
);

create index tasks_org_status_idx on staffer.tasks (organisation_id, status, created_at desc);
create index approvals_org_status_idx on staffer.approvals (organisation_id, status, created_at desc);
create index audit_org_created_idx on staffer.audit_logs (organisation_id, created_at desc);
create index runs_task_idx on staffer.task_runs (task_id, created_at desc);

alter table staffer.organisations enable row level security;
alter table staffer.memberships enable row level security;
alter table staffer.agents enable row level security;
alter table staffer.skills enable row level security;
alter table staffer.agent_skills enable row level security;
alter table staffer.tools enable row level security;
alter table staffer.agent_tools enable row level security;
alter table staffer.tasks enable row level security;
alter table staffer.task_runs enable row level security;
alter table staffer.workflows enable row level security;
alter table staffer.workflow_runs enable row level security;
alter table staffer.approvals enable row level security;
alter table staffer.documents enable row level security;
alter table staffer.audit_logs enable row level security;

create or replace function staffer.is_member(target_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from staffer.memberships m
    where m.organisation_id = target_organisation_id
      and m.user_id = (select auth.uid())
  );
$$;

create policy organisations_member_select on staffer.organisations for select to authenticated
using (staffer.is_member(id));
create policy memberships_member_select on staffer.memberships for select to authenticated
using (staffer.is_member(organisation_id));

-- Apply the same tenant predicate to operational tables. Mutation policies should be
-- tightened by role in a follow-up migration before production use.
create policy agents_member_select on staffer.agents for select to authenticated using (staffer.is_member(organisation_id));
create policy skills_member_select on staffer.skills for select to authenticated using (staffer.is_member(organisation_id));
create policy tools_member_select on staffer.tools for select to authenticated using (staffer.is_member(organisation_id));
create policy tasks_member_select on staffer.tasks for select to authenticated using (staffer.is_member(organisation_id));
create policy task_runs_member_select on staffer.task_runs for select to authenticated using (staffer.is_member(organisation_id));
create policy workflows_member_select on staffer.workflows for select to authenticated using (staffer.is_member(organisation_id));
create policy workflow_runs_member_select on staffer.workflow_runs for select to authenticated using (staffer.is_member(organisation_id));
create policy approvals_member_select on staffer.approvals for select to authenticated using (staffer.is_member(organisation_id));
create policy documents_member_select on staffer.documents for select to authenticated using (staffer.is_member(organisation_id));
create policy audit_member_select on staffer.audit_logs for select to authenticated using (staffer.is_member(organisation_id));

-- Junction-table policies derive tenant membership through the parent record.
create policy agent_skills_member_select on staffer.agent_skills for select to authenticated
using (exists (select 1 from staffer.agents a where a.id = agent_id and staffer.is_member(a.organisation_id)));
create policy agent_tools_member_select on staffer.agent_tools for select to authenticated
using (exists (select 1 from staffer.agents a where a.id = agent_id and staffer.is_member(a.organisation_id)));
