/* eslint-disable */
async page => {
  const visualsDir = __DEV134_VISUALS_DIR__;
  const browser = page.context().browser();
  const browserVersion = browser ? browser.version() : null;
  const browserUserAgent = await page.evaluate(() => navigator.userAgent);
  const checks = [];
  const errors = [];
  const assert = (ok, name, detail = {}) => { checks.push({ name, ok, detail }); if (!ok) errors.push(name); };
  const prompt = page.locator('[data-pwa-update-prompt]');
  const state = value => page.evaluate(value => window.__DEV134_QUICK_UPDATE_FIXTURE.set(value), value);
  let simulationState = null;

  try {
    await page.waitForFunction(() => Boolean(window.__DEV134_QUICK_UPDATE_FIXTURE && window.__DEV134_QUICK_INSTALL_FIXTURE));
    await page.setViewportSize({ width: 320, height: 844 });

    await state({ status: 'idle', updateAvailable: true, reloadSafetyState: 'safe' });
    assert(await prompt.isHidden(), 'safe update uses shared silent apply policy');

    await state({ status: 'update-available', updateAvailable: true, dismissedAt: null, reloadSafetyState: 'dirty' });
    await prompt.waitFor({ state: 'visible' });
    assert((await prompt.innerText()).includes('新版已就緒'), 'dirty page announces available update');
    assert(await prompt.getByRole('button', { name: '重新載入' }).isVisible() && await prompt.getByRole('button', { name: '稍後' }).isVisible(), 'normal prompt matches main app actions');
    const layout = await page.evaluate(() => {
      const card = document.querySelector('[data-pwa-update-prompt]');
      const button = card.querySelector('[data-pwa-update-action]');
      const box = card.getBoundingClientRect(); const action = button.getBoundingClientRect();
      return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, left: box.left, right: box.right, bottom: box.bottom, viewport: innerHeight, buttonBottom: action.bottom };
    });
    assert(layout.scrollWidth <= layout.width && layout.left >= 0 && layout.right <= layout.width && layout.bottom <= layout.viewport + 1 && layout.buttonBottom <= layout.viewport, '320px mobile prompt fits viewport', layout);
    await page.screenshot({ path: `${visualsDir}/dev134-quick-task-prompt-320x844.png` });

    await prompt.getByRole('button', { name: '稍後' }).click();
    const actions = await page.evaluate(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions);
    assert(actions.dismiss === 1, 'later calls shared dismiss action');
    await state({ dismissedAt: null });
    await prompt.getByRole('button', { name: '重新載入' }).click();
    await page.waitForFunction(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions.apply === 1);
    assert(true, 'reload calls shared safety-gated apply action');

    await state({ status: 'recoverable-cache-error', updateAvailable: false, failureKind: 'load', errorMessage: '畫面暫時無法載入。', reloadSafetyState: 'dirty' });
    assert((await prompt.innerText()).includes('畫面載入失敗') && await prompt.getByRole('button', { name: '重試' }).isVisible() && await prompt.getByRole('button', { name: '清除快取後重整' }).isVisible(), 'load recovery preserves main app actions');
    await prompt.getByRole('button', { name: '重試' }).click();
    await page.waitForFunction(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions.retry === 1);
    await prompt.getByRole('button', { name: '清除快取後重整' }).click();
    await page.waitForFunction(() => window.__DEV134_QUICK_UPDATE_FIXTURE.actions.recover === 1);
    assert(true, 'recovery actions call shared retry and cache recovery');

    const diagnostics = await page.evaluate(() => ({ horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, promptVisible: !document.querySelector('[data-pwa-update-prompt]').hidden }));
    assert(!diagnostics.horizontalOverflow && diagnostics.promptVisible, 'prompt remains usable after state changes', diagnostics);

    await state({ status: 'idle', updateAvailable: false, dismissedAt: null, failureKind: null, errorMessage: null, reloadSafetyState: 'safe' });
    const installFixture = page.locator('body').evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot());
    simulationState = (await installFixture).simulationState;
    const menu = page.locator('.quick-task-header-actions .quick-task-install-menu');
    const summary = menu.locator('summary');
    const checkButton = page.locator('[data-quick-update-check]');
    const checkStatus = page.locator('[data-quick-update-status]');
    const reloadButton = page.locator('[data-quick-update-reload]');
    const titleInput = page.getByRole('textbox', { name: '任務名稱' });
    const isMenuOpen = () => page.evaluate(() => Boolean(document.querySelector('.quick-task-install-menu')?.open));
    const fixtureSnapshot = () => page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot());
    const captureUpdateDom = async label => {
      const dom = await page.evaluate(() => {
        const read = selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            present: true,
            hidden: element.hidden,
            text: element.textContent ?? '',
            display: style.display,
            visibility: style.visibility,
            width: rect.width,
            height: rect.height,
          };
        };
        return {
          menuOpen: Boolean(document.querySelector('.quick-task-install-menu')?.open),
          check: read('[data-quick-update-check]'),
          status: read('[data-quick-update-status]'),
          reload: read('[data-quick-update-reload]'),
        };
      });
      const locatorStates = {
        checkHidden: await checkButton.isHidden(),
        checkEnabled: await checkButton.isEnabled(),
        statusHidden: await checkStatus.isHidden(),
        reloadHidden: await reloadButton.isHidden(),
        reloadEnabled: await reloadButton.isEnabled(),
      };
      const screenshotPath = `${visualsDir}/dev134-quick-task-${label}.png`;
      await page.screenshot({ path: screenshotPath });
      return { dom, locatorStates, screenshotPath };
    };

    await summary.click();
    await page.waitForFunction(() => Boolean(document.querySelector('.quick-task-install-menu')?.open));
    const initialFixture = await fixtureSnapshot();
    assert(
      initialFixture.simulationState.mode === 'SIMULATION'
        && initialFixture.simulationState.serviceWorker === false
        && initialFixture.simulationState.normalU02InstallFlow === false
        && initialFixture.simulationState.normalQuickTaskEntryPoint === false
        && initialFixture.sameMenuNode
        && await page.locator('.quick-task-header-actions .quick-task-install-menu').count() === 1,
      'real install renderer is mounted once in an explicitly simulated header menu',
      initialFixture,
    );

    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.configureProviderBehaviors(['reject', 'deferred']));
    await checkButton.click();
    await page.waitForFunction(() => window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot().providerCount === 1, null, { timeout: 5_000 });
    await page.waitForFunction(() => document.querySelector('[data-quick-update-status]')?.textContent === '目前無法檢查更新', null, { timeout: 5_000 });
    const rejectedProvider = await fixtureSnapshot();
    assert(
      rejectedProvider.providerCount === 1
        && rejectedProvider.subscriptionCount === 0
        && rejectedProvider.checkCalls.length === 0
        && await checkButton.isEnabled(),
      'provider rejection reports unavailable and unlocks a retry',
      rejectedProvider,
    );

    const readinessStartedAt = await page.evaluate(() => Date.now());
    await checkButton.click();
    await page.waitForFunction(() => {
      const snapshot = window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot();
      return snapshot.providerCount === 2 && snapshot.providerPending;
    }, null, { timeout: 5_000 });
    await page.waitForFunction(() => document.querySelector('[data-quick-update-status]')?.textContent === '檢查逾時，請重試', null, { timeout: 15_000 });
    const readinessElapsedMs = await page.evaluate(startedAt => Date.now() - startedAt, readinessStartedAt);
    const timedOutReadiness = await fixtureSnapshot();
    assert(
      readinessElapsedMs >= 9_500 && readinessElapsedMs <= 12_500
        && timedOutReadiness.providerCount === 2
        && timedOutReadiness.providerPending
        && timedOutReadiness.subscriptionCount === 0
        && timedOutReadiness.checkCalls.length === 0
        && await checkButton.isEnabled(),
      'real 10-second readiness deadline ends UI waiting but preserves the unresolved provider',
      { elapsedMs: readinessElapsedMs, ...timedOutReadiness },
    );

    await checkButton.click();
    const retriedPending = await fixtureSnapshot();
    assert(
      retriedPending.providerCount === 2
        && retriedPending.providerPending
        && retriedPending.subscriptionCount === 0
        && retriedPending.checkCalls.length === 0
        && await checkButton.isDisabled(),
      'retry shares the pending provider promise without another provider call',
      retriedPending,
    );

    await summary.click();
    await page.waitForFunction(() => !document.querySelector('.quick-task-install-menu')?.open);
    await titleInput.focus();
    const beforeLateProvider = await page.evaluate(() => ({
      menuOpen: Boolean(document.querySelector('.quick-task-install-menu')?.open),
      statusText: document.querySelector('[data-quick-update-status]')?.textContent ?? '',
      statusHidden: document.querySelector('[data-quick-update-status]')?.hidden ?? true,
      focusLabel: document.activeElement?.getAttribute('aria-label') ?? null,
    }));
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.resolveDeferredProvider());
    await page.waitForFunction(() => window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot().subscriptionCount === 1, null, { timeout: 5_000 });
    await page.waitForTimeout(100);
    const afterLateProvider = await page.evaluate(() => ({
      menuOpen: Boolean(document.querySelector('.quick-task-install-menu')?.open),
      statusText: document.querySelector('[data-quick-update-status]')?.textContent ?? '',
      statusHidden: document.querySelector('[data-quick-update-status]')?.hidden ?? true,
      focusLabel: document.activeElement?.getAttribute('aria-label') ?? null,
    }));
    const afterLateSnapshot = await fixtureSnapshot();
    assert(
      !afterLateProvider.menuOpen
        && afterLateProvider.statusText === beforeLateProvider.statusText
        && afterLateProvider.statusHidden === beforeLateProvider.statusHidden
        && afterLateProvider.focusLabel === '任務名稱'
        && afterLateSnapshot.providerCount === 2
        && afterLateSnapshot.subscriptionCount === 1
        && afterLateSnapshot.checkCalls.length === 0
        && afterLateSnapshot.sameMenuNode,
      'late provider settlement after collapse leaves the old menu, status and focus untouched',
      { before: beforeLateProvider, after: afterLateProvider, snapshot: afterLateSnapshot },
    );

    await summary.click();
    await page.waitForFunction(() => Boolean(document.querySelector('.quick-task-install-menu')?.open));
    await page.waitForFunction(() => document.querySelector('[data-quick-update-status]')?.hidden === true);
    const firstManualResult = {
      requestId: 1,
      phase: 'up-to-date',
      currentVersion: 'bundle-A',
      latestVersion: 'bundle-A',
      startedAt: 1,
      finishedAt: 2,
      errorCode: null,
    };
    await page.evaluate(result => window.__DEV134_QUICK_INSTALL_FIXTURE.queueDeferredCheck(result), firstManualResult);
    const manualClickStartedAt = await page.evaluate(() => Date.now());
    await checkButton.click();
    await page.waitForFunction(() => window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot().checkCalls.length === 1, null, { timeout: 5_000 });
    const pendingManualCheck = await fixtureSnapshot();
    const observedCheck = pendingManualCheck.syncObservations.filter(observation => observation.action === 'check').at(-1);
    assert(
      observedCheck?.checkDisabled === true
        && pendingManualCheck.providerCount === 2
        && pendingManualCheck.subscriptionCount === 1
        && pendingManualCheck.checkCalls.length === 1
        && pendingManualCheck.pendingCheckCount === 1
        && await checkButton.isDisabled(),
      'check is disabled synchronously before its first await and stays disabled while the check is pending',
      { observation: observedCheck, snapshot: pendingManualCheck },
    );
    const firstCheckDeadlineDeltaMs = pendingManualCheck.checkCalls[0].deadlineAt - manualClickStartedAt;
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.resolveNextCheck());
    await page.waitForFunction(() => document.querySelector('[data-quick-update-status]')?.textContent === '已是最新版' && !document.querySelector('[data-quick-update-check]')?.disabled, null, { timeout: 5_000 });
    const firstCheckSettledAt = await page.evaluate(() => Date.now());
    assert(
      firstCheckDeadlineDeltaMs >= 9_500 && firstCheckDeadlineDeltaMs <= 10_500
        && firstCheckSettledAt - manualClickStartedAt < 5_000
        && await checkButton.isEnabled(),
      'ready API receives the click-based absolute deadline and settling unlocks the check action',
      { deadlineDeltaMs: firstCheckDeadlineDeltaMs, elapsedMs: firstCheckSettledAt - manualClickStartedAt, snapshot: await fixtureSnapshot() },
    );

    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.setApiState({ currentVersion: 'bundle-B', latestVersion: 'bundle-B' }));
    await page.waitForFunction(() => document.querySelector('[data-quick-update-status]')?.hidden === true);
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.setApiState({ currentVersion: 'bundle-A', latestVersion: 'bundle-A' }));
    const afterIdentityRestore = await fixtureSnapshot();
    const identityRestoreDom = await captureUpdateDom('identity-restore-diagnostics');
    assert(
      await checkStatus.isHidden()
        && await reloadButton.isHidden()
        && !afterIdentityRestore.apiState.localUpdateBusy,
      'changed current/latest identities permanently clear a successful result when the original identities return',
      { snapshot: afterIdentityRestore, dom: identityRestoreDom },
    );

    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.setApiState({ currentVersion: 'bundle-B', latestVersion: 'bundle-C', updateAvailable: false, status: 'idle' }));
    const availableResult = {
      requestId: 2,
      phase: 'available',
      currentVersion: 'bundle-B',
      latestVersion: 'bundle-C',
      startedAt: 3,
      finishedAt: 4,
      errorCode: null,
    };
    await page.evaluate(result => window.__DEV134_QUICK_INSTALL_FIXTURE.queueCheckResult(result), availableResult);
    await checkButton.click();
    await page.waitForFunction(() => document.querySelector('[data-quick-update-status]')?.textContent === '發現新版' && document.querySelector('[data-quick-update-reload]')?.hidden === false, null, { timeout: 5_000 });
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.deferNextApply());
    await reloadButton.click();
    await page.waitForFunction(() => window.__DEV134_QUICK_INSTALL_FIXTURE.snapshot().applyCount === 1, null, { timeout: 5_000 });
    const pendingApply = await fixtureSnapshot();
    const observedReload = pendingApply.syncObservations.filter(observation => observation.action === 'reload').at(-1);
    const pendingApplyDom = await captureUpdateDom('local-update-busy-pending-diagnostics');
    assert(
      observedReload?.checkDisabled === true
        && observedReload?.reloadHidden === true
        && observedReload?.localUpdateBusy === true
        && pendingApply.applyPending
        && await checkButton.isDisabled()
        && await reloadButton.isHidden(),
      'local update busy clears the successful reload result before apply settles and disables controls synchronously',
      { observation: observedReload, snapshot: pendingApply, dom: pendingApplyDom },
    );
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.setApiState({ currentVersion: 'bundle-D', latestVersion: 'bundle-D' }));
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.resolveApply());
    await page.waitForFunction(() => !document.querySelector('[data-quick-update-check]')?.disabled && document.querySelector('[data-quick-update-status]')?.hidden === true, null, { timeout: 5_000 });
    await page.evaluate(() => window.__DEV134_QUICK_INSTALL_FIXTURE.setApiState({ currentVersion: 'bundle-B', latestVersion: 'bundle-C' }));
    const afterBusyIdentityRestore = await fixtureSnapshot();
    const settledBusyDom = await captureUpdateDom('local-update-busy-settled-diagnostics');
    assert(
      await checkButton.isEnabled()
        && await reloadButton.isHidden()
        && await checkStatus.isHidden()
        && !afterBusyIdentityRestore.apiState.localUpdateBusy
        && afterBusyIdentityRestore.providerCount === 2
        && afterBusyIdentityRestore.subscriptionCount === 1
        && afterBusyIdentityRestore.checkCalls.length === 2
        && afterBusyIdentityRestore.applyCount === 1,
      'settled local busy unlocks controls without reviving the cleared successful result after identities return',
      { snapshot: afterBusyIdentityRestore, dom: settledBusyDom },
    );
  } catch (error) {
    assert(false, 'fixture runner retained partial results after an exception', { message: error instanceof Error ? error.message : String(error) });
  }

  return {
    ok: errors.length === 0,
    checks,
    errors,
    viewport: '320x844',
    screenshot: `${visualsDir}/dev134-quick-task-prompt-320x844.png`,
    browserVersion,
    browserUserAgent,
    fixtureOnly: true,
    simulationOnly: true,
    simulationState,
    normalU02InstallFlowVerified: false,
    normalQuickTaskEntryPointVerified: false,
    realU06LifecycleVerified: false,
  };
}
