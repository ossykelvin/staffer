-- Staffer Phase 2 tool registry permissions.
-- Tightens agent-tool mappings so tools cannot be attached across tenants.

drop policy if exists agent_tools_admin_insert on staffer.agent_tools;
drop policy if exists agent_tools_admin_update on staffer.agent_tools;
drop policy if exists agent_tools_admin_delete on staffer.agent_tools;

create policy agent_tools_admin_insert on staffer.agent_tools
for insert to authenticated
with check (exists (
  select 1
  from staffer.agents a
  join staffer.tools t on t.id = tool_id
  where a.id = agent_id
    and t.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_tools_admin_update on staffer.agent_tools
for update to authenticated
using (exists (
  select 1
  from staffer.agents a
  join staffer.tools t on t.id = tool_id
  where a.id = agent_id
    and t.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
))
with check (exists (
  select 1
  from staffer.agents a
  join staffer.tools t on t.id = tool_id
  where a.id = agent_id
    and t.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_tools_admin_delete on staffer.agent_tools
for delete to authenticated
using (exists (
  select 1
  from staffer.agents a
  join staffer.tools t on t.id = tool_id
  where a.id = agent_id
    and t.organisation_id = a.organisation_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));
