-- Staffer outstanding roadmap completion foundations.
-- Covers PB-032 approval centre completion, PB-034 Support Triage specialist
-- loop, PB-035 GitHub readiness evidence and PB-036+ lifecycle scaffolding.

alter table staffer.approvals
  add column if not exists approval_mode text not null default 'parallel' check (approval_mode in ('single','parallel','sequential')),
  add column if not exists current_review_sequence integer not null default 1 check (current_review_sequence > 0),
  add column if not exists separation_of_duties_enforced boolean not null default false,
  add column if not exists delegated_from_approval_id uuid references staffer.approvals(id) on delete set null,
  add column if not exists mobile_notification_payload jsonb not null default '{}'::jsonb;

alter table staffer.approvals
  drop constraint if exists approvals_mobile_notification_payload_object,
  add constraint approvals_mobile_notification_payload_object check (jsonb_typeof(mobile_notification_payload) = 'object');

create table if not exists staffer.approval_review_steps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  approval_id uuid not null references staffer.approvals(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_role staffer.membership_role,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','ready','approved','rejected','changes_requested','delegated','expired','skipped')),
  decision_id uuid references staffer.approval_decisions(id) on delete set null,
  delegated_to_user_id uuid references auth.users(id) on delete set null,
  delegated_by_user_id uuid references auth.users(id) on delete set null,
  delegation_comment text,
  reviewer_comment text,
  available_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, approval_id, sequence, reviewer_user_id),
  constraint approval_review_steps_reviewer_check check (reviewer_user_id is not null or reviewer_role is not null)
);

create table if not exists staffer.approval_mobile_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  approval_id uuid not null references staffer.approvals(id) on delete cascade,
  review_step_id uuid references staffer.approval_review_steps(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'in_app' check (channel in ('in_app','email','mobile_push','webhook')),
  title text not null,
  body text not null,
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sent','failed','read','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  constraint approval_mobile_notifications_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists staffer.support_specialist_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  support_case_id uuid not null references staffer.support_triage_cases(id) on delete cascade,
  task_id uuid references staffer.tasks(id) on delete set null,
  workflow_run_id uuid references staffer.workflow_runs(id) on delete set null,
  specialist_agent_id uuid references staffer.agents(id) on delete set null,
  specialist_key text not null,
  review_type text not null check (review_type in ('technical_security_release','data_protection_compliance','knowledge_follow_up')),
  status text not null default 'pending' check (status in ('pending','not_required','completed','changes_requested','blocked')),
  findings jsonb not null default '{}'::jsonb,
  reviewer_comment text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (organisation_id, support_case_id, specialist_key, review_type),
  constraint support_specialist_reviews_findings_object check (jsonb_typeof(findings) = 'object')
);

create table if not exists staffer.support_knowledge_followups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  support_case_id uuid not null references staffer.support_triage_cases(id) on delete cascade,
  task_id uuid references staffer.tasks(id) on delete set null,
  document_id uuid references staffer.documents(id) on delete set null,
  status text not null default 'draft_requested' check (status in ('draft_requested','draft_created','approval_requested','approved','published','cancelled')),
  reusable_finding text not null,
  draft_title text not null,
  draft_content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_knowledge_followups_citations_array check (jsonb_typeof(citations) = 'array')
);

alter table staffer.support_triage_cases
  add column if not exists specialist_review_status text not null default 'pending' check (specialist_review_status in ('pending','not_required','in_review','completed','blocked')),
  add column if not exists knowledge_followup_status text not null default 'not_required' check (knowledge_followup_status in ('not_required','draft_requested','draft_created','approval_requested','published'));

alter table staffer.feature_intake_requests
  drop constraint if exists feature_intake_status_check,
  add constraint feature_intake_status_check check (status in ('drafted','approval_requested','approved','github_issue_ready','github_ready_verified','github_readiness_blocked','github_issue_created','changes_requested','cancelled'));

create table if not exists staffer.github_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  feature_request_id uuid references staffer.feature_intake_requests(id) on delete set null,
  approval_id uuid references staffer.approvals(id) on delete set null,
  repository text not null,
  token_configured boolean not null default false,
  repository_reachable boolean not null default false,
  evidence_links_verified boolean not null default false,
  duplicate_execution_blocked boolean not null default true,
  status text not null default 'pending' check (status in ('pending','passed','failed','blocked')),
  checked_by uuid references auth.users(id),
  check_payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  constraint github_readiness_checks_payload_object check (jsonb_typeof(check_payload) = 'object')
);

