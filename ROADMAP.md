# Staffer Product Roadmap and Codex Requirement Checklist

> **Codex instruction:** Read `AGENTS.md`, then work through this file in order. Do not mark a requirement complete until implementation, tests, lint and production build pass.

## Product vision

Staffer is KOP Technology's governed AI workforce platform. It gives human-like specialist agents profiles, skills and limited tools, while deterministic workflows control approvals, retries, deadlines, escalation and audit.

## Current execution queue

The full roadmap below remains the source of truth for product phases. The immediate tick-off backlog is maintained in [`PRODUCT_BACKLOG.md`](PRODUCT_BACKLOG.md) so implementation can proceed in small, reviewable slices.

- [x] PB-001: Define the route map and clickable interaction contract — implemented in `docs/interaction-contract.md`; verified with lint, typecheck, build and HTTP smoke checks; no git commit because this folder is not a git repository
- [x] PB-002: Make task rows clickable and add task detail pages — implemented `/tasks/[id]` and linked dashboard/task rows; verified with lint, typecheck, build and `/tasks/TSK-1042` smoke check; no git commit because this folder is not a git repository
- [x] PB-003: Add a demo-mode task creation flow — implemented `/tasks/new` with validated non-persistent demo confirmation; verified with lint, typecheck, build and `/tasks/new` smoke check; no git commit because this folder is not a git repository
- [x] PB-004: Add approval detail pages with review, approve, reject and request-changes states — implemented `/approvals/[id]` and demo decision controls; verified with lint, typecheck, build and `/approvals/APR-221` smoke check; no git commit because this folder is not a git repository
- [x] PB-005: Add workflow detail pages and a dry-run timeline — implemented `/workflows/[id]` dry-run views; verified with lint, typecheck, build and `/workflows/support-triage` smoke check; no git commit because this folder is not a git repository
- [x] PB-006: Add useful empty, loading, error and confirmation states across the app — implemented shared empty state plus route-level loading, error and not-found states; verified with lint, typecheck, build and HTTP smoke checks; no git commit because this folder is not a git repository
- [x] PB-007: Fix local configuration ergonomics so the app starts cleanly from `.env.local.example` — quoted colour values and normalised blank optional env values; verified with lint, typecheck, build and `/api/health` smoke check; no git commit because this folder is not a git repository
- [x] PB-008: Repair and verify the Supabase RLS membership model — implemented `20260715082325_staffer_live_foundation.sql`, applied Staffer migrations to Supabase project `okkyvhkcpoyrflswatax`, exposed the `staffer` Data API schema, and verified every Staffer table has RLS plus tenant-aware policies; verified by `npm run verify:live-foundation`, lint, typecheck, build and Supabase advisors
- [x] PB-009: Implement Supabase Auth, protected routes and unauthorised states — implemented Next.js Proxy protection, login/sign-up, auth callback and unauthorised route; verified with lint, typecheck, build and smoke checks; no git commit because this folder is not a git repository
- [x] PB-010: Add organisation onboarding and founder/admin membership — implemented onboarding route and `staffer.create_organisation_for_current_user` RPC; applied live to Supabase with invitation acceptance and membership audit events; verified by static live-foundation check and build
- [x] PB-011: Build tenant-aware repositories with demo fallback parity — implemented repository layer for agents, tasks, workflows and approvals with seed fallback; verified with lint, typecheck, build and smoke checks; no git commit because this folder is not a git repository
- [x] PB-012: Replace JSON reads with live repositories for agents, tasks, workflows and approvals — updated page/API data access to repositories while retaining seed data for fallback/static params; verified with lint, typecheck, build and smoke checks; no git commit because this folder is not a git repository
- [x] PB-013: Add audit events for task state changes, approval decisions and material mutations — implemented audit RPC plus task transition and approval decision server actions for demo/live audit events; verified by static live-foundation check, lint, typecheck, build and task/approval smoke checks; no git commit because this folder is not a git repository
- [x] PB-014: Agent profile CRUD foundation — implemented `/agents/new`, profile edit forms, lifecycle status controls and server-side create/update/status actions; applied live migration `phase2_agent_registry_skills`; verified with static live-foundation check, lint, typecheck, build and Supabase RLS checks
- [x] PB-015: Agent versioning — added append-only `staffer.agent_versions`, version snapshots for create/edit/activate/retire/skill mapping changes and visible version history on agent detail pages; verified live RLS and authenticated grants
- [x] PB-016: Skills catalogue and mapping — added live skills catalogue reads, skill creation, agent-skill proficiency mapping/removal and tightened cross-tenant junction policies; verified no duplicate permissive Staffer policies for touched tables
- [x] PB-017: Tools catalogue and agent-tool permission mapping — added live tool catalogue reads, tool creation with risk/approval/schema fields, agent-tool mapping/removal with JSON constraints, version snapshots and stricter same-tenant junction policies
- [x] PB-018: Configure autonomy defaults, prohibited actions, approval rules and per-agent model/cost/step/token limits — added organisation default guardrail settings, per-agent runtime routing/limits, prohibited actions and approval rules with live migration `phase2_agent_guardrails`
- [x] PB-019: Agent rollback, generated avatars and founder confirmation — added append-only rollback actions, generated avatar metadata/rendering and explicit founder confirmation/request-changes workflow with audit events
- [x] PB-020: Task comments, dependencies, watchers, retries and evidence timelines — added tenant-scoped collaboration tables with RLS, task retry metadata, live repository reads, server-action mutations, audit events and task detail UI panels
- [x] PB-021: Approval policy engine and exact-payload execution checks — added tenant approval policies, append-only decision/execution check records, canonical payload hashing, live policy detail UI, reviewer-count decisions and database-enforced execution verification

