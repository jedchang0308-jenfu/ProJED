# ProJED Supabase / Gemini Migration Task

Last updated: 2026-05-20

## Document Role

This is the master task tracker for Supabase cutover and future Gemini/RAG work.

Related documents:

- [00_DOCS_INDEX.md](./00_DOCS_INDEX.md): Document map and duplication review.
- [04_SUPABASE_MIGRATION_PLAN.md](./04_SUPABASE_MIGRATION_PLAN.md): Supabase and RAG architecture baseline.
- [10_P8_PRODUCTION_CUTOVER_EXECUTION.md](./10_P8_PRODUCTION_CUTOVER_EXECUTION.md): Current P8 execution runbook.

## Goal

Move ProJED from the current Firebase-centered architecture toward Supabase PostgreSQL, while preserving a path for future Gemini / LLM RAG integration.

The target architecture must support:

- Multi-tenant project and WBS data isolation.
- PostgreSQL-backed WBS, project, dependency, member, audit, and RAG-ready document data.
- Supabase Auth / RLS enforcement before production cutover.
- Gemini-compatible retrieval through tenant-aware APIs, RPCs, or future Edge Functions.
- Traceable RAG citations through `document_id`, `chunk_id`, source table, and source row identifiers.

## Current Status

- [x] P1: Supabase migration direction and schema scope defined.
- [x] P2: Multi-tenant model and WBS/RAG table direction defined.
- [x] P3: Source-level migration gate passed.
- [x] P3: Runtime database gate identified as environment-dependent.
- [x] P4: Supabase app integration path implemented.
- [x] P5: Runtime Supabase CRUD smoke path implemented and previously validated when runtime env was available.
- [x] P6: Supabase cutover readiness checks implemented.
- [x] P7: Production release gate implemented.
- [x] P7: Secret hygiene gate passes with zero findings.
- [x] P8: Browser OAuth smoke tooling implemented.
- [x] P8: Browser smoke cleanup tooling implemented.
- [x] P8: Credential rotation verifier implemented.
- [x] P8: Local env loader implemented for `.env.p8.local`, `.env.local`, `.env.development.local`, `.env.production.local`, and `.env`.
- [x] P8: P7 release gate accepts P8 manual confirmation aliases.
- [x] P8: Production readiness preflight implemented for missing credentials, placeholder values, and manual confirmations.
- [x] P8: Strict production readiness gate passed.
- [x] P8: Real browser Google OAuth smoke completed and confirmed.
- [x] P8: Credential rotation completed and confirmed.
- [x] P8: Linked Supabase DB lint and RLS/RAG smoke revalidated with current credentials.
- [x] P8: Supabase CLI link updated to the selected production project `knodlkxqpcqyrtgwpdst`.
- [x] P8: Baseline Supabase migration applied to the selected production project.
- [x] P8: New Supabase key format validated (`sb_publishable` public key and `sb_secret` admin key).
- [x] P9: Gemini/RAG retrieval integration design drafted for non-production development.
- [x] P9: Local WBS-to-RAG prototype started without Gemini/Supabase runtime calls.
- [x] P9: Local RAG indexing plan implemented for WBS documents, versions, chunks, embedding inputs, and sync jobs.
- [x] P9: Trusted embedding worker scaffold implemented with Gemini REST provider and dry-run smoke coverage.
- [x] P9: Retrieval Edge Function boundary implemented with tenant-scoped RPC citations, browser-facing RAG UI, no service-role/browser Gemini calls, and strengthened edge verification.
- [x] P8: Firebase CLI reauthenticated and verified production build deployed to Firebase Hosting.

## Latest QC Result

`npm.cmd run verify:supabase:p8-production-readiness` passes against the selected production Supabase project `knodlkxqpcqyrtgwpdst`.

Firebase Hosting deployment completed for project `projed-cc78d`.

Confirmed passing:

- `verify:source`
- `verify:supabase:static`
- `verify:supabase:p7-secret-hygiene`
- `verify:supabase:p8-production-readiness`
- `verify:p9-rag-local`
- `verify:p9-edge-function`

Current blockers:

- None for P8 production readiness.
- None for Firebase Hosting deployment.

## Immediate Next Step

Continue P9 Gemini/RAG development with runtime smoke against the local Supabase Edge Function, then validate citation navigation from retrieved WBS sources back into the task detail modal.

## P8 Final Gate

After OAuth smoke, cleanup, linked DB checks, and credential rotation are complete, run:

```powershell
npm.cmd run verify:supabase:p8-production-readiness
```

P8 can be marked complete only when this command returns `ok: true`.

## P9 Direction: Gemini / RAG

P9 design and local prototype work may continue after P8 production readiness sign-off.

Current P9 design:

- [12_P9_GEMINI_RAG_DESIGN.md](./12_P9_GEMINI_RAG_DESIGN.md)

P9 should focus on:

- Tenant-aware retrieval API contract.
- Gemini embedding model choice and vector dimension confirmation.
- Chunking policy for WBS items, project notes, risks, decisions, and uploaded files.
- Citation format for `document_id`, `chunk_id`, source table, and source row.
- Reindex job flow using `rag_sync_jobs`.
- External object mapping using `external_rag_objects` if Gemini File Search is used.
- Service-role-only embedding writes with authenticated read paths through RLS-safe RPCs.

## Key Tables

Core tenancy:

- `profiles`
- `tenants`
- `tenant_members`

Project and WBS:

- `projects`
- `project_members`
- `wbs_items`
- `wbs_dependencies`

RAG-ready data:

- `documents`
- `document_versions`
- `document_chunks`
- `document_embeddings`
- `rag_sync_jobs`
- `external_rag_objects`

Audit and observability:

- `activity_events`
- `audit_logs`
- `llm_access_logs`

## Risk Register

- [ ] P8 cannot be signed off without real Supabase runtime credentials.
- [ ] Browser OAuth smoke must be performed in a real browser; source-level checks are not a substitute.
- [ ] Credential rotation evidence is weaker if old credentials are unavailable and only manual confirmation is used.
- [ ] RAG APIs must not expose raw cross-tenant table access.
- [ ] Embedding writes must remain service-role-only or otherwise tightly controlled.
- [ ] Gemini integration must preserve citation traceability back to ProJED records.