create table if not exists staffer.workflow_lifecycles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null,
  owner_agent_key text,
  trigger_types text[] not null default '{}',
  required_approval_actions text[] not null default '{}',
  default_steps jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key),
  constraint workflow_lifecycles_default_steps_array check (jsonb_typeof(default_steps) = 'array')
);

create table if not exists staffer.workflow_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  lifecycle_id uuid not null references staffer.workflow_lifecycles(id) on delete cascade,
  task_id uuid references staffer.tasks(id) on delete set null,
  workflow_run_id uuid references staffer.workflow_runs(id) on delete set null,
  approval_id uuid references staffer.approvals(id) on delete set null,
  trigger_type text not null,
  trigger_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','approval','blocked','completed','failed','cancelled')),
  owner_agent_id uuid references staffer.agents(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_lifecycle_requests_trigger_payload_object check (jsonb_typeof(trigger_payload) = 'object'),
  constraint workflow_lifecycle_requests_evidence_object check (jsonb_typeof(evidence) = 'object')
);

create index if not exists approval_review_steps_approval_idx
  on staffer.approval_review_steps (approval_id, sequence);

create index if not exists approval_review_steps_ready_idx
  on staffer.approval_review_steps (organisation_id, status, available_at);

create index if not exists approval_mobile_notifications_recipient_idx
  on staffer.approval_mobile_notifications (organisation_id, recipient_user_id, status, created_at desc)
  where recipient_user_id is not null;

create index if not exists support_specialist_reviews_case_idx
  on staffer.support_specialist_reviews (support_case_id, status);

create index if not exists support_knowledge_followups_case_idx
  on staffer.support_knowledge_followups (support_case_id, status);

create index if not exists github_readiness_checks_org_status_idx
  on staffer.github_readiness_checks (organisation_id, status, created_at desc);

create index if not exists workflow_lifecycles_org_status_idx
  on staffer.workflow_lifecycles (organisation_id, status, key);

create index if not exists workflow_lifecycle_requests_lifecycle_idx
  on staffer.workflow_lifecycle_requests (lifecycle_id, status, created_at desc);

alter table staffer.approval_review_steps enable row level security;
alter table staffer.approval_mobile_notifications enable row level security;
alter table staffer.support_specialist_reviews enable row level security;
alter table staffer.support_knowledge_followups enable row level security;
alter table staffer.github_readiness_checks enable row level security;
alter table staffer.workflow_lifecycles enable row level security;
alter table staffer.workflow_lifecycle_requests enable row level security;

grant select, insert, update on
  staffer.approval_review_steps,
  staffer.approval_mobile_notifications,
  staffer.support_specialist_reviews,
  staffer.support_knowledge_followups,
  staffer.github_readiness_checks,
  staffer.workflow_lifecycles,
  staffer.workflow_lifecycle_requests
to authenticated;

grant select, insert, update, delete on
  staffer.approval_review_steps,
  staffer.approval_mobile_notifications,
  staffer.support_specialist_reviews,
  staffer.support_knowledge_followups,
  staffer.github_readiness_checks,
  staffer.workflow_lifecycles,
  staffer.workflow_lifecycle_requests
to service_role;

create policy approval_review_steps_member_select on staffer.approval_review_steps
for select to authenticated using (staffer.is_member(organisation_id));
create policy approval_review_steps_operator_write on staffer.approval_review_steps
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]));

create policy approval_mobile_notifications_member_select on staffer.approval_mobile_notifications
for select to authenticated using (staffer.is_member(organisation_id));
create policy approval_mobile_notifications_operator_write on staffer.approval_mobile_notifications
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]));

create policy support_specialist_reviews_member_select on staffer.support_specialist_reviews
for select to authenticated using (staffer.is_member(organisation_id));
create policy support_specialist_reviews_operator_write on staffer.support_specialist_reviews
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]));

create policy support_knowledge_followups_member_select on staffer.support_knowledge_followups
for select to authenticated using (staffer.is_member(organisation_id));
create policy support_knowledge_followups_operator_write on staffer.support_knowledge_followups
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer','operator']::staffer.membership_role[]));

