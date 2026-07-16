alter table staffer.feature_intake_settings
  alter column github_policy set default '{
    "createIssueRequiresApproval": true,
    "defaultRepository": "ossykelvin/staffer-product",
    "issueMode": "approval_gated_create",
    "labels": ["feature-intake", "needs-founder-approval"]
  }'::jsonb;

update staffer.feature_intake_settings
set
  github_policy = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          github_policy,
          '{createIssueRequiresApproval}',
          'true'::jsonb,
          true
        ),
        '{defaultRepository}',
        to_jsonb('ossykelvin/staffer-product'::text),
        true
      ),
      '{issueMode}',
      to_jsonb('approval_gated_create'::text),
      true
    ),
    '{labels}',
    '["feature-intake", "needs-founder-approval"]'::jsonb,
    true
  ),
  updated_at = now();

comment on column staffer.feature_intake_settings.github_policy is 'Tenant-owned GitHub issue execution policy for Feature Intake. Exact approved payloads are required before issue creation.';