- [x] PB-022: Server-only AI provider router with fallback, guardrails and structured output — added governed AI runtime, Zod output contracts, provider fallback/error classification, prompt/data-exfiltration guardrails, confidence escalation, audit-ready telemetry and per-agent evaluation fixtures
- [x] PB-023: Durable workflow execution, pause, resume, retry and replay — added live workflow run/step/event state, idempotent start, transition and replay RPCs, workflow execution console controls, repository reads, append-only events and static/live verification

- [x] PB-024: Knowledge ingestion, retrieval, citations, retention and access control — added live knowledge collections, document versions, chunking, citation search, retrieval audit events, agent collection ACLs, retention/review/legal-hold metadata and Knowledge Hub ingestion/search UI

- [x] PB-025: Customer Support Triage live workflow — added tenant-owned support triage settings, manual intake, queued task creation, durable workflow start, Anna-style classification, approved knowledge retrieval, citation-backed draft response, specialist routing flags, approval request creation and workflow-console case tracking
- [x] PB-025A: Approved Brevo support email execution — added exact-payload verified support response sending from approved Anna drafts, duplicate-send blocking, Brevo failure handling, support case/task/workflow/audit updates and live `sent` state migration
- [x] PB-025B: Signup and onboarding welcome email reliability — added Brevo-backed signup welcome and founder onboarding welcome emails, masked structured auth logs, onboarding welcome audit events and dashboard feedback for welcome delivery state

## Current first-draft scope

- [x] Next.js App Router application shell
- [x] Modern KOP blue command-centre design
- [x] Responsive dashboard, staff directory and agent detail pages
- [x] Task, workflow, approval, knowledge, integration and settings views
- [x] Ten configurable founder-confirmed agent personas
- [x] Agent skills, tools, autonomy levels and approval boundaries
- [x] Gemini-primary and OpenRouter-fallback provider scaffold
- [x] Supabase SSR client scaffold
- [x] Initial Supabase schema and RLS design
- [x] Environment template with no secrets committed
- [x] Codex operating instructions and profile questionnaire
- [x] Replace placeholder profile details with founder-confirmed profiles — Nathan, Nancy, Mobola, Anderson, Nakamura, Kristin, Anna, Benny, Lawal, and Raj completed

## Phase 1 — Foundation and identity

- [x] Create Supabase project and dedicated `staffer` schema — connected to Supabase project `okkyvhkcpoyrflswatax`; applied Staffer schema via managed migrations
- [x] Apply migration and verify all tables, indexes and policies — applied `staffer_core`, `staffer_live_foundation`, `phase1_identity_completion`, `phase1_policy_advisor_cleanup`, and `expose_staffer_data_api_schema`; verified all 16 Staffer tables have RLS and policies
- [x] Implement Supabase Auth with email/password and password reset flow — sign-in/sign-up existed; added reset request, token confirmation route, authenticated password update page, structured signup diagnostics and Brevo-backed welcome email coverage
- [x] Create organisation onboarding and founder/admin membership — implemented onboarding RPC and live founder membership audit trail
- [x] Implement tenant-aware server data access layer — repository layer reads live tenant-scoped Supabase records with authenticated membership context
- [x] Replace JSON demonstration loaders with database repositories — pages/API use repositories with seed fallback for static params and demo parity
- [x] Retain `NEXT_PUBLIC_DEMO_MODE` fallback for local demonstrations — demo mode remains default in `.env.local.example`
- [x] Add protected app routes and unauthorised states — Next.js proxy protects app/account routes, redirects unauthenticated users, and handles no-membership onboarding
- [x] Add role model: founder, administrator, reviewer, operator, viewer — role enum, helper RPCs and role-aware RLS policies are live
- [x] Add organisation settings UI and encrypted integration secrets — settings page now updates organisation settings, creates one-time invitations, lists members/invitations, and stores integration secrets encrypted server-side