create policy github_readiness_checks_member_select on staffer.github_readiness_checks
for select to authenticated using (staffer.is_member(organisation_id));
create policy github_readiness_checks_operator_write on staffer.github_readiness_checks
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy workflow_lifecycles_member_select on staffer.workflow_lifecycles
for select to authenticated using (staffer.is_member(organisation_id));
create policy workflow_lifecycles_admin_write on staffer.workflow_lifecycles
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]));

create policy workflow_lifecycle_requests_member_select on staffer.workflow_lifecycle_requests
for select to authenticated using (staffer.is_member(organisation_id));
create policy workflow_lifecycle_requests_operator_write on staffer.workflow_lifecycle_requests
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

insert into staffer.workflow_lifecycles (
  organisation_id,
  key,
  name,
  description,
  owner_agent_key,
  trigger_types,
  required_approval_actions,
  default_steps,
  status
)
select
  o.id,
  lifecycle.key,
  lifecycle.name,
  lifecycle.description,
  lifecycle.owner_agent_key,
  lifecycle.trigger_types,
  lifecycle.required_approval_actions,
  lifecycle.default_steps,
  'active'
from staffer.organisations o
cross join (
  values
    (
      'documentation-lifecycle',
      'Documentation Lifecycle',
      'Turns approved features, policies, releases and resolved support cases into governed versioned knowledge artifacts.',
      'kristin',
      array['approved_feature','resolved_support_case','policy_change','release_note'],
      array['document.publish','policy.publish','customer_facing_document.publish'],
      '[
        {"key":"source-review","type":"agent","owner":"kristin","name":"Identify audience, document type, approved sources, owner, sensitivity and review date"},
        {"key":"specialist-validation","type":"human","owner":"domain_specialists","name":"Validate process, security, testing, release or compliance claims"},
        {"key":"approval","type":"approval","name":"Approve customer-facing, policy, regulatory or executive content"},
        {"key":"versioned-publish","type":"action","name":"Publish versioned artifact with citations and review date"}
      ]'::jsonb
    ),
    (
      'growth-campaign-lifecycle',
      'Growth Campaign Lifecycle',
      'Plans, approves and audits acquisition or launch campaigns with consent, claims and spend controls.',
      'benny',
      array['growth_objective','product_launch','campaign_request','acquisition_opportunity'],
      array['campaign.launch','bulk_email.send','paid_spend.commit','pricing_claim.publish'],
      '[
        {"key":"objective","type":"agent","owner":"benny","name":"Define target audience, measurable objective, channel mix and constraints"},
        {"key":"evidence-research","type":"tool","name":"Research approved product evidence and customer language"},
        {"key":"compliance-review","type":"human","owner":"lawal","name":"Validate consent, suppression, claims and regulated-industry obligations"},
        {"key":"launch-approval","type":"approval","name":"Approve spend, launch, sends, discounts or external commitments"}
      ]'::jsonb
    ),
    (
      'compliance-assurance-lifecycle',
      'Compliance Assurance Lifecycle',
      'Maps obligations, controls, owners, evidence and approvals for policy, vendor, incident or regulatory changes.',
      'lawal',
      array['new_product','vendor_change','policy_change','incident','audit_request','complaint'],
      array['risk.accept','policy.publish','regulator.notify','sensitive_data.action'],
      '[
        {"key":"obligation-map","type":"agent","owner":"lawal","name":"Identify applicable data-protection, regulated-industry, ISO, contractual and audit obligations"},
        {"key":"control-map","type":"human","name":"Map obligations to controls, owners, systems, records and residual risks"},
        {"key":"specialist-input","type":"parallel","name":"Collect Anderson, Nakamura, Mobola and Kristin input where relevant"},
        {"key":"formal-approval","type":"approval","name":"Approve formal sign-off, risk acceptance or regulatory communication"}
      ]'::jsonb
    ),
    (
      'daily-command-brief',
      'Daily Command Brief',
      'Produces an internal weekday brief of overdue work, risks, approvals, customer signals and delivery status.',
      'nathan',
      array['weekday_schedule','manual_request'],
      array['brief.deliver'],
      '[
        {"key":"gather-signals","type":"tool","owner":"nathan","name":"Gather overdue tasks, risks, approvals, customer signals and delivery status"},
        {"key":"summarise","type":"agent","owner":"nathan","name":"Produce decisions, actions and watch-list"},
        {"key":"internal-delivery","type":"notification","name":"Deliver internally through selected channel"}
      ]'::jsonb
    ),
    (
      'development-delivery-lifecycle',
      'Development Delivery Lifecycle',
      'Delivers approved engineering issues through scoped implementation, validation, PR evidence and release handoff.',
      'raj',
      array['approved_github_issue','defect','remediation','technical_task'],
      array['pull_request.open','merge.deploy','production.change'],
      '[
        {"key":"scope-confirmation","type":"agent","owner":"raj","name":"Confirm approved scope, acceptance criteria, architecture decisions and controls"},
        {"key":"implementation-plan","type":"human","name":"Inspect codebase and prepare isolated implementation plan"},
        {"key":"quality-checks","type":"tool","name":"Run lint, type, build, accessibility, migration and rollback checks"},
        {"key":"pr-approval","type":"approval","name":"Prepare PR evidence and route domain review before merge/deploy"}
      ]'::jsonb
    ),
    (
      'release-readiness-gate',
      'Release Readiness Gate',
      'Gates release decisions using PR evidence, quality/security checks, migration notes, rollback plan and approvals.',
      'raj',
      array['github_release_state','vercel_deployment_state','manual_release_request'],
      array['release.approve','production.promote','rollback.execute'],
      '[
        {"key":"evidence-pack","type":"agent","owner":"raj","name":"Supply approved PR, implementation evidence, tests, migration notes and rollback plan"},
        {"key":"quality-security","type":"tool","name":"Run quality, security, migration and rollback checks"},
        {"key":"lawal-review","type":"human","owner":"lawal","name":"Review regulated, data-protection, policy and audit impacts"},
        {"key":"release-decision","type":"approval","name":"Collect required approvals and record release decision"}
      ]'::jsonb
    )
) as lifecycle(key, name, description, owner_agent_key, trigger_types, required_approval_actions, default_steps)
on conflict (organisation_id, key) do update
set
  name = excluded.name,
  description = excluded.description,
  owner_agent_key = excluded.owner_agent_key,
  trigger_types = excluded.trigger_types,
  required_approval_actions = excluded.required_approval_actions,
  default_steps = excluded.default_steps,
  status = 'active',
  updated_at = now();

