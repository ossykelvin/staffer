-- Staffer Phase 1 advisor cleanup.
-- Split broad FOR ALL write policies so SELECT uses one tenant-aware policy per table.

drop policy if exists agents_admin_write on staffer.agents;
drop policy if exists skills_admin_write on staffer.skills;
drop policy if exists tools_admin_write on staffer.tools;
drop policy if exists tasks_operator_write on staffer.tasks;
drop policy if exists workflows_admin_write on staffer.workflows;
drop policy if exists documents_admin_write on staffer.documents;
drop policy if exists agent_skills_admin_write on staffer.agent_skills;
drop policy if exists agent_tools_admin_write on staffer.agent_tools;
drop policy if exists integration_secrets_admin_write on staffer.integration_secrets;

create policy agents_admin_insert on staffer.agents
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy agents_admin_update on staffer.agents
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy agents_admin_delete on staffer.agents
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy skills_admin_insert on staffer.skills
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy skills_admin_update on staffer.skills
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy skills_admin_delete on staffer.skills
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tools_admin_insert on staffer.tools
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tools_admin_update on staffer.tools
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tools_admin_delete on staffer.tools
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy tasks_operator_insert on staffer.tasks
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy tasks_operator_update on staffer.tasks
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy tasks_operator_delete on staffer.tasks
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy workflows_admin_insert on staffer.workflows
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy workflows_admin_update on staffer.workflows
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy workflows_admin_delete on staffer.workflows
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy documents_operator_insert on staffer.documents
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy documents_operator_update on staffer.documents
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy documents_operator_delete on staffer.documents
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy agent_skills_admin_insert on staffer.agent_skills
for insert to authenticated
with check (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_skills_admin_update on staffer.agent_skills
for update to authenticated
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

create policy agent_skills_admin_delete on staffer.agent_skills
for delete to authenticated
using (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_tools_admin_insert on staffer.agent_tools
for insert to authenticated
with check (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy agent_tools_admin_update on staffer.agent_tools
for update to authenticated
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

create policy agent_tools_admin_delete on staffer.agent_tools
for delete to authenticated
using (exists (
  select 1 from staffer.agents a
  where a.id = agent_id
    and staffer.has_role(a.organisation_id, array['founder','administrator']::staffer.membership_role[])
));

create policy integration_secrets_admin_insert on staffer.integration_secrets
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy integration_secrets_admin_update on staffer.integration_secrets
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy integration_secrets_admin_delete on staffer.integration_secrets
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));
