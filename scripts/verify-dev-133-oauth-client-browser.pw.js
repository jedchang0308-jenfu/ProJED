/* eslint-disable */
async (page) => {
  const { createHash } = require('node:crypto');
  const baseUrl = 'http://127.0.0.1:4174/quick-task/';
  const consentUrl = 'http://127.0.0.1:4174/oauth-consent.html';
  const supabaseOrigin = 'https://dev133-test.supabase.co';
  const clientId = 'dev133-oauth-public-client';
  const user = {
    id: 'dev133-oauth-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'dev133-oauth@example.test',
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = (accountId, selectedClientId, suffix = 'access') => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: accountId, client_id: selectedClientId, aud: 'authenticated', iss: `${supabaseOrigin}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600, token_use: suffix })}.mock-signature`;
  };
  const result = { devId: 'DEV-133', slice: 'B0-oauth-mocked', status: 'FAIL', cases: [], requests: { authorize: [], token: [], userinfo: 0, user: 0, details: 0, consent: [], rpc: 0 }, browserErrors: [] };
  const failures = [];
  const record = (id, passed, details = {}) => {
    result.cases.push({ id, status: passed ? 'SIMULATION PASS' : 'FAIL', details });
    if (!passed) failures.push(id);
  };
  const attachApiMocks = async (context, controls = {}) => {
    const calls = { authorize: [], googleAuthorize: [], token: [], userinfo: 0, user: 0, details: 0, consent: [], rpc: 0, paths: [] };
    await context.route(`${supabaseOrigin}/**`, async route => {
      const request = route.request();
      const url = new URL(request.url());
      calls.paths.push({ method: request.method(), path: url.pathname.replace(/\/oauth\/authorizations\/[^/]+/u, '/oauth/authorizations/:id') });
      if (url.pathname === '/auth/v1/oauth/authorize') {
        calls.authorize.push(url.toString());
        if (controls.authorizationDestination) {
          const destination = JSON.stringify(controls.authorizationDestination);
          await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${destination})</script>` });
          return;
        }
        const callback = new URL(url.searchParams.get('redirect_uri'));
        callback.searchParams.set('code', 'dev133-one-time-code');
        callback.searchParams.set('state', url.searchParams.get('state'));
        const destination = JSON.stringify(callback.toString());
        await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${destination})</script>` });
        return;
      }
      if (url.pathname === '/auth/v1/authorize' && url.searchParams.get('provider') === 'google') {
        calls.googleAuthorize.push(url.toString());
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>mock Google login</title>' });
        return;
      }
      if (url.pathname === '/auth/v1/oauth/token') {
        const body = new URLSearchParams(request.postData() ?? '');
        calls.token.push({ grantType: body.get('grant_type'), clientId: body.get('client_id'), redirectUri: body.get('redirect_uri'), codeVerifier: body.get('code_verifier'), refreshToken: body.get('refresh_token') });
        const refreshed = body.get('grant_type') === 'refresh_token';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          access_token: token(user.id, clientId, refreshed ? 'refreshed' : 'access'),
          refresh_token: refreshed ? 'rotated-refresh-token' : 'initial-refresh-token',
          token_type: 'bearer',
          expires_in: refreshed ? 3600 : 120,
        }) });
        return;
      }
      if (url.pathname === '/auth/v1/oauth/userinfo') {
        calls.userinfo += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sub: user.id, email: user.email, email_verified: true }) });
        return;
      }
      if (url.pathname === '/auth/v1/user') {
        calls.user += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
        return;
      }
      if (url.pathname.startsWith('/auth/v1/oauth/authorizations/')) {
        if (request.method() === 'GET') {
          calls.details += 1;
          const authorizationId = url.pathname.split('/').at(-1);
          const redirectUri = controls.redirectUri ?? baseUrl;
          const payload = controls.autoRedirect
            ? { redirect_url: controls.autoRedirect }
            : { authorization_id: authorizationId, redirect_uri: redirectUri,
              client: { id: clientId, name: 'ProJED-快速建任務', uri: '', logo_uri: '' },
              user: { id: user.id, email: user.email }, scope: controls.scope ?? 'email' };
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
          return;
        }
        if (request.method() === 'POST' && url.pathname.endsWith('/consent')) {
          const body = request.postDataJSON();
          calls.consent.push(body);
          const callback = new URL(baseUrl);
          const authorizationState = calls.authorize.length
            ? new URL(calls.authorize.at(-1)).searchParams.get('state')
            : 'approved-state';
          if (body.action === 'deny') {
            callback.searchParams.set('error', 'access_denied');
            callback.searchParams.set('error_description', 'The user denied the authorization request');
          } else {
            callback.searchParams.set('code', 'approved-code');
          }
          callback.searchParams.set('state', authorizationState ?? 'approved-state');
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ redirect_url: callback.toString() }) });
          return;
        }
      }
      if (url.pathname === '/auth/v1/authorize') {
        calls.authorize.push(url.toString());
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>mock Google login</title>' });
        return;
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        calls.rpc += 1;
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'OAuth RPC gate should block before network.' }) });
        return;
      }
      await route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ message: `Unexpected mock endpoint ${url.pathname}` }) });
    });
    return calls;
  };
  const installAuthSession = async targetPage => {
    await targetPage.goto(`${consentUrl}?authorization_id=authz-dev133-1234567890`, { waitUntil: 'domcontentloaded' });
    return targetPage.evaluate(async sessionUser => {
      const { supabase } = await import('/src/services/supabase/client.ts');
      const key = supabase.auth.storageKey;
      localStorage.setItem(key, JSON.stringify({ access_token: 'dev133-main-session-token', refresh_token: 'dev133-main-refresh', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: sessionUser }));
      return key;
    }, user);
  };

  page.on('pageerror', error => result.browserErrors.push(error.message));
  const quickCalls = await attachApiMocks(page.context());
  try {
    await page.goto(`${baseUrl}?install=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '任務名稱' }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: '登入快速建任務' }).click();
    await page.waitForFunction(() => location.pathname === '/quick-task/' && document.querySelector('#quick-task-auth-status')?.innerText.includes('安全同步待啟用'), null, { timeout: 12000 });
    const authRequest = new URL(quickCalls.authorize[0] ?? 'https://invalid.test');
    const authParams = authRequest.searchParams;
    const exchange = quickCalls.token.find(item => item.grantType === 'authorization_code');
    const pkceMatches = Boolean(exchange?.codeVerifier)
      && createHash('sha256').update(exchange.codeVerifier).digest('base64url') === authParams.get('code_challenge');
    const savedSession = await page.evaluate(() => JSON.parse(localStorage.getItem('projed.quick-task.oauth-session.v1') ?? 'null'));
    const callbackPassed = authParams.get('response_type') === 'code'
      && authParams.get('client_id') === clientId
      && authParams.get('redirect_uri') === baseUrl
      && authParams.get('code_challenge_method') === 'S256'
      && authParams.get('scope') === 'email'
      && Boolean(authParams.get('state'))
      && pkceMatches
      && exchange?.clientId === clientId
      && exchange?.redirectUri === baseUrl
      && savedSession?.accountId === user.id && savedSession?.clientId === clientId
      && !page.url().includes('code=') && quickCalls.userinfo > 0;
    record('B0-public-client-pkce-callback-verified', callbackPassed, { authorizeParameters: { responseType: authParams.get('response_type'), scope: authParams.get('scope'), redirectUri: authParams.get('redirect_uri'), challengeMethod: authParams.get('code_challenge_method') }, pkceMatches, sessionAccountMatches: savedSession?.accountId === user.id, callbackUrlCleaned: !page.url().includes('code=') });

    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.fill('DEV-133 OAuth 暫停 RPC');
    await page.getByRole('button', { name: '建立' }).click();
    await page.getByText('已記下，待同步').waitFor({ state: 'visible', timeout: 10000 });
    const pending = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('projed-quick-task-v1', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const request = db.transaction('captures', 'readonly').objectStore('captures').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return rows.find(row => row.title === 'DEV-133 OAuth 暫停 RPC');
    });
    const duplicateLoginPrompt = await page.locator('#quick-task-success [data-login]').count() > 0;
    record('B1-not-yet-enabled-oauth-token-never-reaches-data-rpc', Boolean(pending && pending.accountId === user.id && pending.state === 'pending') && quickCalls.rpc === 0 && !duplicateLoginPrompt,
      { localOwnerMatches: pending?.accountId === user.id, localState: pending?.state ?? null, dataRpcRequests: quickCalls.rpc,
        duplicateLoginPrompt,
        ui: await page.locator('#quick-task-auth-status').innerText() });

    await page.evaluate(() => {
      const key = 'projed.quick-task.oauth-session.v1';
      const session = JSON.parse(localStorage.getItem(key));
      session.expiresAt = Date.now() - 1000;
      localStorage.setItem(key, JSON.stringify(session));
    });
    const refreshed = await page.evaluate(async () => {
      const { loadQuickOAuthSession } = await import('/src/features/quickTaskCapture/oauthClient.ts');
      return loadQuickOAuthSession();
    });
    const storedAfterRefresh = await page.evaluate(() => JSON.parse(localStorage.getItem('projed.quick-task.oauth-session.v1') ?? 'null'));
    record('B0-refresh-rotates-token-and-preserves-owner', refreshed?.accountId === user.id && storedAfterRefresh?.refreshToken === 'rotated-refresh-token'
      && quickCalls.token.filter(item => item.grantType === 'refresh_token').length === 1,
    { sameOwner: refreshed?.accountId === user.id, refreshTokenRotated: storedAfterRefresh?.refreshToken === 'rotated-refresh-token', refreshRequests: quickCalls.token.filter(item => item.grantType === 'refresh_token').length });

    const refreshCountBeforeConcurrent = quickCalls.token.filter(item => item.grantType === 'refresh_token').length;
    const concurrentRefreshResults = await page.evaluate(async () => {
      const key = 'projed.quick-task.oauth-session.v1';
      const session = JSON.parse(localStorage.getItem(key));
      session.expiresAt = Date.now() - 1000;
      localStorage.setItem(key, JSON.stringify(session));
      const { loadQuickOAuthSession } = await import('/src/features/quickTaskCapture/oauthClient.ts');
      return Promise.all([loadQuickOAuthSession(), loadQuickOAuthSession()]);
    });
    const refreshRequestsDuringConcurrent = quickCalls.token.filter(item => item.grantType === 'refresh_token').length - refreshCountBeforeConcurrent;
    const concurrentOwnersMatch = concurrentRefreshResults.every(session => session?.accountId === user.id && session.clientId === clientId);
    const concurrentTokensMatch = concurrentRefreshResults.length === 2
      && concurrentRefreshResults.every(session => session?.refreshToken === 'rotated-refresh-token');
    const sessionAfterConcurrentRefresh = await page.evaluate(() => JSON.parse(localStorage.getItem('projed.quick-task.oauth-session.v1') ?? 'null'));
    record('B0-parallel-refresh-uses-single-rotated-token', refreshRequestsDuringConcurrent === 1 && concurrentOwnersMatch
      && concurrentTokensMatch && sessionAfterConcurrentRefresh?.refreshToken === 'rotated-refresh-token', {
      refreshRequests: refreshRequestsDuringConcurrent,
      sameOwner: concurrentOwnersMatch,
      bothCallsReceivedRotatedToken: concurrentTokensMatch,
      storedRefreshTokenRotated: sessionAfterConcurrentRefresh?.refreshToken === 'rotated-refresh-token',
    });

    const mismatchContext = await page.context().browser().newContext();
    const mismatchPage = await mismatchContext.newPage();
    const mismatchCalls = await attachApiMocks(mismatchContext);
    await mismatchPage.addInitScript(() => sessionStorage.setItem('projed.quick-task.oauth-transaction.v1', JSON.stringify({ state: 'expected-state-value-123', verifier: 'verifier-not-used', redirectUri: 'http://127.0.0.1:4174/quick-task/', expiresAt: Date.now() + 60_000, captureId: null, claimNonce: null })));
    await mismatchPage.goto(`${baseUrl}?code=replayed-code&state=wrong-state-value-123`, { waitUntil: 'domcontentloaded' });
    await mismatchPage.waitForFunction(() => !location.search.includes('code='), null, { timeout: 10000 });
    const mismatchNoExchange = mismatchCalls.token.length === 0;
    record('B0-state-mismatch-rejects-code-before-exchange', mismatchNoExchange && !mismatchPage.url().includes('code='), { tokenRequests: mismatchCalls.token.length, callbackUrlCleaned: !mismatchPage.url().includes('code=') });
    await mismatchContext.close();

    const consentContext = await page.context().browser().newContext();
    const consentPage = await consentContext.newPage();
    const consentCalls = await attachApiMocks(consentContext);
    await consentPage.goto(`${consentUrl}?authorization_id=authz-dev133-1234567890`, { waitUntil: 'domcontentloaded' });
    await consentPage.getByRole('button', { name: '使用 Google 登入' }).waitFor({ state: 'visible', timeout: 10000 });
    await consentPage.getByRole('button', { name: '使用 Google 登入' }).click();
    await consentPage.waitForURL(/dev133-test\.supabase\.co\/auth\/v1\/authorize/u, { timeout: 10000 });
    const googleAuthorizationRequest = new URL(consentCalls.googleAuthorize[0] ?? 'https://invalid.test');
    const preservedAuthorizationId = new URL(googleAuthorizationRequest.searchParams.get('redirect_to') ?? 'https://invalid.test').searchParams.get('authorization_id') === 'authz-dev133-1234567890';
    record('B0-consent-login-preserves-authorization-request', preservedAuthorizationId, { authorizationIdPreserved: preservedAuthorizationId });
    await consentContext.close();

    const approvalContext = await page.context().browser().newContext();
    const approvalPage = await approvalContext.newPage();
    const approvalCalls = await attachApiMocks(approvalContext);
    await installAuthSession(approvalPage);
    await approvalPage.reload({ waitUntil: 'domcontentloaded' });
    await approvalPage.getByText('ProJED-快速建任務').waitFor({ state: 'visible', timeout: 10000 });
    const callbackRequest = approvalPage.waitForRequest(request => request.url().startsWith(baseUrl) && request.url().includes('code=approved-code'));
    await approvalPage.getByRole('button', { name: '允許' }).click();
    const approvedCallbackUrl = (await callbackRequest).url();
    const approvalPassed = approvalCalls.details >= 1 && approvalCalls.user >= 1
      && approvalCalls.consent.length === 1 && approvalCalls.consent[0]?.action === 'approve'
      && new URL(approvedCallbackUrl).origin + new URL(approvedCallbackUrl).pathname === baseUrl;
    record('B0-consent-checks-account-and-returns-to-registered-callback', approvalPassed, { userVerificationRequests: approvalCalls.user, authorizationDetailsRequests: approvalCalls.details, mockAuthPaths: approvalCalls.paths.map(item => `${item.method} ${item.path}`), consentAction: approvalCalls.consent[0]?.action ?? null, returnedToQuickCallback: new URL(approvedCallbackUrl).origin + new URL(approvedCallbackUrl).pathname === baseUrl });
    await approvalContext.close();

    const denialContext = await page.context().browser().newContext();
    const denialPage = await denialContext.newPage();
    const denialCalls = await attachApiMocks(denialContext, {
      authorizationDestination: `${consentUrl}?authorization_id=authz-dev133-denial123456`,
    });
    await installAuthSession(denialPage);
    await denialPage.goto(`${baseUrl}?install=1`, { waitUntil: 'domcontentloaded' });
    await denialPage.getByRole('textbox', { name: '任務名稱' }).waitFor({ state: 'visible', timeout: 10000 });
    await denialPage.getByRole('button', { name: '登入快速建任務' }).click();
    await denialPage.getByRole('button', { name: '拒絕' }).waitFor({ state: 'visible', timeout: 10000 });
    const expectedDenialState = await denialPage.evaluate(() => JSON.parse(sessionStorage.getItem('projed.quick-task.oauth-transaction.v1') ?? 'null')?.state ?? null);
    const denialCallbackRequest = denialPage.waitForRequest(request => {
      if (!request.url().startsWith(baseUrl)) return false;
      const callback = new URL(request.url());
      return callback.searchParams.get('error') === 'access_denied';
    });
    await denialPage.getByRole('button', { name: '拒絕' }).click();
    const denialCallbackUrl = new URL((await denialCallbackRequest).url());
    await denialPage.getByText('登入驗證未完成；待辦仍保留在本機，請重新登入。').waitFor({ state: 'visible', timeout: 10000 });
    const denialSession = await denialPage.evaluate(() => localStorage.getItem('projed.quick-task.oauth-session.v1'));
    const denialPassed = denialCalls.consent.length === 1 && denialCalls.consent[0]?.action === 'deny'
      && Boolean(expectedDenialState) && denialCallbackUrl.searchParams.get('state') === expectedDenialState
      && denialCalls.token.length === 0 && denialSession === null;
    record('B0-consent-denial-returns-access-denied-with-state', denialPassed, {
      consentAction: denialCalls.consent[0]?.action ?? null,
      accessDenied: denialCallbackUrl.searchParams.get('error') === 'access_denied',
      generatedStatePreserved: Boolean(expectedDenialState) && denialCallbackUrl.searchParams.get('state') === expectedDenialState,
      tokenRequests: denialCalls.token.length,
      noOAuthSessionCreated: denialSession === null,
      userMessageVisible: await denialPage.getByText('登入驗證未完成；待辦仍保留在本機，請重新登入。').isVisible(),
    });
    await denialContext.close();

    const mismatchConsentContext = await page.context().browser().newContext();
    const mismatchConsentPage = await mismatchConsentContext.newPage();
    await attachApiMocks(mismatchConsentContext, { redirectUri: 'https://evil.example/callback/' });
    await installAuthSession(mismatchConsentPage);
    await mismatchConsentPage.reload({ waitUntil: 'domcontentloaded' });
    const detailsHidden = await mismatchConsentPage.locator('#oauth-consent-details').isHidden();
    record('B0-consent-rejects-unregistered-callback', detailsHidden, { consentControlsHidden: detailsHidden });
    await mismatchConsentContext.close();

    const legacyContext = await page.context().browser().newContext();
    const legacyPage = await legacyContext.newPage();
    const legacyCalls = await attachApiMocks(legacyContext);
    const legacyBaseUrl = baseUrl.replace('127.0.0.1', 'localhost');
    await legacyPage.goto(`${legacyBaseUrl}?install=1`, { waitUntil: 'domcontentloaded' });
    await legacyPage.getByRole('textbox', { name: '任務名稱' }).waitFor({ state: 'visible', timeout: 10000 });
    await legacyPage.evaluate(async sessionUser => {
      const { supabase } = await import('/src/services/supabase/client.ts');
      localStorage.setItem(supabase.auth.storageKey, JSON.stringify({ access_token: 'dev133-main-session-token', refresh_token: 'dev133-main-refresh', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: sessionUser }));
    }, user);
    await legacyPage.reload({ waitUntil: 'domcontentloaded' });
    await legacyPage.waitForFunction(() => document.querySelector('#quick-task-auth-status')?.innerText.includes('dev133-oauth@example.test'), null, { timeout: 10000 });
    const legacySessionRestored = await legacyPage.locator('#quick-task-auth-status').innerText();
    await legacyContext.close();

    const legacyLoginContext = await page.context().browser().newContext();
    const legacyLoginPage = await legacyLoginContext.newPage();
    const legacyLoginCalls = await attachApiMocks(legacyLoginContext);
    await legacyLoginPage.goto(`${legacyBaseUrl}?install=1`, { waitUntil: 'domcontentloaded' });
    await legacyLoginPage.getByRole('textbox', { name: '任務名稱' }).waitFor({ state: 'visible', timeout: 10000 });
    await legacyLoginPage.getByRole('button', { name: '登入快速建任務' }).click();
    await legacyLoginPage.waitForURL(url => url.hostname === 'dev133-test.supabase.co' && url.pathname === '/auth/v1/authorize', { timeout: 10000 });
    const legacyGoogleRequest = new URL(legacyLoginCalls.googleAuthorize[0] ?? 'https://invalid.test');
    const legacyRedirect = new URL(legacyGoogleRequest.searchParams.get('redirect_to') ?? 'https://invalid.test');
    const legacyOriginFlow = legacyGoogleRequest.searchParams.get('provider') === 'google'
      && legacyRedirect.origin === new URL(legacyBaseUrl).origin
      && legacyRedirect.pathname === '/quick-task/'
      && legacyLoginCalls.authorize.length === 0;
    record('B0-legacy-quick-origin-keeps-supabase-session-and-login',
      legacySessionRestored.includes('dev133-oauth@example.test') && legacyOriginFlow,
      { legacySessionRestored: legacySessionRestored.includes('dev133-oauth@example.test'), legacyLoginRedirectPreserved: legacyOriginFlow,
        oauthClientAuthorizeRequests: legacyLoginCalls.authorize.length });
    await legacyLoginContext.close();

    result.requests = {
      authorizeCount: quickCalls.authorize.length,
      tokenGrantTypes: quickCalls.token.map(item => item.grantType),
      userinfoCount: quickCalls.userinfo,
      consentActions: quickCalls.consent.map(item => item.action),
      dataRpcCount: quickCalls.rpc,
    };
    result.status = failures.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    failures.push('UNCAUGHT');
    result.status = 'FAIL';
  }
  result.failures = failures;
  return result;
}
