# ProJED AI Docs Index

Last updated: 2026-05-18

## Canonical Documents

Use these as the current source of truth:

- [11_SUPABASE_GEMINI_MIGRATION_TASK.md](./11_SUPABASE_GEMINI_MIGRATION_TASK.md): Master status, next steps, and P9 Gemini/RAG direction.
- [12_P9_GEMINI_RAG_DESIGN.md](./12_P9_GEMINI_RAG_DESIGN.md): P9 retrieval contract, indexing flow, citation rules, and local prototype scope.
- [10_P8_PRODUCTION_CUTOVER_EXECUTION.md](./10_P8_PRODUCTION_CUTOVER_EXECUTION.md): P8 execution runbook for OAuth smoke, cleanup, credential rotation, and final readiness gate.
- [archive/09_P7_PRODUCTION_RELEASE_GATE.md](./archive/09_P7_PRODUCTION_RELEASE_GATE.md): P7 strict release gate definition. Historical, but still useful because P8 wraps P7 strict checks.
- [04_SUPABASE_MIGRATION_PLAN.md](./04_SUPABASE_MIGRATION_PLAN.md): Supabase migration architecture and RAG guardrails.
- [01_SYSTEM_CONTEXT.md](./01_SYSTEM_CONTEXT.md): Product/system context.
- [02_ARCHITECTURE_RULES.md](./02_ARCHITECTURE_RULES.md): General architecture rules.
- [03_VALIDATION_PLAN.md](./03_VALIDATION_PLAN.md): General app validation plan.

## Historical Phase Notes

These are retained as historical delivery records. Do not treat them as the latest operating runbook unless the master task file points to them.

- [archive/05_QC_VERIFICATION_REPORT.md](./archive/05_QC_VERIFICATION_REPORT.md): P3-era QC report. Runtime blockers have since moved into P7/P8 gates.
- [archive/06_SUPABASE_RUNTIME_GATE.md](./archive/06_SUPABASE_RUNTIME_GATE.md): Early runtime gate definition. Current execution is covered by P7/P8.
- [archive/07_P4_SUPABASE_APP_INTEGRATION.md](./archive/07_P4_SUPABASE_APP_INTEGRATION.md): P4 implementation note.
- [archive/08_P6_SUPABASE_CUTOVER_READINESS.md](./archive/08_P6_SUPABASE_CUTOVER_READINESS.md): P6 readiness note. Current release sign-off is covered by P7/P8.
- [archive/12_JED_DEV_RULES_LEGACY.md](./archive/12_JED_DEV_RULES_LEGACY.md): Archived copy of legacy JED agent/development rules. The original remains in the external `Jed-Standard-Rules` submodule so the submodule stays clean; current project rules are consolidated in `01`-`03`.

## Duplication Review

The folder had useful but overlapping content:

- `05_QC_VERIFICATION_REPORT.md` and `06_SUPABASE_RUNTIME_GATE.md` both describe early runtime validation. Keep `05` as evidence and `06` as historical gate design; use P7/P8 for current execution.
- `08_P6_SUPABASE_CUTOVER_READINESS.md`, `09_P7_PRODUCTION_RELEASE_GATE.md`, and `10_P8_PRODUCTION_CUTOVER_EXECUTION.md` all mention OAuth, linked DB checks, and production cutover. Use `10` as the current P8 runbook.
- `04_SUPABASE_MIGRATION_PLAN.md` and `11_SUPABASE_GEMINI_MIGRATION_TASK.md` both discuss Gemini/RAG. Use `04` for architecture, and `11` for current task status and next decisions.
- `Jed-Standard-Rules/JED_DEV_RULES.md` is an external submodule document. A project-owned archive copy is kept as `archive/12_JED_DEV_RULES_LEGACY.md`; the submodule source remains unchanged.

## Excluded From AI Docs

These files were found during the project-wide document scan but are not AI-facing docs:

- `README.md`: public project entrypoint. It now points readers to `.ai-docs/`.
- `dev_output.txt`: runtime error output.
- `out.txt`: empty output file.
- `src/components/ListView_old.txt`: old code backup, not documentation.

## Current State

- P1-P7 engineering work is complete.
- P8 production readiness has passed against the selected production Supabase project.
- Runtime credentials and manual confirmations are available locally through ignored env files.
- P9 Gemini/RAG design and local prototype may continue after P8 sign-off.

## Current Next Command

To revalidate the production Supabase cutover gate, run:

```powershell
npm.cmd run verify:supabase:p8-production-readiness
```

P8 is complete. Future runs should continue returning `ok: true`.
