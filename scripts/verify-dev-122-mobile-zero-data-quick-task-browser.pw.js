/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-122-mobile-zero-data-quick-task';
  const result = { devId: 'DEV-122', status: 'FAIL', caseSet: 'local-smoke-v2', sourceRevision: 'working-tree', buildId: 'unknown', actorAlias: 'DEV122-QUICK-A', fixtureVersion: 'DEV122-QUICK-V1', platform: 'Chromium', route: '/quick-task/', viewport: { width: 390, height: 844 }, cases: [], screenshots: [], browserErrors: [], httpFailures: [], businessRequests: [], runtime: { port: 4000, reused: true, cleaned: false, portReleased: false } };
  const fail = [];
  const record = (id, ok, details = {}) => { result.cases.push({ id, sourceRevision: result.sourceRevision, buildId: result.buildId, actorAlias: result.actorAlias, fixtureVersion: result.fixtureVersion, route: result.route, viewport: result.viewport, platform: result.platform, expected: true, actual: ok, status: ok ? 'PASS' : 'FAIL', details }); if (!ok) fail.push(id); };
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon')) result.browserErrors.push(msg.text()); });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('favicon')) result.httpFailures.push({ status: response.status(), url: response.url() }); });
  page.on('request', request => {
    const url = request.url();
    if (/\/rest\/v1\/|\/graphql|\/api\//u.test(url)) result.businessRequests.push({ method: request.method(), url });
  });
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value: undefined });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: undefined });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:4000/quick-task/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('projed-quick-task-v1');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    });
    await page.reload({ waitUntil: 'networkidle' });
    result.buildId = await page.locator('meta[name="projed-shell-version"]').getAttribute('content').catch(() => 'local-test');
    await page.getByRole('textbox', { name: '任務名稱' }).waitFor({ state: 'visible' });
    const title = page.getByRole('textbox', { name: '任務名稱' });
    const voice = page.getByRole('button', { name: '使用語音輸入任務名稱' });
    const submit = page.getByRole('button', { name: '建立' });
    record('SM01', await title.isVisible() && await title.isEnabled() && await voice.isVisible() && await submit.isEnabled(), { title: await title.isEnabled(), voice: await voice.isEnabled(), submit: await submit.isEnabled() });
    await title.fill('DEV122 現場快速記錄');
    await submit.click();
    await page.getByText('已記下，待同步').waitFor({ state: 'visible' });
    record('SM02', await page.getByText('DEV122 現場快速記錄').isVisible() && await page.getByRole('button', { name: '前往工作台' }).isVisible());
    const localRecord = await page.evaluate(() => new Promise(resolve => {
      const open = indexedDB.open('projed-quick-task-v1');
      open.onsuccess = () => { const request = open.result.transaction('captures').objectStore('captures').getAll(); request.onsuccess = () => resolve(request.result); };
      open.onerror = () => resolve([]);
    }));
    record('SM03', Array.isArray(localRecord) && localRecord.length === 1 && localRecord[0].title === 'DEV122 現場快速記錄', { localRecord });
    await page.getByRole('button', { name: '再記一筆' }).click();
    record('SM04', await title.evaluate(element => element.matches(':focus')) && await page.getByText('可以直接輸入名稱，或點右側「語音」。').isVisible(), { focused: await title.evaluate(element => element.matches(':focus')), helperVisible: await page.getByText('可以直接輸入名稱，或點右側「語音」。').isVisible() });

    await voice.click();
    const firstFallback = await title.evaluate(element => element.matches(':focus')) && await page.getByText('請點名稱欄，再點鍵盤麥克風。').isVisible();
    await page.evaluate(() => {
      class DeniedRecognition {
        onresult = null;
        onend = null;
        onerror = null;
        start() { setTimeout(() => { this.onerror?.(Object.assign(new Event('error'), { error: 'not-allowed' })); this.onend?.(); }, 0); }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = DeniedRecognition;
    });
    await voice.click();
    await page.waitForTimeout(50);
    await page.getByText('請點名稱欄，再點鍵盤麥克風。').waitFor({ state: 'visible' });
    await title.fill('再試');
    await page.evaluate(() => {
      class RetryRecognition {
        onresult = null;
        onend = null;
        onerror = null;
        start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '語音重試' } }] }); this.onend?.(); }, 0); }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = RetryRecognition;
    });
    await voice.click();
    await page.waitForFunction(() => document.querySelector('#quick-task-title')?.value === '再試語音重試', null, { timeout: 1000 });
    record('SM05', firstFallback && await title.inputValue() === '再試語音重試', {
      focused: await title.evaluate(element => element.matches(':focus')),
      fallbackVisible: await page.getByText('請點名稱欄，再點鍵盤麥克風。').isVisible(),
      retryValue: await title.inputValue(),
    });

    await page.evaluate(() => {
      const input = document.querySelector('#quick-task-title');
      const quickForm = document.querySelector('#quick-task-form');
      if (!(input instanceof HTMLInputElement) || !(quickForm instanceof HTMLFormElement)) throw new Error('B06 fixture missing');
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = '組字中的名稱';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      quickForm.requestSubmit();
    });
    await page.waitForTimeout(50);
    const compositionRecords = await page.evaluate(() => new Promise(resolve => {
      const open = indexedDB.open('projed-quick-task-v1');
      open.onsuccess = () => { const request = open.result.transaction('captures').objectStore('captures').getAll(); request.onsuccess = () => resolve(request.result); };
      open.onerror = () => resolve([]);
    }));
    record('SM06', Array.isArray(compositionRecords) && compositionRecords.length === 1 && await page.getByRole('textbox', { name: '任務名稱' }).isVisible(), { recordCount: Array.isArray(compositionRecords) ? compositionRecords.length : -1 });
    await page.evaluate(() => document.querySelector('#quick-task-title')?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));

    await title.fill('甲乙');
    await title.evaluate(element => element.setSelectionRange(1, 1));
    await page.evaluate(() => {
      class FakeRecognition {
        onresult = null;
        onend = null;
        onerror = null;
        continuous = false;
        interimResults = true;
        lang = 'zh-TW';
        start() {
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '語音' } }] }), 0);
          setTimeout(() => this.onend?.(), 10);
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = FakeRecognition;
    });
    await voice.click();
    await page.waitForFunction(() => document.querySelector('#quick-task-title')?.getAttribute('value') === '甲語音乙' || (document.querySelector('#quick-task-title') instanceof HTMLInputElement && (document.querySelector('#quick-task-title')).value === '甲語音乙'), null, { timeout: 1000 });
    record('SM07', await title.inputValue() === '甲語音乙' && await voice.getAttribute('data-listening') === 'false', { value: await title.inputValue() });

    const voiceBox = await voice.boundingBox();
    record('SM08', Boolean(voiceBox && voiceBox.width >= 48 && voiceBox.height >= 48 && await title.isVisible()), { voiceBox });
    record('SM09', result.browserErrors.length === 0 && result.httpFailures.length === 0 && result.businessRequests.length === 0, { browserErrors: result.browserErrors, httpFailures: result.httpFailures, businessRequests: result.businessRequests });

    const delayedPage = await page.context().newPage();
    try {
      await delayedPage.setViewportSize({ width: 390, height: 844 });
      let releaseMain;
      const mainHeld = new Promise(resolve => { releaseMain = resolve; });
      await delayedPage.route('**/src/quickTask/main.ts*', async route => {
        await mainHeld;
        await route.continue();
      });
      const delayedNavigation = delayedPage.goto('http://localhost:4000/quick-task/', { waitUntil: 'domcontentloaded' });
      const delayedTitle = delayedPage.getByRole('textbox', { name: '任務名稱' });
      await delayedTitle.waitFor({ state: 'visible' });
      await delayedTitle.fill('延遲載入仍保留');
      await delayedTitle.press('Enter', { noWaitAfter: true });
      await delayedPage.waitForTimeout(100);
      record('SM10', await delayedPage.url() === 'http://localhost:4000/quick-task/'
        && await delayedTitle.inputValue() === '延遲載入仍保留'
        && await delayedPage.getByRole('button', { name: '建立' }).isDisabled(), { url: await delayedPage.url(), title: await delayedTitle.inputValue() });
      releaseMain();
      await delayedNavigation;
    } finally {
      await delayedPage.close();
    }

    const outboxEvidence = await page.evaluate(async () => {
      const outbox = await import('/src/features/quickTaskCapture/outbox.ts');
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase('projed-quick-task-v1');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
      const captureId = 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000b1';
      const record = {
        schemaVersion: 1, captureId, accountId: 'acct-a', title: 'lease test', workspaceHint: null,
        clientCreatedAt: Date.now(), updatedAt: Date.now(), state: 'pending', attemptCount: 0,
        nextAttemptAt: null, lastErrorCode: null, leaseId: null, leaseExpiresAt: null, claimIntent: null,
      };
      await outbox.commitQuickCapture(record);
      const leases = await Promise.all([
        outbox.acquireQuickCaptureLease(captureId, 'acct-a'),
        outbox.acquireQuickCaptureLease(captureId, 'acct-a'),
      ]);
      const winner = leases.find(Boolean);
      const winnerCount = leases.filter(Boolean).length;
      if (!winner) return { winnerCount, staleState: null, retryState: null, bound: false };
      await outbox.finishQuickCaptureLease(captureId, winner.leaseId, 'failed_retryable', 'NETWORK');
      const retryState = await outbox.getQuickCapture(captureId);
      await outbox.retryQuickCapture(captureId, 'acct-a');
      const second = await outbox.acquireQuickCaptureLease(captureId, 'acct-a');
      await outbox.finishQuickCaptureLease(captureId, 'wrong-lease', 'synced');
      const stale = await outbox.getQuickCapture(captureId);
      if (second) await outbox.finishQuickCaptureLease(captureId, second.leaseId, 'synced');

      const unboundId = 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000b2';
      await outbox.commitQuickCapture({ ...record, captureId: unboundId, accountId: null, title: 'claim test', state: 'awaiting_auth' });
      await outbox.putClaimIntent(unboundId, 'nonce-hash', Date.now() + 60_000);
      const recoverableForAccount = await outbox.listQuickCaptures('acct-a', true);
      const unboundVisible = recoverableForAccount.some(item => item.captureId === unboundId && item.accountId === null);
      const bound = await outbox.bindQuickCaptureClaim(unboundId, 'acct-a', 'nonce-hash');

      const exhaustedId = 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000b3';
      await outbox.commitQuickCapture({ ...record, captureId: exhaustedId, title: 'exhaustion test' });
      for (let index = 0; index < 8; index += 1) {
        await outbox.updateQuickCapture(exhaustedId, { state: 'pending', nextAttemptAt: null, leaseId: null, leaseExpiresAt: null });
        const attempt = await outbox.acquireQuickCaptureLease(exhaustedId, 'acct-a');
        if (!attempt) return { winnerCount, retryState: null, retryHasBackoff: false, staleState: null, bound: false, exhaustedState: null, exhaustedBlocked: false, manualRetryReset: false };
        await outbox.finishQuickCaptureLease(exhaustedId, attempt.leaseId, 'failed_retryable', 'NETWORK');
      }
      const exhausted = await outbox.getQuickCapture(exhaustedId);
      const exhaustedBlocked = !(await outbox.acquireQuickCaptureLease(exhaustedId, 'acct-a'));
      const manuallyRetried = await outbox.retryQuickCapture(exhaustedId, 'acct-a');
      return {
        winnerCount,
        retryState: retryState?.state ?? null,
        retryHasBackoff: Boolean(retryState?.nextAttemptAt && retryState.nextAttemptAt > Date.now()),
        staleState: stale?.state ?? null,
        unboundVisible,
        bound: Boolean(bound && bound.accountId === 'acct-a' && bound.state === 'pending' && bound.claimIntent === null),
        exhaustedState: exhausted?.state ?? null,
        exhaustedBlocked,
        manualRetryReset: Boolean(manuallyRetried?.state === 'pending' && manuallyRetried.attemptCount === 0),
      };
    });
    record('SM11', outboxEvidence.winnerCount === 1 && outboxEvidence.retryState === 'failed_retryable' && outboxEvidence.retryHasBackoff && outboxEvidence.staleState === 'syncing', outboxEvidence);
    record('SM12', outboxEvidence.unboundVisible === true && outboxEvidence.bound === true, outboxEvidence);
    record('SM13', outboxEvidence.exhaustedState === 'failed_permanent' && outboxEvidence.exhaustedBlocked && outboxEvidence.manualRetryReset, outboxEvidence);
    const installPage = await page.context().newPage();
    try {
      await installPage.setViewportSize({ width: 390, height: 844 });
      await installPage.goto('http://localhost:4000/quick-task/?install=1', { waitUntil: 'domcontentloaded' });
      const installGuide = installPage.locator('[data-quick-install="true"]');
      await installGuide.waitFor({ state: 'visible' });
      const titleOnInstall = installPage.getByRole('textbox', { name: '任務名稱' });
      await installPage.evaluate(() => {
        let prompted = false;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.defineProperties(event, {
          prompt: { configurable: true, value: async () => { prompted = true; } },
          userChoice: { configurable: true, value: Promise.resolve({ outcome: 'accepted' }) },
        });
        Object.defineProperty(window, '__DEV122_PROMPTED', { configurable: true, get: () => prompted });
        window.dispatchEvent(event);
      });
      const installAction = installPage.getByRole('button', { name: '安裝快速建待辦' });
      await installAction.waitFor({ state: 'visible' });
      await installAction.click();
      await installPage.getByText('已送出安裝；完成後可從桌面圖示開啟。').waitFor({ state: 'visible' });
      await installPage.screenshot({ path: `${outputDir}/quick-task-install-390x844.png`, fullPage: true });
      result.screenshots.push(`${outputDir}/quick-task-install-390x844.png`);
      record('SM14', await installGuide.isVisible() && await titleOnInstall.isVisible() && await installPage.evaluate(() => Boolean(window.__DEV122_PROMPTED)), {
        guideVisible: await installGuide.isVisible(),
        titleVisible: await titleOnInstall.isVisible(),
        prompted: await installPage.evaluate(() => Boolean(window.__DEV122_PROMPTED)),
      });
      const iosInstallPage = await page.context().newPage();
      try {
        await iosInstallPage.addInitScript(() => {
          Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
          Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'iPhone' });
          Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
        });
        await iosInstallPage.setViewportSize({ width: 390, height: 844 });
        await iosInstallPage.goto('http://localhost:4000/quick-task/?install=1', { waitUntil: 'domcontentloaded' });
        const iosGuide = iosInstallPage.locator('[data-quick-install="true"]');
        await iosGuide.waitFor({ state: 'visible' });
        record('SM15', await iosGuide.getByText('加入手機主畫面').isVisible() && await iosInstallPage.getByRole('textbox', { name: '任務名稱' }).isVisible(), {
          guideText: await iosGuide.innerText(),
          titleVisible: await iosInstallPage.getByRole('textbox', { name: '任務名稱' }).isVisible(),
        });
        await iosInstallPage.screenshot({ path: `${outputDir}/quick-task-install-ios-guidance-390x844.png`, fullPage: true });
        result.screenshots.push(`${outputDir}/quick-task-install-ios-guidance-390x844.png`);
      } finally {
        await iosInstallPage.close();
      }
    } finally {
      await installPage.close();
    }
    await page.screenshot({ path: `${outputDir}/quick-task-390x844.png`, fullPage: true });
    result.screenshots.push(`${outputDir}/quick-task-390x844.png`);
    result.status = fail.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    fail.push('UNCAUGHT');
    console.error(`DEV122 browser verification result: ${JSON.stringify(result)}`);
  }
  result.failures = fail;
  await page.evaluate(({ result, outputDir }) => { window.__DEV122_ARTIFACT = result; window.__DEV122_ARTIFACT_PATH = outputDir; }, { result, outputDir });
  if (fail.length) throw new Error(`DEV-122 browser verification failed: ${fail.join(', ')} | ${JSON.stringify(result.cases)}${result.browserErrors.length ? ` | ${result.browserErrors.join(' | ')}` : ''}`);
}
