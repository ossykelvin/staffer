# Staffer Product Backlog

This backlog turns the broad product roadmap into implementation-sized slices. Work from the top unless a dependency blocks the item. Do not mark an item complete until implementation, tests, lint, build, and the relevant roadmap note are done.

## Product north star

Staffer should move work through a governed operating loop:

`trigger -> task -> agent -> review -> approval -> action -> audit`

The current app shows the shape of that product, but most screens are still static. The first milestone is therefore not "more UI"; it is making the existing UI behave like a usable product in demo mode while preserving the path to Supabase-backed live mode.

## Now / Next / Later roadmap

### Now: make the prototype operational

- [x] PB-001: Define the route map and clickable interaction contract. Implemented in `docs/interaction-contract.md`; verified with lint, typecheck, build, and HTTP smoke checks.
- [x] PB-002: Make task rows clickable and add task detail pages. Implemented `/tasks/[id]` and linked dashboard/task rows; verified with lint, typecheck, build, and `/tasks/TSK-1042` smoke check.
- [x] PB-003: Add a demo-mode task creation flow. Implemented `/tasks/new` with validated non-persistent demo confirmation; verified with lint, typecheck, build, and `/tasks/new` smoke check.
- [x] PB-004: Add approval detail pages with review, approve, reject, and request-changes states. Implemented `/approvals/[id]` and demo decision controls; verified with lint, typecheck, build, and `/approvals/APR-221` smoke check.
- [x] PB-005: Add workflow detail pages and a dry-run timeline. Implemented `/workflows/[id]` dry-run views; verified with lint, typecheck, build, and `/workflows/support-triage` smoke check.
- [x] PB-006: Add useful empty, loading, error, and confirmation states across the app. Implemented shared empty state plus route-level loading, error, and not-found states; verified with lint, typecheck, build, and smoke checks.
- [x] PB-007: Fix local configuration ergonomics so the app starts from `.env.local.example` without hidden runtime failures. Quoted colour values and normalised blank optional env values; verified with lint, typecheck, build, and `/api/health` smoke check.

### Next: connect the product to real governed data

- [x] PB-008: Repair and verify the Supabase RLS membership model. Implemented `20260715082325_staffer_live_foundation.sql` with non-recursive membership helpers, explicit grants and role policies; applied live Staffer migrations to Supabase project `okkyvhkcpoyrflswatax`; exposed the `staffer` Data API schema; verified all Staffer tables have RLS and policies; cleaned up Staffer advisor performance warnings.
- [x] PB-009: Implement Supabase Auth, protected routes, and unauthorised states. Implemented Next.js Proxy protection, login/sign-up, auth callback, and unauthorised route; verified with lint, typecheck, build, and smoke checks.
- [x] PB-010: Add organisation onboarding and founder/admin membership. Implemented onboarding route and `staffer.create_organisation_for_current_user` RPC that creates founder membership and audit event; applied live and extended with one-time invitation acceptance plus membership audit event.
- [x] PB-011: Build tenant-aware repositories with demo fallback parity. Implemented repository layer that uses Supabase `staffer` schema in live mode and seed data in demo mode; verified with smoke checks.
- [x] PB-012: Replace JSON reads with live repositories for agents, tasks, workflows, and approvals. Updated page/API data access to repository functions while retaining seed data for fallback/static params; verified with lint, typecheck, build, and smoke checks.
- [x] PB-013: Add audit events for task state changes, approval decisions, and material mutations. Implemented audit RPC, task transition server action, and approval decision server action that record demo/live audit results; verified statically and through task/approval smoke checks.
- [x] PB-013A: Complete Phase 1 identity operations. Added password reset/update flow, organisation settings UI, admin invitation creation, invite acceptance, encrypted integration secret storage, Staffer Data API exposure, and live Supabase verification.
- [x] PB-014: Agent profile CRUD foundation. Added `/agents/new`, editable agent detail forms, server-side create/update/status actions, profile lifecycle controls, audit events, and live Supabase persistence.
- [x] PB-015: Agent versioning. Added append-only `staffer.agent_versions`, version snapshots for profile/status/skill changes, visible version history, and live RLS/grant verification.
- [x] PB-016: Skills catalogue and agent-skill proficiency mapping. Added organisation skill creation, catalogue reads, agent skill map/remove flows, proficiency levels, and stricter same-tenant junction policies.
- [x] PB-017: Tools catalogue and agent-tool permission mapping. Added organisation tool creation, catalogue reads, risk/approval/schema fields, per-agent tool map/remove flows with JSON constraints, version snapshots, audit events, and stricter same-tenant junction policies.
- [x] PB-018: Configure autonomy defaults, prohibited actions, approval rules and per-agent model/cost/step limits. Added organisation guardrail defaults, per-agent runtime routing and limits, prohibited actions, approval rules, live schema constraints, audit-aware settings updates, and static/live verification.
- [x] PB-019: Add profile image upload or generated-avatar support and founder confirmation workflow for draft personas. Added generated-avatar metadata/rendering, preserved reviewed image-path support, implemented founder confirm/request-changes actions and version rollback from immutable snapshots.
- [x] PB-020: Implement task comments, dependencies, watchers, retries, and evidence timelines. Added tenant-scoped collaboration tables with explicit RLS/grants, retry metadata on tasks, live repository reads, task detail panels, server actions, evidence events, and audit logging.
- [x] PB-021: Implement the approval policy engine and exact-payload execution checks. Added tenant approval policies, policy snapshots, reviewer-count decisions, canonical payload hashing, append-only decision/execution records, and database-enforced execution verification.