**Acceptance:** A new founder can sign up, create an organisation, invite a user and access only that organisation's records.

## Phase 2 — Agent registry and skills

- [x] Implement create, edit, version, activate and retire agent profiles — `/agents/new` and `/agents/[id]` now provide live-backed profile creation/editing and draft/active/retired lifecycle controls with version snapshots and audit events
- [x] Store biography, pronouns, location, timezone, experience, personality and communication style — editable profile form persists these fields in the tenant-owned `agents.profile` JSON with validated server actions and demo fallback
- [x] Create skills catalogue and agent-skill proficiency mapping — skills can be created per organisation and mapped to agents through `agent_skills` with proficiency levels and tenant-safe RLS policies
- [x] Create tools catalogue and agent-tool permission mapping — tools can be created per organisation with risk class, input/output schemas, default approval requirements and active state, then mapped to agents through tenant-safe `agent_tools` constraints
- [x] Configure autonomy levels 0–5 with organisation defaults — editable organisation defaults now live in `organisations.settings` and preserve other settings during updates
- [x] Configure prohibited actions and approval rules per agent — `agents.prohibited_actions` and `agents.approval_rules` are editable arrays with database JSON-array constraints
- [x] Add model, step, token and cost limits per agent — agent forms and detail pages now cover model keys plus step, cost, input-token and output-token ceilings
- [x] Add agent version history and rollback — version history now supports rollback from immutable snapshots into a new audited version
- [x] Add profile image upload or generated-avatar option — added governed generated-avatar metadata/rendering while preserving reviewed local image-path support
- [x] Add founder confirmation workflow for draft personas — agent detail pages now record founder confirmation or requested changes with notes, version snapshots and audit events

**Acceptance:** An administrator can change an agent's profile or permissions without changing code, and all changes are versioned.

## Phase 3 — Tasks and collaboration

- [ ] Implement task creation, assignment, priority, due date and project linkage
- [ ] Support human and agent assignees
- [x] Add task comments, attachments, dependencies and watchers — comments, watcher controls, dependency edges and attachment-reference evidence events are live-backed through PB-020
- [ ] Add task states: draft, queued, running, blocked, review, approval, completed, failed, cancelled
- [x] Add retry policy and idempotency key — task idempotency keys existed in the core schema; PB-020 added retry policy/count/reason/timestamps and manual retry recording
- [ ] Add task templates for recurring operations
- [ ] Add kanban, table and detail views
- [x] Add activity timeline and evidence panel — task detail pages now combine live evidence events with the existing demo activity timeline
- [ ] Add notifications for overdue, failed and approval-waiting tasks

**Acceptance:** A task can move from creation to completion with every state transition and actor recorded.

## Phase 4 — AI runtime

- [x] Implement server-only provider router using configured primary and fallback providers — PB-022 added a server-only governed AI runtime with Gemini/OpenRouter routes from env/model-selection settings and demo-safe deterministic execution.
- [x] Implement structured output schemas with Zod — PB-022 added reusable governed output, risk flag, action, evidence and request schemas.
- [x] Implement reusable `ToolLoopAgent` factory for bounded specialist tasks — PB-022 added a bounded factory that applies configured model, step, timeout and output-token limits.
- [x] Add stop conditions, maximum steps, timeout and cost guardrails — PB-022 enforces configured step count, timeout, output token and per-run cost limits.
- [x] Add provider retry and fallback with error classification — PB-022 classifies auth, timeout, rate-limit, provider, validation and safety errors before fallback.
- [x] Record prompts, redacted inputs, outputs, tool calls, token usage, latency and cost — PB-022 emits audit-ready records and persists them through the append-only audit helper when context is available.
- [x] Add prompt injection and data-exfiltration checks — PB-022 blocks critical injection/exfiltration patterns before provider access.
- [x] Add confidence scoring and mandatory escalation thresholds — PB-022 escalates low-confidence or model-marked outputs using configured thresholds.
- [x] Add model selection settings by role and task type — PB-022 accepts role/task-specific runtime overrides for provider, model and guardrail limits.
- [x] Add evaluation fixtures for each agent role — PB-022 added one structured AI evaluation fixture for every seeded agent role.

