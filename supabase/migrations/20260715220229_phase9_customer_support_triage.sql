-- Staffer Phase 9 customer support triage foundation.
-- Adds a governed first live workflow slice for support intake -> Anna triage -> knowledge retrieval -> approval-gated response draft.

create table if not exists staffer.support_triage_settings (
  organisation_id uuid primary key references staffer.organisations(id) on delete cascade,
  workflow_key text not null default 'support-triage',
  severity_rules jsonb not null default '{
    "critical": {"targetHours": 4, "riskClass": 5, "keywords": ["outage", "security", "breach", "fraud", "critical", "production down", "data loss"]},
    "high": {"targetHours": 8, "riskClass": 4, "keywords": ["banking", "payment", "access", "locked", "cannot login", "blocked", "urgent"]},
    "medium": {"targetHours": 24, "riskClass": 3, "keywords": ["error", "bug", "failed", "issue", "problem", "onboarding"]},
    "low": {"targetHours": 72, "riskClass": 2, "keywords": ["question", "how do i", "guidance", "information"]}
  }'::jsonb,
  category_rules jsonb not null default '{
    "critical_incident": ["outage", "production down", "critical incident", "data loss"],
    "security": ["security", "breach", "fraud", "vulnerability", "unauthorised", "unauthorized"],
    "data_protection": ["personal data", "gdpr", "privacy", "data request", "delete my data"],
    "compliance": ["audit", "policy", "regulation", "compliance", "cqc", "iso"],
    "banking_application": ["banking", "payment", "transaction", "account balance", "transfer"],
    "access": ["login", "locked", "password", "permission", "access", "mfa"],
    "onboarding": ["onboarding", "setup", "first time", "new user"],
    "billing": ["invoice", "billing", "refund", "charge"],
    "technical": ["bug", "error", "failed", "crash", "integration"]
  }'::jsonb,
  routing_rules jsonb not null default '{
    "banking_application": ["anna", "nakamura", "lawal"],
    "access": ["anna", "nakamura"],
    "data_protection": ["anna", "lawal"],
    "security": ["anna", "nakamura", "lawal"],
    "compliance": ["anna", "lawal"],
    "critical_incident": ["anna", "nakamura", "lawal"],
    "technical": ["anna", "nakamura"],
    "onboarding": ["anna"],
    "general": ["anna"]
  }'::jsonb,
  response_policy jsonb not null default '{
    "externalSendRequiresApproval": true,
    "defaultResponseAction": "create_draft_after_approval",
    "knowledgeCollectionKeys": ["customer-support", "product-documentation", "company-policies"],
    "firstLineTone": "professional_casual"
  }'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_triage_settings_severity_rules_object check (jsonb_typeof(severity_rules) = 'object'),
  constraint support_triage_settings_category_rules_object check (jsonb_typeof(category_rules) = 'object'),
  constraint support_triage_settings_routing_rules_object check (jsonb_typeof(routing_rules) = 'object'),
  constraint support_triage_settings_response_policy_object check (jsonb_typeof(response_policy) = 'object')
);

create table if not exists staffer.support_triage_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  task_id uuid not null references staffer.tasks(id) on delete cascade,
  workflow_run_id uuid references staffer.workflow_runs(id) on delete set null,
  approval_id uuid references staffer.approvals(id) on delete set null,
  source_type text not null default 'manual',
  source_message_id text,
  customer_name text,
  customer_email text,
  subject text not null,
  message_body text not null,
  product_area text,
  category text not null default 'general',
  severity text not null default 'medium',
  sentiment text not null default 'neutral',
  onboarding_state text not null default 'unknown',
  sla_target_at timestamptz,
  risk_class smallint not null default 3 check (risk_class between 0 and 5),
  classification jsonb not null default '{}'::jsonb,
  knowledge_query text,
  retrieved_chunk_ids uuid[] not null default '{}',
  citations jsonb not null default '[]'::jsonb,
  draft_response text,
  draft_status text not null default 'not_started',
  escalation_targets text[] not null default '{}',
  specialist_reviews jsonb not null default '{}'::jsonb,
  response_action text not null default 'create_draft_after_approval',
  external_action_status text not null default 'pending_approval',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_triage_cases_source_type_check check (source_type in ('manual','gmail','api','demo')),
  constraint support_triage_cases_category_check check (category in ('general','technical','banking_application','access','data_protection','security','compliance','critical_incident','onboarding','billing')),
  constraint support_triage_cases_severity_check check (severity in ('low','medium','high','critical')),
  constraint support_triage_cases_sentiment_check check (sentiment in ('positive','neutral','negative','urgent')),
  constraint support_triage_cases_onboarding_state_check check (onboarding_state in ('unknown','new','active','blocked','complete')),
  constraint support_triage_cases_classification_object check (jsonb_typeof(classification) = 'object'),
  constraint support_triage_cases_citations_array check (jsonb_typeof(citations) = 'array'),
  constraint support_triage_cases_specialist_reviews_object check (jsonb_typeof(specialist_reviews) = 'object'),
  constraint support_triage_cases_draft_status_check check (draft_status in ('not_started','drafted','needs_review','approved','blocked')),
  constraint support_triage_cases_external_action_status_check check (external_action_status in ('pending_approval','approval_requested','approved_to_draft','draft_created','sent_blocked','cancelled'))
);

create index if not exists support_triage_cases_org_created_idx
  on staffer.support_triage_cases (organisation_id, created_at desc);

create index if not exists support_triage_cases_org_severity_status_idx
  on staffer.support_triage_cases (organisation_id, severity, external_action_status, updated_at desc);

