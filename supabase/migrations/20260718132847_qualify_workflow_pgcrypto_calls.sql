create extension if not exists pgcrypto with schema extensions;

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
    workflow_row.key || ':' || coalesce(target_task_id::text, 'manual') || ':' || encode(extensions.gen_random_bytes(12), 'hex')
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
        resume_token = encode(extensions.gen_random_bytes(16), 'hex'),
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

  replay_key := 'replay:' || source_run.id::text || ':' || encode(extensions.gen_random_bytes(12), 'hex');

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

revoke all on function staffer.start_workflow_run(text, uuid, text, jsonb, text) from public;
revoke all on function staffer.transition_workflow_run(uuid, text, text) from public;
revoke all on function staffer.replay_workflow_run(uuid, text) from public;

grant execute on function staffer.start_workflow_run(text, uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function staffer.transition_workflow_run(uuid, text, text) to authenticated, service_role;
grant execute on function staffer.replay_workflow_run(uuid, text) to authenticated, service_role;
