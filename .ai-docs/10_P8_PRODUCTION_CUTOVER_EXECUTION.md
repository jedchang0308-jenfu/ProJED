# P8 Production Cutover Execution

P8 turns the remaining P7 manual blockers into repeatable operating steps. It does not change the Supabase schema. It adds browser-only diagnostics for real Google OAuth smoke testing, cleanup for smoke data, and credential rotation verification.

## Scope

- Verify Google OAuth in a real browser against the Supabase backend.
- Create a small authenticated tenant/project/WBS/dependency smoke record through RLS.
- Remove P8 smoke records with service role credentials.
- Verify the currently configured Supabase keys work and the old exposed credentials no longer work.
- Provide a strict readiness wrapper before production cutover.

## Local Environment

The P5-P8 verification scripts automatically load local environment files in this order:

- `.env.p8.local`
- `.env.local`
- `.env.development.local`
- `.env.production.local`
- `.env`

These files are ignored by git. They can use either dotenv syntax or PowerShell syntax:

```powershell
SUPABASE_URL=https://your-project-ref.supabase.co
$env:SUPABASE_ANON_KEY="your-current-anon-key"
```

The loader also maps `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_AUTH_REDIRECT_URL` to the matching server-side `SUPABASE_*` names when the server-side names are not already set.

## Browser OAuth Smoke

Use this only for a manual browser validation window.

```powershell
$env:VITE_DATA_BACKEND="supabase"
$env:VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="your-current-anon-key"
$env:VITE_SUPABASE_AUTH_REDIRECT_URL="http://localhost:5173/"
$env:VITE_ENABLE_SUPABASE_DIAGNOSTICS="true"
npm.cmd run dev
```

After Google login completes in the browser, open DevTools and run:

```js
await window.ProJEDSupabaseDiagnostics.session()
await window.ProJEDSupabaseDiagnostics.runSmoke()
```

Pass criteria:

- `session()` returns `authenticated: true`.
- `runSmoke()` returns `status: "pass"`.
- The result includes tenant, project, parent WBS item, child WBS item, and dependency IDs.
- `cleanupRequired` is `true`.

Turn diagnostics off after the test:

```powershell
$env:VITE_ENABLE_SUPABASE_DIAGNOSTICS="false"
```

## Browser Smoke Cleanup

The browser smoke creates data as the authenticated user. Cleanup uses service role credentials so it can remove the tagged tenant and all cascading test data.

```powershell
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-current-service-role-key"
npm.cmd run verify:supabase:p8-browser-cleanup
```

To check without deleting:

```powershell
npm.cmd run verify:supabase:p8-browser-cleanup -- --dry-run
```

To fail if any P8 browser smoke tenant remains:

```powershell
npm.cmd run verify:supabase:p8-browser-cleanup -- --dry-run --fail-on-found
```

## Credential Rotation Verification

Use current credentials plus old credentials if available. The script never prints secrets; it reports only role, project ref, HTTP status, and pass/fail.

```powershell
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_ANON_KEY="your-current-anon-key"
$env:SUPABASE_SERVICE_ROLE_KEY="your-current-service-role-key"
$env:SUPABASE_ACCESS_TOKEN="your-current-management-token"

$env:OLD_SUPABASE_ANON_KEY="old-anon-key"
$env:OLD_SUPABASE_SERVICE_ROLE_KEY="old-service-role-key"
$env:OLD_SUPABASE_ACCESS_TOKEN="old-management-token"

npm.cmd run verify:supabase:p8-credential-rotation
```

If old credentials are not available because they were already revoked, manual confirmation is allowed:

```powershell
$env:SUPABASE_CREDENTIAL_ROTATION_VERIFIED="true"
npm.cmd run verify:supabase:p8-credential-rotation -- --strict
```

Pass criteria:

- Current public key shape is valid: either a legacy `anon` JWT or a new `sb_publishable` key.
- Current admin key shape is valid: either a legacy `service_role` JWT or a new `sb_secret` key.
- Current anon REST check is active.
- Current service role admin check is active.
- Current management token is active when supplied.
- Old anon, service role, and management credentials are inactive, or rotation is manually confirmed after revoke.

## Strict P8 Production Readiness

Run this only after the browser OAuth smoke has passed, smoke data has been cleaned, and credentials have been rotated.

```powershell
npm.cmd run verify:supabase:p8-preflight -- --strict
$env:SUPABASE_BROWSER_OAUTH_E2E_CONFIRMED="true"
$env:SUPABASE_CREDENTIAL_ROTATION_VERIFIED="true"
npm.cmd run verify:supabase:p8-production-readiness
```

The wrapper runs:

- `verify:supabase:p8-preflight -- --strict`
- `verify:supabase:p7-release-gate -- --strict`
- `verify:supabase:p8-credential-rotation -- --strict`
- `verify:supabase:p8-browser-cleanup -- --dry-run --fail-on-found`

## P8 Exit Criteria

P8 can be marked pass when:

- P7 strict release gate passes.
- Browser Google OAuth smoke passes in a real browser.
- P8 browser smoke cleanup reports zero remaining smoke tenants.
- Credential rotation verification passes.
- `verify:supabase:p8-production-readiness` passes.

Until then, Supabase production cutover remains blocked.
