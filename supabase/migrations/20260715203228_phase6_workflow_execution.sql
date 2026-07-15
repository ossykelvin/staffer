-- Staffer Phase 6 workflow execution foundation.
-- Adds durable workflow run state, step records, append-only events and idempotent control RPCs.

alter table staffer.workflow_runs
  add column if not exists trigger_type text not null default 'manual',
  add column if not exists trigger_payload jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists definition_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists run_kind text not null default 'original',
  add column if not exists replay_of_run_id uuid references staffer.workflow_runs(id) on delete set null,
  add column if not exists current_step_index integer not null default 0,
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists pause_reason text,
  add column if not exists resume_token text,
  add column if not exists paused_at timestamptz,
  add column if not exists resumed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

alter table staffer.workflow_runs
  drop constraint if exists workflow_runs_status_check,
  add constraint workflow_runs_status_check check (status in ('queued','running','paused','waiting','blocked','completed','failed','cancelled')),
  drop constraint if exists workflow_runs_context_object,
  add constraint workflow_runs_context_object check (jsonb_typeof(context) = 'object'),
  drop constraint if exists workflow_runs_trigger_payload_object,
  add constraint workflow_runs_trigger_payload_object check (jsonb_typeof(trigger_payload) = 'object'),
  drop constraint if exists workflow_runs_definition_snapshot_object,
  add constraint workflow_runs_definition_snapshot_object check (jsonb_typeof(definition_snapshot) = 'object'),
  drop constraint if exists workflow_runs_run_kind_check,
  add constraint workflow_runs_run_kind_check check (run_kind in ('original','retry','replay')),
  drop constraint if exists workflow_runs_retry_count_nonnegative,
  add constraint workflow_runs_retry_count_nonnegative check (retry_count >= 0 and max_retries >= 0);

create unique index if not exists workflow_runs_org_idempotency_key_idx
  on staffer.workflow_runs (organisation_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists workflow_runs_org_status_updated_idx
  on staffer.workflow_runs (organisation_id, status, updated_at desc);

create table if not exists staffer.workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  workflow_run_id uuid not null references staffer.workflow_runs(id) on delete cascade,
  workflow_id uuid not null references staffer.workflows(id) on delete cascade,
  task_id uuid references staffer.tasks(id) on delete set null,
  step_index integer not null,
  step_key text not null,
  step_name text not null,
  step_type text not null default 'agent',
  status text not null default 'queued',
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  idempotency_key text not null,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  next_retry_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_run_steps_status_check check (status in ('queued','running','waiting','paused','completed','failed','skipped','cancelled')),
  constraint workflow_run_steps_attempts_positive check (attempt > 0 and max_attempts > 0),
  constraint workflow_run_steps_input_object check (jsonb_typeof(input_payload) = 'object'),
  constraint workflow_run_steps_output_object check (jsonb_typeof(output_payload) = 'object'),
  constraint workflow_run_steps_error_object check (jsonb_typeof(error_payload) = 'object'),
  unique (workflow_run_id, step_index, attempt),
  unique (organisation_id, idempotency_key)
);

create table if not exists staffer.workflow_run_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  workflow_run_id uuid not null references staffer.workflow_runs(id) on delete cascade,
  step_run_id uuid references staffer.workflow_run_steps(id) on delete set null,
  event_type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint workflow_run_events_title_not_blank check (length(trim(title)) > 0),
  constraint workflow_run_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists workflow_run_steps_run_index_idx
  on staffer.workflow_run_steps (workflow_run_id, step_index, attempt);

create index if not exists workflow_run_steps_org_status_idx
  on staffer.workflow_run_steps (organisation_id, status, updated_at desc);

create index if not exists workflow_run_events_run_created_idx
  on staffer.workflow_run_events (workflow_run_id, created_at desc);

alter table staffer.workflow_run_steps enable row level security;
alter table staffer.workflow_run_events enable row level security;

grant select, insert, update on staffer.workflow_runs to authenticated;
grant select, insert, update on staffer.workflow_run_steps to authenticated;
grant select, insert on staffer.workflow_run_events to authenticated;

