/* eslint-disable */
async page => {
  const origin = '__ORIGIN__', a = '__VERSION_A__', b = '__VERSION_B__';
  const mode = '__DEV134_MODE__';
  const results = [], diagnostics = [];
  const context = page.context();
  const assert = (condition, message, details) => { if (!condition) throw new Error(message + ': ' + JSON.stringify(details)); };
  const check = async (name, work) => { const progress={}; try { const details = await work(progress); results.push({ name, ok: true, details }); } catch (error) { results.push({ name, ok: false, error: error.message, stack:error.stack, partial:progress }); } };
  const attach = tab => {
    tab.on('pageerror', error => diagnostics.push({ type:'pageerror', url:tab.url(), message:error.message }));
    tab.on('console', message => { if(message.type()==='error') diagnostics.push({type:'console-error',url:tab.url(),message:message.text()}); });
  };
  const seededTaskContexts = new WeakSet();
  const seedTaskSentinel = async tab => {
    const owner=tab.context();
    if(seededTaskContexts.has(owner))return;
    await tab.evaluate(()=>localStorage.setItem('dev134-u-evidence-sentinel','preserve'));
    seededTaskContexts.add(owner);
  };
  const taskEvidence = async tab => tab.evaluate(async () => {
    const name='projed-quick-task-v1';
    if (indexedDB.databases && !(await indexedDB.databases()).some(item=>item.name===name)) return { expectedPendingTaskCount:0, records:[], sentinel:localStorage.getItem('dev134-u-evidence-sentinel') };
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const records=await new Promise((resolve,reject)=>{const request=db.transaction('captures').objectStore('captures').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    db.close();
    const pending=records.filter(item=>item.state!=='synced');
    return { expectedPendingTaskCount:pending.length, records:pending.map(item=>({captureId:item.captureId,state:item.state,title:item.title,accountId:item.accountId??null})), sentinel:localStorage.getItem('dev134-u-evidence-sentinel') };
  });
  const visibleUnexpectedErrors = async tab => tab.evaluate(() => [...document.querySelectorAll('.inline-error,[role="alert"],[data-error],.error-message')]
    .filter(element => !element.closest('[data-pwa-update-prompt],.quick-task-pwa-update')
      && !element.hidden && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
    .map(element => ({selector:element.tagName.toLowerCase()+(element.id?`#${element.id}`:''),text:element.textContent?.trim().slice(0,240)??''})));
  const mainLayoutChildSnapshot = tab => tab.evaluate(() => {
    const main=document.querySelector('main[data-app-main="true"]');
    const headings=main?[...main.querySelectorAll('h1,h2,h3')].map(element=>({tag:element.tagName,text:element.textContent?.trim()??''})):[];
    const homeHeadingCount=headings.filter(item=>item.tag==='H2'&&item.text==='工作區總覽').length;
    const settingsRoot=main?.querySelector('[data-settings-view="true"]')??null;
    const homeEmptyState=main?[...main.querySelectorAll('section')].map(element=>element.textContent?.trim()??'').find(text=>text.startsWith('尚未建立工作區。'))??null:null;
    return {url:location.href,title:document.title,mainCount:document.querySelectorAll('main[data-app-main="true"]').length,
      mainPresent:Boolean(main),mainChildren:main?[...main.children].map(element=>({tag:element.tagName,className:element.className?.toString?.()??'',text:element.textContent?.trim().slice(0,500)??''})):[],
      headings,homeHeadingCount,settingsRootCount:main?.querySelectorAll('[data-settings-view="true"]').length??0,
      settingsHeading:settingsRoot?.querySelector('h2')?.textContent?.trim()??null,homeEmptyState,
      appMenuCount:document.querySelectorAll('[data-app-more-menu]').length,authGateHeadings:[...document.querySelectorAll('#root h1')].map(element=>element.textContent?.trim()??'')};
  });

if (mode === 'u09') {
  const legacy = '__VERSION_L__';
  const androidUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const startedAt = Date.now();
  const requestEvents = [];
  const httpFailures = [];
  const blockedExternalRequests = [];
  const u09 = {
    mode: 'U09 real service worker update with isolated Android standalone simulation',
    simulation: [
      'Android user agent and display-mode standalone are profile-scoped SIMULATION.',
      'Non-loopback HTTP(S) requests are blocked and recorded; no remote write is performed.',
      'Service worker registration, ready, update, Quick Task form, outbox, update check, and prompt remain real.',
    ],
    legacy,
    targetVersion: b,
    startedAt: new Date(startedAt).toISOString(),
    steps: [],
    screenshots: [],
    requestEvents,
    httpFailures,
    blockedExternalRequests,
    cleanup: { ownedContextCreated: false, ownedContextClosed: false },
  };
  let profileContext = null;
  let safePage = null;
  let aClientPage = null;
  let progressRef = null;

  const recordStep = (name, details) => {
    u09.steps.push({ name, at: new Date().toISOString(), ...details });
    if (progressRef) progressRef.evidence = u09;
  };
  const failIf = (condition, message, details) => assert(condition, message, details);
  const attachU09 = (tab, role) => {
    attach(tab);
    tab.on('request', request => requestEvents.push({
      role,
      at: Date.now(),
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
    }));
    tab.on('response', response => {
      if (response.status() >= 400) {
        httpFailures.push({ role, at: Date.now(), status: response.status(), url: response.url() });
      }
    });
  };
  let candidatePublished = false;
  const readPageEvidence = (tab, includeUpdateApi = true) => tab.evaluate(async ({ includeApi, readLegacyMetadata }) => {
    const readJson = async path => {
      try {
        const response = await fetch(path, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        return { status: response.status, body: response.ok ? await response.json() : null };
      } catch (error) {
        return { status: null, error: error instanceof Error ? error.message : String(error) };
      }
    };
    const registration = await navigator.serviceWorker?.ready?.catch(() => null);
    const state = includeApi ? window.__DEV134_PWA?.getState?.() ?? null : null;
    const status = includeApi ? document.querySelector('[data-quick-update-status]') : null;
    const menu = includeApi ? document.querySelector('details[data-quick-install-menu="true"]') : null;
    const prompt = includeApi ? document.querySelector('[data-pwa-update-prompt]') : null;
    const transactionRaw = localStorage.getItem('projed.pwa-update.transaction.v1');
    let transaction = null;
    let transactionParseError = null;
    if (transactionRaw) {
      try { transaction = JSON.parse(transactionRaw); }
      catch (error) { transactionParseError = error instanceof Error ? error.message : String(error); }
    }
    return {
      route: location.pathname,
      timeOrigin: performance.timeOrigin,
      titleDraft: document.querySelector('#quick-task-title')?.value ?? null,
      embeddedVersion: document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content') ?? null,
      entryScripts: [...document.querySelectorAll('script[type="module"][src]')].map(script => script.getAttribute('src')),
      updaterResources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /pwaUpdateService[^/]*\.js/u.test(name)),
      legacyTransaction: { present: Boolean(transactionRaw), value: transaction, parseError: transactionParseError },
      releaseMetadata: readLegacyMetadata ? await readJson('/release-meta.json') : { skipped: true, reason: 'sealed metadata verified before candidate publication; current fixture uses app-shell metadata' },
      appShellMetadata: includeApi ? await readJson('/app-shell-meta.json') : { skipped: true, reason: 'sealed L legacy phase does not request the newer endpoint' },
      state,
      serviceWorker: {
        supported: 'serviceWorker' in navigator,
        readyScope: registration?.scope ?? null,
        activeScript: registration?.active?.scriptURL ?? null,
        waitingScript: registration?.waiting?.scriptURL ?? null,
        installingScript: registration?.installing?.scriptURL ?? null,
        controllerScript: navigator.serviceWorker?.controller?.scriptURL ?? null,
        controllerChanges: window.__DEV134U09Lifecycle?.controllerChanges ?? [],
        pageshows: window.__DEV134U09Lifecycle?.pageshows ?? [],
      },
      menu: includeApi ? {
        count: document.querySelectorAll('details[data-quick-install-menu="true"]').length,
        open: Boolean(menu?.open),
        legacyInstallRootCount: document.querySelectorAll('#quick-task-install').length,
        checkCount: document.querySelectorAll('[data-quick-update-check]').length,
        checkDisabled: document.querySelector('[data-quick-update-check]')?.disabled ?? null,
        checkText: document.querySelector('[data-quick-update-check]')?.textContent?.trim() ?? null,
        statusText: status?.textContent?.trim() ?? null,
        statusHidden: status?.hidden ?? null,
        reloadCount: document.querySelectorAll('[data-quick-update-reload]').length,
      } : { inspected: false, legacyInstallRootCount: document.querySelectorAll('#quick-task-install').length },
      prompt: includeApi ? {
        count: document.querySelectorAll('[data-pwa-update-prompt]').length,
        visible: Boolean(prompt && !prompt.hidden && getComputedStyle(prompt).display !== 'none'),
        text: prompt?.textContent?.trim() ?? null,
        failureKind: state?.failureKind ?? null,
        errorCode: state?.errorCode ?? null,
        errorMessage: state?.errorMessage ?? null,
      } : { inspected: false, reason: 'legacy prompt state is not inferred from the newer update API' },
      legacyObservation: {
        apiAvailability: includeApi ? (state ? 'available' : 'unknown/not exposed by this artifact') : 'unknown/not queried by legacy contract',
        inputValue: document.querySelector('#quick-task-title')?.value ?? null,
        inputDisabled: document.querySelector('#quick-task-title')?.disabled ?? null,
        submitDisabled: document.querySelector('#quick-task-submit')?.disabled ?? null,
      },
      standalone: matchMedia('(display-mode: standalone)').matches,
      userAgent: navigator.userAgent,
    };
  }, { includeApi: includeUpdateApi, readLegacyMetadata: !includeUpdateApi && !candidatePublished });
  const readFixtureRequests = async tab => {
    try {
      const response = await tab.request.get(`${origin}/__dev134/requests`, { timeout: 10000 });
      return { status: response.status(), requests: response.ok() ? await response.json() : [] };
    } catch (error) {
      return { status: null, error: error instanceof Error ? error.message : String(error), requests: [] };
    }
  };
  const capture = async (name, tab, extra = {}, includeUpdateApi = true) => {
    const [browser, task, visibleErrors] = await Promise.all([
      readPageEvidence(tab, includeUpdateApi),
      taskEvidence(tab),
      visibleUnexpectedErrors(tab),
    ]);
    const screenshot = `__VISUALS__/U09-${name}.png`;
    await tab.screenshot({ path: screenshot });
    u09.screenshots.push(screenshot);
    const evidence = { name, browser, taskEvidence: task, visibleUnexpectedErrors: visibleErrors, screenshot, ...extra };
    recordStep(name, evidence);
    return evidence;
  };

  await check('U09-real-service-worker-safe-update-preserves-other-unsafe-client-and-local-task', async progress => {
    progressRef = progress;
    progress.evidence = u09;
    try {
      const initialSwitch = await page.request.get(`${origin}/__dev134/switch?release=L`, { timeout: 10000 });
      u09.serverSwitchToLegacy = { status: initialSwitch.status(), body: await initialSwitch.text() };
      failIf(initialSwitch.ok(), 'U09 could not select sealed legacy release L', u09.serverSwitchToLegacy);
      recordStep('server-selected-L', { response: u09.serverSwitchToLegacy });

      profileContext = await context.browser().newContext({
        userAgent: androidUserAgent,
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'allow',
      });
      u09.cleanup.ownedContextCreated = true;
      await profileContext.addInitScript(() => {
        const originalMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = query => query === '(display-mode: standalone)'
          ? {
            matches: true,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          }
          : originalMatchMedia(query);
        window.__DEV134U09Lifecycle = { controllerChanges: [], pageshows: [] };
        navigator.serviceWorker?.addEventListener('controllerchange', () => {
          window.__DEV134U09Lifecycle.controllerChanges.push({ at: Date.now(), scriptURL: navigator.serviceWorker.controller?.scriptURL ?? null });
        });
        addEventListener('pageshow', event => window.__DEV134U09Lifecycle.pageshows.push({ at: Date.now(), persisted: event.persisted, timeOrigin: performance.timeOrigin }));
      });
      await profileContext.route('**/*', async route => {
        const url = new URL(route.request().url());
        const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1';
        if ((url.protocol === 'http:' || url.protocol === 'https:') && !isLoopback) {
          blockedExternalRequests.push({ at: Date.now(), method: route.request().method(), url: url.href, resourceType: route.request().resourceType() });
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });

      safePage = await profileContext.newPage();
      attachU09(safePage, 'safe-task-client');
      await safePage.goto(`${origin}/quick-task/?install=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await safePage.waitForSelector('#quick-task-title:enabled', { timeout: 20000 });
      await safePage.evaluate(async () => { await navigator.serviceWorker.ready; });
      await safePage.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      await safePage.waitForSelector('#quick-task-title:enabled', { timeout: 20000 });
      await safePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
      await seedTaskSentinel(safePage);

      const taskTitle = `DEV-134 U09 local outbox sentinel ${Date.now()}`;
      u09.taskTitle = taskTitle;
      await safePage.locator('#quick-task-title').fill(taskTitle);
      await safePage.locator('#quick-task-submit').click();
      await safePage.waitForFunction(async expectedTitle => {
        const openDatabase = () => new Promise((resolve, reject) => {
          const request = indexedDB.open('projed-quick-task-v1');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const db = await openDatabase().catch(() => null);
        if (!db || !db.objectStoreNames.contains('captures')) return false;
        const rows = await new Promise(resolve => {
          const request = db.transaction('captures').objectStore('captures').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve([]);
        });
        db.close();
        return rows.some(row => row.title === expectedTitle && row.state !== 'synced');
      }, taskTitle, { timeout: 20000 });
      const localTaskBefore = await taskEvidence(safePage);
      u09.localTaskBefore = localTaskBefore;
      failIf(localTaskBefore.expectedPendingTaskCount === 1
        && localTaskBefore.records[0]?.title === taskTitle
        && localTaskBefore.sentinel === 'preserve', 'U09 did not create exactly one real unsynced local task and sentinel', localTaskBefore);
      await capture('L-safe-task-before-update', safePage, { expectedTaskTitle: taskTitle }, false);

      aClientPage = await profileContext.newPage();
      attachU09(aClientPage, 'unsafe-A-client');
      await aClientPage.goto(`${origin}/quick-task/?install=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await aClientPage.waitForSelector('#quick-task-title:enabled', { timeout: 20000 });
      await aClientPage.evaluate(async () => { await navigator.serviceWorker.ready; });
      await aClientPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
      const draft = `DEV-134 U09 unsafe A-client draft ${Date.now()}`;
      u09.unsafeDraft = draft;
      await aClientPage.locator('#quick-task-title').fill(draft);

      // Give both real app-shell bootstraps their normal three-second initialization window.
      await safePage.waitForTimeout(3000);
      const initialSafe = await capture('L-safe-bootstrap', safePage, { expectedOwnVersion: legacy }, false);
      const initialUnsafe = await capture('L-unsafe-draft-bootstrap', aClientPage, { expectedOwnVersion: legacy, expectedDraft: draft }, false);
      u09.initial = { safe: initialSafe, unsafe: initialUnsafe };
      failIf(initialSafe.browser.serviceWorker.supported
        && Boolean(initialSafe.browser.serviceWorker.readyScope)
        && Boolean(initialSafe.browser.serviceWorker.controllerScript)
        && initialSafe.browser.userAgent.includes('Android')
        && initialSafe.browser.standalone,
      'U09 profile must be Android standalone SIMULATION with a real ready and controlling service worker', initialSafe.browser);
      failIf(initialSafe.browser.embeddedVersion === legacy
        && initialUnsafe.browser.embeddedVersion === legacy
        && initialSafe.browser.releaseMetadata?.body?.releaseId === legacy.replace(/^release:/, '')
        && initialUnsafe.browser.releaseMetadata?.body?.releaseId === legacy.replace(/^release:/, ''),
      'both documents did not bootstrap from the sealed legacy L release metadata', { safe: initialSafe.browser, unsafe: initialUnsafe.browser });
      failIf(initialSafe.browser.legacyObservation.inputValue === ''
        && initialUnsafe.browser.legacyObservation.inputValue === draft
        && initialUnsafe.browser.titleDraft === draft,
      'U09 did not retain the observable idle input and separate A-client draft in the legacy DOM', { safe: initialSafe.browser, unsafe: initialUnsafe.browser });
      failIf(initialSafe.browser.updaterResources.length > 0
        && initialUnsafe.browser.updaterResources.length > 0,
      'sealed L documents did not load their real shared updater resource', { safe: initialSafe.browser.updaterResources, unsafe: initialUnsafe.browser.updaterResources });
      u09.legacyBaseline = {
        apiAndNewCheck: 'not injected, queried, or invoked during L phase; availability remains unknown by design',
        safety: 'not inferred from legacy state; only input value/disabled attributes recorded',
        transactionReadOnly: { safe: initialSafe.browser.legacyTransaction, unsafe: initialUnsafe.browser.legacyTransaction },
      };
      recordStep('sealed-L-old-dom-and-updater-observed', u09.legacyBaseline);

      const switchResponse = await page.request.get(`${origin}/__dev134/switch?release=B`, { timeout: 10000 });
      u09.serverSwitchToB = { status: switchResponse.status(), body: await switchResponse.text() };
      failIf(switchResponse.ok(), 'U09 could not switch the real fixture server to release B', u09.serverSwitchToB);
      candidatePublished = true;
      recordStep('server-selected-B', { response: u09.serverSwitchToB });

      let registrationUpdate;
      try {
        registrationUpdate = await safePage.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          await registration.update();
          return {
            scope: registration.scope,
            activeScript: registration.active?.scriptURL ?? null,
            waitingScript: registration.waiting?.scriptURL ?? null,
            installingScript: registration.installing?.scriptURL ?? null,
          };
        });
      } catch (error) {
        if (!/Execution context was destroyed|navigation/i.test(error instanceof Error ? error.message : String(error))) throw error;
        registrationUpdate = { interruptedByNavigation: true, note: error instanceof Error ? error.message : String(error) };
      }
      u09.realRegistrationUpdate = registrationUpdate;
      recordStep('real-registration-update-requested', { registrationUpdate });
      await safePage.bringToFront(); // Existing old foreground handler owns the natural boundary.
      // A normal same-profile reopen refreshes the legacy local safety owner.
      // Retain its controlling A worker and the other dirty A document; do not
      // navigate directly to B, clear storage, or alter the sealed old script.
      await safePage.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      recordStep('normal-same-profile-reopen', { browser: await readPageEvidence(safePage, false), task: await taskEvidence(safePage) });

      await safePage.waitForFunction(expected => document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content') === expected, b, { timeout: 45000 });
      await safePage.waitForFunction(() => Boolean(window.__DEV134_PWA?.getState?.()), null, { timeout: 20000 });
      let safeMenu = safePage.locator('details[data-quick-install-menu="true"]');
      await safeMenu.waitFor({ state: 'attached', timeout: 15000 });
      if (!await safeMenu.evaluate(element => element.open)) await safeMenu.locator('summary').click();
      await safePage.locator('[data-quick-update-check]').click();
      await safePage.waitForFunction(expected => {
        const state = window.__DEV134_PWA?.getState?.();
        const status = document.querySelector('[data-quick-update-status]');
        return state?.currentVersion === expected
          && state?.check?.phase === 'up-to-date'
          && state.check.latestVersion === expected
          && status && !status.hidden && status.textContent.trim() === '已是最新版'
          && !document.querySelector('[data-quick-update-check]')?.disabled;
      }, b, { timeout: 15000 });
      const finalSafe = await capture('B-safe-update-and-check-terminal', safePage, { expectedOwnVersion: b, expectedCheckPhase: 'up-to-date' });
      const finalLocalTask = await taskEvidence(safePage);
      u09.localTaskAfter = finalLocalTask;
      failIf(finalSafe.browser.appShellMetadata?.body?.version === b
        && finalSafe.browser.state?.currentVersion === b
        && finalSafe.browser.state?.check?.phase === 'up-to-date'
        && finalSafe.browser.menu.count === 1
        && finalSafe.browser.menu.checkCount === 1
        && finalSafe.browser.menu.statusText === '已是最新版'
        && finalLocalTask.expectedPendingTaskCount === 1
        && finalLocalTask.records[0]?.title === taskTitle
        && finalLocalTask.sentinel === 'preserve',
      'safe Quick Task client did not reach B with a single terminal check menu while preserving its local task', { finalSafe, finalLocalTask });

      // The service-worker controller may legitimately change; the dirty document itself must not reload or adopt B.
      const beforeUnsafeFinal = initialUnsafe.browser;
      await aClientPage.waitForTimeout(1000);
      const finalUnsafe = await capture('A-unsafe-document-preserved', aClientPage, { expectedOwnVersion: legacy, expectedDraft: draft }, false);
      const oldDocumentStable = finalUnsafe.browser.timeOrigin === beforeUnsafeFinal.timeOrigin
        && finalUnsafe.browser.embeddedVersion === legacy
        && finalUnsafe.browser.titleDraft === draft
        && JSON.stringify(finalUnsafe.browser.entryScripts) === JSON.stringify(beforeUnsafeFinal.entryScripts)
        && finalUnsafe.browser.embeddedVersion === beforeUnsafeFinal.embeddedVersion;
      failIf(oldDocumentStable, 'unsafe A document navigated, changed its own metadata, lost its draft, or duplicated its menu', {
        before: beforeUnsafeFinal,
        after: finalUnsafe.browser,
        controllerChangeAllowed: true,
      });
      failIf(finalLocalTask.expectedPendingTaskCount === 1
        && finalLocalTask.records[0]?.title === taskTitle
        && finalLocalTask.sentinel === 'preserve', 'local task or sentinel changed after B activation', finalLocalTask);

      const finalErrors = {
        safe: await visibleUnexpectedErrors(safePage),
        unsafe: await visibleUnexpectedErrors(aClientPage),
        prompts: {
          safe: finalSafe.browser.prompt,
          unsafe: finalUnsafe.browser.prompt,
        },
      };
      const promptFailures = finalErrors.prompts.safe.inspected
        && (finalErrors.prompts.safe.failureKind || finalErrors.prompts.safe.errorCode)
        ? [{ role: 'safe-task-client', ...finalErrors.prompts.safe }]
        : [];
      const serverRequestReadback = await readFixtureRequests(safePage);
      u09.serverRequestReadback = serverRequestReadback;
      u09.finalErrors = finalErrors;
      u09.promptFailures = promptFailures;
      const relevantServerRequests = serverRequestReadback.requests.filter(request => request.time >= startedAt);
      u09.relevantServerRequests = relevantServerRequests;
      const localHttpFailures = httpFailures.filter(item => {
        try { return new URL(item.url).hostname === new URL(origin).hostname && !/favicon\.ico(?:\?|$)/i.test(item.url); }
        catch { return true; }
      });
      failIf(finalErrors.safe.length === 0 && finalErrors.unsafe.length === 0,
        'U09 surfaced an unexpected visible application error', finalErrors);
      failIf(promptFailures.length === 0, 'safe B document exposed a PWA update prompt error', promptFailures);
      failIf(localHttpFailures.length === 0, 'U09 produced an unexpected local HTTP failure', localHttpFailures);
      recordStep('U09-terminal-evidence', {
        serverRequests: relevantServerRequests,
        browserRequests: requestEvents.filter(item => item.at >= startedAt),
        visibleErrors: finalErrors,
        localHttpFailures,
        blockedExternalRequests,
        expectedTaskEvidence: { before: localTaskBefore, after: finalLocalTask },
      });
      return u09;
    } catch (error) {
      u09.failure = { message: error.message };
      if (safePage && !safePage.isClosed()) u09.failure.safe = await readPageEvidence(safePage, false).catch(readError => ({ error: readError.message }));
      if (aClientPage && !aClientPage.isClosed()) u09.failure.unsafe = await readPageEvidence(aClientPage, false).catch(readError => ({ error: readError.message }));
      u09.failure.serverRequests = await readFixtureRequests(page);
      throw error;
    } finally {
      if (profileContext) {
        const pageCountBeforeClose = profileContext.pages().length;
        try {
          await profileContext.close();
          u09.cleanup.ownedContextClosed = true;
          u09.cleanup.pagesBeforeClose = pageCountBeforeClose;
        } catch (error) {
          u09.cleanup.error = error instanceof Error ? error.message : String(error);
        }
        if (progressRef) progressRef.evidence = u09;
      }
    }
  });

  const report = {
    ok: results.every(item => item.ok),
    results,
    diagnostics: diagnostics.slice(),
    u09,
    fixtureOnly: false,
    realServiceWorker: true,
    nonLoopbackNetworkWritesAllowed: false,
  };
  return report;
}

  if (mode === 'u-operations') {
    const withMain = async (work, progress) => {
      await page.request.get(origin + '/__dev134/switch?release=A');
      const owner = await context.browser().newContext({ viewport: { width: 390, height: 844 } });
      await owner.addInitScript(() => {
        const original = ServiceWorkerRegistration.prototype.update;
        const metrics = window.__dev134NativeRefresh = { calls: 0, active: 0, maxActive: 0 };
        ServiceWorkerRegistration.prototype.update = function(...args) {
          metrics.calls++; metrics.active++; metrics.maxActive = Math.max(metrics.maxActive, metrics.active);
          try { return Promise.resolve(original.apply(this, args)).finally(() => { metrics.active--; }); }
          catch (error) { metrics.active--; throw error; }
        };
      });
      const tab = await owner.newPage(); attach(tab);
      progress.evidence = { simulations: ['Auth/migration preconditions; readiness(false) only prevents natural apply while testing detection'], steps: [] };
      try {
        await tab.goto(origin + '/?normal=1&role=admin&view=home');
        await tab.waitForSelector('main[data-app-main="true"] h2', { timeout: 20000 });
        await tab.waitForFunction(() => Boolean(window.__DEV134.registration()), null, { timeout: 20000 });
        await tab.evaluate(() => navigator.serviceWorker.ready);
        await tab.waitForTimeout(3500);
        await tab.waitForFunction(() => window.__DEV134.state().check.phase !== 'checking', null, { timeout: 15000 });
        await seedTaskSentinel(tab);
        return await work(tab, progress.evidence);
      } finally {
        await page.request.get(origin + '/__dev134/check-delay?ms=0').catch(() => {});
        await page.request.get(origin + '/__dev134/check-fault?enable=0').catch(() => {});
        await owner.close();
      }
    };
    const openMenu = async tab => {
      const menu = tab.locator('[data-app-more-menu]');
      if (!await menu.evaluate(element => element.open)) await menu.locator('summary').click();
      await tab.waitForSelector('[data-app-update-check]', { timeout: 5000 });
    };
    const readMain = async tab => ({
      state: await tab.evaluate(() => window.__DEV134.state()),
      status: await tab.locator('[data-app-more-menu-panel] [role=status]').allTextContents(),
      checkDisabled: await tab.locator('[data-app-update-check]').isDisabled().catch(() => null),
      task: await taskEvidence(tab), errors: await visibleUnexpectedErrors(tab),
    });
    for (const fault of ['offline', 'http-503']) {
      await check(`U03-real-main-manual-${fault}-and-retry`, progress => withMain(async (tab, evidence) => {
        await tab.evaluate(() => window.__DEV134.ready(false));
        await openMenu(tab);
        const start = Date.now();
        if (fault === 'offline') await tab.context().setOffline(true);
        else await tab.request.get(origin + '/__dev134/check-fault?enable=1');
        await tab.locator('[data-app-update-check]').click();
        const expectedText = fault === 'offline' ? '無法連線' : '檢查失敗，請重試';
        await tab.waitForFunction(text => document.querySelector('[data-app-more-menu-panel] [role=status]')?.textContent === text, expectedText, { timeout: 15000 });
        evidence.failure = await readMain(tab);
        evidence.fault = { type: fault, simulation: fault === 'offline' ? 'BrowserContext offline transport' : 'loopback server 503 for primary metadata and existing fallbacks' };
        await tab.screenshot({ path: `__VISUALS__/U03-${fault}.png` });
        assert(!evidence.failure.checkDisabled && evidence.failure.state.failureKind === null && evidence.failure.state.status !== 'failed', 'manual check error became an application failure or disabled retry', evidence);
        if (fault === 'offline') await tab.context().setOffline(false);
        else await tab.request.get(origin + '/__dev134/check-fault?enable=0');
        evidence.expectedHttpErrors = (await (await tab.request.get(origin + '/__dev134/requests')).json()).filter(item => item.time >= start && item.status >= 400);
        assert(evidence.expectedHttpErrors.every(item => fault === 'http-503' && item.status === 503 && /^\/(app-shell-meta\.json|release-meta\.json|index\.html)(\?|$)/.test(item.url)), 'unrelated HTTP failure occurred during explicit check fault', evidence.expectedHttpErrors);
        await tab.locator('[data-app-update-check]').click();
        await tab.waitForFunction(() => document.querySelector('[data-app-more-menu-panel] [role=status]')?.textContent === '已是最新版', null, { timeout: 15000 });
        evidence.retried = await readMain(tab);
        assert(evidence.retried.task.sentinel === 'preserve' && evidence.retried.errors.length === 0 && !evidence.retried.checkDisabled, 'manual fault/retry changed data or surfaced an unrelated visible error', evidence.retried);
        return evidence;
      }, progress));
    }
    await check('U04-real-endpoint-flight-join-and-native-refresh-guard', progress => withMain(async (tab, evidence) => {
      await tab.evaluate(() => window.__DEV134.ready(false));
      const baseline = await tab.evaluate(() => ({ ...window.__dev134NativeRefresh }));
      await tab.request.get(origin + '/__dev134/check-delay?ms=2500');
      const start = Date.now();
      await tab.evaluate(() => { window.__dev134BackgroundCheck = window.__DEV134.check(); });
      await tab.waitForFunction(() => window.__DEV134.state().check.phase === 'checking', null, { timeout: 5000 });
      const before = await tab.evaluate(() => window.__DEV134.state().check);
      await openMenu(tab); await tab.locator('[data-app-update-check]').click();
      const joined = await tab.evaluate(() => window.__DEV134.state().check);
      await tab.waitForFunction(() => window.__DEV134.state().check.phase === 'up-to-date'
        && document.querySelector('[data-app-more-menu-panel] [role=status]')?.textContent === '已是最新版', null, { timeout: 15000 });
      const final = await readMain(tab);
      const requests = (await (await tab.request.get(origin + '/__dev134/requests')).json()).filter(item => item.time >= start && /app-shell-meta|release-meta/.test(item.url));
      const native = await tab.evaluate(() => ({ ...window.__dev134NativeRefresh }));
      Object.assign(evidence, { before, joined, final, requests, baseline, native });
      assert(before.requestId === joined.requestId && final.state.check.requestId === before.requestId, 'manual join did not retain the detection flight identity', evidence);
      assert(requests.length >= 1 && requests.length <= 2 && requests.every(item => item.status === 200), 'join produced unexpected metadata requests', requests);
      assert(native.maxActive === 1 && native.calls - baseline.calls === 1, 'native refresh overlapped or duplicated on manual join', { baseline, native });
      assert(final.task.sentinel === 'preserve' && final.errors.length === 0, 'join changed task sentinel or surfaced an unrelated error', final);
      return evidence;
    }, progress));
    await check('U05-real-ten-second-timeout-late-response-and-retry', progress => withMain(async (tab, evidence) => {
      await tab.evaluate(() => window.__DEV134.ready(false));
      await openMenu(tab); await tab.request.get(origin + '/__dev134/check-delay?ms=12000');
      const startedAt = Date.now(); await tab.locator('[data-app-update-check]').click();
      await tab.waitForFunction(() => document.querySelector('[data-app-more-menu-panel] [role=status]')?.textContent === '檢查逾時，請重試', null, { timeout: 15000 });
      const elapsed = Date.now() - startedAt, terminal = await readMain(tab);
      Object.assign(evidence, { elapsed, terminal });
      await tab.waitForTimeout(3000);
      const late = await readMain(tab); Object.assign(evidence, { late });
      assert(elapsed >= 9500 && elapsed < 12000 && terminal.state.check.errorCode === 'CHECK_TIMEOUT', 'UI/flight did not terminate its real ten-second wait', evidence);
      assert(late.status.join('') === '檢查逾時，請重試' && !late.checkDisabled && late.state.check.requestId === terminal.state.check.requestId, 'late response changed the timed-out UI or guard', late);
      await tab.locator('[data-app-update-check]').click();
      await tab.waitForFunction(() => document.querySelector('[data-app-more-menu-panel] [role=status]')?.textContent === '已是最新版', null, { timeout: 12000 });
      const retried = await readMain(tab); Object.assign(evidence, { retried });
      assert(retried.state.check.requestId > terminal.state.check.requestId && retried.state.check.phase === 'up-to-date', 'retry did not create a fresh successful flight', retried);
      assert(retried.task.sentinel === 'preserve' && retried.errors.length === 0, 'timeout/retry changed local data or surfaced an unrelated error', retried);
      return evidence;
    }, progress));
    await check('U08-real-main-result-invalidates-without-resurrection', progress => withMain(async (tab, evidence) => {
      await tab.evaluate(() => window.__DEV134.ready(false));
      await openMenu(tab); await tab.locator('[data-app-update-check]').click();
      await tab.waitForFunction(() => document.querySelector('[data-app-more-menu-panel] [role=status]')?.textContent === '已是最新版', null, { timeout: 12000 });
      evidence.success = await readMain(tab);
      await tab.request.get(origin + '/__dev134/switch?release=B');
      await tab.evaluate(() => window.__DEV134.check());
      evidence.changed = await readMain(tab);
      assert(evidence.changed.state.latestVersion === b && !evidence.changed.status.join('').includes('已是最新版'), 'background B did not clear the stale manual success', evidence);
      await tab.request.get(origin + '/__dev134/switch?release=A');
      await tab.evaluate(() => window.__DEV134.check());
      evidence.returned = await readMain(tab);
      assert(evidence.returned.status.length === 0, 'background result resurrected an old manual success', evidence);
      // A waiting B worker makes a rollback-to-A comparison intentionally
      // unknown. Record that trusted guard instead of expecting false success.
      assert(evidence.returned.state.check.phase === 'up-to-date' || evidence.returned.state.check.errorCode === 'CHECK_VERSION_UNKNOWN', 'background A readback did not settle through the real trust guard', evidence.returned);
      evidence.identityReturnLimitation = 'Waiting B worker makes A comparison unknown; exact identity return is covered by the adapter and Quick renderer, not this browser sequence.';
      return evidence;
    }, progress));
    await check('U08-real-main-close-during-apply-finally-unlocks', progress => withMain(async (tab, evidence) => {
      await openMenu(tab); await tab.request.get(origin + '/__dev134/switch?release=B');
      await tab.locator('[data-app-update-check]').click();
      await tab.waitForFunction(() => Boolean(document.querySelector('[data-app-update-reload]')), null, { timeout: 15000 });
      await tab.waitForFunction(() => Boolean(window.__DEV134.registration()?.waiting) && !window.__DEV134.registration()?.installing, null, { timeout: 20000 });
      await tab.locator('[data-app-update-check]').click();
      await tab.waitForFunction(() => !document.querySelector('[data-app-update-check]')?.disabled && Boolean(document.querySelector('[data-app-update-reload]')), null, { timeout: 15000 });
      evidence.available = await readMain(tab);
      await tab.request.get(origin + '/__dev134/check-delay?ms=3000');
      await tab.locator('[data-app-update-reload]').click();
      await tab.waitForFunction(() => window.__DEV134.state().localUpdateBusy, null, { timeout: 5000 });
      evidence.busy = await readMain(tab);
      // SIMULATION of a readiness producer losing safety while the real apply
      // is waiting for stable-target metadata. Do not fake apply or completion.
      await tab.evaluate(() => window.__DEV134.ready(false));
      await tab.locator('[data-app-more-menu] > summary').click();
      await tab.waitForFunction(() => !window.__DEV134.state().localUpdateBusy, null, { timeout: 15000 });
      await openMenu(tab); evidence.after = await readMain(tab);
      assert(evidence.busy.checkDisabled && !evidence.after.checkDisabled && !evidence.after.status.join('').includes('正在更新'), 'closed menu retained stale local apply busy after service finally', evidence);
      assert(evidence.after.state.currentVersion === a && evidence.after.task.sentinel === 'preserve', 'cancelled apply navigated or changed local data', evidence.after);
      return evidence;
    }, progress));
    for (const invalidation of ['local-busy', 'reopened-menu']) {
      await check(`U08-real-main-delayed-focus-invalidated-by-${invalidation}`, progress => withMain(async (tab, evidence) => {
        // SIMULATION only of delayed frame delivery. React, menu completion,
        // actual metadata result, service busy state, and callback are real.
        await tab.evaluate(() => {
          window.__DEV134.ready(false);
          window.__DEV134.load();
          const request = window.requestAnimationFrame.bind(window);
          const cancel = window.cancelAnimationFrame.bind(window);
          const frames = new Map(); let sequence = -1;
          window.__dev134FocusFrames = {
            count: () => frames.size,
            flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(performance.now())); },
            restore: () => { window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel; frames.clear(); },
          };
          window.requestAnimationFrame = callback => { const id = sequence--; frames.set(id, callback); return id; };
          window.cancelAnimationFrame = id => { if (!frames.delete(id)) cancel(id); };
        });
        evidence.simulations.push('Hold animation-frame delivery until real menu completion; execute original callbacks after latest service/DOM change');
        await openMenu(tab);
        await tab.request.get(origin + '/__dev134/switch?release=B');
        await tab.locator('[data-app-update-check]').click();
        await tab.waitForFunction(() => window.__DEV134.state().check.phase === 'available'
          && !document.querySelector('[data-app-more-menu]')?.open
          && window.__dev134FocusFrames.count() > 0, null, { timeout: 15000 });
        evidence.scheduled = await tab.evaluate(() => ({ state: window.__DEV134.state(), frames: window.__dev134FocusFrames.count(), active: document.activeElement?.outerHTML }));
        if (invalidation === 'local-busy') {
          await tab.request.get(origin + '/__dev134/check-delay?ms=2500');
          await tab.evaluate(() => { window.__dev134FocusApply = window.__DEV134.retry(); });
          await tab.waitForFunction(() => window.__DEV134.state().localUpdateBusy, null, { timeout: 5000 });
        } else {
          await tab.locator('[data-app-more-menu] > summary').click();
          await tab.waitForFunction(() => document.querySelector('[data-app-more-menu]')?.open, null, { timeout: 5000 });
        }
        evidence.beforeFlush = await tab.evaluate(() => ({ state: window.__DEV134.state(), frames: window.__dev134FocusFrames.count(), active: document.activeElement?.outerHTML }));
        await tab.evaluate(() => window.__dev134FocusFrames.flush());
        evidence.afterFlush = await tab.evaluate(() => ({ state: window.__DEV134.state(), frames: window.__dev134FocusFrames.count(), focusedPrompt: Boolean(document.activeElement?.closest('[data-pwa-update-prompt]')), active: document.activeElement?.outerHTML }));
        await tab.screenshot({ path: `__VISUALS__/U08-focus-${invalidation}.png` });
        assert(!evidence.afterFlush.focusedPrompt && evidence.afterFlush.frames === 0, 'stale frame moved focus to prompt after invalidation', evidence);
        if (invalidation === 'reopened-menu') assert(evidence.afterFlush.active === evidence.beforeFlush.active, 'reopened menu focus was overwritten by stale handoff', evidence);
        await tab.evaluate(() => window.__dev134FocusFrames.restore());
        await tab.waitForFunction(() => !window.__DEV134.state().localUpdateBusy, null, { timeout: 15000 });
        evidence.final = await readMain(tab);
        assert(evidence.final.task.sentinel === 'preserve' && evidence.final.errors.length === 0, 'focus invalidation changed local data or surfaced unrelated errors', evidence.final);
        return evidence;
      }, progress));
    }
    for (const blockedInput of ['composition', 'voice', 'commit-pending']) {
      await check(`U08-real-quick-${blockedInput}-protects-data`, async progress => {
        await page.request.get(origin + '/__dev134/switch?release=A');
        const owner = await context.browser().newContext({ viewport: { width: 390, height: 844 } });
        if (blockedInput === 'voice') await owner.addInitScript(() => {
          // Only microphone engine is simulated; the actual voice button,
          // session ownership, safety owner and apply path run unchanged.
          window.SpeechRecognition = class {
            start() { window.__dev134VoiceEngine = this; }
            stop() { this.onend?.(); }
            abort() { this.onend?.(); }
          };
        });
        const tab = await owner.newPage(); attach(tab);
        const evidence = progress.evidence = { blockedInput, simulation: blockedInput === 'voice' ? 'inert SpeechRecognition engine; no microphone permission or remote recognition' : blockedInput === 'composition' ? 'browser-dispatched IME DOM event sequence' : 'real isolated IDB readwrite lock holds capture transaction; no fake commit result' };
        try {
          await tab.goto(origin + '/quick-task/');
          await tab.waitForSelector('#quick-task-title:enabled', { timeout: 20000 });
          await tab.waitForFunction(() => Boolean(window.__DEV134_PWA?.getState?.()), null, { timeout: 20000 });
          await tab.evaluate(() => navigator.serviceWorker.ready);
          await tab.waitForTimeout(3500);
          await seedTaskSentinel(tab);
          evidence.baseline = { state: await tab.evaluate(() => window.__DEV134_PWA.getState()), task: await taskEvidence(tab), timeOrigin: await tab.evaluate(() => performance.timeOrigin) };
          if (blockedInput === 'composition') await tab.locator('#quick-task-title').evaluate(input => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })); input.dispatchEvent(new Event('input', { bubbles: true })); });
          else if (blockedInput === 'voice') {
            await tab.locator('#quick-task-voice').click();
            await tab.locator('#quick-task-title').evaluate(input => input.dispatchEvent(new Event('input', { bubbles: true })));
          } else {
            await tab.evaluate(async () => {
              const db = await new Promise((resolve, reject) => { const req = indexedDB.open('projed-quick-task-v1'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
              const tx = db.transaction('captures', 'readwrite'); const store = tx.objectStore('captures');
              window.__dev134CommitLock = { release: false, abort: () => tx.abort() };
              const keepAlive = () => { const req = store.get('dev134-lock-absent'); req.onsuccess = () => { if (!window.__dev134CommitLock.release) keepAlive(); }; };
              tx.oncomplete = tx.onabort = () => db.close(); keepAlive();
            });
            await tab.locator('#quick-task-title').fill('DEV-134 pending actual capture commit');
            await tab.locator('#quick-task-submit').click();
            await tab.waitForFunction(() => document.querySelector('#quick-task-submit')?.disabled, null, { timeout: 5000 });
            await tab.locator('#quick-task-title').evaluate(input => input.dispatchEvent(new Event('input', { bubbles: true })));
          }
          await tab.waitForFunction(() => window.__DEV134_PWA.getState().reloadSafetyState === 'dirty', null, { timeout: 5000 });
          evidence.blocked = await tab.evaluate(() => ({ state: window.__DEV134_PWA.getState(), draft: document.querySelector('#quick-task-title').value, voiceListening: document.querySelector('#quick-task-voice').dataset.listening, submitDisabled: document.querySelector('#quick-task-submit').disabled }));
          await tab.request.get(origin + '/__dev134/switch?release=B');
          await tab.locator('details[data-quick-install-menu] > summary').click();
          await tab.locator('[data-quick-update-check]').click();
          await tab.waitForFunction(() => window.__DEV134_PWA.getState().check.phase === 'available' && Boolean(document.querySelector('[data-pwa-update-prompt]:not([hidden])')), null, { timeout: 15000 });
          await tab.locator('[data-pwa-update-prompt] [data-pwa-update-action]').click();
          await tab.waitForFunction(() => !window.__DEV134_PWA.getState().localUpdateBusy, null, { timeout: 5000 });
          evidence.afterApply = await tab.evaluate(() => ({ state: window.__DEV134_PWA.getState(), timeOrigin: performance.timeOrigin, draft: document.querySelector('#quick-task-title').value, voiceListening: document.querySelector('#quick-task-voice').dataset.listening, submitDisabled: document.querySelector('#quick-task-submit').disabled }));
          assert(evidence.afterApply.state.currentVersion === a && evidence.afterApply.timeOrigin === evidence.baseline.timeOrigin && evidence.afterApply.draft === evidence.blocked.draft, 'blocked Quick input reloaded or lost its draft', evidence);
          assert(evidence.afterApply.state.pendingLocalTarget === b && evidence.afterApply.state.reloadSafetyState !== 'safe', 'blocked update lost its pending target or bypassed local gate', evidence);
          await tab.screenshot({ path: `__VISUALS__/U08-quick-${blockedInput}.png` });
          if (blockedInput === 'commit-pending') {
            await tab.evaluate(() => { window.__dev134CommitLock.release = true; });
            await tab.waitForFunction(() => !document.querySelector('#quick-task-submit')?.disabled, null, { timeout: 10000 });
          }
          evidence.taskAfter = await taskEvidence(tab); evidence.errorsAfter = await visibleUnexpectedErrors(tab);
          assert(evidence.taskAfter.sentinel === 'preserve' && evidence.taskAfter.expectedPendingTaskCount === (blockedInput === 'commit-pending' ? 1 : 0) && evidence.errorsAfter.length === 0, 'blocked input changed local task data or surfaced unrelated errors', evidence);
          return evidence;
        } finally {
          await tab.evaluate(() => { if (window.__dev134CommitLock) window.__dev134CommitLock.release = true; }).catch(() => {});
          await owner.close();
        }
      });
    }
    return { ok: results.every(item => item.ok), results, diagnostics };
  }
  if (mode === 'u06') {
    const u06 = { cycles:[], notRestored:[], errorsVisibleSweep:[], expectedTaskEvidence:[], preconditions:{}, browserVersion:context.browser()?.version?.() ?? 'unavailable', requiredCorePersistedCount:5, requiredTotalPersistedCount:6 };
    const installProbe=browserContext=>browserContext.addInitScript(() => {
      const uuid=()=>crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      window.__dev134HeapIdentity=uuid();window.__dev134DocumentIdentity=uuid();window.__dev134PageShows=[];window.__dev134PageHides=[];
      const markRoot=()=>{
        const root=document.querySelector('[data-quick-task-root="true"]');
        const menu=root?.querySelector('details[data-quick-install-menu="true"]');
        if(root){window.__dev134RootRef=root;root.dataset.dev134RootIdentity??=uuid();window.__dev134RootIdentity=root.dataset.dev134RootIdentity;}
        if(menu){window.__dev134MenuRef=menu;window.__dev134MenuIdentity??=uuid();}
      };
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',markRoot,{once:true});else markRoot();
      addEventListener('pageshow',event=>{markRoot();window.__dev134PageShows.push({persisted:event.persisted,timeOrigin:performance.timeOrigin,heap:window.__dev134HeapIdentity,document:window.__dev134DocumentIdentity,at:Date.now()});});
      addEventListener('pagehide',event=>window.__dev134PageHides.push({persisted:event.persisted,at:Date.now()}));
    });
    const prepareQuick=async tab=>{
      await tab.goto(origin+'/quick-task/?dev134Bfcache=1');
      await tab.waitForSelector('#quick-task-title:enabled',{timeout:20000});
      await tab.waitForSelector('details[data-quick-install-menu="true"] > summary[aria-label="更多選項"]',{timeout:20000});
      await tab.waitForFunction(()=>Boolean(window.__DEV134_PWA?.metrics?.()),null,{timeout:20000});
      await seedTaskSentinel(tab);
      await tab.locator('details[data-quick-install-menu="true"] > summary').click();
      await tab.waitForFunction(()=>window.__DEV134_PWA?.metrics?.().listenerCount>=1,null,{timeout:10000});
    };
    const newScenario=async name=>{
      const scenarioContext=await context.browser().newContext();await installProbe(scenarioContext);
      const tab=await scenarioContext.newPage();attach(tab);await prepareQuick(tab);return {name,scenarioContext,tab,closed:false};
    };
    const establishNormalUpdate=async(tab,label)=>{
      const requestWindowStart=Date.now();
      await tab.locator('#quick-task-title').fill(`DEV-134 U06 ${label} draft sentinel`);
      await tab.waitForFunction(()=>window.__DEV134_PWA.getState().reloadSafetyState==='dirty',null,{timeout:10000});
      await tab.request.get(origin+'/__dev134/switch?release=B');
      if(!await tab.locator('details[data-quick-install-menu="true"]').evaluate(element=>element.open))await tab.locator('details[data-quick-install-menu="true"] > summary').click();
      await tab.locator('[data-quick-update-check]').click();
      await tab.waitForFunction(expected=>{const state=window.__DEV134_PWA?.getState?.();return state?.check?.phase==='available'&&state.check.latestVersion===expected&&state.updateAvailable===true;},b,{timeout:15000});
      const state=await tab.evaluate(()=>window.__DEV134_PWA.getState());const promptCount=await tab.locator('.quick-task-pwa-update[data-pwa-update-prompt]:visible').count();
      const requests=await(await tab.request.get(origin+'/__dev134/requests')).json();const relevantRequests=requests.filter(request=>request.time>=requestWindowStart);const httpErrors=relevantRequests.filter(request=>request.status>=400);
      const task=await taskEvidence(tab);const evidence={simulation:null,check:state.check,state:{updateAvailable:state.updateAvailable,failureKind:state.failureKind,localUpdateBusy:state.localUpdateBusy,reloadSafetyState:state.reloadSafetyState},visiblePromptCount:promptCount,expectedPendingTaskCount:task.expectedPendingTaskCount,taskEvidence:task,requestCount:relevantRequests.length,httpErrors};u06.preconditions.normal=evidence;
      assert(state.check.phase==='available'&&state.check.latestVersion===b&&state.updateAvailable===true&&state.failureKind===null&&state.localUpdateBusy===false&&state.reloadSafetyState==='dirty'&&promptCount===1,'normal U06 precondition did not produce a real A-to-B result, dirty safety state and existing prompt',{state,promptCount});
      assert(httpErrors.length===0,'normal U06 check produced an unexpected HTTP error',httpErrors);
      return evidence;
    };
    const establishRecovery=async tab=>{
      await tab.locator('#quick-task-title').fill('DEV-134 U06 recovery draft sentinel');
      await tab.waitForFunction(()=>window.__DEV134_PWA.getState().reloadSafetyState==='dirty',null,{timeout:10000});
      await tab.evaluate(()=>window.__DEV134_PWA.load(new Error('SIMULATION: dynamic import recovery precondition for U06')));
      await tab.waitForFunction(()=>{const state=window.__DEV134_PWA?.getState?.();return state?.failureKind==='load'&&state.errorCode==='CHUNK_LOAD_FAILED';},null,{timeout:10000});
      const state=await tab.evaluate(()=>window.__DEV134_PWA.getState());const promptCount=await tab.locator('.quick-task-pwa-update[data-pwa-update-prompt]:visible').count();
      const task=await taskEvidence(tab);const evidence={simulation:'SIMULATION: invoked the real recoverable dynamic-import error handler; did not synthesize pageshow or check result',failureKind:state.failureKind,errorCode:state.errorCode,status:state.status,reloadSafetyState:state.reloadSafetyState,visiblePromptCount:promptCount,expectedPendingTaskCount:task.expectedPendingTaskCount,taskEvidence:task};u06.preconditions.recovery=evidence;
      assert(state.failureKind==='load'&&state.errorCode==='CHUNK_LOAD_FAILED'&&state.reloadSafetyState==='dirty'&&promptCount===1,'recovery U06 precondition lacks the actual load-error readback, dirty form and recovery prompt',{state,promptCount});
      return evidence;
    };
    const establishSafe=async tab=>{
      await tab.waitForFunction(()=>window.__DEV134_PWA.getState().reloadSafetyState==='safe',null,{timeout:10000});
      await tab.locator('[data-quick-update-check]').click();
      await tab.waitForFunction(()=>{const state=window.__DEV134_PWA?.getState?.();const status=document.querySelector('[data-quick-update-status]');return state?.check?.phase==='up-to-date'&&status&&!status.hidden&&status.textContent.trim().length>0;},null,{timeout:12000});
      const state=await tab.evaluate(()=>window.__DEV134_PWA.getState());const promptCount=await tab.locator('.quick-task-pwa-update[data-pwa-update-prompt]:visible').count();
      const task=await taskEvidence(tab);const evidence={simulation:null,check:state.check,state:{updateAvailable:state.updateAvailable,failureKind:state.failureKind,localUpdateBusy:state.localUpdateBusy,reloadSafetyState:state.reloadSafetyState},visiblePromptCount:promptCount,expectedPendingTaskCount:task.expectedPendingTaskCount,taskEvidence:task};u06.preconditions.safe=evidence;
      assert(state.check.phase==='up-to-date'&&state.reloadSafetyState==='safe'&&promptCount===0,'safe U06 precondition lacks a real same-version check and safe form snapshot',{state,promptCount});
      return evidence;
    };
    const establishInflight=async tab=>{
      await tab.waitForFunction(()=>window.__DEV134_PWA.getState().reloadSafetyState==='safe',null,{timeout:10000});
      await tab.request.get(origin+'/__dev134/check-delay?ms=7000');await tab.locator('[data-quick-update-check]').click();
      await tab.waitForFunction(()=>document.querySelector('[data-quick-update-check]')?.disabled===true,null,{timeout:5000});
      let requests=[];let pending=null;
      for(let attempt=0;attempt<12;attempt++){requests=await(await tab.request.get(origin+'/__dev134/requests')).json();pending=requests.find(item=>item.pending&&/app-shell-meta|release-meta/.test(item.url))??null;if(pending)break;await tab.waitForTimeout(100);}
      const evidence={simulation:null,pendingRequest:pending,requestCount:requests.filter(item=>/app-shell-meta|release-meta/.test(item.url)).length,metadataRequests:requests.filter(item=>/app-shell-meta|release-meta/.test(item.url))};u06.preconditions.inflight=evidence;
      assert(Boolean(pending),'manual check did not reach a pending real metadata request before navigation',requests.filter(item=>/app-shell-meta|release-meta/.test(item.url)));
      return evidence;
    };
    const runCycle=async(tab,kind,index)=>{
      const cycle={index,kind,startedAt:new Date().toISOString(),requestWindowStart:Date.now(),ok:false};u06.cycles.push(cycle);
      try{
        const before=await tab.evaluate(()=>{
          window.__dev134BeforeRoot=document.querySelector('[data-quick-task-root="true"]');window.__dev134BeforeMenu=document.querySelector('details[data-quick-install-menu="true"]');
          return {showCount:window.__dev134PageShows.length,heap:window.__dev134HeapIdentity,document:window.__dev134DocumentIdentity,timeOrigin:performance.timeOrigin,root:window.__dev134RootIdentity,menu:window.__dev134MenuIdentity,setupCalls:window.__DEV134_PWA.metrics().setupCalls,listeners:window.__DEV134_PWA.metrics().listenerCount,focus:document.activeElement?.getAttribute?.('data-quick-update-check')?'check':document.activeElement?.getAttribute?.('data-pwa-update-action')?'prompt-action':document.activeElement?.getAttribute?.('aria-label')??document.activeElement?.tagName,taskDraft:document.querySelector('#quick-task-title')?.value??null,state:window.__DEV134_PWA.getState()};
        });
        const beforeTask=await taskEvidence(tab);u06.expectedTaskEvidence.push({cycle:index,kind,...beforeTask});
        const visibleBefore=await tab.locator('.quick-task-pwa-update[data-pwa-update-prompt]:visible').count();const beforeErrors=await visibleUnexpectedErrors(tab);
        Object.assign(cycle,{expectedPendingTaskCount:beforeTask.expectedPendingTaskCount,before:{heap:before.heap,document:before.document,timeOrigin:before.timeOrigin,setupCalls:before.setupCalls,listeners:before.listeners,visiblePromptCount:visibleBefore,focus:before.focus,taskDraft:before.taskDraft,state:before.state,visibleUnexpectedErrors:beforeErrors}});
        if(kind==='normal')assert(visibleBefore===1&&before.state.check?.phase==='available'&&before.state.reloadSafetyState==='dirty','normal case lacks its real update prompt/readback',{kind,visibleBefore,state:before.state});
        if(kind==='safe'||kind==='inflight-check')assert(visibleBefore===0,'safe/in-flight case shows an unintended update or error prompt',{kind,visibleBefore,state:before.state});
        if(kind==='recovery')assert(visibleBefore===1&&before.state.failureKind==='load','recovery case lacks its intended existing prompt and load state',{kind,visibleBefore,state:before.state});
        assert(beforeErrors.length===0,'U06 case starts with an unintended visible error',beforeErrors);
        await tab.goto(origin+'/__dev134/away',{waitUntil:'domcontentloaded'});assert(await tab.locator('[data-dev134-away="true"]').count()===1,'same-origin away page was not served',kind);
        let backError=null;try{await tab.goBack({waitUntil:'commit',timeout:15000});}catch(error){backError=error.message;}
        await tab.waitForFunction(({count,heap})=>(window.__dev134PageShows?.length??0)>count||window.__dev134HeapIdentity!==heap,{count:before.showCount,heap:before.heap},{timeout:20000}).catch(()=>{});
        let latestReadbackError=null;
        try{await tab.waitForFunction(({kind,version})=>{const state=window.__DEV134_PWA?.getState?.();if(!state)return false;if(kind==='normal')return state.check?.phase==='available'&&state.check.latestVersion===version&&state.updateAvailable===true;if(kind==='recovery')return state.failureKind==='load'&&state.errorCode==='CHUNK_LOAD_FAILED';if(kind==='safe')return state.check?.phase==='up-to-date'&&state.reloadSafetyState==='safe';return state.check?.phase!=='checking'&&state.localUpdateBusy===false;},{kind,version:b},{timeout:15000});}catch(error){latestReadbackError=error.message;}
        const after=await tab.evaluate(()=>({url:location.pathname,heap:window.__dev134HeapIdentity,document:window.__dev134DocumentIdentity,timeOrigin:performance.timeOrigin,show:window.__dev134PageShows.at(-1)??null,hide:window.__dev134PageHides.at(-1)??null,root:window.__dev134RootIdentity,menu:window.__dev134MenuIdentity,rootSame:window.__dev134BeforeRoot===document.querySelector('[data-quick-task-root="true"]'),menuSame:window.__dev134BeforeMenu===document.querySelector('details[data-quick-install-menu="true"]'),rootCount:document.querySelectorAll('[data-quick-task-root="true"]').length,menuCount:document.querySelectorAll('details[data-quick-install-menu="true"]').length,setupCalls:window.__DEV134_PWA?.metrics?.().setupCalls??null,listeners:window.__DEV134_PWA?.metrics?.().listenerCount??null,checkText:document.querySelector('[data-quick-update-check]')?.textContent?.trim()??null,status:document.querySelector('[data-quick-update-status]')?.textContent?.trim()??null,statusHidden:document.querySelector('[data-quick-update-status]')?.hidden??null,focused:document.activeElement?.getAttribute?.('data-quick-update-check')?'check':document.activeElement?.getAttribute?.('data-pwa-update-action')?'prompt-action':document.activeElement?.getAttribute?.('aria-label')??document.activeElement?.tagName,taskDraft:document.querySelector('#quick-task-title')?.value??null,state:window.__DEV134_PWA?.getState?.()??null,navigation:performance.getEntriesByType('navigation')[0]?.notRestoredReasons??null}));
        const persisted=after.show?.persisted===true;const sameHeap=persisted&&after.heap===before.heap&&after.document===before.document&&after.timeOrigin===before.timeOrigin&&Boolean(before.root&&before.menu)&&after.root===before.root&&after.menu===before.menu&&after.rootSame&&after.menuSame;
        const afterTask=await taskEvidence(tab);const taskStateStable=afterTask.expectedPendingTaskCount===beforeTask.expectedPendingTaskCount&&afterTask.sentinel==='preserve';
        if(after.menuCount===1&&!await tab.locator('details[data-quick-install-menu="true"]').evaluate(element=>element.open))await tab.locator('details[data-quick-install-menu="true"] > summary').click();
        const checkAction=tab.locator('[data-quick-update-check]');const activeAction=after.menuCount===1&&after.rootCount===1&&await checkAction.count()===1&&await checkAction.isEnabled();
        const pendingCleared=kind!=='inflight-check'||(!after.checkText?.includes('檢查中')&&(!after.status||after.statusHidden));
        const formDraftRetained=after.taskDraft===before.taskDraft;const recoveryDraftRetained=kind!=='recovery'||after.taskDraft==='DEV-134 U06 recovery draft sentinel';const setupStable=after.setupCalls===before.setupCalls&&after.listeners===before.listeners;
        const visibleAfter=await tab.locator('.quick-task-pwa-update[data-pwa-update-prompt]:visible').count();const expectedPromptCount=kind==='normal'||kind==='recovery'?1:0;const visibleErrorStable=visibleAfter===expectedPromptCount;
        const afterErrors=await visibleUnexpectedErrors(tab);const focusStable=kind!=='inflight-check'||after.focused===before.focus;
        const requestLog=await(await tab.request.get(origin+'/__dev134/requests')).json();const cycleRequests=requestLog.filter(request=>request.time>=cycle.requestWindowStart);const httpErrors=cycleRequests.filter(request=>request.status>=400);
        const latestStateReadback=kind==='normal'?after.state?.check?.phase==='available'&&after.state.check.latestVersion===b&&after.state.updateAvailable===true:kind==='recovery'?after.state?.failureKind==='load'&&after.state.errorCode==='CHUNK_LOAD_FAILED':kind==='safe'?after.state?.check?.phase==='up-to-date'&&after.state.reloadSafetyState==='safe':after.state?.check?.phase!=='checking'&&after.state.localUpdateBusy===false;
        Object.assign(cycle,{persisted,sameHeap,latestStateReadback,latestReadbackError,activeAction,pendingCleared,formDraftRetained,recoveryDraftRetained,setupStable,taskStateStable,visibleErrorStable,focusStable,requestCount:cycleRequests.length,httpErrors,taskEvidence:{before:beforeTask,after:afterTask},after:{heap:after.heap,document:after.document,timeOrigin:after.timeOrigin,setupCalls:after.setupCalls,listeners:after.listeners,rootCount:after.rootCount,menuCount:after.menuCount,checkText:after.checkText,status:after.status,statusHidden:after.statusHidden,focused:after.focused,taskDraft:after.taskDraft,rootSame:after.rootSame,menuSame:after.menuSame,visiblePromptCount:visibleAfter,state:after.state,visibleUnexpectedErrors:afterErrors},backError,navigationNotRestored:after.navigation});
        cycle.ok=persisted&&sameHeap&&latestStateReadback&&activeAction&&pendingCleared&&formDraftRetained&&recoveryDraftRetained&&setupStable&&taskStateStable&&visibleErrorStable&&focusStable&&afterErrors.length===0&&httpErrors.length===0;
        u06.errorsVisibleSweep.push({cycle:index,kind,expectedVisiblePromptCount:expectedPromptCount,actualVisiblePromptCount:visibleAfter,unexpectedVisibleErrors:afterErrors,httpErrors,requestCount:cycleRequests.length,status:after.status,statusHidden:after.statusHidden,expectedPendingTaskCount:beforeTask.expectedPendingTaskCount,taskEvidence:{before:beforeTask,after:afterTask},diagnostics:diagnostics.slice()});
        if(!persisted)u06.notRestored.push({cycle:index,kind,reasons:after.navigation,backError,url:after.url});return cycle;
      }catch(error){cycle.error=error.message;cycle.stack=error.stack;cycle.ok=false;throw error;}
    };
    const scenarios=[];
    try{
      await page.request.get(origin+'/__dev134/switch?release=A');
      const normal=await newScenario('normal');scenarios.push(normal);u06.preconditions.normal=await establishNormalUpdate(normal.tab,'normal update');
      u06.setupBaseline=await normal.tab.evaluate(()=>window.__DEV134_PWA.metrics());await runCycle(normal.tab,'normal',1);await runCycle(normal.tab,'normal',2);
      await normal.scenarioContext.close();normal.closed=true;await page.request.get(origin+'/__dev134/switch?release=A');
      const recovery=await newScenario('recovery');scenarios.push(recovery);u06.preconditions.recovery=await establishRecovery(recovery.tab);
      await runCycle(recovery.tab,'recovery',3);await runCycle(recovery.tab,'recovery',4);
      await recovery.scenarioContext.close();recovery.closed=true;await page.request.get(origin+'/__dev134/switch?release=A');
      const safe=await newScenario('safe');scenarios.push(safe);u06.preconditions.safe=await establishSafe(safe.tab);await runCycle(safe.tab,'safe',5);
      await safe.scenarioContext.close();safe.closed=true;const inflight=await newScenario('inflight-check');scenarios.push(inflight);u06.preconditions.inflight=await establishInflight(inflight.tab);
      await runCycle(inflight.tab,'inflight-check',6);u06.finalMetrics=await inflight.tab.evaluate(()=>window.__DEV134_PWA.metrics());
    }catch(error){u06.fatalError=error.message;u06.stack=error.stack;}
    finally{for(const scenario of scenarios)if(!scenario.closed)try{await scenario.scenarioContext.close();scenario.closed=true;}catch(error){u06.contextCleanupErrors??=[];u06.contextCleanupErrors.push(`${scenario.name}: ${error.message}`);}}
    const core=u06.cycles.filter(cycle=>cycle.kind!=='inflight-check');const corePersisted=core.filter(cycle=>cycle.persisted&&cycle.sameHeap).length;const totalPersisted=u06.cycles.filter(cycle=>cycle.persisted&&cycle.sameHeap).length;
    u06.corePersistedCount=corePersisted;u06.persistedCount=totalPersisted;
    u06.ok=!u06.fatalError&&!u06.contextCleanupErrors?.length&&u06.cycles.length===6&&u06.cycles.every(cycle=>cycle.ok)&&corePersisted===5&&totalPersisted===6;
    results.push({name:'U06-five-core-and-one-inflight-genuine-bfcache-restore',ok:u06.ok,details:u06});return {ok:u06.ok,results,diagnostics,u06};
  }
  const ready = async tab => {
    await tab.waitForFunction(() => window.__DEV134?.registration(), null, { timeout: 20000 });
    await tab.evaluate(() => navigator.serviceWorker.ready);
  };
  await context.addInitScript(() => {
    const original = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function(message, ...args) {
      if (message?.type === 'SKIP_WAITING') localStorage.setItem('dev134-activations', String(Number(localStorage.getItem('dev134-activations') || 0) + 1));
      return original.call(this, message, ...args);
    };
  });
  attach(page);
  await page.reload(); await ready(page);
  await page.reload(); await ready(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(async () => {
    localStorage.setItem('auth-sentinel', 'preserve'); localStorage.setItem('draft-sentinel', 'preserve'); document.cookie = 'auth_fixture=preserve; path=/';
    const cache = await caches.open('dev134-business-sentinel'); await cache.put('/sentinel', new Response('preserve'));
    await new Promise((resolve, reject) => { const request = indexedDB.open('dev134-business',1); request.onupgradeneeded = () => request.result.createObjectStore('drafts'); request.onsuccess = () => { const db=request.result, tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put('preserve','draft');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject; }; request.onerror=reject; });
  });
  const oldCaches = await page.evaluate(() => caches.keys());
  const other = await context.newPage(); attach(other); await other.goto(origin); await ready(other);
  await page.evaluate(() => window.__DEV134.ready(false));
  await other.evaluate(() => window.__DEV134.ready(false));
  await page.request.get(origin + '/__dev134/switch?release=B');
  await page.evaluate(target => window.__DEV134.fail(target), b);
  await check('R01-real-worker-failed-record-replay-preserves-reason', async () => {
    for (let i=0;i<3;i++) await page.evaluate(() => window.__DEV134.check());
    await page.reload(); await ready(page);
    await page.evaluate(() => window.__DEV134.ready(false));
    await page.evaluate(() => window.__DEV134.check());
    const state = await page.evaluate(() => window.__DEV134.state());
    assert(state.status === 'failed' && state.errorMessage === '先前啟用未完成。' && state.errorCode === 'APPLY_FAILED', 'original failure was lost', state);
    assert(state.currentVersion === a, 'background replay navigated', state);
    return state;
  });
  await check('R05-booting-dirty-and-unknown-recovery-do-not-reload-or-delete', async () => {
    const before = await page.evaluate(() => ({ transaction: localStorage.getItem('projed.pwa-update.transaction.v1'), cookies: document.cookie }));
    assert(await page.evaluate(() => window.__DEV134.retry()) === false, 'unknown readiness retry must be blocked');
    assert(await page.evaluate(() => window.__DEV134.recover()) === false, 'unknown readiness cleanup must be blocked');
    await page.evaluate(() => { window.__DEV134.ready(true); window.__DEV134.dirty(true); });
    assert(await page.evaluate(() => window.__DEV134.retry()) === false, 'dirty retry must be blocked');
    assert(await page.evaluate(() => window.__DEV134.recover()) === false, 'dirty cleanup must be blocked');
    const after = await page.evaluate(() => ({ state: window.__DEV134.state(), transaction: localStorage.getItem('projed.pwa-update.transaction.v1'), cookies: document.cookie }));
    assert(after.state.currentVersion === a && before.transaction === after.transaction && before.cookies === after.cookies, 'blocked recovery altered identity/storage', after);
    assert((await page.evaluate(() => caches.keys())).includes('dev134-business-sentinel'), 'cache deleted before safety gate');
    await page.evaluate(() => window.__DEV134.dirty(false));
    return after.state;
  });
  await check('R02-explicit-UI-retry-new-fence-real-worker-dual-tab-single-activation', async () => {
    await page.locator('[data-pwa-update-action]').click();
    await page.waitForFunction(expected => window.__DEV134?.state().currentVersion === expected, b, { timeout: 30000 });
    await ready(page);
    const history = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dev134-state-history') || '[]'));
    assert(history.some(item => item.transaction?.transactionId.startsWith('tx-retry-') && item.transaction.phase === 'applying' && item.transaction.errorCode == null), 'retry did not get a new fenced transaction', history);
    const blockedOther = await other.evaluate(() => window.__DEV134.state());
    assert(blockedOther.currentVersion === a, 'other unsafe tab was forcibly reloaded', blockedOther);
    // The real app-open readiness boundary can immediately replace this old
    // document. A navigation interruption is acceptable only with target readback.
    await other.evaluate(() => window.__DEV134.ready(true)).catch(error => {
      if (!error.message.includes('Execution context was destroyed')) throw error;
    });
    await other.waitForFunction(expected => window.__DEV134?.state().currentVersion === expected, b, { timeout: 20000 });
    const activations = await page.evaluate(() => Number(localStorage.getItem('dev134-activations')));
    assert(activations === 1, 'multiple activation messages', activations);
    assert(!(await page.locator('[data-pwa-update-prompt]').count()), 'successful retry left a banner');
    const requests = await (await page.request.get(origin + '/__dev134/requests')).json();
    assert(requests.filter(item => item.url.includes('projed_update_latest=') && item.release === 'B').length >= 2, 'own-boundary reload did not fetch network HTML', requests);
    return { current: b, otherCurrent: b, activations, newTransaction: history.filter(item => item.transaction?.transactionId.startsWith('tx-retry-')).map(item=>item.transaction.phase) };
  });
  await check('R10-auth-draft-IDB-and-old-worker-cache-survive-retry', async () => {
    const sentinels = await page.evaluate(async () => ({ auth: localStorage.getItem('auth-sentinel'), draft: localStorage.getItem('draft-sentinel'), cookie: document.cookie, cache: await (await (await caches.open('dev134-business-sentinel')).match('/sentinel')).text(), idb: await new Promise(resolve => { const req=indexedDB.open('dev134-business');req.onsuccess=()=>{const db=req.result,get=db.transaction('drafts').objectStore('drafts').get('draft');get.onsuccess=()=>{resolve(get.result);db.close();};}; }), caches: await caches.keys() }));
    assert(sentinels.auth === 'preserve' && sentinels.draft === 'preserve' && sentinels.cookie.includes('auth_fixture=preserve') && sentinels.idb === 'preserve' && sentinels.cache === 'preserve', 'business storage damaged', sentinels);
    assert(oldCaches.every(name => sentinels.caches.includes(name)), 'old worker cache reclaimed during activation', sentinels);
    return sentinels;
  });
  await other.close();

  await check('R03-current-version-stale-failure-retired-without-reload', async () => {
    const before = await page.evaluate(() => performance.timeOrigin);
    await page.evaluate(target => window.__DEV134.fail(target), a);
    await page.evaluate(() => window.__DEV134.check());
    const state = await page.evaluate(() => window.__DEV134.state());
    assert(state.status === 'idle' && state.failureKind === null && !state.transactionId, 'resolved failure remained visible',state);
    assert(await page.evaluate(() => performance.timeOrigin) === before, 'same-version cleanup navigated');
    assert(await page.evaluate(() => localStorage.getItem('draft-sentinel')) === 'preserve', 'stale failure cleanup changed draft');
    return {current:state.currentVersion, failureCleared:true, navigated:false};
  });

  await check('R06-old-controller-nonce-navigation-fetches-network-target', async () => {
    await page.request.get(origin + '/__dev134/switch?release=A');
    const isolated = await context.browser().newContext();
    const tab = await isolated.newPage(); attach(tab);
    try {
      await tab.goto(origin); await ready(tab); await tab.reload(); await ready(tab);
      assert(await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'old worker not controlling fixture');
      await tab.evaluate(() => window.__DEV134.ready(false));
      await tab.request.get(origin + '/__dev134/switch?release=B');
      await tab.goto(origin + '/?projed_update_latest=dev134-network-proof'); await ready(tab);
      const state = await tab.evaluate(() => window.__DEV134.state());
      assert(state.currentVersion === b, 'old navigation fallback intercepted nonce', state);
      const requests = await (await tab.request.get(origin + '/__dev134/requests')).json();
      assert(requests.some(item => item.url === '/?projed_update_latest=dev134-network-proof' && item.release === 'B'), 'nonce absent from network trace');
      return { current: state.currentVersion, controlled: await tab.evaluate(() => Boolean(navigator.serviceWorker.controller)), networkNavigation: true };
    } finally { await isolated.close(); }
  });
  await check('R05-real-load-error-survives-cross-tab-transaction-and-background-check', async () => {
    const isolated = await context.browser().newContext();
    const receiver = await isolated.newPage(), sender = await isolated.newPage(); attach(receiver); attach(sender);
    try {
      await receiver.goto(origin); await ready(receiver);
      await sender.goto(origin); await ready(sender);
      await receiver.evaluate(() => window.__DEV134.ready(false));
      const before = await receiver.evaluate(() => performance.timeOrigin);
      await receiver.evaluate(() => window.__DEV134.load());
      await sender.evaluate(target => window.__DEV134.fail(target), a);
      await receiver.evaluate(() => window.__DEV134.check());
      await receiver.waitForFunction(() => window.__DEV134.state().failureKind === 'load');
      const state = await receiver.evaluate(() => window.__DEV134.state());
      assert(state.failureKind === 'load' && state.errorCode === 'CHUNK_LOAD_FAILED', 'other tab hid load failure',state);
      assert(await receiver.evaluate(() => performance.timeOrigin) === before, 'unsafe load recovery navigated');
      assert(await receiver.locator('[data-pwa-update-prompt]').count() === 1, 'real load failure prompt hidden');
      return { failureKind:state.failureKind, errorCode:state.errorCode, navigated:false };
    } finally { await isolated.close(); }
  });
  await check('R04-real-background-worker-check-network-failure-remains-quiet', async () => {
    const isolated = await context.browser().newContext(); const tab=await isolated.newPage(); attach(tab);
    try {
      await tab.goto(origin); await ready(tab);
      await isolated.setOffline(true);
      await tab.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await tab.evaluate(() => window.__DEV134.check());
      const state=await tab.evaluate(() => window.__DEV134.state());
      assert(state.failureKind === null && state.status !== 'failed', 'offline background check was reported as load failure', state);
      assert(!(await tab.locator('[data-pwa-update-prompt]').count()), 'offline background failure displayed a banner');
      await isolated.setOffline(false);
      return state;
    } finally { await isolated.close(); }
  });
  await check('R09-failure-types-mobile-desktop-viewport-and-keyboard', async () => {
    // Visual states have a dedicated context without background lifecycle
    // producers. Those producers are tested against actual workers above.
    const uiContext = await context.browser().newContext();
    const page = await uiContext.newPage(); attach(page);
    try {
    await page.goto(origin + '/?ui=1');
    await page.waitForFunction(() => Boolean(window.__DEV134));
    const screenshots = [];
    const titles = { update:'重新載入未完成', load:'畫面載入失敗', 'cache-recovery':'快取恢復未完成' };
    for (const width of [320,390,1440]) {
      await page.setViewportSize({width,height:width===1440?900:844});
      for (const [kind,title] of Object.entries(titles)) {
        await page.evaluate(kind => window.__DEV134.show(kind),kind);
        const prompt=page.locator('[data-pwa-update-prompt]'); await prompt.waitFor();
        assert((await prompt.innerText()).includes(title), 'wrong failure title',kind);
        const rect=await prompt.boundingBox(), buttons=await page.locator('[data-pwa-update-prompt] button').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().toJSON()));
        assert(rect.y>=0 && rect.y+rect.height<=900 && buttons.every(r=>r.x>=0 && r.x+r.width<=width), 'prompt/actions overflow', {width,rect,buttons});
        assert(await page.evaluate(() => document.documentElement.scrollWidth<=document.documentElement.clientWidth+1), 'horizontal document overflow',width);
        const file='__VISUALS__/'+width+'-'+kind+'.png'; await page.screenshot({path:file}); screenshots.push(file);
      }
      for (const blocked of [false,true]) {
        await page.evaluate(value=>window.__DEV134.normal(value),blocked);
        const prompt=page.locator('[data-pwa-update-prompt]'); await prompt.waitFor();
        assert((await prompt.innerText()).includes('新版已就緒'), 'normal update lost compact title');
        const file='__VISUALS__/'+width+'-'+(blocked?'blocked':'normal')+'.png';await page.screenshot({path:file});screenshots.push(file);
      }
    }
    await page.evaluate(() => window.__DEV134.show('update'));
    await page.locator('[data-pwa-update-action]').focus();
    assert(await page.locator('[data-pwa-update-action]').evaluate(e=>e===document.activeElement), 'primary action cannot receive keyboard focus');
    await page.keyboard.press('Tab');
    assert(await page.locator('[data-pwa-cache-recovery]').evaluate(e=>e===document.activeElement), 'keyboard order does not reach cache recovery');
    assert(await page.locator('[data-pwa-cache-recovery]').evaluate(e=>getComputedStyle(e).boxShadow!=='none'), 'keyboard focus indicator missing');
    return {screenshots, widths:[320,390,1440], keyboard:true};
    } finally { await uiContext.close(); }
  });
  await check('R11-quick-shell-activates-shared-update-at-safe-boundary', async () => {
    await page.request.get(origin + '/__dev134/switch?release=A');
    const quickContext = await context.browser().newContext();
    const quickPage = await quickContext.newPage(); attach(quickPage);
    try {
      await quickPage.goto(origin + '/quick-task/?install=1');
      await quickPage.waitForSelector('#quick-task-title:enabled', { timeout: 20000 });
      await quickPage.evaluate(() => navigator.serviceWorker.ready);
      await quickPage.reload();
      await quickPage.waitForSelector('#quick-task-title:enabled', { timeout: 20000 });
      await quickPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
      const before = await quickPage.locator('meta[name="projed-shell-version"]').getAttribute('content');
      assert(before === a, 'quick shell did not start at build A', before);
      const updaterLoaded = await quickPage.evaluate(() => performance.getEntriesByType('resource').some(entry => /pwaUpdateService[^/]*\.js/u.test(entry.name)));
      assert(updaterLoaded, 'quick shell did not load the deferred shared updater');
      await quickPage.request.get(origin + '/__dev134/switch?release=B');
      await quickPage.evaluate(() => { void navigator.serviceWorker.getRegistration('/').then(registration => registration?.update()); });
      await quickPage.waitForFunction(expected => document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content') === expected, b, { timeout: 45000 });
      const after = await quickPage.evaluate(() => ({
        version: document.querySelector('meta[name="projed-shell-version"]')?.getAttribute('content'),
        controlled: Boolean(navigator.serviceWorker.controller),
        titleEnabled: !document.querySelector('#quick-task-title')?.disabled,
        route: location.pathname,
      }));
      assert(after.version === b && after.controlled && after.titleEnabled && after.route === '/quick-task/', 'quick update did not converge to B', after);
      return { before, after, updaterLoaded, singleSharedWorker: true };
    } finally { await quickContext.close(); }
  });

  await check('U01-real-main-layout-roles-viewports-keyboard-and-result-handoff', async progress => {
    await page.request.get(origin + '/__dev134/switch?release=A');
    const browser = context.browser();
    const evidence = { roles:[], geometries:[], screenshots:[], errorSweep:[], expectedTaskCount:0, sentinel:'preserve', simulations:['Auth identity and skipped migration preconditions'] };
    progress.evidence=evidence;
    const roleViews=[{role:'admin',view:'home',fixtureRole:'admin'},{role:'member',view:'settings',fixtureRole:'member'},{role:'member-no-board',view:'home',fixtureRole:'member',noBoard:true}];
    let adminContext=null;
    for(const item of roleViews){
      const localContext=await browser.newContext({viewport:{width:390,height:844}});
      const tab=await localContext.newPage();attach(tab);
      try{
        const requestWindowStart=Date.now();
        await tab.goto(`${origin}/?normal=1&role=${item.fixtureRole}&view=${item.view}`);
        const menu=tab.locator('[data-app-more-menu]');
        let menuWaitError=null;
        try{await menu.waitFor({timeout:20000});}catch(error){menuWaitError=error.message;}
        let noBoardReadback=null,noBoardError=null;
        if(item.noBoard){try{noBoardReadback=await tab.evaluate(()=>window.__DEV134?.noBoard?.()??null);}catch(error){noBoardError=error.message;}}
        let childWaitError=null;
        try{await tab.waitForFunction(view=>{const main=document.querySelector('main[data-app-main="true"]');if(!main)return false;return view==='settings'?Boolean(main.querySelector('[data-settings-view="true"] h2')):[...main.querySelectorAll('h2')].some(element=>element.textContent?.trim()==='工作區總覽');},item.view,{timeout:10000});}catch(error){childWaitError=error.message;}
        const childSnapshot=await mainLayoutChildSnapshot(tab);
        const roleEvidence={role:item.role,fixtureRole:item.fixtureRole,view:item.view,noBoardReadback,noBoardError,menuCount:childSnapshot.appMenuCount,childSnapshot,childWaitError,menuWaitError};
        evidence.roles.push(roleEvidence);progress.evidence=evidence;
        const noBoardReady=!item.noBoard||(noBoardReadback?.workspaces===0&&noBoardReadback.activeWorkspaceId===null&&noBoardReadback.activeBoardId===null);
        const childExists=item.view==='settings'
          ? childSnapshot.settingsRootCount===1&&childSnapshot.settingsHeading==='設定中心'
          : childSnapshot.homeHeadingCount===1&&(!item.noBoard||Boolean(childSnapshot.homeEmptyState));
        assert(!menuWaitError&&childSnapshot.appMenuCount===1&&!childWaitError&&childExists&&noBoardReady,'expected actual MainLayout child view missing',{item,childWaitError,menuWaitError,noBoardError,noBoardReadback,childSnapshot});
        await seedTaskSentinel(tab);
        const task=await taskEvidence(tab);
        assert(task.expectedPendingTaskCount===0,'normal MainLayout case unexpectedly contains a Quick Task outbox row',task);
        const visiblePromptCount=await tab.locator('[data-pwa-update-prompt]:visible').count();
        assert(visiblePromptCount===0,'normal MainLayout case shows an unintended update/error prompt',{role:item.role,view:item.view,visiblePromptCount});
        const visibleErrors=await visibleUnexpectedErrors(tab);
        assert(visibleErrors.length===0,'normal MainLayout case has an unintended visible error',{role:item.role,view:item.view,visibleErrors});
        const requestLog=await(await tab.request.get(origin+'/__dev134/requests')).json();
        const httpErrors=requestLog.filter(request=>request.time>=requestWindowStart&&request.status>=400);
        assert(httpErrors.length===0,'normal MainLayout case produced an unexpected HTTP error',{role:item.role,view:item.view,httpErrors});
        Object.assign(roleEvidence,{expectedTaskCount:task.expectedPendingTaskCount,sentinel:task.sentinel,visiblePromptCount,visibleErrors,httpErrors});
        for(const width of [320,390,1440]){
          await tab.setViewportSize({width,height:width===1440?900:844});
          const summary=tab.locator('[data-app-more-menu] > summary');
          const trigger=await summary.boundingBox();
          assert(trigger&&trigger.width>=44&&trigger.height>=44,'MainLayout more-menu target is below 44px',{width,trigger});
          await summary.click();
          const panel=tab.locator('[data-app-more-menu-panel]');await panel.waitFor();
          const panelRect=await panel.boundingBox();
          const overflow=await tab.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
          assert(panelRect&&panelRect.x>=0&&panelRect.x+panelRect.width<=width+1,'MainLayout menu panel clips at viewport edge',{width,panelRect});
          assert(overflow.scrollWidth<=overflow.clientWidth+1,'MainLayout viewport has horizontal overflow',{width,overflow});
          evidence.geometries.push({role:item.role,view:item.view,width,trigger,panel:panelRect,overflow});
          if(item.role==='admin'){
            const file=`__VISUALS__/U01-main-${width}.png`;await tab.screenshot({path:file});evidence.screenshots.push(file);
          }
          await tab.locator('[data-app-more-menu] > summary').press('Escape');
          assert(!(await menu.locator('summary').evaluate(node=>node.parentElement.open)),'Escape did not close native details menu',width);
          await summary.focus();await tab.keyboard.press('Enter');
          await panel.waitFor({state:'visible',timeout:5000});
          assert(await panel.isVisible(),'Enter did not open native details menu',width);
          await tab.keyboard.press('Escape');
          await summary.focus();await tab.keyboard.press('Space');
          await panel.waitFor({state:'visible',timeout:5000});
          assert(await panel.isVisible(),'Space did not open native details menu',width);
          await tab.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:true,keyCode:229})));
          assert(await panel.isVisible(),'composition Escape incorrectly closed menu',width);
          await tab.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:false,keyCode:0})));
          assert(!(await menu.locator('summary').evaluate(node=>node.parentElement.open)),'non-composition Escape failed to close menu',width);
          await summary.click();
          await tab.locator('main').first().click({position:{x:Math.min(width-20,40),y:Math.min(80,40)}}).catch(()=>{});
          assert(!(await menu.locator('summary').evaluate(node=>node.parentElement.open)),'outside pointer failed to close menu',width);
        }
        if(item.role==='admin'){
          adminContext=localContext;
          await tab.evaluate(()=>window.__DEV134.ready(false)); // SIMULATION: hold automatic apply boundary closed for handoff measurement.
          await tab.locator('[data-app-more-menu] > summary').click();
          await tab.locator('[data-app-update-check]').click();
          await tab.waitForFunction(()=>!document.querySelector('[data-app-update-check]')?.disabled,null,{timeout:12000});
          const status=await tab.locator('[data-app-more-menu-panel] [role="status"]').textContent();
          const sameVersionState=await tab.evaluate(()=>window.__DEV134.state().check);
          const visibleErrors=await tab.locator('[data-pwa-update-prompt]:visible').count();
          assert(Boolean(status?.trim())&&sameVersionState.phase==='up-to-date'&&visibleErrors===0,'real MainLayout check did not produce an inline same-version result or showed an unintended error',{status,sameVersionState,visibleErrors});
          evidence.inlineCheck={status:status.trim(),check:sameVersionState};
          // SIMULATION: a real load-error handler establishes an existing
          // recovery prompt. Detection and its result are still real.
          await tab.evaluate(()=>window.__DEV134.load());
          evidence.promptHandoffPrecondition='SIMULATION: real recoverable load error; safety readiness held false';
          await tab.request.get(origin+'/__dev134/switch?release=B');
          if(!(await tab.locator('[data-app-more-menu]').evaluate(element=>element.open))) await tab.locator('[data-app-more-menu] > summary').click();
          await tab.locator('[data-app-update-check]').click();
          await tab.waitForFunction(()=>window.__DEV134.state().check.phase==='available'
            && document.activeElement?.matches('[data-pwa-update-prompt] [data-pwa-update-action]')
            && !document.querySelector('[data-app-more-menu]')?.open,null,{timeout:20000});
          const handoff=await tab.evaluate(()=>({prompt:Boolean(document.querySelector('[data-pwa-update-prompt] [data-pwa-update-action]')),menuOpen:document.querySelector('[data-app-more-menu]')?.open,active:document.activeElement?.getAttribute('data-pwa-update-action')!==null&&document.activeElement?.matches('[data-pwa-update-prompt] [data-pwa-update-action]'),check:window.__DEV134.state().check,latest:window.__DEV134.state().latestVersion}));
          evidence.promptHandoff=handoff;
          assert(handoff.prompt&&handoff.active&&handoff.check.phase==='available','real version check did not hand off focus to the existing update prompt',handoff);
          const sentinel=await taskEvidence(tab);assert(sentinel.sentinel==='preserve','normal MainLayout flow lost its sentinel',sentinel);
          evidence.expectedTaskCount=sentinel.expectedPendingTaskCount;evidence.sentinel=sentinel.sentinel;
          roleEvidence.taskEvidence=sentinel;
        }else{
          roleEvidence.taskEvidence=task;
        }
      }finally{if(item.role!=='admin')await localContext.close();}
    }
    const loginContext=await browser.newContext({viewport:{width:390,height:844}});const login=await loginContext.newPage();attach(login);
    try{
      await login.goto(origin+'/?normal=1&login=1&ui=1');await login.getByRole('heading',{name:'ProJED'}).waitFor({timeout:20000});
      assert(await login.locator('[data-app-more-menu]').count()===0,'login shell must not add the MainLayout menu');
      await login.evaluate(()=>window.__DEV134.show('load')); // SIMULATION: exercises only prompt placement, not update/check results.
      const prompt=login.locator('[data-pwa-update-prompt]');await prompt.waitFor({timeout:10000});
      assert(await prompt.evaluate(element=>element.closest('.min-h-screen')===null),'existing update prompt is not mounted outside the real AuthGate login shell');
      evidence.loginPromptOutsideGate=true;
      evidence.errorSweep.push({kind:'SIMULATION load-recovery prompt placement',visible:await prompt.innerText()});
    }finally{await loginContext.close();}
    const faultContext=await browser.newContext({viewport:{width:390,height:844}});const fault=await faultContext.newPage();attach(fault);
    try{
      await fault.goto(origin+'/?normal=1&role=member&view=home');await fault.locator('[data-app-more-menu]').waitFor({timeout:20000});
      await seedTaskSentinel(fault);
      await fault.evaluate(()=>{document.cookie='dev134_fault=http; path=/; SameSite=Lax';window.__DEV134.ready(false);});
      await fault.locator('[data-app-more-menu] > summary').click();await fault.locator('[data-app-update-check]').click();
      await fault.waitForFunction(()=>!document.querySelector('[data-app-update-check]')?.disabled,null,{timeout:12000});
      const status=await fault.locator('[data-app-more-menu-panel] [role="status"]').textContent();
      const state=await fault.evaluate(()=>window.__DEV134.state().check);
      const requests=await (await fault.request.get(origin+'/__dev134/requests')).json();
      const failures=requests.filter(item=>item.status===503&&/app-shell-meta|release-meta/.test(item.url));
      assert(Boolean(status?.trim())&&state.phase==='error'&&failures.length>0,'HTTP metadata fault did not produce a visible real check error',{status,state,failures});
      evidence.errorSweep.push({kind:'HTTP 503 metadata SIMULATION',status:status.trim(),check:state,requests:failures});
      evidence.expectedTaskCount=(await taskEvidence(fault)).expectedPendingTaskCount;
      progress.evidence=evidence;
    }finally{await faultContext.close();}
    if(adminContext)await adminContext.close();
    return evidence;
  });

  await check('U02-real-quick-task-route-install-menu-dom-identity-and-outbox', async progress => {
    await page.request.get(origin + '/__dev134/switch?release=A');
    const browser=context.browser();
    const result={routes:[],screenshots:[],checkAttempts:[],simulations:['beforeinstallprompt/appinstalled events','Android/iOS user-agent and display-mode','SIMULATION bounded auth SDK precondition; auth.ts/main/form/menu/outbox/update service remain real'],errorSweep:[],authCoverage:{signedIn:{zero:null,pending:null},signedOut:{zero:null,pending:null}}};
    progress.evidence=result;
    const authNetworkAudit=new WeakMap();
    const createQuick=async(options={},authMode='signedOut')=>{
      const quickContext=await browser.newContext({viewport:{width:390,height:844},...options});
      const tab=await quickContext.newPage();attach(tab);
      const remoteSupabaseRequests=[];authNetworkAudit.set(tab,remoteSupabaseRequests);
      tab.on('request',request=>{try{const url=new URL(request.url());if(/supabase|dev134-simulation/i.test(url.hostname))remoteSupabaseRequests.push({method:request.method(),url:request.url()});}catch{}});
      await tab.goto(origin+`/quick-task/?install=1&dev134Auth=${authMode}`);
      await tab.waitForSelector('#quick-task-title:enabled',{timeout:20000});
      await tab.waitForSelector('details[data-quick-install-menu="true"] > summary[aria-label="更多選項"]',{timeout:20000});
      await seedTaskSentinel(tab);
      return {quickContext,tab};
    };
    const authEvidence=async(tab,authMode,caseName)=>{
      const signed=authMode==='signedIn';
      let waitError=null;
      try{await tab.waitForFunction(expected=>{const metrics=window.__DEV134_QUICK_AUTH_SIMULATION;const text=document.querySelector('#quick-task-auth-status')?.textContent?.trim()??'';return Boolean(metrics)&&metrics.mode===expected&&(expected==='signedIn'?text.startsWith('此快速 App 已登入：'):text.startsWith('此快速 App 尚未登入'));},authMode,{timeout:20000});}catch(error){waitError=error.message;}
      const evidence=await tab.evaluate(()=>({status:document.querySelector('#quick-task-auth-status')?.textContent?.trim()??null,simulation:window.__DEV134_QUICK_AUTH_SIMULATION?{...window.__DEV134_QUICK_AUTH_SIMULATION}:null}));
      evidence.waitError=waitError;
      result.authCoverage[authMode][caseName]={authEvidence:evidence};progress.evidence=result;
      assert(!waitError&&evidence.simulation?.marker?.startsWith('SIMULATION: bounded auth SDK precondition')&&evidence.simulation.endpointConfigured===false,'Quick Task auth SDK precondition was not the bounded no-network fixture or expected auth UI state did not settle',{authMode,evidence});
      assert(evidence.simulation.mode===authMode&&evidence.simulation.subscriptions>=1&&evidence.simulation.getSessionCalls>=1&&(!signed||evidence.simulation.getUserCalls>=1),'real Quick auth.ts did not exercise the expected SDK session verification path',{authMode,evidence});
      evidence.remoteSupabaseRequests=authNetworkAudit.get(tab)??[];
      assert(evidence.remoteSupabaseRequests.length===0,'auth precondition attempted a remote Supabase RPC',{authMode,evidence});
      return evidence;
    };
    const waitForTerminalCheck=async(tab,scenario)=>{
      try{await tab.waitForFunction(()=>{const state=window.__DEV134_PWA?.getState?.();const status=document.querySelector('[data-quick-update-status]');const phases=['up-to-date','available','error','cancelled','busy'];return phases.includes(state?.check?.phase)&&status&&!status.hidden&&Boolean(status.textContent?.trim())&&status.textContent.trim()!=='檢查中';},null,{timeout:15000});}
      catch(error){const diagnostic=await tab.evaluate(()=>({state:window.__DEV134_PWA?.getState?.()??null,status:document.querySelector('[data-quick-update-status]')?.textContent?.trim()??null,statusHidden:document.querySelector('[data-quick-update-status]')?.hidden??null,checkDisabled:document.querySelector('[data-quick-update-check]')?.disabled??null}));const attempt={...scenario,terminal:false,diagnostic,waitError:error.message};result.checkAttempts.push(attempt);progress.evidence=result;throw new Error('Quick Task check failed to reach a terminal visible result: '+JSON.stringify(attempt));}
      const readback=await tab.evaluate(()=>({state:window.__DEV134_PWA?.getState?.(),status:document.querySelector('[data-quick-update-status]')?.textContent?.trim()??null,statusHidden:document.querySelector('[data-quick-update-status]')?.hidden??null}));
      const attempt={...scenario,terminal:true,phase:readback.state?.check?.phase??null,status:readback.status,statusHidden:readback.statusHidden,check:readback.state?.check??null};result.checkAttempts.push(attempt);progress.evidence=result;
      assert(readback.state?.check?.phase==='up-to-date'&&readback.statusHidden===false&&readback.status&&readback.status!=='檢查中','real Quick Task same-version check did not reach its terminal visible local result',{...attempt,readback});
      return readback;
    };
    for(const authMode of ['signedIn','signedOut']){
      const coverageKey=authMode;
      const {quickContext:zeroContext,tab:zero}=await createQuick({},authMode);
      try{
        const auth=await authEvidence(zero,authMode,'zero');
        const beforeEvidence=await taskEvidence(zero);assert(beforeEvidence.expectedPendingTaskCount===0,'zero-task route unexpectedly has saved Quick Task rows',{authMode,beforeEvidence});
        const menu=zero.locator('details[data-quick-install-menu="true"]');
        assert(await menu.count()===1,'real Quick Task route must render exactly one three-dot entry',{authMode});
        await menu.locator('summary').click();
        const checkButton=zero.locator('[data-quick-update-check]');const installButton=zero.locator('[data-quick-install-action]');
        assert(await checkButton.count()===1&&await installButton.count()===1,'update and install rows must both remain available',{authMode});
        const order=await zero.evaluate(()=>{const check=document.querySelector('[data-quick-update-check]'),install=document.querySelector('[data-quick-install-action]');return Boolean(check&&install&&(check.compareDocumentPosition(install)&Node.DOCUMENT_POSITION_FOLLOWING));});
        assert(order,'Quick Task check must appear before install action',{authMode});
        await checkButton.click();
        const checkEvidence=await waitForTerminalCheck(zero,{authMode,pending:0});
        const unexpectedPrompt=await zero.locator('.quick-task-pwa-update[data-pwa-update-prompt]:visible').count();
        assert(unexpectedPrompt===0,'normal zero-task Quick Task case shows an unintended update/error prompt',{authMode,unexpectedPrompt});
        const visibleErrors=await visibleUnexpectedErrors(zero);assert(visibleErrors.length===0,'normal zero-task Quick Task case has an unintended visible error',{authMode,visibleErrors});
        await zero.evaluate(()=>{window.__dev134MenuRef=document.querySelector('details[data-quick-install-menu="true"]');window.__dev134PanelRef=document.querySelector('.quick-task-install-menu-panel');window.__dev134CheckRef=document.querySelector('[data-quick-update-check]');});
        await zero.evaluate(()=>{
          const prompt=new Event('beforeinstallprompt',{cancelable:true});
          Object.defineProperty(prompt,'prompt',{value:async()=>{}});
          Object.defineProperty(prompt,'userChoice',{value:Promise.resolve({outcome:'dismissed',platform:''})});
          window.dispatchEvent(prompt);
          window.dispatchEvent(new Event('appinstalled'));
        });
        for(const width of [320,390,1440]){
          await zero.setViewportSize({width,height:width===1440?900:844});
          const preserved=await zero.evaluate(()=>({sameMenu:window.__dev134MenuRef===document.querySelector('details[data-quick-install-menu="true"]'),samePanel:window.__dev134PanelRef===document.querySelector('.quick-task-install-menu-panel'),sameCheck:window.__dev134CheckRef===document.querySelector('[data-quick-update-check]'),menuCount:document.querySelectorAll('details[data-quick-install-menu="true"]').length,status:document.querySelector('[data-quick-update-status]')?.textContent?.trim(),statusHidden:document.querySelector('[data-quick-update-status]')?.hidden,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
          assert(preserved.sameMenu&&preserved.samePanel&&preserved.sameCheck&&preserved.menuCount===1&&preserved.status===checkEvidence.status&&!preserved.statusHidden,'Quick Task install event or RWD render replaced menu/result DOM',{authMode,width,preserved,checkEvidence});
          assert(preserved.scrollWidth<=preserved.clientWidth+1,'Quick Task menu caused horizontal overflow',{authMode,width,preserved});
          if(authMode==='signedOut'){const file=`__VISUALS__/U02-quick-${width}.png`;await zero.screenshot({path:file});result.screenshots.push(file);}
        }
        let dialogText=null;
        if(authMode==='signedOut'){
          await installButton.click();
          const dialog=zero.locator('dialog.quick-task-install-dialog');
          await zero.waitForFunction(()=>document.querySelector('dialog.quick-task-install-dialog')?.open===true,null,{timeout:5000});
          assert(await dialog.isVisible(),'actual Quick Task install guide dialog was not opened');
          dialogText=await dialog.innerText();
          await dialog.locator('form button[type="submit"]').click();
          assert(await zero.locator('#quick-task-form').count()===1&&await zero.locator('#quick-task-title').isEnabled(),'Quick Task form was removed or disabled after install guide');
        }
        const afterEvidence=await taskEvidence(zero);
        assert(afterEvidence.expectedPendingTaskCount===0&&afterEvidence.sentinel==='preserve','zero-task/sentinel state changed during menu check',{authMode,beforeEvidence,afterEvidence});
        const route={route:'/quick-task/?install=1',authState:authMode,pending:afterEvidence.expectedPendingTaskCount,checkStatus:checkEvidence.status,checkReadback:checkEvidence.state.check,visiblePromptCount:unexpectedPrompt,visibleErrors,dialogText,menuIdentityPreserved:true,taskEvidence:afterEvidence,authEvidence:auth};
        result.routes.push(route);result.authCoverage[coverageKey].zero=route;progress.evidence=result;
      }finally{await zeroContext.close();}

      const {quickContext:taskContext,tab:taskPage}=await createQuick({},authMode);
      try{
        const auth=await authEvidence(taskPage,authMode,'pending');
        const title=`DEV-134 U02 ${authMode} pending local task sentinel`;
        await taskPage.locator('#quick-task-title').fill(title);
        await taskPage.locator('#quick-task-submit').click();
        await taskPage.waitForFunction(async expectedTitle=>{
          const db=await new Promise(resolve=>{const request=indexedDB.open('projed-quick-task-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);});
          if(!db)return false;const rows=await new Promise(resolve=>{const request=db.transaction('captures').objectStore('captures').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve([]);});db.close();return rows.some(row=>row.title===expectedTitle&&row.state!=='synced');
        },title,{timeout:20000});
        const beforeCheck=await taskEvidence(taskPage);
        assert(beforeCheck.expectedPendingTaskCount===1&&beforeCheck.records[0].title===title,'real Quick Task form did not commit exactly one unsynced outbox task',{authMode,beforeCheck});
        assert(authMode==='signedIn'?beforeCheck.records[0].accountId==='dev134-simulated-user':beforeCheck.records[0].accountId===null,'real auth precondition did not produce the expected local account binding',{authMode,auth,beforeCheck});
        const menu=taskPage.locator('details[data-quick-install-menu="true"]');await menu.locator('summary').click();
        await taskPage.locator('[data-quick-update-check]').click();
        const checkEvidence=await waitForTerminalCheck(taskPage,{authMode,pending:1,title});
        const visibleErrors=await visibleUnexpectedErrors(taskPage);
        assert(visibleErrors.length===0,'U02 pending-task auth case surfaced an unrelated visible error',{authMode,visibleErrors});
        const evidence=await taskEvidence(taskPage);
        assert(evidence.expectedPendingTaskCount===1&&evidence.records[0].title===title&&evidence.sentinel==='preserve','pending task or sentinel changed during the real check',{authMode,evidence,checkEvidence});
        const route={route:'/quick-task/?install=1',authState:authMode,pending:evidence.expectedPendingTaskCount,taskEvidence:evidence,checkStatus:checkEvidence.status,checkReadback:checkEvidence.state.check,visibleErrors,authEvidence:auth};
        result.routes.push(route);result.authCoverage[coverageKey].pending=route;progress.evidence=result;
      }finally{await taskContext.close();}
    }

    const {quickContext:taskContext,tab:taskPage}=await createQuick({},'signedOut');
    try{
      await taskContext.setOffline(true); // Fault subcase is isolated from U06 BFCache context.
      await taskPage.locator('#quick-task-title').fill('DEV-134 U02 saved local task sentinel');
      await taskPage.locator('#quick-task-submit').click();
      await taskPage.waitForFunction(async()=>{
        const db=await new Promise(resolve=>{const request=indexedDB.open('projed-quick-task-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);});
        if(!db)return false;const rows=await new Promise(resolve=>{const request=db.transaction('captures').objectStore('captures').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve([]);});db.close();return rows.some(row=>row.title==='DEV-134 U02 saved local task sentinel'&&row.state!=='synced');
      },null,{timeout:20000});
      const menu=taskPage.locator('details[data-quick-install-menu="true"]');await menu.locator('summary').click();
      await taskPage.locator('[data-quick-update-check]').click();
      await taskPage.waitForFunction(()=>{const state=window.__DEV134_PWA?.getState?.();const status=document.querySelector('[data-quick-update-status]');return state?.check?.phase==='error'&&status&&!status.hidden&&Boolean(status.textContent.trim())&&status.textContent.trim()!=='檢查中';},null,{timeout:15000});
      const errorText=await taskPage.locator('[data-quick-update-status]').textContent();
      const evidence=await taskEvidence(taskPage);
      const offlineState=await taskPage.evaluate(()=>window.__DEV134_PWA?.getState?.());
      const visibleErrors=await visibleUnexpectedErrors(taskPage);
      assert(evidence.expectedPendingTaskCount===1&&evidence.records[0].title==='DEV-134 U02 saved local task sentinel','real Quick Task form did not retain exactly one unsynced outbox task',evidence);
      assert(Boolean(errorText?.trim())&&errorText.trim()!=='檢查中'&&offlineState?.check?.phase==='error','offline update error did not reach its terminal visible error readback',{errorText,offlineState});
      assert(visibleErrors.length===0,'U02 offline fault surfaced an unrelated visible error',visibleErrors);
      assert(await taskPage.locator('#quick-task-form').count()===1,'business form missing from nonzero-task route');
       result.errorSweep.push({kind:'isolated offline check',expectedVisibleError:errorText.trim(),checkReadback:offlineState.check,unexpectedVisibleErrors:visibleErrors,checkMenuCount:1});
      result.routes.push({route:'/quick-task/?install=1',authState:'signedOut SIMULATION',pending:evidence.expectedPendingTaskCount,taskEvidence:evidence,errorVisible:errorText.trim(),checkReadback:offlineState.check,unexpectedVisibleErrors:visibleErrors});
    }finally{await taskContext.setOffline(false).catch(()=>{});await taskContext.close();}

    for(const platform of [
      {name:'Android installed SIMULATION',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'},
      {name:'iOS installed SIMULATION',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},
    ]){
      const {quickContext:platformContext,tab:platformPage}=await createQuick({userAgent:platform.userAgent},'signedOut');
      try{
        await platformPage.addInitScript(()=>{
          const original=window.matchMedia.bind(window);
          window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return false;}}:original(query);
        });
        await platformPage.reload();await platformPage.waitForSelector('#quick-task-title:enabled',{timeout:20000});
        assert(await platformPage.locator('details[data-quick-install-menu="true"]').count()===1,'installed platform simulation changed single-menu invariant',platform.name);
        await platformPage.locator('details[data-quick-install-menu="true"] > summary').click();
        await platformPage.locator('[data-quick-install-action]').click();
       await platformPage.waitForFunction(()=>document.querySelector('dialog.quick-task-install-dialog')?.open===true,null,{timeout:5000});
        const guidance=await platformPage.locator('dialog.quick-task-install-dialog').innerText();
        const task=await taskEvidence(platformPage);
        result.routes.push({route:'/quick-task/?install=1',platform:platform.name,platformMark:'SIMULATION user-agent/display-mode',authState:'signedOut SIMULATION',dialogText:guidance,expectedPendingTaskCount:task.expectedPendingTaskCount,sentinel:task.sentinel});
      }finally{await platformContext.close();}
    }
     progress.evidence=result;
     assert(result.authCoverage.signedIn.zero&&result.authCoverage.signedIn.pending&&result.authCoverage.signedOut.zero&&result.authCoverage.signedOut.pending,'U02 auth-state × task-count matrix is incomplete',result.authCoverage);
     return result;
  });

  await check('U01-visible-http-error-sweep-recorded',async()=>{
    const visible=results.find(item=>item.name.startsWith('U01-real-main-layout'))?.details?.errorSweep
      ??results.find(item=>item.name.startsWith('U01-real-main-layout'))?.partial?.evidence?.errorSweep??[];
    assert(visible.length>=2,'U01 did not preserve login prompt and HTTP error visibility evidence',visible);
    return {visible,diagnostics:diagnostics.slice()};
  });
  await check('U02-visible-error-and-expected-task-count-recorded',async()=>{
    const result=results.find(item=>item.name.startsWith('U02-real-quick-task'));
    const details=result?.details??result?.partial?.evidence;
    assert(details?.routes?.some(item=>item.pending===1||item.expectedPendingTaskCount===1),'U02 did not preserve its real pending task case',details);
    assert(details?.errorSweep?.some(item=>Boolean(item.visible||item.expectedVisibleError)),'U02 did not preserve visible error evidence',details);
    return {errorSweep:details.errorSweep,expectedTaskCounts:details.routes.map(item=>item.pending??item.expectedPendingTaskCount),diagnostics:diagnostics.slice()};
  });
  return {ok:results.every(item=>item.ok),results,diagnostics};
}
