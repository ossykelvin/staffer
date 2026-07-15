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
- [ ] PB-026: Launch the second live workflow: Feature Intake to Engineering.
- [ ] PB-027: Add governance dashboards for audit, cost, quality, latency, and failures.

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