drop policy if exists workflow_runs_operator_insert on staffer.workflow_runs;
drop policy if exists workflow_runs_operator_update on staffer.workflow_runs;
drop policy if exists workflow_run_steps_member_select on staffer.workflow_run_steps;
drop policy if exists workflow_run_steps_operator_insert on staffer.workflow_run_steps;
drop policy if exists workflow_run_steps_operator_update on staffer.workflow_run_steps;
drop policy if exists workflow_run_events_member_select on staffer.workflow_run_events;
drop policy if exists workflow_run_events_operator_insert on staffer.workflow_run_events;

create policy workflow_runs_operator_insert on staffer.workflow_runs
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy workflow_runs_operator_update on staffer.workflow_runs
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy workflow_run_steps_member_select on staffer.workflow_run_steps
for select to authenticated
using (staffer.is_member(organisation_id));

create policy workflow_run_steps_operator_insert on staffer.workflow_run_steps
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.workflow_runs wr
    where wr.id = workflow_run_id
      and wr.organisation_id = workflow_run_steps.organisation_id
  )
);

create policy workflow_run_steps_operator_update on staffer.workflow_run_steps
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy workflow_run_events_member_select on staffer.workflow_run_events
for select to authenticated
using (staffer.is_member(organisation_id));

create policy workflow_run_events_operator_insert on staffer.workflow_run_events
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.workflow_runs wr
    where wr.id = workflow_run_id
      and wr.organisation_id = workflow_run_events.organisation_id
  )
);

create or replace function staffer.workflow_step_key(step_name text, step_index integer)
returns text
language sql
immutable
set search_path = staffer, public
as $$
  select coalesce(nullif(regexp_replace(lower(trim(step_name)), '[^a-z0-9]+', '-', 'g'), ''), 'step') || '-' || step_index::text;
$$;

