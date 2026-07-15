# Codex Handoff Prompt

Paste the following into Codex from the project root:

> You are completing the Staffer first draft for KOP Technology. Read `AGENTS.md`, `ROADMAP.md`, `README.md`, `AGENT_PROFILE_QUESTIONNAIRE.md`, all seed JSON files, and `supabase/migrations/0001_staffer_core.sql` before editing. Preserve the modern KOP blue design and demo mode. Implement roadmap requirements in dependency order with secure tenant-aware Supabase access, Gemini primary and OpenRouter fallback, narrow server-enforced tools, approval-gated protected actions, and complete audit logging. Do not hardcode secrets, models, provider selection, thresholds, schedules, tenant IDs, branding or approval policies. After each coherent milestone, run tests, `npm run lint`, and `npm run build`; update only the corresponding roadmap checkboxes and add concise implementation notes.
