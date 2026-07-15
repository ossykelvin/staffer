# Staffer Interaction Contract

This contract defines what every visible primary action does in demo mode. It exists so the product behaves like a real application before live Supabase repositories, audit events, and workflow execution are enabled.

## Global rule

No external action, production action, financial action, permission change, deletion, or public communication executes in demo mode. Buttons for those actions must either navigate to a review surface, stage a non-persistent demo result, or show a blocked state explaining the missing live prerequisite.

## Routes

| Route | Purpose | Primary interactions |
| --- | --- | --- |
| `/` | Command centre | Open task board, open task details, open staff profiles |
| `/agents` | Staff directory | Open agent profiles |
| `/agents/[id]` | Agent profile | Read biography, skills, tools, and approval boundaries |
| `/tasks` | Task board | Open task details, create a demo task |
| `/tasks/new` | Demo task creation | Validate and stage a non-persistent task confirmation |
| `/tasks/[id]` | Task detail | Review metadata, approval path, evidence, and activity |
| `/workflows` | Workflow studio | Open workflow details; creation is blocked until live repositories exist |
| `/workflows/[id]` | Workflow detail | Review trigger, steps, dry-run timeline, and execution blockers |
| `/approvals` | Approval centre | Open approval detail before any decision |
| `/approvals/[id]` | Approval detail | Stage demo approve, reject, request changes, or expire decisions |
| `/knowledge` | Knowledge hub | Review collections; upload is blocked until ingestion and access control exist |
| `/integrations` | Integrations | Review planned connectors; configuration is blocked until encrypted settings exist |
| `/settings` | Settings | Review public bootstrap config and implementation status |

## Demo-state behavior

- Demo task creation never writes to a database.
- Demo approval decisions never execute the protected payload.
- Workflow dry-runs are deterministic display data, not AI-generated execution.
- Empty, loading, error, and not-found states must be visible and explain whether the blocker is demo data, configuration, auth, or unavailable live services.

## Live-mode prerequisites

Before any demo-only action becomes live-backed, Staffer needs tenant repositories, Supabase Auth, verified RLS, and append-only audit events for the affected mutation.
