-- Staffer Phase 7 approval policy engine foundation.
-- Adds policy-driven approval metadata, immutable decision history and exact-payload execution checks.

create extension if not exists pgcrypto with schema extensions;

alter table staffer.approvals
  add column if not exists policy_id uuid,
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists required_reviewer_count integer not null default 1 check (required_reviewer_count > 0),
  add column if not exists approved_reviewer_count integer not null default 0 check (approved_reviewer_count >= 0),
  add column if not exists execution_status text not null default 'not_requested' check (execution_status in ('not_requested','verified','blocked','executed','failed')),
  add column if not exists execution_payload_hash text,
  add column if not exists execution_verified_at timestamptz;

alter table staffer.approvals
  drop constraint if exists approvals_policy_snapshot_object,
  add constraint approvals_policy_snapshot_object check (jsonb_typeof(policy_snapshot) = 'object');

create table if not exists staffer.approval_policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  action_key_pattern text not null default '*',
  minimum_risk_class smallint not null default 1 check (minimum_risk_class between 0 and 5),
  required_reviewer_count integer not null default 1 check (required_reviewer_count > 0),
  requires_separation_of_duties boolean not null default true,
  exact_payload_required boolean not null default true,
  expires_after_minutes integer not null default 1440 check (expires_after_minutes > 0),
  conditions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key),
  constraint approval_policies_conditions_object check (jsonb_typeof(conditions) = 'object')
);

alter table staffer.approvals
  drop constraint if exists approvals_policy_id_fkey,
  add constraint approvals_policy_id_fkey foreign key (policy_id) references staffer.approval_policies(id) on delete set null;

create table if not exists staffer.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  approval_id uuid not null references staffer.approvals(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected','changes_requested','expired','delegated')),
  comment text,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  payload_hash_at_decision text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  constraint approval_decisions_policy_snapshot_object check (jsonb_typeof(policy_snapshot) = 'object')
);

create table if not exists staffer.approval_execution_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  approval_id uuid not null references staffer.approvals(id) on delete cascade,
  expected_payload_hash text not null,
  actual_payload_hash text not null,
  execution_payload jsonb not null,
  verified boolean not null,
  status text not null check (status in ('verified','blocked')),
  failure_reason text,
  checked_by uuid references auth.users(id),
  checked_at timestamptz not null default now(),
  constraint approval_execution_checks_payload_object check (jsonb_typeof(execution_payload) = 'object')
);

create index if not exists approval_policies_org_active_idx
  on staffer.approval_policies (organisation_id, is_active, minimum_risk_class desc);

create index if not exists approval_decisions_approval_created_idx
  on staffer.approval_decisions (approval_id, decided_at desc);

create index if not exists approval_execution_checks_approval_created_idx
  on staffer.approval_execution_checks (approval_id, checked_at desc);

alter table staffer.approval_policies enable row level security;
alter table staffer.approval_decisions enable row level security;
alter table staffer.approval_execution_checks enable row level security;

grant select, insert, update, delete on staffer.approval_policies to authenticated;
grant select, insert on staffer.approval_decisions to authenticated;
grant select, insert on staffer.approval_execution_checks to authenticated;

grant select, insert, update, delete on
  staffer.approval_policies,
  staffer.approval_decisions,
  staffer.approval_execution_checks
to service_role;

drop policy if exists approval_policies_member_select on staffer.approval_policies;
drop policy if exists approval_policies_admin_insert on staffer.approval_policies;
drop policy if exists approval_policies_admin_update on staffer.approval_policies;
drop policy if exists approval_policies_admin_delete on staffer.approval_policies;
drop policy if exists approval_decisions_member_select on staffer.approval_decisions;
drop policy if exists approval_decisions_reviewer_insert on staffer.approval_decisions;
drop policy if exists approval_execution_checks_member_select on staffer.approval_execution_checks;
drop policy if exists approval_execution_checks_operator_insert on staffer.approval_execution_checks;

create policy approval_policies_member_select on staffer.approval_policies
for select to authenticated
using (staffer.is_member(organisation_id));

create policy approval_policies_admin_insert on staffer.approval_policies
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[])
);

