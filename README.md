# ProJED

ProJED is a WBS/project planning application.

AI-facing project context, architecture rules, validation plans, and Supabase/Gemini migration notes are consolidated in `.ai-docs/`.

Start with:

- `.ai-docs/00_DOCS_INDEX.md`
- `.ai-docs/11_SUPABASE_GEMINI_MIGRATION_TASK.md`
- `.ai-docs/10_P8_PRODUCTION_CUTOVER_EXECUTION.md`

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
```

## Supabase Migration

Current Supabase/PostgreSQL migration references:

- `supabase/migrations/202605140001_initial_projed_schema.sql`
- `.ai-docs/04_SUPABASE_MIGRATION_PLAN.md`
- `.ai-docs/10_P8_PRODUCTION_CUTOVER_EXECUTION.md`
- `.ai-docs/11_SUPABASE_GEMINI_MIGRATION_TASK.md`
- `src/services/supabase/`

Historical phase notes are archived under `.ai-docs/archive/`.

Use `VITE_DATA_BACKEND=firebase` for the current safe default, or `VITE_DATA_BACKEND=supabase` to exercise the Supabase adapter. Supabase mode also requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_AUTH_REDIRECT_URL`, the P3 migration applied, and an auth path compatible with RLS.

Browser diagnostics must stay disabled unless running the P8 manual OAuth smoke:

```bash
VITE_ENABLE_SUPABASE_DIAGNOSTICS=true
```

Production Supabase cutover remains blocked until P8 production readiness passes.
