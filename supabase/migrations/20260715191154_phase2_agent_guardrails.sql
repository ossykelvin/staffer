-- Staffer Phase 2 agent guardrails.
-- Adds explicit per-agent prohibited actions, approval rules and token limits.

alter table staffer.agents
  add column if not exists maximum_input_tokens integer check (maximum_input_tokens is null or maximum_input_tokens > 0),
  add column if not exists maximum_output_tokens integer check (maximum_output_tokens is null or maximum_output_tokens > 0),
  add column if not exists prohibited_actions jsonb not null default '[]'::jsonb,
  add column if not exists approval_rules jsonb not null default '[]'::jsonb;

alter table staffer.agents
  drop constraint if exists agents_prohibited_actions_array,
  add constraint agents_prohibited_actions_array check (jsonb_typeof(prohibited_actions) = 'array'),
  drop constraint if exists agents_approval_rules_array,
  add constraint agents_approval_rules_array check (jsonb_typeof(approval_rules) = 'array');

comment on column staffer.agents.maximum_input_tokens is 'Optional per-agent input token ceiling. Null means use organisation/runtime default.';
comment on column staffer.agents.maximum_output_tokens is 'Optional per-agent output token ceiling. Null means use organisation/runtime default.';
comment on column staffer.agents.prohibited_actions is 'Per-agent prohibited action keys or plain-language boundaries.';
comment on column staffer.agents.approval_rules is 'Per-agent approval rules evaluated by the governed runtime before protected actions.';
