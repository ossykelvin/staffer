# Staffer

All Our Staff.

Staffer is a modern, governed AI staff operations platform for KOP Technology. This package is designed as a working visual scaffold and a precise handoff to Codex.

## Included

- Command Centre dashboard
- Human-like AI staff directory with ten founder-confirmed detailed profiles
- Task board, workflow studio and approval centre
- Knowledge, integrations and settings surfaces
- Config-driven agent and workflow seed data
- Gemini-primary / OpenRouter-fallback adapter scaffold
- Supabase SSR client scaffold
- Supabase schema, indexes and RLS baseline
- Codex instructions, detailed roadmap and profile questionnaire

## Run locally

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify

```bash
npm run lint
npm run build
```

## Codex handoff

Tell Codex:

> Read `AGENTS.md`, `ROADMAP.md`, `AGENT_PROFILE_QUESTIONNAIRE.md`, and the Supabase migration before changing code. Work through the roadmap in order, preserve demo mode, and update roadmap checkboxes only after lint, tests and build pass.

## Configuration

No credentials are committed. Copy `.env.local.example` and supply local values. Mutable agent profiles and workflows should move from the seed JSON files into Supabase during Phase 1 and Phase 2.
