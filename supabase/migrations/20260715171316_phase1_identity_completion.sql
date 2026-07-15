-- Staffer Phase 1 identity completion.
-- Adds organisation invitations and encrypted integration secret metadata.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'staffer'
      and t.typname = 'invitation_status'
  ) then
    create type staffer.invitation_status as enum ('pending','accepted','revoked','expired');
  end if;
end $$;

create table if not exists staffer.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  email text not null,
  role staffer.membership_role not null default 'viewer',
  token_hash text not null unique,
  status staffer.invitation_status not null default 'pending',
  invited_by uuid references auth.users(id),
  accepted_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_invitations_email_not_blank check (length(trim(email)) > 3)
);

create table if not exists staffer.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  integration_key text not null,
  display_name text not null,
  secret_label text not null,
  ciphertext text not null,
  iv text not null,
  tag text not null,
  key_version text not null default 'v1',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, integration_key, secret_label),
  constraint integration_key_not_blank check (length(trim(integration_key)) > 0),
  constraint integration_secret_label_not_blank check (length(trim(secret_label)) > 0)
);

create index if not exists organisation_invitations_org_status_idx
  on staffer.organisation_invitations (organisation_id, status, created_at desc);

create index if not exists integration_secrets_org_key_idx
  on staffer.integration_secrets (organisation_id, integration_key, updated_at desc);

alter table staffer.organisation_invitations enable row level security;
alter table staffer.integration_secrets enable row level security;

grant select, insert, update, delete on
  staffer.organisation_invitations,
  staffer.integration_secrets
to authenticated;

grant select, insert, update, delete on
  staffer.organisation_invitations,
  staffer.integration_secrets
to service_role;

drop policy if exists organisation_invitations_admin_select on staffer.organisation_invitations;
drop policy if exists organisation_invitations_admin_insert on staffer.organisation_invitations;
drop policy if exists organisation_invitations_admin_update on staffer.organisation_invitations;
drop policy if exists integration_secrets_admin_select on staffer.integration_secrets;
drop policy if exists integration_secrets_admin_write on staffer.integration_secrets;

create policy organisation_invitations_admin_select on staffer.organisation_invitations
for select to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy organisation_invitations_admin_insert on staffer.organisation_invitations
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[])
  and invited_by = (select auth.uid())
);

create policy organisation_invitations_admin_update on staffer.organisation_invitations
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy integration_secrets_admin_select on staffer.integration_secrets
for select to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy integration_secrets_admin_write on staffer.integration_secrets
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create or replace function staffer.accept_invitation_for_current_user(invitation_token text)
returns staffer.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invitation staffer.organisation_invitations;
  inserted staffer.memberships;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to accept an invitation.';
  end if;

  if trim(coalesce(invitation_token, '')) = '' then
    raise exception 'Invitation token is required.';
  end if;

  select *
    into invitation
  from staffer.organisation_invitations
  where token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
    and status = 'pending'
  limit 1;

  if invitation.id is null then
    raise exception 'Invitation is invalid or has already been used.';
  end if;

  if invitation.expires_at <= now() then
    update staffer.organisation_invitations
      set status = 'expired',
          updated_at = now()
    where id = invitation.id;

    raise exception 'Invitation has expired.';
  end if;

  insert into staffer.memberships (organisation_id, user_id, role)
  values (invitation.organisation_id, current_user_id, invitation.role)
  on conflict (organisation_id, user_id)
  do update set role = excluded.role
  returning * into inserted;

  update staffer.organisation_invitations
    set status = 'accepted',
        accepted_by = current_user_id,
        accepted_at = now(),
        updated_at = now()
  where id = invitation.id;

  perform staffer.record_audit_event(
    invitation.organisation_id,
    'user',
    current_user_id::text,
    'membership.invitation_accepted',
    'membership',
    current_user_id::text,
    'User accepted organisation invitation.',
    jsonb_build_object('email', invitation.email, 'role', invitation.role)
  );

  return inserted;
end;
$$;

revoke all on function staffer.accept_invitation_for_current_user(text) from public;
grant execute on function staffer.accept_invitation_for_current_user(text) to authenticated;