**Acceptance:** A test task can run through Gemini, fail safely to OpenRouter, emit validated output and create a complete audit record.

## Phase 5 — Tool registry

- [ ] Define tool contract: key, description, input schema, output schema, risk class, timeout and required approval
- [ ] Implement safe internal tools first: knowledge search, task read/update, approval request, document draft
- [ ] Implement Gmail read and draft tools; sending remains separately approval-gated
- [ ] Implement Google Calendar read and draft-event tools
- [ ] Implement GitHub read, issue-draft and PR-review-draft tools
- [ ] Implement Vercel deployment status and log-read tools
- [ ] Implement Supabase report/query tools using allow-listed operations only
- [ ] Add tool permission checks independent of the language model
- [ ] Add rate limits and integration-specific circuit breakers
- [ ] Add redaction of credentials and sensitive customer data from logs

**Acceptance:** A model cannot call a tool unless both agent permission and workflow policy permit it.

## Phase 6 — Workflow engine and automation

- [x] Implement workflow definitions, versions, steps, conditions and transitions — PB-023 added durable run records, workflow definition snapshots, idempotent step records and controlled run transitions; condition execution remains part of later workflow automation.
- [ ] Use durable workflows for waits, retries, webhook callbacks and long-running operations — PB-023 added database-backed run durability, retry counters, pause/resume metadata and replay snapshots; webhook callback execution remains open.
- [ ] Implement scheduled, manual, event and condition triggers
- [ ] Add step types: agent, human, condition, parallel, delay, webhook, tool, approval and notification
- [x] Add workflow simulator and dry-run mode — PB-005 added dry-run timelines and PB-023 kept them as a reference beside live run state.
- [ ] Add idempotent webhook ingestion and signature verification
- [ ] Add dead-letter handling and replay — PB-023 added replay-from-snapshot support; dead-letter queues remain open.
- [ ] Add visual workflow builder after JSON/database execution is stable
- [x] Add workflow run timeline and step-level logs — PB-023 added append-only workflow run events and step-ledger UI.
- [x] Add pause, resume, cancel and retry controls — PB-023 added server actions, RPC transitions and workflow-console controls.

**Acceptance:** A workflow survives a process failure, resumes from the correct step and never duplicates a protected action.

## Phase 7 — Approval centre

- [x] Implement policy-driven approval creation — PB-021 added tenant-owned approval policies, policy snapshots and required reviewer counts for approval requests
- [ ] Support one-person, multi-person and sequential approvals
- [x] Store evidence, proposed action and exact payload to be executed — approval detail pages now show the exact approved payload and canonical payload hash
- [ ] Add approve, reject, request changes, delegate and expire actions
- [x] Verify approval at execution time; do not trust a model's claim of approval — `staffer.verify_approval_execution` checks approved status, expiry and exact payload hash before protected execution can proceed
- [ ] Add separation-of-duties rules for high-risk actions
- [ ] Add mobile-friendly approval notifications
- [ ] Add immutable decision history and reviewer comments

**Acceptance:** Protected actions are impossible without a valid, unexpired approval record matching the exact action payload.

## Phase 8 — Knowledge and memory

- [ ] Implement document upload, virus scan, metadata and versioning — PB-024 added manual text ingestion, scan-status metadata and append-only document versions; binary upload and real virus scanning remain open.
- [ ] Implement extraction, chunking, embeddings and citation-aware retrieval — PB-024 added text extraction, chunking, full-text retrieval, citation JSON and embedding status tracking; generated embeddings remain open.
- [x] Add collection-level access control and agent permissions — PB-024 added `knowledge_collections` and `knowledge_collection_agents` with agent retrieval enforcement in the search RPC.
- [x] Add source freshness and review dates — PB-024 added review interval, review due, retention and legal-hold metadata.
- [ ] Add retrieval filters by organisation, project, customer and sensitivity — PB-024 enforces organisation boundaries and collection filters; project/customer/sensitivity filters remain open.
- [ ] Separate task memory, customer memory, project memory and company knowledge
- [ ] Require policy or human approval before long-term memory promotion
- [ ] Implement retention, deletion and legal-hold controls — PB-024 added retention dates and legal-hold metadata; deletion/expiry workflows remain open.
- [x] Add answer citations and source preview — PB-024 returns citation JSON and source excerpts from approved chunks.

