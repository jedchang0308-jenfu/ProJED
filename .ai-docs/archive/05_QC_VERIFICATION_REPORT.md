# ProJED Supabase Migration QC Verification Report

Date: 2026-05-14
Branch: `codex/transfer_to_supabase`

## Scope

This report covers the current Supabase migration baseline:

- Supabase schema migration
- Supabase TypeScript client and adapter
- Existing React/Vite build health
- TypeScript static validation
- ESLint validation after the lint configuration fix

## Result Summary

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run lint` | Pass with warnings | No lint errors. Existing warnings remain in React hooks, unused variables, purity, and Fast Refresh rules. |
| `npx.cmd tsc --noEmit` | Pass | Supabase type issues are resolved. |
| `npm.cmd run build` | Pass | Build completes. Existing Vite warnings remain for chunk size and mixed static/dynamic imports. |
| `npm.cmd run verify:supabase:static` | Pass | Verifies required migration tables, RLS policy names, RPCs, pgvector index, and RAG guardrails exist in SQL. |
| `npm.cmd run verify:source` | Pass | Runs lint, TypeScript, production build, and Supabase static verification as one source-level gate. |
| Supabase CLI availability | Pass via `npx.cmd supabase` | CLI version `2.98.2` can run through `npx`. |
| Local Supabase DB lint | Blocked | `npx.cmd supabase db lint --local --fail-on error` cannot connect to local Postgres at `127.0.0.1:54322`. |
| Local migration apply test | Blocked | Docker, `psql`, and a local Supabase database are not available in this environment. |
| Remote migration apply test | Not run | Requires Supabase project connection details or linked CLI project. |
| RLS cross-tenant test | Not run | Requires a live Supabase database with test users/sessions. |
| RAG RPC runtime test | Not run | Requires a live database with `pgvector` enabled and test embeddings. |

## Verified Commands

```bash
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run verify:supabase:static
npm.cmd run verify:source
npx.cmd supabase --version
npx.cmd supabase db lint --local --fail-on error
```

## Current Pass Criteria

The codebase currently passes the local source-level gate:

- ESLint exits successfully.
- TypeScript exits successfully.
- Vite production build exits successfully.
- Supabase adapter is type-checkable.
- `@supabase/supabase-js` no longer blocks project-level static validation.
- The Supabase migration has a static source gate for required schema/RLS/RAG objects.

## Runtime Test Assets

The next-stage runtime SQL smoke test has been added:

```text
supabase/tests/202605140002_rls_rag_smoke.sql
```

This test is intended for a disposable local or preview Supabase database after migrations are applied. It checks table/function presence, WBS RLS policies, embedding write separation, cross-tenant WBS isolation, RAG document isolation, disabled RAG document behavior, and LLM access log tenant boundaries.

## Remaining Warnings

Warnings are present but are not new blockers for this Supabase migration baseline:

- React hook dependency warnings
- Conditional hook usage warnings in existing components
- Unused imports and variables
- React purity warnings around synchronous state updates and `Date.now`
- Fast Refresh export warnings
- Vite chunk-size warning
- Vite warning for `useWbsStore` being both dynamically and statically imported

These should be tracked separately from the Supabase migration work unless the release gate requires a zero-warning lint policy.

## Blocked External Validation

The following checks need an actual Supabase/Postgres runtime:

- Apply `supabase/migrations/202605140001_initial_projed_schema.sql`
- Run Supabase database lint against a live or local database
- Execute `supabase/tests/202605140002_rls_rag_smoke.sql`
- Verify `match_project_knowledge` end-to-end with real `vector(3072)` rows and Gemini embeddings
- Verify `service_role`-only write paths for embeddings and sync jobs

Local validation is blocked because this machine currently has no usable local database stack:

- `docker` is not available
- `psql` is not available
- Supabase local Postgres is not running on `127.0.0.1:54322`

## Recommended Next Gate

Run these checks once a Supabase project or local Supabase stack is available:

```bash
npx.cmd supabase link --project-ref <project-ref>
npx.cmd supabase db push --dry-run
npx.cmd supabase db lint --linked --fail-on error
```

Then execute RLS tests with at least:

- User A in Tenant A
- User B in Tenant B
- User C with no tenant membership
- Service-role migration client

## QC Decision

Current decision: `Pass for source-level migration baseline`.

Release decision for production Supabase cutover: `Blocked until live database migration, RLS, and RAG runtime tests pass`.
