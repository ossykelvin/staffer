-- Staffer Phase 3 task collaboration.
-- Adds live comments, watchers, dependencies, retry metadata and evidence timeline events.

alter table staffer.tasks
  add column if not exists retry_policy jsonb not null default '{}'::jsonb,
  add column if not exists retry_count integer not null default 0 check (retry_count >= 0),
  add column if not exists last_retry_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists retry_reason text;

alter table staffer.tasks
  drop constraint if exists tasks_retry_policy_object,
  add constraint tasks_retry_policy_object check (jsonb_typeof(retry_policy) = 'object');

create table if not exists staffer.task_comments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  body text not null,
  visibility text not null default 'internal' check (visibility in ('internal','reviewer','owner')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_comments_body_not_blank check (length(trim(body)) > 0)
);

create table if not exists staffer.task_watchers (
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists staffer.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references staffer.tasks(id) on delete cascade,
  dependency_type text not null default 'blocks' check (dependency_type in ('blocks','relates_to','duplicates','parent')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id, dependency_type),
  constraint task_dependencies_not_self check (task_id <> depends_on_task_id)
);

create table if not exists staffer.task_evidence_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  event_type text not null default 'evidence' check (event_type in ('evidence','attachment','status','retry','dependency','watcher','comment','system')),
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint task_evidence_events_title_not_blank check (length(trim(title)) > 0),
  constraint task_evidence_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists task_comments_task_created_idx
  on staffer.task_comments (task_id, created_at desc);

create index if not exists task_watchers_user_idx
  on staffer.task_watchers (user_id, created_at desc);

create index if not exists task_dependencies_task_idx
  on staffer.task_dependencies (task_id, created_at desc);

create index if not exists task_dependencies_depends_on_idx
  on staffer.task_dependencies (depends_on_task_id, created_at desc);

create index if not exists task_evidence_events_task_created_idx
  on staffer.task_evidence_events (task_id, created_at desc);

alter table staffer.task_comments enable row level security;
alter table staffer.task_watchers enable row level security;
alter table staffer.task_dependencies enable row level security;
alter table staffer.task_evidence_events enable row level security;

grant select, insert on
  staffer.task_comments,
  staffer.task_watchers,
  staffer.task_dependencies,
  staffer.task_evidence_events
to authenticated;

grant delete on
  staffer.task_watchers,
  staffer.task_dependencies
to authenticated;

grant select, insert, update, delete on
  staffer.task_comments,
  staffer.task_watchers,
  staffer.task_dependencies,
  staffer.task_evidence_events
to service_role;

drop policy if exists task_comments_member_select on staffer.task_comments;
drop policy if exists task_comments_member_insert on staffer.task_comments;
drop policy if exists task_watchers_member_select on staffer.task_watchers;
drop policy if exists task_watchers_self_insert on staffer.task_watchers;
drop policy if exists task_watchers_self_or_admin_delete on staffer.task_watchers;
drop policy if exists task_dependencies_member_select on staffer.task_dependencies;
drop policy if exists task_dependencies_operator_insert on staffer.task_dependencies;
drop policy if exists task_dependencies_operator_delete on staffer.task_dependencies;
drop policy if exists task_evidence_events_member_select on staffer.task_evidence_events;
drop policy if exists task_evidence_events_operator_insert on staffer.task_evidence_events;

create policy task_comments_member_select on staffer.task_comments
for select to authenticated
using (staffer.is_member(organisation_id));

create policy task_comments_member_insert on staffer.task_comments
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.is_member(organisation_id)
  and exists (
    select 1
    from staffer.tasks t
    where t.id = task_id
      and t.organisation_id = task_comments.organisation_id
  )
);

create policy task_watchers_member_select on staffer.task_watchers
for select to authenticated
using (staffer.is_member(organisation_id));

create policy task_watchers_self_insert on staffer.task_watchers
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and created_by = (select auth.uid())
  and staffer.is_member(organisation_id)
  and exists (
    select 1
    from staffer.tasks t
    where t.id = task_id
      and t.organisation_id = task_watchers.organisation_id
  )
);

create policy task_watchers_self_or_admin_delete on staffer.task_watchers
for delete to authenticated
using (
  user_id = (select auth.uid())
  or staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
);

create policy task_dependencies_member_select on staffer.task_dependencies
for select to authenticated
using (staffer.is_member(organisation_id));

create policy task_dependencies_operator_insert on staffer.task_dependencies
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.tasks t
    join staffer.tasks d on d.id = depends_on_task_id
    where t.id = task_id
      and t.organisation_id = task_dependencies.organisation_id
      and d.organisation_id = task_dependencies.organisation_id
  )
);

create policy task_dependencies_operator_delete on staffer.task_dependencies
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy task_evidence_events_member_select on staffer.task_evidence_events
for select to authenticated
using (staffer.is_member(organisation_id));

create policy task_evidence_events_operator_insert on staffer.task_evidence_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.tasks t
    where t.id = task_id
      and t.organisation_id = task_evidence_events.organisation_id
  )
);

comment on column staffer.tasks.retry_policy is 'Task-specific retry settings as mutable tenant data. Empty object means no retry policy configured.';
comment on column staffer.tasks.retry_count is 'Number of retry attempts recorded for this task.';
comment on table staffer.task_comments is 'Tenant-scoped task comments.';
comment on table staffer.task_watchers is 'Users watching tenant-scoped tasks.';
comment on table staffer.task_dependencies is 'Task-to-task dependency edges within an organisation.';
comment on table staffer.task_evidence_events is 'Append-only task evidence and activity timeline events.';