### Later: build the governed AI workforce

- [x] PB-022: Implement the server-only AI provider router with fallback, guardrails, and structured output. Added server-only provider routing, AI SDK v6 structured outputs, guardrail blocking, retry/fallback classification, cost/timeout/step limits, confidence escalation, audit-ready run records, bounded `ToolLoopAgent` factory, env examples, static verification and per-agent evaluation fixtures.
- [x] PB-023: Implement durable workflow execution, pause, resume, retry, and replay. Added live Supabase run/step/event state with RLS and Data API grants, idempotent start RPC, transition and replay RPCs, workflow execution repository reads, server actions for start/pause/resume/cancel/retry/replay, workflow console UI, static verification and live schema checks.
- [x] PB-024: Implement knowledge ingestion, retrieval, citations, retention, and access control. Added live knowledge collections, agent collection ACLs, document metadata/versioning, manual text ingestion, chunking, citation JSON, full-text retrieval RPC with agent access enforcement, retrieval audit events, retention/review/legal-hold metadata, Knowledge Hub UI, static verification and live RLS/grant checks.
- [x] PB-025: Launch the first live workflow: Customer Support Triage. Added tenant-owned support triage settings, live support cases, manual intake, queued task creation, durable workflow start, Anna-style classification, approved knowledge retrieval, citation-backed draft response, specialist routing flags, approval request creation, support triage UI, live RLS/grant checks and static verification.
- [x] PB-025A: Add approved Brevo execution for support response drafts. Added approval-page execution for Anna support drafts, exact stored-payload verification through `staffer.verify_approval_execution`, server-only Brevo send, duplicate-send blocking, failure state handling, support case/task/workflow/audit evidence updates, and the live `sent` support-case state.
- [x] PB-025B: Add signup and onboarding welcome email reliability. Added Brevo-backed signup welcome and founder onboarding welcome emails, masked structured auth/onboarding logs, audited organisation welcome delivery/failure events, dashboard feedback messages, and static verification.
- [x] PB-026: Launch the second live workflow: Feature Intake to Engineering. Added live feature intake settings/requests, manual intake, durable workflow run creation, specialist artifacts from Nancy/Mobola/Anderson/Raj/Nakamura/Lawal, approval-gated GitHub issue payload with Staffer evidence links, approved GitHub issue execution path, task evidence, tool telemetry, failure compensation for downstream write failures and live RLS/index checks. Production execution still requires the product repo and `GITHUB_ISSUE_TOKEN`.
- [x] PB-027: Add governance dashboards for audit, cost, quality, latency, and failures. Added `/governance`, `staffer.get_governance_dashboard`, tool execution logs and task notification foundations; verified with static checks, typecheck, lint, build and live schema checks.
- [x] PB-028: Implement safe internal tool permission enforcement. Added a reusable server-only agent/tool permission guard over `staffer.tools` and `staffer.agent_tools`, blocked-attempt tool telemetry and audit events, workflow action allow-list checks, approval-context checks for protected execution, and wired enforcement into Support Triage knowledge/email-draft, Feature Intake GitHub-draft, approved GitHub issue creation and approved support email sending.
- [ ] PB-029: Implement tool rate limits and integration-specific circuit breakers. Pair with PB-028 so every tool execution is permissioned, rate-limited, failure-aware and auditable before deeper integrations expand.
- [ ] PB-030: Implement first-class safe internal tools. Build governed internal tools for knowledge search, task read/update, approval request and document draft without exposing unrestricted SQL, shell, deletion or production access.
- [ ] PB-031: Implement Gmail read and draft integration. Add Gmail event ingestion for Support Triage and Gmail draft creation while keeping external sending separately approval-gated through the existing protected execution path.
- [ ] PB-032: Complete the approval centre. Add sequential approvals, delegation, expiry, separation-of-duties checks, reviewer comments/history and mobile-friendly approval notifications.
- [x] PB-033: Knowledge upload and memory controls. Added Supabase Storage-backed knowledge uploads, built-in file safety scanning, upload/version metadata, text extraction, deterministic embeddings, hybrid retrieval filters for memory/project/customer/sensitivity, approval-gated memory promotion, retention deletion approval with soft retirement, legal-hold controls, audit events and static verification.
- [ ] PB-034: Complete the Customer Support Triage specialist loop. Add Nakamura technical review, Lawal compliance review and Kristin knowledge-base follow-up so support cases close the review and reusable-learning loop.
- [ ] PB-035: Complete Feature Intake production issue creation readiness. Verify GitHub repository/token state, confirm evidence-link payloads in production and close the roadmap item for GitHub issue creation.
- [ ] PB-036+: Build the remaining workflow lifecycles. Deliver Documentation Lifecycle, Growth Campaign Lifecycle, Compliance Assurance, Daily Command Brief, Development Delivery and Release Readiness Gate in implementation-sized slices.