**Acceptance:** Every knowledge-grounded answer identifies its sources and agents cannot retrieve unauthorised collections.

## Phase 9 — First live workflows

### Customer Support Triage
- [ ] Gmail event creates queued task — PB-025 added a manual intake path plus idempotent `source_message_id` support for Gmail events; Gmail connector ingestion remains open.
- [x] Anna classifies customer, product, category, severity, sentiment, onboarding state, and SLA — PB-025 added settings-driven classification from support message content, product area and tenant severity/category rules.
- [x] Retrieve approved knowledge and similar resolved cases — PB-025 calls the approved knowledge search RPC and stores retrieved citations on each support case; similar resolved-case retrieval remains a later enhancement.
- [x] Anna performs approved first-line troubleshooting and drafts a professional, casual response with no unsupported commitments — PB-025 creates a citation-backed draft response and explicitly blocks customer-visible execution until approval.
- [x] Route banking-application, access, data, security, compliance, or critical-incident concerns to the correct specialist without exposing sensitive information — PB-025 stores escalation targets from tenant routing rules for Anna, Nakamura and Lawal.
- [ ] Nakamura reviews technical accuracy, security, testing, and release risk for high-risk or security-relevant cases — PB-025 flags Nakamura review requirements; actual reviewer decision capture remains open.
- [ ] Lawal reviews data-protection, regulated-industry, policy, evidence, and reportability implications where relevant — PB-025 flags Lawal review requirements; actual compliance review capture remains open.
- [x] Human approves external send — PB-025 creates a pending approval with exact payload hash for the support draft before any customer-visible action can proceed.
- [x] Send or create draft based on organisation policy — PB-025A added the approved Brevo send path for Anna support responses: approval must be recorded, the stored payload is re-verified by `staffer.verify_approval_execution`, Brevo sends server-side, and case/task/workflow/audit evidence is updated. Gmail draft creation remains optional future work.
- [ ] Update task and ask Kristin to convert reusable findings into a draft knowledge-base improvement — PB-025 records task evidence; Kristin documentation follow-up remains open.

### Feature Intake
- [ ] Capture feedback from form, email or manual input
- [ ] Nancy summarises the product problem and expected outcome
- [ ] Mobola drafts requirements and traceability
- [ ] Anderson provides architecture, security impact, and delivery options
- [ ] Raj drafts the implementation plan, delivery slices, dependencies, test approach, and GitHub engineering tasks
- [ ] Nakamura drafts acceptance, security, and release-risk tests
- [ ] Lawal identifies applicable data-protection, CQC, financial-services, ISO, audit, and policy-governance controls
- [ ] Founder approves roadmap or backlog outcome
- [ ] Create GitHub issue with evidence links

### Documentation Lifecycle
- [ ] Trigger from an approved feature, process, policy, release, or resolved support case
- [ ] Kristin identifies the audience, document type, approved sources, owner, sensitivity, and review date
- [ ] Draft the appropriate knowledge article, user guide, policy, SOP, release note, training material, or executive document
- [ ] Mobola validates process and requirement accuracy where operational workflows are involved
- [ ] Nakamura validates security, testing, and release claims where relevant
- [ ] Lawal validates policy, regulatory, data-protection, audit, and compliance claims where relevant
- [ ] Route customer-facing, policy, regulatory, or executive content for human approval
- [ ] Publish a versioned artifact with source citations, ownership, effective date, and next review date
- [ ] Retire or supersede stale content without deleting its audit history

### Growth Campaign Lifecycle
- [ ] Trigger from an approved growth objective, product launch, campaign request, or identified acquisition opportunity
- [ ] Benny defines the target audience, measurable commercial objective, channel mix, attribution plan, and campaign constraints
- [ ] Research search demand, competitors, customer language, and approved product evidence before drafting claims
- [ ] Draft SEO plan, lead-generation assets, content, email sequence, and sales-enablement materials using approved sources
- [ ] Validate consent, suppression lists, sensitive-data handling, brand standards, pricing claims, and regulatory requirements
- [ ] Lawal reviews data-protection, regulated-industry, policy, evidence, and retention implications before external launch where relevant
- [ ] Route paid spend, bulk sends, external launch, discounts, partnerships, and commercial commitments for human approval
- [ ] Launch only through approved integrations with idempotency, audit logging, rate limits, and unsubscribe controls
- [ ] Measure traffic, qualified leads, conversion, attribution, pipeline contribution, cost, and lessons for the next campaign

