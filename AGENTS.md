# Codex Operating Instructions — Staffer

Codex must read this file and `ROADMAP.md` before making changes.

## Mission
Build Staffer into a secure, governed AI staff operations platform for KOP Technology. Preserve the operating model:

`trigger → task → agent → review → approval → action → audit`

## Non-negotiable rules

1. Do not hardcode secrets, provider names, model IDs, thresholds, branding, tenant IDs, URLs, approval rules or schedules in UI or business logic.
2. Use `.env.local` for secrets and bootstrap settings. Move mutable runtime configuration into Supabase settings tables.
3. Gemini is the primary provider and OpenRouter is the fallback unless environment configuration says otherwise.
4. Every exposed Supabase table must have RLS and explicit tenant-aware policies.
5. Never expose Supabase secret/service-role keys to browser code.
6. External emails, public publishing, production changes, deletion, financial actions and permission changes require recorded approval by default.
7. Agent tools must be narrow and server-enforced. Never provide unrestricted SQL, shell, file deletion, email sending or production access.
8. Keep agent profiles and skills data-driven. Do not embed profiles in React components.
9. Store every agent run, tool call, approval decision, failure and material data mutation in an append-only audit trail.
10. Build accessible, responsive interfaces with clear empty, loading, error and confirmation states.
11. Run `npm run lint` and `npm run build` before marking any requirement complete.
12. Update the checklist in `ROADMAP.md` as work is completed. Include commit references or implementation notes beside completed items.

## Working method

- Complete requirements in roadmap order unless a dependency requires otherwise.
- Prefer small, reviewable commits.
- Add tests with every service or policy implementation.
- Use Server Components by default and isolate client interactivity.
- Initialise external SDKs lazily inside server-only functions.
- Validate all environment variables and all agent-generated structured output.
- Keep demo mode working until live data parity is proven.

## Initial commands

```bash
cp .env.local.example .env.local
npm install
npm run dev
npm run lint
npm run build
```

## Important source files

- `src/config/agents.seed.json` — draft agent identities, skills and permission boundaries
- `src/config/workflows.seed.json` — first workflow definitions
- `src/lib/ai/provider.ts` — provider adapter scaffold
- `src/lib/supabase/server.ts` — Supabase server-client scaffold
- `supabase/migrations/0001_staffer_core.sql` — initial database design
- `AGENT_PROFILE_QUESTIONNAIRE.md` — founder input still required
- `ROADMAP.md` — authoritative implementation backlog