## Ready backlog

### PB-001: Define the route map and clickable interaction contract

**Problem:** Users can see cards, tables, and buttons, but cannot confidently predict what will happen when they click.

**Scope:**
- Document every primary navigation route.
- Define the expected click behavior for dashboard cards, task rows, agent cards, workflow rows, approval cards, and settings panels.
- Decide which actions are demo-only, read-only, or live-backed.
- Add disabled states and explanatory labels where an action is intentionally unavailable.

**Acceptance:**
- A tester can click through the product without dead-end buttons.
- Every visible primary action either navigates, opens a form/detail view, or is clearly disabled with a reason.
- No production or external action can execute from demo mode.

**Touches:** App shell, dashboard, tasks, approvals, workflows, knowledge, integrations, settings.

### PB-002: Make task rows clickable and add task detail pages

**Problem:** Tasks are displayed as table rows, but they are not work objects yet.

**Scope:**
- Add `/tasks/[id]`.
- Link task rows from the dashboard and task board.
- Show task metadata, owner, priority, status, due date, project, approval path, evidence, and activity timeline.
- Add placeholder comments/activity using demo data.

**Acceptance:**
- A user can open a task, understand why it exists, see who owns it, and see what action is required next.
- Missing task IDs show a useful not-found state.
- Demo data remains validated through the shared schema layer.

**Touches:** `src/app/tasks`, `src/lib/data.ts`, `src/lib/schemas.ts`.

### PB-003: Add a demo-mode task creation flow

**Problem:** "Create task" is currently a visual button.

**Scope:**
- Add a task creation screen or modal.
- Capture title, owner, priority, due date, project, and description.
- In demo mode, persist to client/session state or return a clear non-persistent demo confirmation.
- In live mode, block the flow until authenticated tenant repositories exist.

**Acceptance:**
- The button always does something understandable.
- Validation errors are shown inline.
- Demo-created tasks cannot be mistaken for committed live records.

**Touches:** Tasks page, form components, validation schemas.

### PB-004: Add approval detail and decision states

**Problem:** Approvals show "Review" and "Approve" buttons, but no decision workflow exists.

**Scope:**
- Add `/approvals/[id]`.
- Show proposed action, requester, risk, evidence, exact payload placeholder, and decision history.
- Add demo approve, reject, request changes, and expire states.
- Keep execution blocked; approval should only change demo state until live audit exists.

**Acceptance:**
- A reviewer can inspect what they are approving before making a decision.
- Decisions require confirmation and produce a visible activity entry.
- The UI communicates that protected execution is not enabled yet.

**Touches:** Approvals page, approval schemas, status components.

### PB-005: Add workflow detail pages and dry-run timeline

**Problem:** Workflows are described, but users cannot inspect or simulate the operating loop.

