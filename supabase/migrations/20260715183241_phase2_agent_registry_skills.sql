-- Staffer Phase 2 agent registry and skills.
-- Adds append-only agent profile versions and tightens agent-skill mapping.

create table if not exists staffer.agent_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  agent_id uuid not null references staffer.agents(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  change_summary text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, agent_id, version),
  constraint agent_versions_summary_not_blank check (length(trim(change_summary)) > 0)
);

create index if not exists agent_versions_agent_created_idx
  on staffer.agent_versions (agent_id, created_at desc);

alter table staffer.agent_versions enable row level security;

grant select, insert on staffer.agent_versions to authenticated;
grant select, insert, update, delete on staffer.agent_versions to service_role;

drop policy if exists agent_versions_member_select on staffer.agent_versions;
drop policy if exists agent_versions_admin_insert on staffer.agent_versions;

create policy agent_versions_member_select on staffer.agent_versions
for select to authenticated
using (staffer.is_member(organisation_id));

create policy agent_versions_admin_insert on staffer.agent_versions
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.agents a
    where a.id = agent_id
      and a.organisation_id = agent_versions.organisation_id
  )
  and created_by = (select auth.uid())
);

drop policy if exists agent_skills_admin_insert on staffer.agent_skills;
drop policy if exists agent_skills_admin_update on staffer.agent_skills;
drop policy if exists agent_skills_admin_delete on staffer.agent_skills;

create policy agent_skills_admin_insert on staffer.agent_skills
for insert to authenticated
with check (exists (
  select 1
  from staffer.agents a
  join staffer.skills s on s.id = skill_id
  where a.id = agent_id
    and s.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_skills_admin_update on staffer.agent_skills
for update to authenticated
using (exists (
  select 1
  from staffer.agents a
  join staffer.skills s on s.id = skill_id
  where a.id = agent_id
    and s.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
))
with check (exists (
  select 1
  from staffer.agents a
  join staffer.skills s on s.id = skill_id
  where a.id = agent_id
    and s.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_skills_admin_delete on staffer.agent_skills
for delete to authenticated
using (exists (
  select 1
  from staffer.agents a
  join staffer.skills s on s.id = skill_id
  where a.id = agent_id
    and s.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));
