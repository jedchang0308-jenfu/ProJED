# P6 Supabase Cutover Readiness

P6 prepares the Supabase path for release-gate validation. It does not declare production cutover complete; it adds the remaining guardrails needed before a browser OAuth E2E and credential rotation sign-off.

## Scope

- Stabilize Supabase Google OAuth redirect handling.
- Add an automated Supabase readiness gate for project/key/redirect sanity checks.
- Keep Firebase as the default backend unless `VITE_DATA_BACKEND=supabase` is explicitly selected.
- Preserve the P5 preview runtime gates for RLS, RAG smoke, authenticated CRUD, and legacy ID mapping.

## Code Changes

- `src/services/authService.ts`
  - Supabase Google OAuth now redirects to `VITE_SUPABASE_AUTH_REDIRECT_URL` when configured.
  - If no redirect URL is configured, the app falls back to `window.location.origin + window.location.pathname`.
  - This avoids passing transient query strings, modal deep-link parameters, or stale OAuth callback parameters back into the next OAuth request.

- `src/vite-env.d.ts`
  - Adds typed Vite env vars for `VITE_DATA_BACKEND`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_AUTH_REDIRECT_URL`.

- `scripts/p6-supabase-readiness.mjs`
  - Validates Supabase URL shape.
  - Validates anon/service role JWT roles and project-ref consistency.
  - Verifies service-role admin API reachability.
  - Generates a Supabase Google OAuth authorize URL with the configured redirect URL.
  - Fails if the generated OAuth URL does not preserve `SUPABASE_AUTH_REDIRECT_URL`.

## Environment

Frontend:

```bash
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_AUTH_REDIRECT_URL=https://your-app-domain.example/
```

P6 readiness script:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_AUTH_REDIRECT_URL=https://your-app-domain.example/
```

Use `http://localhost:5173/` only for local browser testing. Production redirect URLs must use HTTPS.

## Verification

Run:

```bash
npm.cmd run verify:source
npm.cmd run verify:supabase:p5-crud
npm.cmd run verify:supabase:p6-readiness
```

Recommended linked database gate:

```bash
npx.cmd supabase db lint --linked --fail-on error
npx.cmd supabase db query --linked -f supabase/tests/202605140002_rls_rag_smoke.sql -o table
```

## Manual Release Gate

P6 still requires one manual/browser gate before production cutover:

- Configure Supabase Dashboard Google provider.
- Add the exact redirect URL to Supabase Auth redirect allow list.
- Add the same redirect URL to Google Cloud OAuth authorized redirect settings.
- Start the app with `VITE_DATA_BACKEND=supabase`.
- Sign in with Google in a real browser.
- Confirm a Supabase session exists.
- Create a workspace, board, WBS item, child item, and dependency.
- Sign out and confirm protected data is no longer accessible.

## Decision

P6 can be marked complete when:

- Source gate passes.
- P5 CRUD smoke still passes.
- P6 readiness gate passes.
- Linked DB lint and RLS/RAG smoke pass.
- Manual Google OAuth E2E passes.
- Exposed preview credentials are rotated or revoked.

Until the manual OAuth E2E and credential rotation are complete, the correct status is:

`P6 engineering readiness complete; production cutover not yet signed off.`