### Compliance Assurance Lifecycle
- [ ] Trigger from a new product, process, vendor, policy, material change, audit request, complaint, incident, or regulatory obligation
- [ ] Lawal identifies the applicable UK GDPR, data-protection, CQC, financial-services, ISO, contractual, audit, and policy-governance obligations
- [ ] Classify personal data, special-category data, regulated activity, processing purpose, lawful basis, retention, sharing, transfer, and evidence needs
- [ ] Map obligations to current controls, accountable owners, systems, records, deadlines, and residual risks
- [ ] Draft the required DPIA, policy change, evidence register, control test, vendor review, remediation plan, or executive compliance brief
- [ ] Obtain specialist input from Anderson for architecture, Nakamura for security and testing, Mobola for process design, and Kristin for controlled documentation
- [ ] Require human approval for formal sign-off, policy publication, risk acceptance, regulatory communication, external commitments, or sensitive-data actions
- [ ] Record the exact decision, evidence, reviewer, owner, due date, residual risk, effective date, and next review date
- [ ] Monitor remediation, overdue actions, evidence freshness, and material changes without silently closing compliance gaps

### Daily Command Brief
- [ ] Scheduled weekday trigger based on organisation timezone
- [ ] Nathan gathers overdue tasks, risks, approvals, customer signals, and delivery status
- [ ] Produce concise decisions, actions and watch-list
- [ ] Deliver internally through selected channel

### Development Delivery Lifecycle
- [ ] Trigger from an approved GitHub issue, defect, remediation, or technical task
- [ ] Raj confirms approved scope, acceptance criteria, architecture decisions, dependencies, data impact, and required controls
- [ ] Inspect the existing codebase and create an isolated implementation plan before editing
- [ ] Implement the smallest complete vertical increment with no hardcoded secrets, models, URLs, policies, schedules, tenant IDs, or approval rules
- [ ] Run unit, integration, lint, type, build, accessibility, security, migration, and rollback checks appropriate to the change
- [ ] Prepare a pull request containing evidence, screenshots where relevant, migration notes, environment changes, risks, and rollback instructions
- [ ] Obtain review from Anderson, Nakamura, Lawal, Nancy, Mobola, Kristin, or a human approver according to the affected domain
- [ ] Merge and deploy only through approved automation, then verify health and record audit evidence

### Release Readiness Gate
- [ ] Trigger from GitHub/Vercel release state
- [ ] Raj supplies the approved pull request, implementation evidence, tests, migration notes, and rollback plan
- [ ] Run quality, security, migration and rollback checks
- [ ] Lawal reviews regulatory, data-protection, policy, evidence, and audit impacts for regulated or high-risk releases
- [ ] Collect required approvals
- [ ] Record release decision and evidence

## Phase 10 — Governance, observability and quality

- [ ] Append-only audit log with tamper-evident hashing
- [ ] Cost dashboard by provider, model, agent, workflow and organisation
- [ ] Latency, success, retry, fallback and tool-failure metrics
- [ ] Agent quality evaluations and human feedback scores
- [ ] Prompt and agent-version A/B evaluation framework
- [ ] Security event logging and alerting
- [ ] Data-protection impact assessment template
- [ ] Backup, restore and disaster-recovery runbook
- [ ] Data export and account deletion workflow
- [ ] UK GDPR privacy, retention and processor records

## Future features

- [ ] Customer-facing agent marketplace
- [ ] Custom agent builder with safe templates
- [ ] Voice briefings and spoken task assignment
- [ ] Mobile application for approvals and command briefs
- [ ] Multi-company management for KOP Technology clients
- [ ] Billing, subscriptions and usage quotas
- [ ] Agent performance reviews and coaching plans
- [ ] Organisation-specific skill packs
- [ ] Sandbox for testing new agents against synthetic data
- [ ] Workflow template library
- [ ] Human staff directory and mixed human/AI teams
- [ ] Delegation calendar and capacity planning
- [ ] SLA and service-credit workflow support
- [ ] Incident command room with timeline generation
- [ ] Document generation and branded export centre
- [ ] Customer portal for transparent agent-assisted service

## Definition of done for every requirement

1. Secure implementation is complete.
2. Unit/integration tests cover success and failure paths.
3. RLS and permission tests pass where data is involved.
4. Loading, empty, error and confirmation UX exists.
5. Audit events are emitted for material actions.
6. Documentation and environment templates are updated.
7. `npm run lint` and `npm run build` pass.
8. The corresponding checkbox in this file is updated with a concise implementation note.
