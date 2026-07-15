alter table staffer.support_triage_cases
  drop constraint if exists support_triage_cases_external_action_status_check,
  add constraint support_triage_cases_external_action_status_check
    check (
      external_action_status in (
        'pending_approval',
        'approval_requested',
        'approved_to_draft',
        'draft_created',
        'sent_blocked',
        'sent',
        'cancelled'
      )
    );

comment on constraint support_triage_cases_external_action_status_check on staffer.support_triage_cases
  is 'Tracks Customer Support Triage external response execution, including approval-gated Brevo send completion.';
