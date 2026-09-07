/* eslint-disable */
async (page) => {
  const OUTPUT_DIR = 'output/playwright/dev-106-meeting-local-safety';
  const BASE_URL = page.url().match(/^https?:\/\/[^/]+/)?.[0] || 'http://localhost:4000';
  const diagnostics = [];
  const httpFailures = [];
  const cases = [];
  const remoteRecoveryRequests = [];

  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console:error:${message.text()}`);
  });
  page.on('pageerror', error => diagnostics.push(`pageerror:${error.message}`));
  page.on('dialog', dialog => dialog.dismiss());
  page.on('response', response => {
    if (response.status() >= 400) httpFailures.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', request => {
    const raw = `${request.url()}\n${request.postData() || ''}`;
    if (/checkpointDraft|meeting[-_:]draft[-_:]recovery|projedDraftRecovery/i.test(raw)) {
      remoteRecoveryRequests.push({ method: request.method(), url: request.url() });
    }
  });
  await page.addInitScript(() => {
    window.addEventListener('beforeunload', event => event.stopImmediatePropagation(), true);
  });

  const assert = (condition, message, details = {}) => {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
  };

  const recoveryStorage = async () => page.evaluate(async () => {
    const sessionKeys = Object.keys(sessionStorage).filter(key => key.startsWith('projed:meeting-draft-recovery:v1:'));
    const indexedDbScopes = await new Promise(resolve => {
      if (typeof indexedDB === 'undefined') return resolve([]);
      const request = indexedDB.open('projed-draft-recovery', 1);
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('meeting-drafts')) {
          database.close();
          return resolve([]);
        }
        const transaction = database.transaction('meeting-drafts', 'readonly');
        const getAll = transaction.objectStore('meeting-drafts').getAll();
        getAll.onsuccess = () => resolve((getAll.result || []).map(snapshot => snapshot.scopeKey));
        getAll.onerror = () => resolve([]);
        transaction.oncomplete = () => database.close();
      };
    });
    return { sessionKeys, indexedDbScopes };
  });

  const sideEffectStorage = async () => page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage)
      .filter(key => /knowledgeRecords|activityEvents|rag|document|version|chunk|embedding|undo/i.test(key))
      .sort()
      .map(key => [key, localStorage.getItem(key)]),
  ));

  const visibleErrorSweep = async label => {
    const state = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const alerts = Array.from(document.querySelectorAll('.inline-error,[role="alert"]'))
        .filter(visible)
        .map(element => (element.textContent || '').trim())
        .filter(Boolean);
      return { alerts, bodyError: /HTTP\s+[45]\d\d|Internal Server Error|Unexpected token/i.test(document.body.innerText) };
    });
    assert(state.alerts.length === 0 && !state.bodyError, `${label} visible error sweep failed`, state);
  };

  const seedTestSession = async () => {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('projed-local-test.selected-account', 'local-test-user');
      localStorage.setItem('projed-local-test.session', JSON.stringify({
        uid: 'local-test-user',
        email: 'test@projed.local',
        displayName: 'ProJED DEV-106 QA',
        createdAt: 1704067200000,
      }));
      localStorage.setItem('projed-last-view', 'board');
    });
    await page.evaluate(async () => {
      if (typeof indexedDB === 'undefined') return;
      await new Promise(resolve => {
        const request = indexedDB.open('projed-draft-recovery', 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('meeting-drafts')) database.createObjectStore('meeting-drafts', { keyPath: 'scopeKey' });
        };
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('meeting-drafts')) {
            database.close();
            resolve(true);
            return;
          }
          const transaction = database.transaction('meeting-drafts', 'readwrite');
          transaction.objectStore('meeting-drafts').clear();
          transaction.oncomplete = () => { database.close(); resolve(true); };
          transaction.onerror = () => { database.close(); resolve(false); };
          transaction.onabort = () => { database.close(); resolve(false); };
        };
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: '新增會議記錄' }).waitFor({ state: 'visible', timeout: 15000 });
  };

  const startMeeting = async () => {
    await page.getByRole('button', { name: '新增會議記錄' }).click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-record-composer-shell] [contenteditable="true"]').last().waitFor({ state: 'visible', timeout: 10000 });
  };

  const runCase = async (id, expected, flow) => {
    const started = Date.now();
    try {
      const actual = await flow();
      cases.push({ id, status: 'PASS', expected, actual, durationMs: Date.now() - started });
      return actual;
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      cases.push({ id, status: 'FAIL', expected, failure, durationMs: Date.now() - started });
      await page.screenshot({ path: `${OUTPUT_DIR}/${id}-failure.png`, fullPage: false }).catch(() => undefined);
      throw error;
    }
  };

  const runRecoveryServiceHarness = async () => page.evaluate(async () => {
    const service = await import('/src/services/meetingDraftRecoveryService.ts');
    const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    const waitFor = async (predicate, timeout = 1500) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      throw new Error('recovery harness timed out waiting for fake IndexedDB transaction');
    };
    const snapshot = (scopeKey, writeSequence, content) => ({
      schemaVersion: 2,
      scopeKey,
      ownerUserId: 'dev106-harness-owner',
      workspaceId: 'dev106-harness-workspace',
      boardId: 'dev106-harness-board',
      draftId: scopeKey.split(':').at(-1),
      savedAt: Date.now(),
      writeSequence,
      localSignature: `${scopeKey}:${writeSequence}:${content}`,
      canonicalBaselineSignature: null,
      contentCursorOffset: 0,
      draft: {
        id: scopeKey.split(':').at(-1),
        type: 'meeting',
        title: 'DEV-106 harness',
        content,
        status: 'draft',
        visibility: 'private',
        taskLinks: [],
      },
      meetingActivities: [],
      appendedMeetingActivityIds: [],
    });
    const createFakeIndexedDb = (mode = 'controlled') => {
      const records = new Map();
      const transactions = [];
      const events = [];
      const database = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => ({}),
        close: () => undefined,
        transaction: () => {
          const transaction = { oncomplete: null, onerror: null, onabort: null, finished: false, operations: [] };
          const store = {
            put(value) {
              transaction.operations.push({ type: 'put', value });
              const request = { result: value.scopeKey, onsuccess: null, onerror: null };
              setTimeout(() => { events.push(`request:put:${value.writeSequence}`); request.onsuccess?.({ target: request }); }, 0);
              return request;
            },
            get(key) {
              const request = { result: records.get(key), onsuccess: null, onerror: null };
              setTimeout(() => { events.push('request:get'); request.onsuccess?.({ target: request }); }, 0);
              return request;
            },
            getAll() {
              const request = { result: [...records.values()], onsuccess: null, onerror: null };
              setTimeout(() => { events.push('request:getAll'); request.onsuccess?.({ target: request }); }, 0);
              return request;
            },
            delete(key) {
              transaction.operations.push({ type: 'delete', key });
              const request = { result: undefined, onsuccess: null, onerror: null };
              setTimeout(() => { events.push('request:delete'); request.onsuccess?.({ target: request }); }, 0);
              return request;
            },
          };
          transaction.objectStore = () => store;
          transaction.finish = (outcome = 'complete') => {
            if (transaction.finished) return;
            transaction.finished = true;
            if (outcome === 'complete') {
              transaction.operations.forEach(operation => {
                if (operation.type === 'put') records.set(operation.value.scopeKey, operation.value);
                if (operation.type === 'delete') records.delete(operation.key);
              });
            }
            setTimeout(() => {
              events.push(`transaction:${outcome}`);
              transaction[`on${outcome}`]?.({ target: transaction });
            }, 0);
          };
          transactions.push(transaction);
          if (mode === 'auto') setTimeout(() => transaction.finish('complete'), 0);
          return transaction;
        },
      };
      return {
        open() {
          const request = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
          if (mode === 'error') {
            setTimeout(() => request.onerror?.({ target: request }), 0);
          } else {
            setTimeout(() => {
              request.onupgradeneeded?.({ target: request });
              request.onsuccess?.({ target: request });
            }, 0);
          }
          return request;
        },
        transactions,
        events,
        records,
        completeNext(outcome = 'complete') {
          const transaction = transactions.find(item => !item.finished);
          if (!transaction) throw new Error('fake IndexedDB has no pending transaction');
          transaction.finish(outcome);
        },
      };
    };
    const setIndexedDb = fake => Object.defineProperty(window, 'indexedDB', { configurable: true, value: fake });
    const restoreIndexedDb = () => {
      if (originalIndexedDbDescriptor) Object.defineProperty(window, 'indexedDB', originalIndexedDbDescriptor);
      else delete window.indexedDB;
    };
    const results = {};
    try {
      sessionStorage.clear();
      const fake = createFakeIndexedDb();
      setIndexedDb(fake);
      const scope = 'dev106-harness-owner:dev106-harness-workspace:dev106-harness-board:queue';
      const firstSave = service.saveMeetingDraftSnapshot(snapshot(scope, 1, 'S1'));
      await waitFor(() => fake.transactions.length === 1);
      const secondSave = service.saveMeetingDraftSnapshot(snapshot(scope, 2, 'S2'));
      const latestSave = service.saveMeetingDraftSnapshot(snapshot(scope, 3, 'S3'));
      await new Promise(resolve => setTimeout(resolve, 15));
      const unresolvedBeforeCommit = await Promise.race([
        firstSave.then(() => false),
        new Promise(resolve => setTimeout(() => resolve(true), 10)),
      ]);
      fake.completeNext('complete');
      await waitFor(() => fake.transactions.length === 2);
      fake.completeNext('complete');
      const queueResults = await Promise.all([firstSave, secondSave, latestSave]);
      const loadedPromise = service.loadMeetingDraftSnapshot(scope);
      await waitFor(() => fake.transactions.length === 3);
      fake.completeNext('complete');
      const loaded = await loadedPromise;
      results.transactionOrder = fake.events.slice(0, 4);
      results.transactionAcknowledgement = unresolvedBeforeCommit && queueResults.every(item => item.indexedDbSaved);
      results.queueCoalescing = loaded?.draft.content === 'S3' && queueResults.length === 3;

      const clearScope = 'dev106-harness-owner:dev106-harness-workspace:dev106-harness-board:clear';
      const saveBeforeClear = service.saveMeetingDraftSnapshot(snapshot(clearScope, 1, 'clear-me'));
      await waitFor(() => fake.transactions.length === 4);
      const clearPromise = service.clearMeetingDraftSnapshot(clearScope);
      fake.completeNext('complete');
      await waitFor(() => fake.transactions.length === 5);
      fake.completeNext('complete');
      const clearResult = await clearPromise;
      await saveBeforeClear;
      const afterClearPromise = service.loadMeetingDraftSnapshot(clearScope);
      await waitFor(() => fake.transactions.length === 6);
      fake.completeNext('complete');
      const afterClear = await afterClearPromise;
      results.clearBarrier = clearResult && !afterClear;

      const failing = createFakeIndexedDb('error');
      setIndexedDb(failing);
      const degradedScope = 'dev106-harness-owner:dev106-harness-workspace:dev106-harness-board:degraded';
      const degraded = await service.saveMeetingDraftSnapshot(snapshot(degradedScope, 1, 'session-only'));
      const degradedClear = await service.clearMeetingDraftSnapshot(degradedScope);
      const failedBothScope = 'dev106-harness-owner:dev106-harness-workspace:dev106-harness-board:failed-both';
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('projed:meeting-draft-recovery:v1:')) throw new Error('injected sessionStorage failure');
        return originalSetItem.call(this, key, value);
      };
      const failedBoth = await service.saveMeetingDraftSnapshot(snapshot(failedBothScope, 1, 'error'));
      Storage.prototype.setItem = originalSetItem;
      results.sessionFallback = degraded.sessionStorageSaved && !degraded.indexedDbSaved && degraded.status === 'degraded' && degradedClear;
      results.bothStorageFailure = !failedBoth.sessionStorageSaved && !failedBoth.indexedDbSaved && failedBoth.status === 'error';
      const aborting = createFakeIndexedDb();
      setIndexedDb(aborting);
      const abortScope = 'dev106-harness-owner:dev106-harness-workspace:dev106-harness-board:abort';
      const abortSavePromise = service.saveMeetingDraftSnapshot(snapshot(abortScope, 1, 'abort-save'));
      await waitFor(() => aborting.transactions.length === 1);
      aborting.completeNext('abort');
      const abortedSave = await abortSavePromise;
      const clearFailPromise = service.clearMeetingDraftSnapshot(abortScope);
      await waitFor(() => aborting.transactions.length === 2);
      aborting.completeNext('abort');
      const clearFailed = await clearFailPromise;
      results.deleteAbortPreservesSession = abortedSave.sessionStorageSaved && !abortedSave.indexedDbSaved && abortedSave.status === 'degraded'
        && clearFailed === false
        && sessionStorage.getItem(service.getMeetingDraftRecoverySessionKey(abortScope)) !== null;
      results.transactionOrderValid = fake.events.indexOf('request:put:1') < fake.events.indexOf('transaction:complete');
      results.all = Object.values(results).every(value => value === true || Array.isArray(value));
      return results;
    } finally {
      sessionStorage.clear();
      restoreIndexedDb();
    }
  });

  await runCase('TC-106-runtime', '可控 IndexedDB runtime 證明 request success 不等於 transaction commit、S1/S2/S3 coalesce、clear barrier 與 session fallback。', async () => {
    const result = await runRecoveryServiceHarness();
    assert(result.all && result.transactionAcknowledgement && result.queueCoalescing && result.clearBarrier && result.sessionFallback && result.bothStorageFailure && result.deleteAbortPreservesSession, 'recovery service runtime harness failed', result);
    return result;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await runCase('ROT-106-001', '內容變更後即使快速按關閉，也先完成本機 recovery 保存再離開。', async () => {
    await seedTestSession();
    await startMeeting();
    const sideEffectsBefore = await sideEffectStorage();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 快速關閉仍可復原的會議速記');
    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    const storage = await recoveryStorage();
    assert(storage.sessionKeys.length + storage.indexedDbScopes.length > 0, 'safe close did not leave a recovery snapshot', storage);
    const sideEffectsAfter = await sideEffectStorage();
    assert(JSON.stringify(sideEffectsAfter) === JSON.stringify(sideEffectsBefore), 'recovery close changed canonical/side-effect storage', { sideEffectsBefore, sideEffectsAfter });
    return { ...storage, sideEffectDelta: [] };
  });

  await runCase('ROT-106-001-reload', '頁面重新載入後，會議內容自動回到編輯器且維持草稿狀態。', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText('DEV-106 快速關閉仍可復原的會議速記', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    const statusLocator = page.locator('[data-meeting-draft-recovery-status]');
    const statusCount = await statusLocator.count();
    const status = statusCount > 0 ? await statusLocator.innerText() : '';
    assert(!status.includes('已保存在此裝置'), 'normal local save status must not render a status row', { status, statusCount });
    await page.screenshot({ path: `${OUTPUT_DIR}/desktop-recovered.png`, scale: 'css' });
    return { status, statusCount };
  });

  await runCase('ROT-106-005', 'IndexedDB 開啟失敗時不離開、不重置輸入，只提供重試保護、存草稿後離開、取消三個恢復型動作。', async () => {
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
      window.__DEV106_NATIVE_IDB_DESCRIPTOR__ = descriptor;
      const failingIndexedDb = {
        open() {
          const request = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
          setTimeout(() => request.onerror?.({ target: request }), 0);
          return request;
        },
      };
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: failingIndexedDb });
    });
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 IDB 失敗仍留在畫面的內容');
    await page.locator('[data-record-composer-close]').click();
    const dialog = page.locator('[data-global-dialog="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    const labels = await dialog.locator('[data-global-dialog-decision="true"]').allTextContents();
    const normalizedLabels = labels.map(label => label.replace(/\s+/g, ' ').trim());
    assert(normalizedLabels.length === 3, 'failure dialog action count changed', { labels: normalizedLabels });
    assert(normalizedLabels.some(label => label.includes('重試保護')) && normalizedLabels.some(label => label.includes('存草稿後離開')) && normalizedLabels.some(label => label.includes('取消')), 'failure dialog lacks recovery actions', { labels: normalizedLabels });
    assert(!normalizedLabels.some(label => /捨棄|不儲存|直接離開/.test(label)), 'failure dialog exposed destructive direct-leave action', { labels: normalizedLabels });
    await dialog.locator('[data-global-dialog-decision="true"]', { hasText: '取消' }).click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 5000 });
    assert((await editor.innerText()).includes('DEV-106 IDB 失敗仍留在畫面的內容'), 'cancelled failure dialog lost editor content');
    await page.evaluate(() => {
      const descriptor = window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
      if (descriptor) Object.defineProperty(window, 'indexedDB', descriptor);
      else delete window.indexedDB;
      delete window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
    });
    await page.locator('[data-meeting-draft-overflow]').click();
    await page.locator('[data-meeting-draft-overflow-menu] [data-meeting-draft-discard]').click();
    const discardDialog = page.locator('[data-global-dialog="true"]');
    await discardDialog.waitFor({ state: 'visible', timeout: 5000 });
    await discardDialog.locator('[data-global-dialog-decision="true"]', { hasText: '刪除並離開' }).click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    return { labels: normalizedLabels, cancelledWithContent: true };
  });

  await runCase('ROT-106-006', 'force-flush 超過 2,000ms 未取得本機 acknowledgement 時，停止 navigation 並保留編輯器。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 force flush timeout remains editable');
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
      window.__DEV106_NATIVE_IDB_DESCRIPTOR__ = descriptor;
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: { open: () => ({ result: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null }) },
      });
    });
    const startedAt = Date.now();
    await page.locator('[data-record-composer-close]').click();
    const dialog = page.locator('[data-global-dialog="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 4000 });
    const elapsedMs = Date.now() - startedAt;
    const labels = await dialog.locator('[data-global-dialog-decision="true"]').allTextContents();
    const normalizedLabels = labels.map(label => label.replace(/\s+/g, ' ').trim());
    assert(elapsedMs >= 1_500 && elapsedMs < 4_000, 'force flush timeout did not use the bounded wait window', { elapsedMs });
    assert(normalizedLabels.length === 3 && normalizedLabels.some(label => label.includes('重試保護')) && normalizedLabels.some(label => label.includes('存草稿後離開')) && normalizedLabels.some(label => label.includes('取消')), 'timeout dialog lacks recovery-only actions', { labels: normalizedLabels });
    await dialog.locator('[data-global-dialog-decision="true"]', { hasText: '取消' }).click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'visible', timeout: 5000 });
    assert((await editor.innerText()).includes('DEV-106 force flush timeout remains editable'), 'timeout cancellation lost editor content');
    await page.evaluate(() => {
      const descriptor = window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
      if (descriptor) Object.defineProperty(window, 'indexedDB', descriptor);
      else delete window.indexedDB;
      delete window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seedTestSession();
    return { elapsedMs, labels: normalizedLabels, cancelledWithContent: true };
  });

  await runCase('ROT-106-002', '1024px 下由紀錄庫、設定與系統頁返回看板離開時，皆先完成 force-flush 並保留 recovery。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 1024px view transition safety');
    const sidebarToggle = page.locator('[data-main-sidebar-toggle]');
    if (await sidebarToggle.getAttribute('aria-label') === '展開工作區選單') {
      await sidebarToggle.click();
    }
    await page.locator('[data-sidebar-records-button="true"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-sidebar-records-button="true"]').click();
    await page.locator('[data-records-active-section="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    const recordsStorage = await recoveryStorage();
    assert(recordsStorage.sessionKeys.length + recordsStorage.indexedDbScopes.length > 0, 'records view transition did not preserve recovery', recordsStorage);
    await page.locator('[data-sidebar-settings-button="true"]').click();
    await page.locator('[data-settings-view="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-settings-return-button="true"]').click();
    await page.locator('[data-topbar-board-title="true"]').waitFor({ state: 'visible', timeout: 10000 });
    const finalStorage = await recoveryStorage();
    assert(finalStorage.sessionKeys.length + finalStorage.indexedDbScopes.length > 0, 'return-to-board transition cleared recovery', finalStorage);
    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    return { recordsStorage, finalStorage, viewTransitions: ['records', 'settings', 'escape-to-board'] };
  });

  await runCase('ROT-106-011', '1024px；從正常紀錄庫入口開啟既有紀錄與新增會議紀錄，切換前均保留原 meeting recovery。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const titleInput = page.locator('[data-record-title-input]').last();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await titleInput.fill('DEV-106 existing record fixture');
    await editor.fill('DEV-106 existing record content');
    await page.locator('[data-record-meeting-save-draft]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });

    await startMeeting();
    const newMeetingEditor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await newMeetingEditor.fill('DEV-106 draft before opening existing record');
    const sidebarToggle = page.locator('[data-main-sidebar-toggle]');
    if (await sidebarToggle.getAttribute('aria-label') === '展開工作區選單') await sidebarToggle.click();
    await page.locator('[data-sidebar-records-button="true"]').click();
    await page.locator('[data-records-active-section="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    const existingRow = page.locator('[data-record-section="meeting"] [data-record-list] button').filter({ hasText: 'DEV-106 existing record fixture' }).first();
    await existingRow.waitFor({ state: 'visible', timeout: 10000 });
    await existingRow.click();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    assert(await titleInput.inputValue() === 'DEV-106 existing record fixture', 'open existing record did not reach canonical record', { title: await titleInput.inputValue() });
    const preservedStorage = await recoveryStorage();
    assert(preservedStorage.sessionKeys.length + preservedStorage.indexedDbScopes.length > 0, 'open existing record cleared replaced meeting recovery', preservedStorage);

    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    await page.getByRole('button', { name: '新增會議記錄' }).click();
    await page.locator('[data-record-workflow-kind="meeting"]').waitFor({ state: 'visible', timeout: 10000 });
    const openedNewTitle = await page.locator('[data-record-title-input]').last().inputValue();
    assert(openedNewTitle !== 'DEV-106 existing record fixture', 'new meeting entry reopened existing record', { openedNewTitle });
    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    return { existingRecordOpened: true, newMeetingOpened: true, recoveryPreservedBeforeReplacement: true, preservedStorage };
  });

  await runCase('ROT-106-007', 'canonical 存草稿成功後才更新基線並清除同 scope recovery；清理不影響正式紀錄。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 canonical save cleanup');
    await page.locator('[data-record-meeting-save-draft]').click();
    await page.waitForTimeout(250);
    const storage = await recoveryStorage();
    assert(storage.sessionKeys.length === 0 && storage.indexedDbScopes.length === 0, 'canonical save did not clean same-scope recovery', storage);
    const status = await page.locator('[data-record-composer-shell]').innerText();
    assert(status.includes('存草稿') || status.includes('會議'), 'canonical save left composer unavailable');
    await page.locator('[data-record-composer-close]').click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    return { storage, canonicalSaved: true };
  });

  await runCase('ROT-106-008', 'canonical save 成功但 recovery cleanup abort 時，正式內容仍保留且 recovery 不被誤清除。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 canonical save cleanup abort preserves recovery');
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
      window.__DEV106_NATIVE_IDB_DESCRIPTOR__ = descriptor;
      const database = {
        objectStoreNames: { contains: () => true },
        close: () => undefined,
        transaction: () => {
          const transaction = { oncomplete: null, onerror: null, onabort: null };
          setTimeout(() => transaction.onabort?.({ target: transaction }), 0);
          transaction.objectStore = () => ({
            delete: () => ({}),
            getAll: () => {
              const request = { result: [], onsuccess: null, onerror: null };
              setTimeout(() => request.onsuccess?.({ target: request }), 0);
              return request;
            },
          });
          return transaction;
        },
      };
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: {
          open: () => {
            const request = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
            setTimeout(() => request.onsuccess?.({ target: request }), 0);
            return request;
          },
        },
      });
    });
    await page.locator('[data-record-meeting-save-draft]').click();
    await page.locator('[data-meeting-draft-recovery-status]').waitFor({ state: 'visible', timeout: 5000 });
    const statusTitle = await page.locator('[data-meeting-draft-recovery-status]').getAttribute('title');
    const storage = await recoveryStorage();
    assert((statusTitle || '').includes('本機清理尚未完成'), 'cleanup abort did not expose retryable cleanup state', { statusTitle });
    assert(storage.sessionKeys.length + storage.indexedDbScopes.length > 0, 'cleanup abort removed recovery snapshot', storage);
    await page.evaluate(() => {
      const descriptor = window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
      if (descriptor) Object.defineProperty(window, 'indexedDB', descriptor);
      else delete window.indexedDB;
      delete window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
    });
    await page.locator('[data-record-meeting-save-draft]').click();
    await page.waitForTimeout(300);
    const retryStorage = await recoveryStorage();
    assert(retryStorage.sessionKeys.length === 0 && retryStorage.indexedDbScopes.length === 0, 'cleanup retry did not clear preserved recovery', retryStorage);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seedTestSession();
    return { statusTitle, storage, retryStorage, canonicalSaved: true, recoveryPreserved: true, cleanupRetried: true };
  });

  await runCase('ROT-106-009', 'meeting autosave、restore、close 與 discard 不呼叫任何 provider adapter checkpoint。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    await page.evaluate(async () => {
      const [backendModule, localModule, firestoreModule, supabaseModule] = await Promise.all([
        import('/src/services/dataBackend.ts'),
        import('/src/services/localTestService.ts'),
        import('/src/services/firestoreService.ts'),
        import('/src/services/supabase/projedService.ts'),
      ]);
      const providers = [
        ['dataBackend', backendModule.recordService],
        ['localTest', localModule.localTestRecordService],
        ['firestore', firestoreModule.recordService],
        ['supabase', supabaseModule.supabaseRecordService],
      ];
      const calls = Object.fromEntries(providers.map(([name]) => [name, 0]));
      const originals = providers.map(([, service]) => service.checkpointDraft);
      providers.forEach(([name, service], index) => {
        service.checkpointDraft = async (...args) => {
          calls[name] += 1;
          return originals[index](...args);
        };
      });
      window.__DEV106_CHECKPOINT_SPY__ = { calls, providers, originals };
    });
    try {
      const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
      await editor.fill('DEV-106 provider adapter zero checkpoint');
      await page.waitForTimeout(700);
      await page.locator('[data-record-composer-close]').click();
      await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
      const calls = await page.evaluate(() => ({ ...window.__DEV106_CHECKPOINT_SPY__.calls }));
      assert(Object.values(calls).every(value => value === 0), 'meeting recovery called a provider checkpoint adapter', { calls });
      return { calls, remoteRecoveryRequests: 0 };
    } finally {
      await page.evaluate(() => {
        const spy = window.__DEV106_CHECKPOINT_SPY__;
        if (!spy) return;
        spy.providers.forEach(([, service], index) => { service.checkpointDraft = spy.originals[index]; });
        delete window.__DEV106_CHECKPOINT_SPY__;
      });
    }
  });

  await runCase('ROT-106-012', 'provider checkpoint／正式紀錄／event service failure injection 不得滲入 meeting recovery；autosave、close、discard 仍維持本機隔離。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await page.evaluate(async () => {
      const [backendModule, localModule, firestoreModule, supabaseModule, recordStoreModule, undoStoreModule] = await Promise.all([
        import('/src/services/dataBackend.ts'),
        import('/src/services/localTestService.ts'),
        import('/src/services/firestoreService.ts'),
        import('/src/services/supabase/projedService.ts'),
        import('/src/store/useRecordStore.ts'),
        import('/src/store/useUndoStore.ts'),
      ]);
      const checkpointProviders = [
        ['dataBackend', backendModule.recordService],
        ['localTest', localModule.localTestRecordService],
        ['firestore', firestoreModule.recordService],
        ['supabase', supabaseModule.supabaseRecordService],
      ];
      const calls = {
        recordUpsert: 0,
        recordDelete: 0,
        eventLog: 0,
        checkpoint: Object.fromEntries(checkpointProviders.map(([name]) => [name, 0])),
      };
      const originals = {
        recordUpsert: backendModule.recordService.upsert,
        recordDelete: backendModule.recordService.delete,
        eventLog: backendModule.eventLogService.logActivity,
        checkpointProviders: checkpointProviders.map(([, service]) => service.checkpointDraft),
      };
      backendModule.recordService.upsert = async (...args) => {
        calls.recordUpsert += 1;
        throw new Error('injected canonical upsert failure');
      };
      backendModule.recordService.delete = async (...args) => {
        calls.recordDelete += 1;
        throw new Error('injected canonical delete failure');
      };
      backendModule.eventLogService.logActivity = async (...args) => {
        calls.eventLog += 1;
        throw new Error('injected event log failure');
      };
      checkpointProviders.forEach(([name, service]) => {
        service.checkpointDraft = async (...args) => {
          calls.checkpoint[name] += 1;
          throw new Error(`injected ${name} checkpoint failure`);
        };
      });
      const recordStore = recordStoreModule.default;
      const undoStore = undoStoreModule.default;
      const recordActionNames = [
        'saveDraft',
        'archiveRecord',
        'synthesizeMeetingDraft',
        'appendTaskDiscussionToMeetingDraft',
        'recordMeetingTaskActivity',
      ];
      const originalRecordActions = Object.fromEntries(recordActionNames.map(name => [name, recordStore.getState()[name]]));
      const originalUndoPush = undoStore.getState().pushUndo;
      const recordActionCalls = Object.fromEntries(recordActionNames.map(name => [name, 0]));
      recordStore.setState(Object.fromEntries(recordActionNames.map(name => [name, (...args) => {
        recordActionCalls[name] += 1;
        throw new Error(`injected meeting recovery store action ${name}`);
      }])));
      calls.undoPush = 0;
      undoStore.setState({
        pushUndo: (...args) => {
          calls.undoPush += 1;
          throw new Error('injected meeting recovery undo push');
        },
      });
      window.__DEV106_FAILURE_INJECTION_SPY__ = {
        calls,
        checkpointProviders,
        originals,
        backendModule,
        recordStore,
        undoStore,
        originalRecordActions,
        originalUndoPush,
        recordActionCalls,
      };
    });
    const sideEffectsBefore = await sideEffectStorage();
    try {
      await startMeeting();
      const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
      await editor.fill('DEV-106 provider failure injection close isolation');
      await page.waitForTimeout(700);
      await page.locator('[data-record-composer-close]').click();
      await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
      const closeStorage = await recoveryStorage();
      assert(closeStorage.sessionKeys.length + closeStorage.indexedDbScopes.length > 0, 'provider failure injection lost local recovery on close', closeStorage);

      await startMeeting();
      const discardEditor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
      await discardEditor.fill('DEV-106 provider failure injection discard isolation');
      await page.locator('[data-meeting-draft-overflow]').click();
      await page.locator('[data-meeting-draft-overflow-menu] [data-meeting-draft-discard]').click();
      const dialog = page.locator('[data-global-dialog="true"]');
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      await dialog.locator('[data-global-dialog-decision="true"]', { hasText: '刪除並離開' }).click();
      await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
      const sideEffectsAfter = await sideEffectStorage();
      const calls = await page.evaluate(() => ({
        recordUpsert: window.__DEV106_FAILURE_INJECTION_SPY__.calls.recordUpsert,
        recordDelete: window.__DEV106_FAILURE_INJECTION_SPY__.calls.recordDelete,
        eventLog: window.__DEV106_FAILURE_INJECTION_SPY__.calls.eventLog,
        undoPush: window.__DEV106_FAILURE_INJECTION_SPY__.calls.undoPush,
        recordActions: { ...window.__DEV106_FAILURE_INJECTION_SPY__.recordActionCalls },
        checkpoint: { ...window.__DEV106_FAILURE_INJECTION_SPY__.calls.checkpoint },
      }));
      assert(calls.recordUpsert === 0 && calls.recordDelete === 0 && calls.eventLog === 0 && calls.undoPush === 0 && Object.values(calls.recordActions).every(value => value === 0) && Object.values(calls.checkpoint).every(value => value === 0), 'meeting recovery entered a failure-injected provider or side-effect service', { calls });
      assert(JSON.stringify(sideEffectsAfter) === JSON.stringify(sideEffectsBefore), 'provider failure injection changed side-effect storage', { sideEffectsBefore, sideEffectsAfter });
      return { calls, closeStorage, sideEffectDelta: [], localRecoveryUnaffected: true };
    } finally {
      await page.evaluate(() => {
        const spy = window.__DEV106_FAILURE_INJECTION_SPY__;
        if (!spy) return;
        spy.backendModule.recordService.upsert = spy.originals.recordUpsert;
        spy.backendModule.recordService.delete = spy.originals.recordDelete;
        spy.backendModule.eventLogService.logActivity = spy.originals.eventLog;
        spy.checkpointProviders.forEach(([, service], index) => { service.checkpointDraft = spy.originals.checkpointProviders[index]; });
        spy.recordStore.setState({ ...spy.originalRecordActions });
        spy.undoStore.setState({ pushUndo: spy.originalUndoPush });
        delete window.__DEV106_FAILURE_INJECTION_SPY__;
      });
    }
  });

  await runCase('ROT-106-010', 'explicit discard 的取消與 IDB abort 都保留內容，且操作後焦點回到會議操作入口。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 discard keyboard focus recovery');
    await page.waitForTimeout(700);

    const overflow = page.locator('[data-meeting-draft-overflow]');
    await overflow.click();
    await page.locator('[data-meeting-draft-overflow-menu] [data-meeting-draft-discard]').click();
    const cancelDialog = page.locator('[data-global-dialog="true"]');
    await cancelDialog.waitFor({ state: 'visible', timeout: 5000 });
    await cancelDialog.locator('[data-global-dialog-decision-index="1"]').focus();
    await page.keyboard.press('Escape');
    await cancelDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.matches('[data-meeting-draft-overflow]') ?? false, null, { timeout: 5000 });
    const focusAfterCancel = await page.evaluate(() => document.activeElement?.matches('[data-meeting-draft-overflow]') ?? false);
    assert(focusAfterCancel, 'discard cancel did not restore focus to meeting operations', { focusAfterCancel });

    await overflow.click();
    await page.locator('[data-meeting-draft-overflow-menu] [data-meeting-draft-discard]').click();
    const failureDialog = page.locator('[data-global-dialog="true"]');
    await failureDialog.waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
      window.__DEV106_NATIVE_IDB_DESCRIPTOR__ = descriptor;
      const database = {
        objectStoreNames: { contains: () => true },
        close: () => undefined,
        transaction: () => {
          const transaction = { oncomplete: null, onerror: null, onabort: null };
          transaction.objectStore = () => ({
            delete: () => ({}),
            getAll: () => {
              const request = { result: [], onsuccess: null, onerror: null };
              setTimeout(() => request.onsuccess?.({ target: request }), 0);
              return request;
            },
          });
          setTimeout(() => transaction.onabort?.({ target: transaction }), 0);
          return transaction;
        },
      };
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: {
          open: () => {
            const request = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
            setTimeout(() => request.onsuccess?.({ target: request }), 0);
            return request;
          },
        },
      });
    });
    const discardAction = failureDialog.locator('[data-global-dialog-decision-index="0"]');
    await discardAction.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-meeting-draft-recovery-status]').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.matches('[data-meeting-draft-overflow]') ?? false, null, { timeout: 5000 });
    const statusTitle = await page.locator('[data-meeting-draft-recovery-status]').getAttribute('title');
    const failureFocus = await page.evaluate(() => document.activeElement?.matches('[data-meeting-draft-overflow]') ?? false);
    assert((statusTitle || '').includes('本機內容尚未清除'), 'discard abort did not expose fail-closed state', { statusTitle });
    assert(failureFocus, 'discard abort did not restore focus to meeting operations', { failureFocus });
    assert((await editor.innerText()).includes('DEV-106 discard keyboard focus recovery'), 'discard abort lost editor content');
    await page.evaluate(() => {
      const descriptor = window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
      if (descriptor) Object.defineProperty(window, 'indexedDB', descriptor);
      else delete window.indexedDB;
      delete window.__DEV106_NATIVE_IDB_DESCRIPTOR__;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await seedTestSession();
    return { focusAfterCancel, failureFocus, statusTitle, cancelledWithContent: true, abortPreservedContent: true };
  });

  await runCase('ROT-106-003', '使用者透過會議操作明確捨棄後，當前 recovery 快照從 IndexedDB 與 sessionStorage 清除。', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedTestSession();
    await startMeeting();
    const editor = page.locator('[data-record-composer-shell] [contenteditable="true"]').last();
    await editor.fill('DEV-106 explicit discard content');
    await page.locator('[data-meeting-draft-overflow]').click();
    const menu = page.locator('[data-meeting-draft-overflow-menu]');
    await menu.waitFor({ state: 'visible', timeout: 5000 });
    await menu.locator('[data-meeting-draft-discard]').click();
    const dialog = page.locator('[data-global-dialog="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    await dialog.locator('[data-global-dialog-decision="true"]', { hasText: '刪除並離開' }).click();
    await page.locator('[data-record-composer-shell]').waitFor({ state: 'hidden', timeout: 5000 });
    const storage = await recoveryStorage();
    assert(storage.sessionKeys.length === 0 && storage.indexedDbScopes.length === 0, 'discard left recovery data behind', storage);
    return storage;
  });

  await runCase('ROT-106-004', '手機 390px 不顯示會議入口與編輯器，避免窄視窗誤觸發會議流程。', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      meetingEntry: Array.from(document.querySelectorAll('button')).some(button => (button.textContent || '').includes('新增會議記錄')),
      meetingShell: Boolean(document.querySelector('[data-record-composer-shell]')),
      meetingWorkflow: document.body.innerText.includes('會議流程'),
    }));
    assert(!state.meetingEntry && !state.meetingShell && !state.meetingWorkflow, 'mobile meeting boundary regressed', state);
    await page.screenshot({ path: `${OUTPUT_DIR}/mobile-390-negative.png`, scale: 'css' });
    return state;
  });

  await visibleErrorSweep('DEV-106 final');
  assert(diagnostics.length === 0, 'browser console/page errors detected', { diagnostics });
  assert(httpFailures.length === 0, 'browser HTTP failures detected', { httpFailures });
  assert(remoteRecoveryRequests.length === 0, 'remote meeting recovery request detected', { remoteRecoveryRequests });
  await page.evaluate(result => { window.__DEV106_ARTIFACT = result; }, { status: 'PASS', cases, diagnostics, httpFailures, remoteRecoveryRequests });
  console.log('DEV-106 browser verification passed: local commit truth, failure recovery dialog, guarded view transitions, canonical cleanup, explicit discard, mobile boundary, and remote recovery zero-request sweep.');
}