create or replace function staffer.record_workflow_run_event(
  target_organisation_id uuid,
  target_workflow_run_id uuid,
  target_step_run_id uuid,
  target_event_type text,
  target_title text,
  target_body text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = staffer, public
as $$
declare
  event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to record workflow events.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to record workflow events.';
  end if;

  insert into staffer.workflow_run_events (
    organisation_id,
    workflow_run_id,
    step_run_id,
    event_type,
    title,
    body,
    metadata,
    created_by
  )
  values (
    target_organisation_id,
    target_workflow_run_id,
    target_step_run_id,
    target_event_type,
    target_title,
    target_body,
    coalesce(target_metadata, '{}'::jsonb),
    (select auth.uid())
  )
  returning id into event_id;

  return event_id;
end;
$$;

create or replace function staffer.seed_workflow_run_steps(
  target_run_id uuid,
  target_organisation_id uuid,
  target_workflow_id uuid,
  target_task_id uuid,
  target_definition jsonb,
  target_run_idempotency_key text,
  target_created_by uuid
)
returns integer
language plpgsql
security definer
set search_path = staffer, public
as $$
declare
  step_value jsonb;
  step_name text;
  step_type text;
  step_key text;
  step_index integer := 0;
  inserted_count integer := 0;
begin
  if jsonb_typeof(target_definition->'steps') = 'array' then
    for step_value in select value from jsonb_array_elements(target_definition->'steps')
    loop
      step_index := step_index + 1;
      step_name := case
        when jsonb_typeof(step_value) = 'string' then trim(both '"' from step_value::text)
        else coalesce(step_value->>'name', step_value->>'title', 'Step ' || step_index::text)
      end;
      step_type := case
        when jsonb_typeof(step_value) = 'object' then coalesce(step_value->>'type', 'agent')
        else 'agent'
      end;
      step_key := case
        when jsonb_typeof(step_value) = 'object' then coalesce(step_value->>'key', staffer.workflow_step_key(step_name, step_index))
        else staffer.workflow_step_key(step_name, step_index)
      end;

      insert into staffer.workflow_run_steps (
        organisation_id,
        workflow_run_id,
        workflow_id,
        task_id,
        step_index,
        step_key,
        step_name,
        step_type,
        idempotency_key,
        input_payload,
        created_by
      )
      values (
        target_organisation_id,
        target_run_id,
        target_workflow_id,
        target_task_id,
        step_index,
        step_key,
        step_name,
        step_type,
        target_run_idempotency_key || ':step:' || step_index::text,
        jsonb_build_object('definition', step_value),
        target_created_by
      )
      on conflict do nothing;

      inserted_count := inserted_count + 1;
    end loop;
  end if;

  if step_index = 0 then
    insert into staffer.workflow_run_steps (
      organisation_id,
      workflow_run_id,
      workflow_id,
      task_id,
      step_index,
      step_key,
      step_name,
      step_type,
      idempotency_key,
      input_payload,
      created_by
    )
    values (
      target_organisation_id,
      target_run_id,
      target_workflow_id,
      target_task_id,
      1,
      'run-workflow-1',
      'Run workflow',
      'agent',
      target_run_idempotency_key || ':step:1',
      '{}'::jsonb,
      target_created_by
    )
    on conflict do nothing;

    inserted_count := 1;
  end if;

  return inserted_count;
end;
$$;

create or replace function staffer.start_workflow_run(
  target_workflow_key text,
  target_task_id uuid default null,
  target_trigger_type text default 'manual',
  target_trigger_payload jsonb default '{}'::jsonb,
  target_idempotency_key text default null
)
returns table (
  run_id uuid,
  status text,
  idempotency_key text,
  created_new boolean
)
language plpgsql
security definer
set search_path = staffer, public
as $$
declare
  workflow_row record;
  existing_run record;
  effective_idempotency_key text;
  created_by_user uuid;
  inserted_run_id uuid;
begin
  created_by_user := (select auth.uid());
  if created_by_user is null then
    raise exception 'Authentication is required to start a workflow run.';
  end if;

  select *
  into workflow_row
  from staffer.workflows w
  where w.key = target_workflow_key
    and staffer.has_role(w.organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  order by w.version desc
  limit 1;

  if workflow_row.id is null then
    raise exception 'Workflow was not found or you do not have permission to run it.';
  end if;

  if target_task_id is not null and not exists (
    select 1
    from staffer.tasks t
    where t.id = target_task_id
      and t.organisation_id = workflow_row.organisation_id
  ) then
    raise exception 'Task does not belong to the workflow organisation.';
  end if;

  effective_idempotency_key := coalesce(
    nullif(trim(target_idempotency_key), ''),
    workflow_row.key || ':' || coalesce(target_task_id::text, 'manual') || ':' || encode(gen_random_bytes(12), 'hex')
  );

  select *
  into existing_run
  from staffer.workflow_runs wr
  where wr.organisation_id = workflow_row.organisation_id
    and wr.idempotency_key = effective_idempotency_key
  limit 1;

  if existing_run.id is not null then
    run_id := existing_run.id;
    status := existing_run.status;
    idempotency_key := existing_run.idempotency_key;
    created_new := false;
    return next;
    return;
  end if;

  insert into staffer.workflow_runs (
    organisation_id,
    workflow_id,
    task_id,
    status,
    current_step,
    current_step_index,
    context,
    trigger_type,
    trigger_payload,
    idempotency_key,
    definition_snapshot,
    started_at,
    last_heartbeat_at,
    created_by,
    updated_at
  )
  values (
    workflow_row.organisation_id,
    workflow_row.id,
    target_task_id,
    'queued',
    null,
    0,
    jsonb_build_object('workflowKey', workflow_row.key, 'workflowVersion', workflow_row.version),
    coalesce(nullif(trim(target_trigger_type), ''), 'manual'),
    coalesce(target_trigger_payload, '{}'::jsonb),
    effective_idempotency_key,
    workflow_row.definition,
    now(),
    now(),
    created_by_user,
    now()
  )
  returning id into inserted_run_id;

  perform staffer.seed_workflow_run_steps(
    inserted_run_id,
    workflow_row.organisation_id,
    workflow_row.id,
    target_task_id,
    workflow_row.definition,
    effective_idempotency_key,
    created_by_user
  );

  perform staffer.record_workflow_run_event(
    workflow_row.organisation_id,
    inserted_run_id,
    null,
    'workflow.started',
    'Workflow run queued',
    'A durable workflow run was created with idempotent step records.',
    jsonb_build_object('workflowKey', workflow_row.key, 'triggerType', target_trigger_type)
  );

  run_id := inserted_run_id;
  status := 'queued';
  idempotency_key := effective_idempotency_key;
  created_new := true;
  return next;
end;
$$;

create or replace function staffer.transition_workflow_run(
  target_run_id uuid,
  target_action text,
  target_reason text default null
)
returns table (
  run_id uuid,
  status text,
  action text,
  event_id uuid
)
language plpgsql
security definer
set search_path = staffer, public
as $$
declare
  run_row record;
  normalized_action text;
  next_status text;
  created_event_id uuid;
  event_title text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to transition a workflow run.';
  end if;

  select *
  into run_row
  from staffer.workflow_runs wr
  where wr.id = target_run_id;

  if run_row.id is null then
    raise exception 'Workflow run was not found.';
  end if;

  if not staffer.has_role(run_row.organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to transition this workflow run.';
  end if;

  normalized_action := lower(trim(target_action));

  if normalized_action = 'pause' then
    next_status := 'paused';
    event_title := 'Workflow paused';
    update staffer.workflow_runs
    set status = next_status,
        pause_reason = nullif(trim(coalesce(target_reason, '')), ''),
        resume_token = encode(gen_random_bytes(16), 'hex'),
        paused_at = now(),
        updated_at = now()
    where id = run_row.id;
  elsif normalized_action = 'resume' then
    next_status := case when run_row.current_step_index > 0 then 'running' else 'queued' end;
    event_title := 'Workflow resumed';
    update staffer.workflow_runs
    set status = next_status,
        pause_reason = null,
        resume_token = null,
        resumed_at = now(),
        updated_at = now()
    where id = run_row.id;
  elsif normalized_action = 'cancel' then
    next_status := 'cancelled';
    event_title := 'Workflow cancelled';
    update staffer.workflow_runs
    set status = next_status,
        cancelled_at = now(),
        completed_at = now(),
        updated_at = now()
    where id = run_row.id;
  elsif normalized_action = 'retry' then
    if run_row.retry_count >= run_row.max_retries then
      raise exception 'Workflow run has reached its maximum retry count.';
    end if;
    next_status := 'queued';
    event_title := 'Workflow retry requested';
    update staffer.workflow_runs
    set status = next_status,
        retry_count = retry_count + 1,
        failed_at = null,
        error_code = null,
        error_message = null,
        last_heartbeat_at = now(),
        updated_at = now()
    where id = run_row.id;
  elsif normalized_action = 'complete' then
    next_status := 'completed';
    event_title := 'Workflow completed';
    update staffer.workflow_runs
    set status = next_status,
        completed_at = now(),
        updated_at = now()
    where id = run_row.id;
  elsif normalized_action = 'fail' then
    next_status := 'failed';
    event_title := 'Workflow failed';
    update staffer.workflow_runs
    set status = next_status,
        failed_at = now(),
        error_message = nullif(trim(coalesce(target_reason, '')), ''),
        updated_at = now()
    where id = run_row.id;
  else
    raise exception 'Unsupported workflow action: %', target_action;
  end if;

  created_event_id := staffer.record_workflow_run_event(
    run_row.organisation_id,
    run_row.id,
    null,
    'workflow.' || normalized_action,
    event_title,
    target_reason,
    jsonb_build_object('action', normalized_action, 'nextStatus', next_status)
  );

  run_id := run_row.id;
  status := next_status;
  action := normalized_action;
  event_id := created_event_id;
  return next;
end;
$$;

create or replace function staffer.replay_workflow_run(
  target_run_id uuid,
  target_reason text default null
)
returns table (
  run_id uuid,
  status text,
  idempotency_key text
)
language plpgsql
security definer
set search_path = staffer, public
as $$
declare
  source_run record;
  replay_key text;
  replay_run_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to replay a workflow run.';
  end if;

  select wr.*
  into source_run
  from staffer.workflow_runs wr
  where wr.id = target_run_id;

  if source_run.id is null then
    raise exception 'Workflow run was not found.';
  end if;

  if not staffer.has_role(source_run.organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to replay this workflow run.';
  end if;

  replay_key := 'replay:' || source_run.id::text || ':' || encode(gen_random_bytes(12), 'hex');

  insert into staffer.workflow_runs (
    organisation_id,
    workflow_id,
    task_id,
    status,
    current_step_index,
    context,
    trigger_type,
    trigger_payload,
    idempotency_key,
    definition_snapshot,
    run_kind,
    replay_of_run_id,
    started_at,
    last_heartbeat_at,
    created_by,
    updated_at
  )
  values (
    source_run.organisation_id,
    source_run.workflow_id,
    source_run.task_id,
    'queued',
    0,
    coalesce(source_run.context, '{}'::jsonb) || jsonb_build_object('replayReason', target_reason, 'sourceRunId', source_run.id),
    'replay',
    coalesce(source_run.trigger_payload, '{}'::jsonb),
    replay_key,
    source_run.definition_snapshot,
    'replay',
    source_run.id,
    now(),
    now(),
    (select auth.uid()),
    now()
  )
  returning id into replay_run_id;

  perform staffer.seed_workflow_run_steps(
    replay_run_id,
    source_run.organisation_id,
    source_run.workflow_id,
    source_run.task_id,
    source_run.definition_snapshot,
    replay_key,
    (select auth.uid())
  );

  perform staffer.record_workflow_run_event(
    source_run.organisation_id,
    replay_run_id,
    null,
    'workflow.replayed',
    'Workflow replay queued',
    target_reason,
    jsonb_build_object('sourceRunId', source_run.id)
  );

  run_id := replay_run_id;
  status := 'queued';
  idempotency_key := replay_key;
  return next;
end;
$$;

revoke all on function staffer.workflow_step_key(text, integer) from public;
revoke all on function staffer.record_workflow_run_event(uuid, uuid, uuid, text, text, text, jsonb) from public;
revoke all on function staffer.seed_workflow_run_steps(uuid, uuid, uuid, uuid, jsonb, text, uuid) from public;
revoke all on function staffer.start_workflow_run(text, uuid, text, jsonb, text) from public;
revoke all on function staffer.transition_workflow_run(uuid, text, text) from public;
revoke all on function staffer.replay_workflow_run(uuid, text) from public;

grant execute on function staffer.workflow_step_key(text, integer) to authenticated, service_role;
grant execute on function staffer.record_workflow_run_event(uuid, uuid, uuid, text, text, text, jsonb) to authenticated, service_role;
grant execute on function staffer.start_workflow_run(text, uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function staffer.transition_workflow_run(uuid, text, text) to authenticated, service_role;
grant execute on function staffer.replay_workflow_run(uuid, text) to authenticated, service_role;

comment on table staffer.workflow_runs is 'Durable workflow run state with idempotency, pause/resume/retry/replay metadata.';
comment on table staffer.workflow_run_steps is 'Durable workflow step execution records; each step has its own idempotency key and retry state.';
comment on table staffer.workflow_run_events is 'Append-only workflow run event timeline for orchestration, audit evidence and replay diagnostics.';
comment on function staffer.start_workflow_run(text, uuid, text, jsonb, text) is 'Starts a tenant-owned workflow run idempotently and seeds step records from the workflow definition snapshot.';
comment on function staffer.transition_workflow_run(uuid, text, text) is 'Transitions a workflow run through pause, resume, cancel, retry, complete or fail with an append-only event.';
comment on function staffer.replay_workflow_run(uuid, text) is 'Creates a new queued replay run from a prior workflow run definition snapshot.';
