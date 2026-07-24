-- Expand task evidence event types used by governed workflow actions.
--
-- PB-032/PB-034/PB-035/PB-036 introduced approval, specialist-review,
-- GitHub-readiness and lifecycle evidence writers that persist into the
-- existing append-only task evidence table. The original Phase 3 check
-- constraint only allowed generic collaboration events, so those governed
-- production actions failed after their domain records were written.

alter table staffer.task_evidence_events
  drop constraint if exists task_evidence_events_event_type_check;

alter table staffer.task_evidence_events
  add constraint task_evidence_events_event_type_check
  check (
    event_type in (
      'evidence',
      'attachment',
      'status',
      'retry',
      'dependency',
      'watcher',
      'comment',
      'system',
      'workflow_lifecycle.request_created',
      'github_readiness',
      'feature_intake.github_issue_created',
      'support_triage.email_sent',
      'support_triage.gmail_draft_created',
      'specialist_review',
      'knowledge_followup'
    )
  );