with lifecycle_templates as (
  select
    wl.organisation_id,
    wl.key,
    wl.name,
    wl.description,
    wl.owner_agent_key
  from staffer.workflow_lifecycles wl
)
insert into staffer.task_templates (
  organisation_id,
  key,
  name,
  description,
  project_key,
  default_priority,
  default_status,
  default_assigned_agent_key,
  checklist,
  notification_rules,
  is_active
)
select
  organisation_id,
  key,
  name,
  description,
  key,
  case when key in ('release-readiness-gate','compliance-assurance-lifecycle') then 3 else 2 end,
  'queued',
  owner_agent_key,
  jsonb_build_array('Create task', 'Run assigned agent/review step', 'Capture evidence', 'Route approval where required', 'Record audit'),
  '{"overdue": true, "approvalWaiting": true, "failed": true}'::jsonb,
  true
from lifecycle_templates
on conflict (organisation_id, key) do update
set
  name = excluded.name,
  description = excluded.description,
  default_assigned_agent_key = excluded.default_assigned_agent_key,
  checklist = excluded.checklist,
  notification_rules = excluded.notification_rules,
  is_active = true;

comment on table staffer.approval_review_steps is 'Ordered reviewer steps for sequential, delegated, expired and commented approval workflows.';
comment on table staffer.approval_mobile_notifications is 'Mobile-friendly approval notification queue records; external push delivery can consume these later.';
comment on table staffer.support_specialist_reviews is 'Nakamura, Lawal and Kristin specialist review evidence for Customer Support Triage cases.';
comment on table staffer.support_knowledge_followups is 'Governed reusable-knowledge follow-up drafts created from resolved support findings.';
comment on table staffer.github_readiness_checks is 'Feature Intake GitHub production readiness checks for repository, token, evidence links and duplicate-execution controls.';
comment on table staffer.workflow_lifecycles is 'Tenant-owned lifecycle registry for remaining Staffer operating workflows.';
comment on table staffer.workflow_lifecycle_requests is 'Executable lifecycle request records connecting triggers, tasks, workflow runs, approvals and evidence.';