create unique index if not exists support_triage_cases_org_source_message_idx
  on staffer.support_triage_cases (organisation_id, source_type, source_message_id)
  where source_message_id is not null;

alter table staffer.support_triage_settings enable row level security;
alter table staffer.support_triage_cases enable row level security;

grant select, insert, update on staffer.support_triage_settings to authenticated;
grant select, insert, update on staffer.support_triage_cases to authenticated;
grant select, insert, update on staffer.support_triage_settings, staffer.support_triage_cases to service_role;

drop policy if exists support_triage_settings_member_select on staffer.support_triage_settings;
drop policy if exists support_triage_settings_admin_insert on staffer.support_triage_settings;
drop policy if exists support_triage_settings_admin_update on staffer.support_triage_settings;
drop policy if exists support_triage_cases_member_select on staffer.support_triage_cases;
drop policy if exists support_triage_cases_operator_insert on staffer.support_triage_cases;
drop policy if exists support_triage_cases_operator_update on staffer.support_triage_cases;

create policy support_triage_settings_member_select on staffer.support_triage_settings
for select to authenticated
using (staffer.is_member(organisation_id));

create policy support_triage_settings_admin_insert on staffer.support_triage_settings
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[])
);

create policy support_triage_settings_admin_update on staffer.support_triage_settings
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy support_triage_cases_member_select on staffer.support_triage_cases
for select to authenticated
using (staffer.is_member(organisation_id));

create policy support_triage_cases_operator_insert on staffer.support_triage_cases
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1
    from staffer.tasks t
    where t.id = task_id
      and t.organisation_id = support_triage_cases.organisation_id
  )
);

create policy support_triage_cases_operator_update on staffer.support_triage_cases
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator','reviewer']::staffer.membership_role[]));

create or replace function staffer.ensure_support_triage_settings(target_organisation_id uuid)
returns staffer.support_triage_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row staffer.support_triage_settings;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to initialise support triage settings.';
  end if;

  insert into staffer.support_triage_settings (organisation_id, created_by)
  values (target_organisation_id, current_user_id)
  on conflict (organisation_id) do update
    set updated_at = staffer.support_triage_settings.updated_at
  returning * into settings_row;

  return settings_row;
end;
$$;

create or replace function staffer.ensure_support_triage_workflow(target_organisation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not staffer.has_role(target_organisation_id, array['founder','administrator','operator']::staffer.membership_role[]) then
    raise exception 'You do not have permission to initialise support triage workflow.';
  end if;

  insert into staffer.workflows (
    organisation_id,
    key,
    name,
    description,
    definition,
    version,
    status,
    created_by,
    updated_at
  )
  values (
    target_organisation_id,
    'support-triage',
    'Customer Support Triage',
    'Manual or Gmail-backed support intake that classifies, searches knowledge, drafts a response and requires human approval before external action.',
    jsonb_build_object(
      'department', 'Customer Experience',
      'trigger', 'Manual support message intake now; Gmail event ingestion plugs into the same idempotent case table later.',
      'steps', jsonb_build_array(
        jsonb_build_object('key', 'intake', 'name', 'Create queued support task', 'type', 'trigger'),
        jsonb_build_object('key', 'anna-classify', 'name', 'Anna classifies severity, category, sentiment, onboarding and SLA', 'type', 'agent'),
        jsonb_build_object('key', 'knowledge-retrieval', 'name', 'Retrieve approved support knowledge and similar cases', 'type', 'tool'),
        jsonb_build_object('key', 'anna-draft', 'name', 'Anna drafts professional casual first-line response', 'type', 'agent'),
        jsonb_build_object('key', 'specialist-review', 'name', 'Route high-risk support concerns to Nakamura or Lawal', 'type', 'human'),
        jsonb_build_object('key', 'human-approval', 'name', 'Human approves external send or draft creation', 'type', 'approval'),
        jsonb_build_object('key', 'response-action', 'name', 'Create approved draft; direct send remains blocked until integration policy exists', 'type', 'action'),
        jsonb_build_object('key', 'knowledge-improvement', 'name', 'Ask Kristin to convert reusable findings into a draft knowledge improvement', 'type', 'agent')
      ),
      'approval', 'Required before external send or customer-visible draft creation',
      'sla', 'Driven by support_triage_settings.severity_rules',
      'protectedActions', jsonb_build_array('external_email_send', 'email_draft_create', 'customer_commitment'),
      'pb', 'PB-025'
    ),
    1,
    'active',
    current_user_id,
    now()
  )
  on conflict (organisation_id, key, version) do update
    set name = excluded.name,
        description = excluded.description,
        definition = excluded.definition,
        status = excluded.status,
        updated_at = now()
  returning id into workflow_id;

  return workflow_id;
end;
$$;

revoke all on function staffer.ensure_support_triage_settings(uuid) from public;
revoke all on function staffer.ensure_support_triage_workflow(uuid) from public;
grant execute on function staffer.ensure_support_triage_settings(uuid) to authenticated, service_role;
grant execute on function staffer.ensure_support_triage_workflow(uuid) to authenticated, service_role;

comment on table staffer.support_triage_settings is 'Mutable tenant-owned settings for Customer Support Triage severity, routing and response policy.';
comment on table staffer.support_triage_cases is 'Live Customer Support Triage cases linking support intake, task, workflow run, retrieved citations, draft response and approval state.';
comment on function staffer.ensure_support_triage_settings(uuid) is 'Initialises tenant-owned support triage settings from database defaults when absent.';
comment on function staffer.ensure_support_triage_workflow(uuid) is 'Initialises the active Customer Support Triage workflow definition for an organisation.';
