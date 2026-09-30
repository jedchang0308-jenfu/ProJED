/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-133-quick-task-local-browser';
  const baseUrl = 'http://127.0.0.1:4173/quick-task/';
  const result = {
    devId: 'DEV-133',
    slice: 'A-local-reliability',
    status: 'FAIL',
    route: '/quick-task/',
    platform: 'Chrome headless, mobile emulation',
    viewport: { width: 390, height: 844 },
    cases: [],
    screenshots: [],
    browserErrors: [],
    httpFailures: [],
    businessRequests: [],
  };
  const failures = [];
  const record = (id, passed, details = {}, passStatus = 'PASS') => {
    result.cases.push({ id, status: passed ? passStatus : 'FAIL', details });
    if (!passed) failures.push(id);
  };
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) result.browserErrors.push(message.text());
  });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('favicon')) result.httpFailures.push({ status: response.status(), url: response.url() });
  });
  page.on('request', request => {
    const url = request.url();
    if (/\/rest\/v1\/|\/graphql|\/api\//u.test(url)) result.businessRequests.push({ method: request.method(), url });
  });

  const readRecords = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('projed-quick-task-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('captures', 'readonly').objectStore('captures').getAll();
      read.onsuccess = () => { const rows = read.result; db.close(); resolve(rows); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }));

  const assertNoHorizontalOverflow = async width => {
    await page.setViewportSize({ width, height: 844 });
    return page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
  };

  try {
    await page.setViewportSize(result.viewport);
    await page.addInitScript(() => {
      window.__DEV133_SPEECH_TEST = { started: 0, continuous: null, interimResults: null, lang: null };
      class SimulatedSpeechRecognition {
        onresult = null;
        onend = null;
        onerror = null;
        continuous = false;
        interimResults = false;
        lang = '';
        start() {
          window.__DEV133_SPEECH_TEST.started += 1;
          window.__DEV133_SPEECH_TEST.continuous = this.continuous;
          window.__DEV133_SPEECH_TEST.interimResults = this.interimResults;
          window.__DEV133_SPEECH_TEST.lang = this.lang;
          queueMicrotask(() => {
            const result = Object.assign([{ transcript: '巡檢' }], { isFinal: true });
            this.onresult?.({ resultIndex: 0, results: [result] });
            this.onend?.();
          });
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = SimulatedSpeechRecognition;
    });
    await page.goto(`${baseUrl}?install=1`, { waitUntil: 'domcontentloaded' });
    const title = page.getByRole('textbox', { name: '任務名稱' });
    await title.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: '建立' }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#quick-task-auth-status')?.innerText.includes('尚未登入'), null, { timeout: 10000 });
    const mobileStatus = await page.locator('#quick-task-auth-status').innerText();
    const mobileOverflow = await assertNoHorizontalOverflow(390);
    record('A01-mobile-first-input', await title.isEnabled() && await page.getByRole('button', { name: '建立' }).isEnabled()
      && mobileStatus.includes('尚未登入') && mobileOverflow.document <= mobileOverflow.viewport + 1,
    { mobileStatus, mobileOverflow });
    await page.screenshot({ path: `${outputDir}/quick-task-390x844.png`, fullPage: true });
    result.screenshots.push(`${outputDir}/quick-task-390x844.png`);

    await title.fill('明天確認閥門狀態');
    await title.evaluate(input => input.setSelectionRange(2, 4));
    await page.getByRole('button', { name: '使用語音輸入任務名稱' }).click();
    await page.waitForFunction(() => document.querySelector('#quick-task-title')?.value === '明天巡檢閥門狀態'
      && document.querySelector('#quick-task-message')?.textContent === '語音已加入名稱，可繼續編輯。', null, { timeout: 5000 });
    const speech = await page.evaluate(() => ({
      ...window.__DEV133_SPEECH_TEST,
      inputValue: document.querySelector('#quick-task-title')?.value,
      expectedLang: document.documentElement.lang,
    }));
    record('A01-voice-transcript-replaces-selection-simulation', speech.started === 1
      && speech.continuous === false && speech.interimResults === true && speech.lang === speech.expectedLang
      && speech.inputValue === '明天巡檢閥門狀態', speech, 'SIMULATION PASS');

    await title.fill('輸入法組字中的任務');
    await title.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '日' })));
    await page.getByRole('button', { name: '建立' }).click();
    await page.waitForTimeout(50);
    const composingRecords = await readRecords();
    const imeValue = await title.inputValue();
    const imeSubmitBlocked = imeValue === '輸入法組字中的任務'
      && !composingRecords.some(item => item.title === imeValue)
      && await page.locator('#quick-task-success').isHidden();
    await title.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '輸入法組字中的任務' })));
    record('A01-IME-composition-blocks-submit', imeSubmitBlocked, { imeValue, matchingRecords: composingRecords.filter(item => item.title === imeValue).length });

    const failedWriteTitle = 'DEV-133 IndexedDB 寫入故障保護';
    await title.fill(failedWriteTitle);
    await page.evaluate(() => {
      const prototype = IDBObjectStore.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'add');
      window.__DEV133_ORIGINAL_ADD_DESCRIPTOR = descriptor;
      Object.defineProperty(prototype, 'add', {
        ...descriptor,
        value: function (...args) {
          const request = descriptor.value.apply(this, args);
          const tx = this.transaction;
          queueMicrotask(() => { try { tx.abort(); } catch { /* The transaction may have already ended. */ } });
          return request;
        },
      });
    });
    await page.getByRole('button', { name: '建立' }).click();
    await page.getByText('目前無法記下，請稍後重試。').waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => {
      const descriptor = window.__DEV133_ORIGINAL_ADD_DESCRIPTOR;
      Object.defineProperty(IDBObjectStore.prototype, 'add', descriptor);
      delete window.__DEV133_ORIGINAL_ADD_DESCRIPTOR;
    });
    const afterFailedWrite = await readRecords();
    const failedWriteProtected = !afterFailedWrite.some(item => item.title === failedWriteTitle)
      && await page.locator('#quick-task-success').isHidden() && await title.inputValue() === failedWriteTitle;
    record('A02-IDB-write-failure-does-not-claim-success', failedWriteProtected, {
      matchingRecords: afterFailedWrite.filter(item => item.title === failedWriteTitle).length,
      successVisible: await page.locator('#quick-task-success').isVisible(),
      inputRetained: await title.inputValue() === failedWriteTitle,
    });

    const failedReadbackTitle = 'DEV-133 IndexedDB 讀回故障保護';
    await title.fill(failedReadbackTitle);
    await page.evaluate(() => {
      const prototype = IDBRequest.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'result');
      window.__DEV133_ORIGINAL_RESULT_DESCRIPTOR = descriptor;
      Object.defineProperty(prototype, 'result', {
        ...descriptor,
        get() {
          const result = descriptor.get.call(this);
          return this.source?.name === 'captures' && this.source.transaction.mode === 'readonly'
            ? undefined
            : result;
        },
      });
    });
    await page.getByRole('button', { name: '建立' }).click();
    const failedReadbackMessage = '無法確認是否已記下。請清空輸入欄查看待處理清單；若未出現再重試。';
    await page.getByText(failedReadbackMessage).waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => {
      Object.defineProperty(IDBRequest.prototype, 'result', window.__DEV133_ORIGINAL_RESULT_DESCRIPTOR);
      delete window.__DEV133_ORIGINAL_RESULT_DESCRIPTOR;
    });
    const afterFailedReadback = await readRecords();
    record('A02-IDB-readback-failure-does-not-claim-success',
      afterFailedReadback.some(item => item.title === failedReadbackTitle)
      && await page.locator('#quick-task-success').isHidden()
      && await title.inputValue() === failedReadbackTitle
      && (await page.locator('#quick-task-message').innerText()).includes('無法確認是否已記下'), {
        matchingRecords: afterFailedReadback.filter(item => item.title === failedReadbackTitle).length,
        successVisible: await page.locator('#quick-task-success').isVisible(),
        inputRetained: await title.inputValue() === failedReadbackTitle,
        message: await page.locator('#quick-task-message').innerText(),
      }, 'SIMULATION PASS');

    await page.context().setOffline(true);
    await title.fill('DEV-133 離線本機保存驗證');
    await page.getByRole('button', { name: '建立' }).click();
    await page.getByText('已記下，待同步').waitFor({ state: 'visible', timeout: 10000 });
    const saved = await readRecords();
    const captured = saved.find(record => record.title === 'DEV-133 離線本機保存驗證');
    const navigatorOnLine = await page.evaluate(() => navigator.onLine);
    record('A02-offline-local-commit', Boolean(captured && captured.accountId === null && captured.state === 'awaiting_auth') && !navigatorOnLine,
      { recordCount: saved.length, captured: captured ?? null, navigatorOnLine });
    await page.context().setOffline(false);
    await title.fill('DEV-133 線上未登入保存驗證');
    await page.getByRole('button', { name: '建立' }).click();
    await page.getByText('已記下，待同步').waitFor({ state: 'visible', timeout: 10000 });
    const onlineSaved = await readRecords();
    const onlineUnbound = onlineSaved.find(record => record.title === 'DEV-133 線上未登入保存驗證');
    record('A02-online-signed-out-local-commit', Boolean(onlineUnbound && onlineUnbound.accountId === null && onlineUnbound.state === 'awaiting_auth'), {
      recordCount: onlineSaved.length,
      onlineUnbound: onlineUnbound ?? null,
    });

    const now = Date.now();
    const fixtures = [
      { captureId: 'task_workbench_unplaced_dev133_expired_synced', accountId: 'dev133-qa-user', title: 'expired synced', state: 'synced', updatedAt: now - 8 * 24 * 60 * 60 * 1000 },
      { captureId: 'task_workbench_unplaced_dev133_recent_synced', accountId: 'dev133-qa-user', title: 'recent synced', state: 'synced', updatedAt: now - 6 * 24 * 60 * 60 * 1000 },
      { captureId: 'task_workbench_unplaced_dev133_old_pending', accountId: 'dev133-qa-user', title: 'old pending', state: 'pending', updatedAt: now - 40 * 24 * 60 * 60 * 1000 },
      { captureId: 'task_workbench_unplaced_dev133_old_unbound', accountId: null, title: 'old unbound', state: 'awaiting_auth', updatedAt: now - 40 * 24 * 60 * 60 * 1000 },
    ].map(record => ({
      schemaVersion: 1,
      workspaceHint: null,
      clientCreatedAt: record.updatedAt,
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      leaseId: null,
      leaseExpiresAt: null,
      claimIntent: null,
      ...record,
    }));
    await page.evaluate(rows => new Promise((resolve, reject) => {
      const request = indexedDB.open('projed-quick-task-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('captures', 'readwrite');
        rows.forEach(row => tx.objectStore('captures').put(row));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }), fixtures);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await title.waitFor({ state: 'visible' });
    await page.waitForFunction(async () => {
      const rows = await new Promise((resolve, reject) => {
        const request = indexedDB.open('projed-quick-task-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('captures', 'readonly').objectStore('captures').getAll();
          read.onsuccess = () => { const records = read.result; db.close(); resolve(records); };
          read.onerror = () => { db.close(); reject(read.error); };
        };
      });
      return rows.every(row => row.captureId !== 'task_workbench_unplaced_dev133_expired_synced');
    }, null, { timeout: 10000 });
    const afterCleanup = await readRecords();
    const retainedIds = new Set(afterCleanup.map(record => record.captureId));
    const cleanupPassed = !retainedIds.has('task_workbench_unplaced_dev133_expired_synced')
      && retainedIds.has('task_workbench_unplaced_dev133_recent_synced')
      && retainedIds.has('task_workbench_unplaced_dev133_old_pending')
      && retainedIds.has('task_workbench_unplaced_dev133_old_unbound');
    record('A07-startup-seven-day-cleanup', cleanupPassed, {
      retainedIds: [...retainedIds].filter(id => id.startsWith('task_workbench_unplaced_dev133_')),
      recordCount: afterCleanup.length,
    });

    const concurrentCleanup = await page.evaluate(async () => {
      const { removeExpiredQuickCaptures } = await import('/src/features/quickTaskCapture/outbox.ts');
      const now = Date.now();
      const captureId = `task_workbench_unplaced_dev133_cleanup_race_${crypto.randomUUID()}`;
      const fixture = {
        schemaVersion: 1,
        captureId,
        accountId: 'dev133-qa-user',
        title: 'concurrent pending-to-synced transition',
        workspaceHint: null,
        clientCreatedAt: now - 40 * 24 * 60 * 60 * 1000,
        updatedAt: now - 40 * 24 * 60 * 60 * 1000,
        state: 'pending',
        attemptCount: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
        leaseId: null,
        leaseExpiresAt: null,
        claimIntent: null,
      };
      const openDb = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('projed-quick-task-v1', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const writeFixture = async () => {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('captures', 'readwrite');
          tx.objectStore('captures').put(fixture);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      };
      const completeSyncTransition = async () => {
        const db = await openDb();
        const updatedAt = Date.now();
        const result = await new Promise((resolve, reject) => {
          const tx = db.transaction('captures', 'readwrite');
          const store = tx.objectStore('captures');
          const request = store.get(captureId);
          let found = false;
          request.onsuccess = () => {
            if (!request.result) return;
            found = true;
            store.put({ ...request.result, state: 'synced', updatedAt, leaseId: null, leaseExpiresAt: null });
          };
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => resolve({ found, updatedAt });
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
        return result;
      };
      const readFixture = async () => {
        const db = await openDb();
        const record = await new Promise((resolve, reject) => {
          const tx = db.transaction('captures', 'readonly');
          const request = tx.objectStore('captures').get(captureId);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return record;
      };
      const deleteFixture = async () => {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('captures', 'readwrite');
          tx.objectStore('captures').delete(captureId);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      };

      await writeFixture();
      const cleanupPromise = removeExpiredQuickCaptures(now);
      const syncPromise = completeSyncTransition();
      const [removedCount, sync] = await Promise.all([cleanupPromise, syncPromise]);
      const record = await readFixture();
      const retainedFreshSync = Boolean(sync.found && record?.state === 'synced' && record.updatedAt === sync.updatedAt
        && record.updatedAt >= now && now - record.updatedAt < 7 * 24 * 60 * 60 * 1000);
      await deleteFixture();
      return { retainedFreshSync, removedCount, finalState: record?.state ?? null, transitionTimestampAdvanced: record?.updatedAt === sync.updatedAt };
    });
    record('A07-concurrent-cleanup-preserves-fresh-sync', concurrentCleanup.retainedFreshSync, concurrentCleanup);

    const cleanupAbort = await page.evaluate(async () => {
      const { removeExpiredQuickCaptures } = await import('/src/features/quickTaskCapture/outbox.ts');
      const originalOpenCursor = IDBObjectStore.prototype.openCursor;
      IDBObjectStore.prototype.openCursor = function (...args) {
        const request = originalOpenCursor.apply(this, args);
        const tx = this.transaction;
        queueMicrotask(() => { try { tx.abort(); } catch { /* The transaction may already be inactive. */ } });
        return request;
      };
      try {
        await removeExpiredQuickCaptures();
        return { rejected: false, message: null };
      } catch (error) {
        return { rejected: true, message: error instanceof Error ? error.message : String(error) };
      } finally {
        IDBObjectStore.prototype.openCursor = originalOpenCursor;
      }
    });
    record('A07-cleanup-transaction-abort-reports-failure', cleanupAbort.rejected
      && /^IDB_CLEANUP_(?:FAILED|ABORTED)$/u.test(cleanupAbort.message ?? ''), cleanupAbort);

    const recovery = page.locator('#quick-task-recovery');
    await recovery.waitFor({ state: 'visible', timeout: 10000 });
    const canPostpone = await recovery.getByRole('button', { name: '稍後處理' }).isVisible();
    await recovery.getByRole('button', { name: '稍後處理' }).click();
    record('A-recovery-can-be-postponed', canPostpone && await recovery.isHidden() && await title.isEnabled(), {
      canPostpone,
      recoveryHiddenAfter: await recovery.isHidden(),
      inputEnabled: await title.isEnabled(),
    });

    const narrowOverflow = await assertNoHorizontalOverflow(320);
    const narrowHeading = await page.locator('.quick-task-header h1').innerText();
    record('A09-320px-layout', narrowHeading === 'ProJED-快速建任務'
      && narrowOverflow.document <= narrowOverflow.viewport + 1 && narrowOverflow.body <= narrowOverflow.viewport + 1,
    { heading: narrowHeading, ...narrowOverflow });
    await page.screenshot({ path: `${outputDir}/quick-task-320x844.png`, fullPage: true });
    result.screenshots.push(`${outputDir}/quick-task-320x844.png`);

    const authFixture = await page.evaluate(async () => {
      const { configuredSupabaseUrl, supabase } = await import('/src/services/supabase/client.ts');
      return { apiOrigin: configuredSupabaseUrl ? new URL(configuredSupabaseUrl).origin : null, storageKey: supabase.auth.storageKey };
    });
    if (!authFixture.apiOrigin || !authFixture.storageKey) {
      result.cases.push({ id: 'A04-local-auth-rpc-simulation', status: 'NOT RUN', details: { reason: 'No configured Supabase URL or Auth storage key in local test runtime.' } });
    } else {
      const simulatedUser = {
        id: 'dev133-local-auth-user',
        app_metadata: { provider: 'google', providers: ['google'] },
        user_metadata: {},
        aud: 'authenticated',
        role: 'authenticated',
        email: 'dev133-local@example.test',
        created_at: new Date().toISOString(),
      };
      const simulatedToken = 'dev133-local-only-access-token';
      await page.addInitScript(({ apiOrigin, storageKey, user, accessToken }) => {
      const session = {
          access_token: accessToken,
          refresh_token: 'dev133-local-only-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      const originalFetch = window.fetch.bind(window);
      window.__DEV133_MOCK_CALLS = { getUser: 0, authTokenMatched: true, rpc: [], retryNetworkRpc: 0, unexpectedApiCalls: [] };
      window.fetch = async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin !== apiOrigin) return originalFetch(request);
          if (url.pathname === '/auth/v1/user') {
            window.__DEV133_MOCK_CALLS.getUser += 1;
            window.__DEV133_MOCK_CALLS.authTokenMatched &&= request.headers.get('Authorization') === `Bearer ${accessToken}`;
            return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (url.pathname === '/rest/v1/rpc/create_quick_unplaced_task_v1') {
            const body = await request.json();
            const titleHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.p_title))), byte => byte.toString(16).padStart(2, '0')).join('');
            const rpcCall = {
              authorizationMatched: request.headers.get('Authorization') === `Bearer ${accessToken}`,
              captureId: body.p_capture_id,
              title: body.p_title,
              workspaceHint: body.p_workspace_hint,
            };
            window.__DEV133_MOCK_CALLS.rpc.push(rpcCall);
            if (body.p_title === 'DEV-133 網路恢復後自動同步' || body.p_title === 'DEV-133 退避到期自動重試') {
              window.__DEV133_MOCK_CALLS.retryNetworkRpc += 1;
              if (!navigator.onLine) throw Object.assign(new TypeError('Failed to fetch'), { retryAfter: '6' });
            }
            return new Response(JSON.stringify({
              status: 'committed',
              captureId: body.p_capture_id,
              ownerId: user.id,
              titleHash,
              created: true,
              committedAt: Date.now(),
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          window.__DEV133_MOCK_CALLS.unexpectedApiCalls.push(url.pathname);
          return new Response(JSON.stringify({ message: 'Unexpected local test API call.' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
        };
        localStorage.setItem(storageKey, JSON.stringify(session));
      }, { apiOrigin: authFixture.apiOrigin, storageKey: authFixture.storageKey, user: simulatedUser, accessToken: simulatedToken });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#quick-task-auth-status')?.innerText.includes('dev133-local@example.test'), null, { timeout: 10000 });
      const unboundBeforeAuthCreate = await readRecords();
      const originalUnboundRetained = ['DEV-133 離線本機保存驗證', 'DEV-133 線上未登入保存驗證'].every(titleValue => {
        const record = unboundBeforeAuthCreate.find(item => item.title === titleValue);
        return record?.accountId === null && record.state === 'awaiting_auth';
      });
      result.cases.push({
        id: 'A03-unbound-not-auto-claimed-local-auth-simulation',
        status: originalUnboundRetained ? 'SIMULATION PASS' : 'FAIL',
        details: { retainedUnbound: originalUnboundRetained },
      });
      if (!originalUnboundRetained) failures.push('A03-unbound-not-auto-claimed-local-auth-simulation');
      const authTitle = page.getByRole('textbox', { name: '任務名稱' });
      await authTitle.fill('DEV-133 模擬核身與回執流程');
      await page.getByRole('button', { name: '建立' }).click();
      await page.waitForFunction(() => document.querySelector('#quick-task-success strong')?.innerText === '已建立', null, { timeout: 10000 });
      const syncedRecords = await readRecords();
      const simulatedRecord = syncedRecords.find(record => record.title === 'DEV-133 模擬核身與回執流程');
      const mockCalls = await page.evaluate(() => window.__DEV133_MOCK_CALLS);
      const simulationPassed = Boolean(simulatedRecord && simulatedRecord.accountId === simulatedUser.id && simulatedRecord.state === 'synced')
        && mockCalls.getUser > 0 && mockCalls.authTokenMatched
        && mockCalls.rpc.length === 1 && mockCalls.rpc[0].authorizationMatched
        && mockCalls.rpc[0].captureId === simulatedRecord.captureId
        && mockCalls.rpc[0].title === simulatedRecord.title && mockCalls.unexpectedApiCalls.length === 0;
      result.cases.push({
        id: 'A04-local-auth-rpc-simulation',
        status: simulationPassed ? 'SIMULATION PASS' : 'FAIL',
        details: { storedState: simulatedRecord?.state ?? null, storedOwner: simulatedRecord?.accountId ?? null, mockCalls },
      });
      if (!simulationPassed) failures.push('A04-local-auth-rpc-simulation');

      const retryBackoff = await page.evaluate(async () => {
        const { acquireQuickCaptureLease, commitQuickCapture, finishQuickCaptureLease, getQuickCapture } = await import('/src/features/quickTaskCapture/outbox.ts');
        const cases = [
          { id: 'short-retry-after-keeps-exponential-floor', priorAttempts: 0, retryAfterMs: 1000, expectedState: 'failed_retryable', minimumDelayMs: 4500 },
          { id: 'long-retry-after-is-preserved', priorAttempts: 0, retryAfterMs: 90_000, expectedState: 'failed_retryable', minimumDelayMs: 89_500 },
          { id: 'retry-after-cannot-revive-exhausted-record', priorAttempts: 7, retryAfterMs: 90_000, expectedState: 'failed_permanent', minimumDelayMs: null },
        ];
        const outcomes = [];
        for (const scenario of cases) {
          const startedAt = Date.now();
          const captureId = `task_workbench_unplaced_dev133_retry_${crypto.randomUUID()}`;
          await commitQuickCapture({
            schemaVersion: 1,
            captureId,
            accountId: 'dev133-local-auth-user',
            title: scenario.id,
            workspaceHint: null,
            clientCreatedAt: startedAt,
            updatedAt: startedAt,
            state: 'pending',
            attemptCount: scenario.priorAttempts,
            nextAttemptAt: null,
            lastErrorCode: null,
            leaseId: null,
            leaseExpiresAt: null,
            claimIntent: null,
          });
          const leased = await acquireQuickCaptureLease(captureId, 'dev133-local-auth-user');
          if (!leased?.leaseId) throw new Error(`RETRY_FIXTURE_LEASE_FAILED:${scenario.id}`);
          await finishQuickCaptureLease(captureId, leased.leaseId, 'failed_retryable', 'HTTP_429', scenario.retryAfterMs);
          const record = await getQuickCapture(captureId);
          const delayMs = record?.nextAttemptAt === null || record?.nextAttemptAt === undefined
            ? null
            : record.nextAttemptAt - startedAt;
          const passed = record?.state === scenario.expectedState
            && (scenario.minimumDelayMs === null ? delayMs === null : delayMs !== null && delayMs >= scenario.minimumDelayMs);
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('projed-quick-task-v1', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            const tx = db.transaction('captures', 'readwrite');
            tx.objectStore('captures').delete(captureId);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
          db.close();
          outcomes.push({ id: scenario.id, passed, state: record?.state ?? null, attemptCount: record?.attemptCount ?? null, delayMs });
        }
        return { passed: outcomes.every(outcome => outcome.passed), outcomes };
      });
      record('A05-retry-after-preserves-backoff-and-exhaustion', retryBackoff.passed, retryBackoff);

      const reconnectTitle = 'DEV-133 網路恢復後自動同步';
      const reconnectFixture = await page.evaluate(async titleValue => {
        const { commitQuickCapture } = await import('/src/features/quickTaskCapture/outbox.ts');
        const { createQuickCaptureId } = await import('/src/features/quickTaskCapture/model.ts');
        const now = Date.now();
        const captureId = createQuickCaptureId();
        await commitQuickCapture({
          schemaVersion: 1,
          captureId,
          accountId: 'dev133-local-auth-user',
          title: titleValue,
          workspaceHint: null,
          clientCreatedAt: now,
          updatedAt: now,
          state: 'failed_retryable',
          attemptCount: 1,
          nextAttemptAt: now - 1,
          lastErrorCode: 'NETWORK_ERROR',
          leaseId: null,
          leaseExpiresAt: null,
          claimIntent: null,
        });
        return captureId;
      }, reconnectTitle);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForTimeout(1500);
      const reconnectFinal = await page.evaluate(async titleValue => {
        const { listQuickCaptures } = await import('/src/features/quickTaskCapture/outbox.ts');
        const records = await listQuickCaptures('dev133-local-auth-user');
        const calls = window.__DEV133_MOCK_CALLS.rpc.filter(item => item.title === titleValue);
        return { rows: records.filter(item => item.title === titleValue), calls };
      }, reconnectTitle);
      const onlineEventPassed = Boolean(reconnectFixture)
        && reconnectFinal.rows.length === 1
        && reconnectFinal.rows[0].state === 'synced'
        && reconnectFinal.rows[0].accountId === simulatedUser.id
        && reconnectFinal.calls.length === 1
        && reconnectFinal.calls[0].captureId === reconnectFixture;
      result.cases.push({ id: 'A05-online-event-retries-same-capture-simulation',
        status: onlineEventPassed ? 'SIMULATION PASS' : 'FAIL',
        details: { initialState: 'failed_retryable', finalState: reconnectFinal.rows[0]?.state ?? null,
        attemptCount: reconnectFinal.rows[0]?.attemptCount ?? null,
        captureIds: reconnectFinal.calls.map(call => call.captureId) } });
      if (!onlineEventPassed) failures.push('A05-online-event-retries-same-capture-simulation');

      await page.waitForTimeout(100);
      const backoffTitle = 'DEV-133 退避到期自動重試';
      const backoffFixture = await page.evaluate(async titleValue => {
        const { commitQuickCapture } = await import('/src/features/quickTaskCapture/outbox.ts');
        const { createQuickCaptureId } = await import('/src/features/quickTaskCapture/model.ts');
        const now = Date.now();
        const captureId = createQuickCaptureId();
        await commitQuickCapture({
          schemaVersion: 1,
          captureId,
          accountId: 'dev133-local-auth-user',
          title: titleValue,
          workspaceHint: null,
          clientCreatedAt: now,
          updatedAt: now,
          state: 'failed_retryable',
          attemptCount: 1,
          nextAttemptAt: now + 300,
          lastErrorCode: 'NETWORK_ERROR',
          leaseId: null,
          leaseExpiresAt: null,
          claimIntent: null,
        });
        return captureId;
      }, backoffTitle);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForTimeout(1500);
      const backoffFinal = await page.evaluate(async titleValue => {
        const { listQuickCaptures } = await import('/src/features/quickTaskCapture/outbox.ts');
        const records = await listQuickCaptures('dev133-local-auth-user');
        const calls = window.__DEV133_MOCK_CALLS.rpc.filter(item => item.title === titleValue);
        return { rows: records.filter(item => item.title === titleValue), calls };
      }, backoffTitle);
      const backoffTimerPassed = Boolean(backoffFixture)
        && backoffFinal.rows.length === 1
        && backoffFinal.rows[0].state === 'synced'
        && backoffFinal.rows[0].accountId === simulatedUser.id
        && backoffFinal.rows[0].attemptCount === 2
        && backoffFinal.calls.length === 1
        && backoffFinal.calls[0].captureId === backoffFixture;
      result.cases.push({ id: 'A05-backoff-expiry-timer-retries-same-capture-simulation',
        status: backoffTimerPassed ? 'SIMULATION PASS' : 'FAIL',
        details: { initialState: 'failed_retryable', scheduledDelayMs: 300,
          finalState: backoffFinal.rows[0]?.state ?? null, attemptCount: backoffFinal.rows[0]?.attemptCount ?? null,
          captureIds: backoffFinal.calls.map(call => call.captureId) } });
      if (!backoffTimerPassed) failures.push('A05-backoff-expiry-timer-retries-same-capture-simulation');

      const otherUser = { ...simulatedUser, id: 'dev133-different-auth-user', email: 'different-dev133@example.test' };
      await page.addInitScript(({ apiOrigin, storageKey, sessionUser, returnedUser, accessToken }) => {
        const originalFetch = window.fetch.bind(window);
        const session = {
          access_token: accessToken,
          refresh_token: 'dev133-local-only-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: sessionUser,
        };
        window.__DEV133_MISMATCH_CALLS = { getUser: 0, rpc: 0, unexpectedApiCalls: [] };
        window.fetch = async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          if (url.origin !== apiOrigin) return originalFetch(request);
          if (url.pathname === '/auth/v1/user') {
            window.__DEV133_MISMATCH_CALLS.getUser += 1;
            return new Response(JSON.stringify(returnedUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (url.pathname === '/rest/v1/rpc/create_quick_unplaced_task_v1') window.__DEV133_MISMATCH_CALLS.rpc += 1;
          window.__DEV133_MISMATCH_CALLS.unexpectedApiCalls.push(url.pathname);
          return new Response(JSON.stringify({ message: 'Unexpected local test API call.' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
        };
        localStorage.setItem(storageKey, JSON.stringify(session));
      }, { apiOrigin: authFixture.apiOrigin, storageKey: authFixture.storageKey, sessionUser: simulatedUser, returnedUser: otherUser, accessToken: simulatedToken });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#quick-task-auth-status')?.innerText.includes('登入狀態待確認'), null, { timeout: 10000 });
      const mismatchTitle = page.getByRole('textbox', { name: '任務名稱' });
      await mismatchTitle.fill('DEV-133 核身帳號不符保留本機');
      await page.getByRole('button', { name: '建立' }).click();
      await page.getByText('已記下，待同步').waitFor({ state: 'visible', timeout: 10000 });
      const mismatchRecords = await readRecords();
      const mismatchRecord = mismatchRecords.find(item => item.title === 'DEV-133 核身帳號不符保留本機');
      const mismatchCalls = await page.evaluate(() => window.__DEV133_MISMATCH_CALLS);
      const mismatchPassed = Boolean(mismatchRecord && mismatchRecord.accountId === null && mismatchRecord.state === 'awaiting_auth')
        && mismatchCalls.getUser > 0 && mismatchCalls.rpc === 0 && mismatchCalls.unexpectedApiCalls.length === 0;
      result.cases.push({
        id: 'A04-auth-user-mismatch-fails-closed-simulation',
        status: mismatchPassed ? 'SIMULATION PASS' : 'FAIL',
        details: { storedState: mismatchRecord?.state ?? null, storedOwner: mismatchRecord?.accountId ?? null, mismatchCalls },
      });
      if (!mismatchPassed) failures.push('A04-auth-user-mismatch-fails-closed-simulation');
    }

    record('A-no-browser-or-business-api-errors', result.browserErrors.length === 0 && result.httpFailures.length === 0 && result.businessRequests.length === 0, {
      browserErrors: result.browserErrors,
      httpFailures: result.httpFailures,
      businessRequests: result.businessRequests,
    });
    result.status = failures.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    failures.push('UNCAUGHT');
  } finally {
    await page.context().setOffline(false).catch(() => undefined);
    result.failures = failures;
    await page.evaluate(artifact => { window.__DEV133_ARTIFACT = artifact; }, result).catch(() => undefined);
  }

  if (failures.length) throw new Error(`DEV-133 local browser verification failed: ${failures.join(', ')} | ${JSON.stringify(result)}`);
  return result;
}
