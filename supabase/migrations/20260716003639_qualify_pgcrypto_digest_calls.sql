create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

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
    encode(extensions.digest(
      (
        coalesce(previous, '') ||
        target_organisation_id::text ||
        coalesce(target_actor_type, '') ||
        coalesce(target_actor_id, '') ||
        coalesce(target_event_type, '') ||
        coalesce(target_entity_type, '') ||
        coalesce(target_entity_id, '') ||
        coalesce(target_summary, '') ||
        coalesce(target_details, '{}'::jsonb)::text ||
        now()::text
      )::text,
      'sha256'::text
    ), 'hex')
  )
  returning * into inserted;

  return inserted;
end;
$$;

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
  where token_hash = encode(extensions.digest(invitation_token::text, 'sha256'::text), 'hex')
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

revoke all on function staffer.record_audit_event(uuid, text, text, text, text, text, text, jsonb) from public;
grant execute on function staffer.record_audit_event(uuid, text, text, text, text, text, text, jsonb) to authenticated;

revoke all on function staffer.accept_invitation_for_current_user(text) from public;
grant execute on function staffer.accept_invitation_for_current_user(text) to authenticated;