create policy approval_policies_admin_update on staffer.approval_policies
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy approval_policies_admin_delete on staffer.approval_policies
for delete to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy approval_decisions_member_select on staffer.approval_decisions
for select to authenticated
using (staffer.is_member(organisation_id));

create policy approval_decisions_reviewer_insert on staffer.approval_decisions
for insert to authenticated
with check (
  decided_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.approvals a
    where a.id = approval_id
      and a.organisation_id = approval_decisions.organisation_id
  )
);

create policy approval_execution_checks_member_select on staffer.approval_execution_checks
for select to authenticated
using (staffer.is_member(organisation_id));

create policy approval_execution_checks_operator_insert on staffer.approval_execution_checks
for insert to authenticated
with check (
  checked_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.approvals a
    where a.id = approval_id
      and a.organisation_id = approval_execution_checks.organisation_id
  )
);

create or replace function staffer.approval_payload_hash(target_payload jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(target_payload, 'null'::jsonb)::text, 'sha256'), 'hex');
$$;

create or replace function staffer.verify_approval_execution(
  target_approval_id uuid,
  target_execution_payload jsonb
)
returns table (
  check_id uuid,
  approval_id uuid,
  verified boolean,
  status text,
  expected_payload_hash text,
  actual_payload_hash text,
  failure_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  approval_row record;
  actual_hash text;
  check_record_id uuid;
  is_verified boolean;
  failure text;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_execution_payload is null or jsonb_typeof(target_execution_payload) <> 'object' then
    raise exception 'Execution payload must be a JSON object.';
  end if;

  select
    a.id,
    a.organisation_id,
    a.status,
    a.payload_hash,
    a.expires_at
  into approval_row
  from staffer.approvals a
  where a.id = target_approval_id;

  if not found then
    raise exception 'Approval was not found.';
  end if;

  if not staffer.has_role(approval_row.organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'Only founders, administrators or operators can verify approved execution payloads.';
  end if;

  actual_hash := staffer.approval_payload_hash(target_execution_payload);
  is_verified := true;
  failure := null;

  if approval_row.status <> 'approved'::staffer.approval_status then
    is_verified := false;
    failure := 'Approval status is not approved.';
  elsif approval_row.expires_at is not null and approval_row.expires_at <= now() then
    is_verified := false;
    failure := 'Approval has expired.';
  elsif actual_hash <> approval_row.payload_hash then
    is_verified := false;
    failure := 'Execution payload hash does not match the approved payload hash.';
  end if;

  insert into staffer.approval_execution_checks (
    organisation_id,
    approval_id,
    expected_payload_hash,
    actual_payload_hash,
    execution_payload,
    verified,
    status,
    failure_reason,
    checked_by
  )
  values (
    approval_row.organisation_id,
    approval_row.id,
    approval_row.payload_hash,
    actual_hash,
    target_execution_payload,
    is_verified,
    case when is_verified then 'verified' else 'blocked' end,
    failure,
    current_user_id
  )
  returning id into check_record_id;

  update staffer.approvals
  set execution_status = case when is_verified then 'verified' else 'blocked' end,
      execution_payload_hash = actual_hash,
      execution_verified_at = case when is_verified then now() else execution_verified_at end
  where id = approval_row.id;

  return query
    select
      check_record_id,
      approval_row.id,
      is_verified,
      case when is_verified then 'verified' else 'blocked' end::text,
      approval_row.payload_hash,
      actual_hash,
      failure;
end;
$$;

update staffer.approvals
set payload_hash = staffer.approval_payload_hash(action_payload)
where action_payload is not null;

revoke all on function staffer.approval_payload_hash(jsonb) from public;
revoke all on function staffer.verify_approval_execution(uuid, jsonb) from public;
grant execute on function staffer.approval_payload_hash(jsonb) to authenticated, service_role;
grant execute on function staffer.verify_approval_execution(uuid, jsonb) to authenticated, service_role;

comment on table staffer.approval_policies is 'Tenant-owned rules that classify protected actions and required reviewer counts.';
comment on table staffer.approval_decisions is 'Append-only approval decision history.';
comment on table staffer.approval_execution_checks is 'Append-only exact-payload verification attempts before protected execution.';
comment on function staffer.verify_approval_execution(uuid, jsonb) is 'Verifies approved status, expiry and exact payload hash before protected execution can proceed.';