**Scope:**
- Add `/workflows/[id]`.
- Show trigger, steps, approval requirement, SLA, owning department, and current status.
- Add a dry-run timeline for `trigger -> task -> agent -> review -> approval -> action -> audit`.
- Provide clear blocked states for execution until the workflow engine exists.

**Acceptance:**
- A workflow can be reviewed end to end without reading code.
- Dry-run output is deterministic demo data, not AI-generated.
- Protected actions remain non-executable.

**Touches:** Workflows page, workflow data model, timeline UI.

### PB-006: Add app-wide states

**Problem:** The app lacks consistent loading, empty, error, confirmation, and not-found handling.

**Scope:**
- Add route-level `loading.tsx`, `error.tsx`, and `not-found.tsx` where needed.
- Add empty states for zero tasks, approvals, workflows, knowledge documents, and integrations.
- Add confirmation patterns for risky demo actions.

**Acceptance:**
- Users never see a blank or broken-feeling page for common states.
- Error copy explains whether the issue is demo data, auth, config, or unavailable live services.
- Confirmation states are present before any high-risk action placeholder.

**Touches:** Route segments, shared UI components.

### PB-007: Fix local configuration ergonomics

**Problem:** The app can start but render a server error when required public env values are blank.

**Scope:**
- Decide which bootstrap values are truly required and which can use explicit demo fallback.
- Ensure `.env.local.example` and validation behavior match.
- Add a startup health check or developer-facing config error page.
- Keep secrets out of browser code.

**Acceptance:**
- Fresh setup from `.env.local.example` starts and renders.
- Missing required secrets fail only when the related feature is invoked.
- Non-secret public config errors are actionable.

**Touches:** `src/lib/env.ts`, `.env.local.example`, health route.

### PB-029: Tool rate limits and circuit breakers

**Problem:** PB-028 blocks unauthorised tool use, but authorised tools still need runtime throttling, provider-specific failure handling, and circuit breakers so one bad workflow cannot flood an integration.

**Scope:**
- Store tenant/tool/agent rate-limit and circuit-breaker settings in live configuration, not hardcoded UI logic.
- Enforce per-tool and per-integration limits server-side before execution.
- Track recent failures, open/half-open/closed breaker state, retry-after windows and recovery events.
- Write rate-limit and circuit-breaker outcomes to tool telemetry and audit.

**Acceptance:**
- A permitted tool call can still be blocked by rate limit or open circuit breaker with a clear, auditable reason.
- External integrations have separate breaker keys so Gmail, GitHub, Vercel, Supabase and email failures do not mask each other.
- Demo mode remains deterministic.

**Touches:** `src/lib/tools`, workflow actions, approval execution actions, Supabase migrations, governance dashboard, verification scripts.

### PB-030: Safe internal tool implementations

**Problem:** The platform has permission enforcement, but the core internal tools are still scattered across workflow code instead of first-class governed tool implementations.

**Scope:**
- Implement safe tools for knowledge search, task read, task update, approval request and document draft.
- Validate every tool input/output with schemas.
- Route every tool through PB-028 permissions and PB-029 rate limits.
- Prevent unrestricted SQL, shell, file deletion, raw secret reads or production mutation escapes.

**Acceptance:**
- Workflows call reusable internal tool functions rather than duplicating tool logic.
- Every internal tool emits redacted telemetry and audit evidence.
- Unsafe requests fail closed with actionable errors.

**Touches:** `src/lib/tools`, workflow actions, task/approval/knowledge repositories, schemas, verification scripts.

### PB-031: Gmail read and draft integration

**Problem:** Customer Support Triage supports manual intake and Brevo-approved sending, but Gmail event ingestion and Gmail draft creation are still missing.

**Scope:**
- Add Gmail message/thread read path for support triage intake.
- Create idempotent queued tasks from Gmail events using existing support-case fields.
- Add Gmail draft creation for approved or ready-to-review support responses.
- Keep sending approval-gated and separate from draft creation.

**Acceptance:**
- A Gmail support message can create exactly one support triage task/case.
- Anna can draft a Gmail response with citations and specialist flags.
- No Gmail send occurs without recorded approval and exact-payload execution verification.

**Touches:** Gmail integration layer, Support Triage workflow, `support_triage_cases`, tool registry, env validation, verification scripts.

### PB-032: Approval centre completion

**Problem:** Approvals support policy-driven creation and exact-payload checks, but advanced reviewer workflows remain incomplete.

