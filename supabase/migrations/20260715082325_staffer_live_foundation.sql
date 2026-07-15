-- Staffer live-data foundation.
-- Applies after 0001_staffer_core.sql.

create extension if not exists pgcrypto;

grant usage on schema staffer to authenticated, service_role;
grant select, insert, update, delete on all tables in schema staffer to service_role;
grant usage, select, update on all sequences in schema staffer to service_role;

grant select on
  staffer.organisations,
  staffer.memberships,
  staffer.agents,
  staffer.skills,
  staffer.agent_skills,
  staffer.tools,
  staffer.agent_tools,
  staffer.tasks,
  staffer.task_runs,
  staffer.workflows,
  staffer.workflow_runs,
  staffer.approvals,
  staffer.documents,
  staffer.audit_logs
to authenticated;

grant insert, update on
  staffer.organisations,
  staffer.memberships,
  staffer.agents,
  staffer.skills,
  staffer.agent_skills,
  staffer.tools,
  staffer.agent_tools,
  staffer.tasks,
  staffer.task_runs,
  staffer.workflows,
  staffer.workflow_runs,
  staffer.approvals,
  staffer.documents
to authenticated;

grant delete on
  staffer.memberships,
  staffer.agents,
  staffer.skills,
  staffer.agent_skills,
  staffer.tools,
  staffer.agent_tools,
  staffer.tasks,
  staffer.workflows,
  staffer.approvals,
  staffer.documents
to authenticated;

drop policy if exists organisations_member_select on staffer.organisations;
drop policy if exists memberships_member_select on staffer.memberships;
drop policy if exists agents_member_select on staffer.agents;
drop policy if exists skills_member_select on staffer.skills;
drop policy if exists tools_member_select on staffer.tools;
drop policy if exists tasks_member_select on staffer.tasks;
drop policy if exists task_runs_member_select on staffer.task_runs;
drop policy if exists workflows_member_select on staffer.workflows;
drop policy if exists workflow_runs_member_select on staffer.workflow_runs;
drop policy if exists approvals_member_select on staffer.approvals;
drop policy if exists documents_member_select on staffer.documents;
drop policy if exists audit_member_select on staffer.audit_logs;
drop policy if exists agent_skills_member_select on staffer.agent_skills;
drop policy if exists agent_tools_member_select on staffer.agent_tools;

create or replace function staffer.is_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from staffer.memberships m
      where m.organisation_id = target_organisation_id
        and m.user_id = (select auth.uid())
    );
$$;

create or replace function staffer.has_role(
  target_organisation_id uuid,
  allowed_roles staffer.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from staffer.memberships m
      where m.organisation_id = target_organisation_id
        and m.user_id = (select auth.uid())
        and m.role = any(allowed_roles)
    );
$$;

revoke all on function staffer.is_member(uuid) from public;
revoke all on function staffer.has_role(uuid, staffer.membership_role[]) from public;
grant execute on function staffer.is_member(uuid) to authenticated;
grant execute on function staffer.has_role(uuid, staffer.membership_role[]) to authenticated;

create policy organisations_member_select on staffer.organisations
for select to authenticated
using (staffer.is_member(id));

create policy organisations_admin_update on staffer.organisations
for update to authenticated
using (staffer.has_role(id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(id, array['founder','administrator']::staffer.membership_role[]));

create policy memberships_member_select on staffer.memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[])
);

create policy memberships_admin_insert on staffer.memberships
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy memberships_admin_update on staffer.memberships
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy memberships_founder_delete on staffer.memberships
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder']::staffer.membership_role[]));

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

create policy agents_admin_write on staffer.agents
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy skills_admin_write on staffer.skills
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tools_admin_write on staffer.tools
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tasks_operator_write on staffer.tasks
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy task_runs_operator_insert on staffer.task_runs
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy workflows_admin_write on staffer.workflows
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy workflow_runs_operator_insert on staffer.workflow_runs
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy approvals_reviewer_update on staffer.approvals
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[]));

create policy approvals_operator_insert on staffer.approvals
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy documents_admin_write on staffer.documents
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy agent_skills_member_select on staffer.agent_skills
for select to authenticated
using (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.is_member(a.organisation_id)
));

create policy agent_skills_admin_write on staffer.agent_skills
for all to authenticated
using (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
))
with check (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_tools_member_select on staffer.agent_tools
for select to authenticated
using (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.is_member(a.organisation_id)
));

create policy agent_tools_admin_write on staffer.agent_tools
for all to authenticated
using (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
))
with check (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create or replace function staffer.record_audit_event(
  target_organisation_id uuid,
  target_actor_type text,
  target_actor_id text,
  target_event_type text,
  target_entity_type text,
  target_entity_id text,
  target_summary text,
  target_details jsonb default '{}'::jsonb
)
returns staffer.audit_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
  inserted staffer.audit_logs;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to record audit events.';
  end if;

  if not staffer.is_member(target_organisation_id) then
    raise exception 'User is not a member of the target organisation.';
  end if;

  select event_hash
    into previous
  from staffer.audit_logs
  where organisation_id = target_organisation_id
  order by id desc
  limit 1;

  insert into staffer.audit_logs (
    organisation_id,
    actor_type,
    actor_id,
    event_type,
    entity_type,
    entity_id,
    summary,
    details,
    previous_hash,
    event_hash
  )
  values (
    target_organisation_id,
    target_actor_type,
    target_actor_id,
    target_event_type,
    target_entity_type,
    target_entity_id,
    target_summary,
    coalesce(target_details, '{}'::jsonb),
    previous,
    encode(digest(
      coalesce(previous, '') ||
      target_organisation_id::text ||
      coalesce(target_actor_type, '') ||
      coalesce(target_actor_id, '') ||
      coalesce(target_event_type, '') ||
      coalesce(target_entity_type, '') ||
      coalesce(target_entity_id, '') ||
      coalesce(target_summary, '') ||
      coalesce(target_details, '{}'::jsonb)::text ||
      now()::text,
      'sha256'
    ), 'hex')
  )
  returning * into inserted;

  return inserted;
end;
$$;

create or replace function staffer.create_organisation_for_current_user(
  organisation_name text,
  organisation_slug text,
  organisation_timezone text default 'Europe/London'
)
returns staffer.organisations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted staffer.organisations;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create an organisation.';
  end if;

  if trim(coalesce(organisation_name, '')) = '' then
    raise exception 'Organisation name is required.';
  end if;

  if trim(coalesce(organisation_slug, '')) = '' then
    raise exception 'Organisation slug is required.';
  end if;

  insert into staffer.organisations (name, slug, timezone)
  values (trim(organisation_name), lower(trim(organisation_slug)), coalesce(nullif(trim(organisation_timezone), ''), 'Europe/London'))
  returning * into inserted;

  insert into staffer.memberships (organisation_id, user_id, role)
  values (inserted.id, current_user_id, 'founder');

  perform staffer.record_audit_event(
    inserted.id,
    'user',
    current_user_id::text,
    'organisation.created',
    'organisation',
    inserted.id::text,
    'Founder created organisation.',
    jsonb_build_object('name', inserted.name, 'slug', inserted.slug)
  );

  return inserted;
end;
$$;

revoke all on function staffer.record_audit_event(uuid, text, text, text, text, text, text, jsonb) from public;
revoke all on function staffer.create_organisation_for_current_user(text, text, text) from public;
grant execute on function staffer.record_audit_event(uuid, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function staffer.create_organisation_for_current_user(text, text, text) to authenticated;
