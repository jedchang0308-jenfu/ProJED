# P7 Production Release Gate

P7 converts the remaining production blockers into an executable release gate. It builds on P5 and P6; it does not replace their runtime checks.

## Scope

- Keep the P5 authenticated Supabase CRUD smoke as a regression gate.
- Keep the P6 Supabase/OAuth readiness check as a configuration gate.
- Keep linked DB lint and RLS/RAG smoke inside the release gate when Supabase CLI credentials are available.
- Add repo-level Supabase secret hygiene scanning.
- Add a single release gate command that reports automated, skipped, pending, and failed gates.
- Require explicit human confirmation for browser Google OAuth E2E and credential rotation before production sign-off.

## Commands

Automated secret hygiene:

```bash
npm.cmd run verify:supabase:p7-secret-hygiene
```

Release gate, non-strict:

```bash
npm.cmd run verify:supabase:p7-release-gate
```

Non-strict mode is useful during development. It runs available automated checks and reports missing environment or manual items as `skip` / `pending` instead of failing the whole command.

Release gate, strict:

```bash
npm.cmd run verify:supabase:p7-release-gate -- --strict
```

Strict mode is for production sign-off. It fails unless all required environment variables are present and all manual gates are explicitly confirmed.

## Required Environment For Strict Mode

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_AUTH_REDIRECT_URL=https://your-app-domain.example/
P7_BROWSER_OAUTH_E2E_CONFIRMED=true
P7_CREDENTIAL_ROTATION_CONFIRMED=true
```

## Manual Browser OAuth E2E

Before setting `P7_BROWSER_OAUTH_E2E_CONFIRMED=true`, complete this in a real browser:

1. Configure Supabase Google provider.
2. Add the exact redirect URL to Supabase Auth redirect allow list.
3. Add the same redirect URL to Google Cloud OAuth authorized redirect URIs.
4. Start the app with `VITE_DATA_BACKEND=supabase`.
5. Sign in with Google.
6. Confirm the app returns from callback with a Supabase session.
7. Create a workspace, board, parent WBS item, child WBS item, and dependency.
8. Refresh the browser and confirm the data remains available.
9. Sign out and confirm protected data is no longer accessible.

## Credential Rotation Gate

Before setting `P7_CREDENTIAL_ROTATION_CONFIRMED=true`, rotate or revoke credentials that appeared during preview validation:

- Supabase personal access token.
- Preview database password.
- Supabase anon key.
- Supabase service role key.

Do not paste the new values into reports, markdown files, source files, shell history examples, or screenshots.

## Decision

P7 engineering work is complete when:

- `verify:supabase:p7-secret-hygiene` passes.
- `verify:supabase:p7-release-gate` runs and reports the remaining manual gates clearly.
- Existing P5/P6 automated checks continue to pass when their environment variables are supplied.

Production release sign-off requires:

- `verify:supabase:p7-release-gate -- --strict` passes.
- Linked DB lint passes as part of strict release gate.
- Linked RLS/RAG smoke passes as part of strict release gate.

Until strict mode and linked DB gates pass, the correct status is:

`P7 release gate implemented; production cutover not signed off.`