**Scope:**
- Add sequential approval steps and explicit reviewer ordering where policy requires it.
- Add delegate and expire actions with comments.
- Enforce separation-of-duties for high-risk actions.
- Add reviewer comments/history and mobile-friendly notification records.

**Acceptance:**
- A high-risk approval can require ordered reviewers and block self-approval where policy forbids it.
- Delegation, expiry and reviewer comments are immutable/audited.
- Mobile-friendly notification data is available without requiring external push delivery yet.

**Touches:** Approval schema/migrations, approval actions/pages, notification tables, policy engine, verification scripts.

### PB-033: Knowledge upload and memory controls

**Status:** Completed in local code. Production activation still requires applying the PB-033 Supabase migration and deploying the app.

**Implemented scope:**
- Document upload, built-in file safety scan, metadata and versioning.
- Text extraction, chunking, embeddings and filtered retrieval.
- Memory scope separation and approval-gated long-term memory promotion.
- Retention deletion approval, legal hold and soft retirement workflows.

**Remaining operational step:**
- Apply the Supabase migration and deploy after approval.

**Touches:** `src/app/knowledge`, `src/lib/knowledge`, repository/schema types, approval actions, Supabase migration, verification scripts.

### PB-034: Complete Customer Support Triage specialist loop

**Problem:** Support Triage flags technical/compliance review needs, but Nakamura, Lawal and Kristin follow-up work is not yet represented as executable workflow steps.

**Scope:**
- Add Nakamura technical/security/release-risk review capture.
- Add Lawal data-protection/compliance review capture.
- Add Kristin reusable-knowledge follow-up task/document draft when a support case creates a reusable finding.
- Preserve approval gates before external commitments.

**Acceptance:**
- High-risk support cases cannot skip required specialist review.
- Specialist findings are stored as evidence and visible in the workflow timeline.
- Reusable support findings can produce a governed knowledge-base improvement draft.

**Touches:** Support Triage workflow, task/evidence tables, approvals, knowledge draft tooling, UI panels, verification scripts.

### PB-035: Complete Feature Intake production issue creation readiness

**Problem:** Feature Intake has the issue execution path, but the roadmap remains open until production repository/token configuration and evidence links are verified end to end.

**Scope:**
- Verify `ossykelvin/staffer-product` exists and is reachable by the configured GitHub token.
- Verify `GITHUB_ISSUE_TOKEN` is configured in production.
- Run an approval-gated production readiness simulation for GitHub issue creation with Staffer evidence links.
- Close or clarify the roadmap item based on the result.

**Acceptance:**
- Feature Intake can create a GitHub issue in the intended product repository after recorded approval.
- Duplicate execution remains blocked.
- Failure states are clear when token/repo access is missing.

**Touches:** GitHub integration, approval execution action, Feature Intake workflow, Vercel env config, verification scripts.

### PB-036+: Remaining workflow lifecycles

**Problem:** The major operating lifecycles after Support Triage and Feature Intake are still mostly roadmap-level descriptions.

**Scope:**
- Break Documentation Lifecycle, Growth Campaign Lifecycle, Compliance Assurance, Daily Command Brief, Development Delivery and Release Readiness Gate into individual PB items.
- Implement one vertical workflow slice at a time with trigger, task, agent/review, approval, action and audit.
- Keep protected external actions approval-gated.

**Acceptance:**
- Each lifecycle ships as a testable workflow with durable state, evidence, approvals and audit.
- No lifecycle relies on hardcoded tenant policy, schedule, provider, threshold or external endpoint.

**Touches:** Workflow definitions, task templates, tools, approvals, knowledge, governance dashboard, integration-specific code.

## Sequencing rules

- PB-001 through PB-007 may use demo data only.
- PB-008 through PB-013 must not remove demo mode until live parity is proven.
- Any item touching Supabase data requires RLS and permission verification.
- Any item touching an agent, task, approval, or workflow mutation must emit an audit event once live mode exists.
- Any item exposing an external or protected action must require a recorded approval before execution.

## Backlog item template

Use this shape when adding a new backlog item:

```md
### PB-000: Short title

**Problem:** What user or platform problem this solves.

**Scope:**
- Small implementation slice.
- Explicit exclusions.

**Acceptance:**
- Testable completion condition.
- Security/governance condition where relevant.

**Touches:** Files, routes, tables, or services likely affected.
```
