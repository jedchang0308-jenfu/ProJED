# Supabase Runtime Gate

This gate verifies the migration beyond source-level checks. It must pass before ProJED cuts over from Firebase/Firestore to Supabase/PostgreSQL.

## Source-Level Gate

Run these checks on every migration change:

```bash
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run verify:supabase:static
```

Expected result:

- ESLint exits with code 0. Warnings are allowed unless release policy changes.
- TypeScript exits with code 0.
- Vite production build exits with code 0.
- Static Supabase verification finds required tables, RLS policies, RPCs, and RAG guardrails in the migration SQL.

## Runtime Gate

Run these once a local or preview Supabase database is available:

```bash
npx.cmd supabase db push --dry-run
npx.cmd supabase db lint --linked --fail-on error
npx.cmd supabase test db
```

The runtime smoke test lives at:

```text
supabase/tests/202605140002_rls_rag_smoke.sql
```

It validates:

- Required schema objects exist.
- WBS RLS policies exist.
- Embedding write policy is service-role separated.
- Tenant A cannot read or write Tenant B WBS data.
- Tenant A cannot read Tenant B RAG documents.
- Disabled RAG documents are excluded from retrieval preconditions.
- LLM access logs can only be written for the current tenant/user.

## Cutover Decision

Source-level pass is enough to continue development.

Production cutover remains blocked until:

- The migration applies cleanly to a disposable Supabase database.
- The runtime smoke test passes.
- A Firestore export/import rehearsal confirms row counts and parent/dependency resolution.
- Supabase Auth or the chosen transitional auth bridge is confirmed, because RLS depends on `auth.uid()`.
