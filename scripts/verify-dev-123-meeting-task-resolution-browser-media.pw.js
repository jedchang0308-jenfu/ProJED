/* eslint-disable */
async (page) => {
  const outputDir = 'output/playwright/dev-123-meeting-task-resolution-media';
  const result = {
    devId: 'DEV-123',
    status: 'FAIL',
    cases: [],
    screenshots: [],
    browserErrors: [],
    httpFailures: [],
    runtime: { port: 4000, reused: true, cleaned: false, portReleased: false, routeMocked: true },
  };
  const failures = [];
  const operations = [];
  const decisionCalls = [];
  const captureId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let captureState = 'created';
  let sourceVersion = 1;
  let nextSegmentId = 0;
  let analysisReady = false;
  let candidateDecision = 'suggested';
  let reviewRevision = 0;
  const record = (id, ok, details = {}) => {
    result.cases.push({ id, ok, details });
    if (!ok) failures.push(id);
  };
  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  });
  const progress = () => ({
    captureId,
    state: captureState,
    sourceVersion,
    lastProgressAt: Date.now(),
    stoppedAt: captureState === 'queued' ? Date.now() : null,
    audioExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    reviewRevision: 0,
    pointerLoss: false,
    sourceCompleteness: 'complete',
  });

  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) result.browserErrors.push(message.text());
  });
  page.on('pageerror', error => result.browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 500 && !response.url().includes('favicon')) result.httpFailures.push({ status: response.status(), url: response.url() });
  });

  await page.addInitScript(() => {
    const state = { getUserMediaCalls: 0, tracksStopped: 0, recorderStarts: 0, recorderStops: 0, recorderStartFailures: 0, recorderStopFailures: 0 };
    window.__DEV123_MEDIA = state;
    const activeTracks = [];
    class FakeTrack extends EventTarget {
      constructor() {
        super();
        activeTracks.push(this);
      }
      stop() { state.tracksStopped += 1; }
      end() { this.dispatchEvent(new Event('ended')); }
    }
    class FakeStream {
      constructor() { this.track = new FakeTrack(); }
      getTracks() { return [this.track]; }
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => { state.getUserMediaCalls += 1; return new FakeStream(); } },
    });
    window.__DEV123_END_ACTIVE_TRACK = () => activeTracks.at(-1)?.end();
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; this.ondataavailable = null; this.onstop = null; }
      start() {
        if (window.__DEV123_FAIL_RECORDER_START) {
          state.recorderStartFailures += 1;
          throw new Error('fake recorder start failure');
        }
        this.state = 'recording';
        state.recorderStarts += 1;
        this.ondataavailable?.({ data: new Blob(['dev123-fake-audio'], { type: 'audio/webm' }) });
      }
      stop() {
        if (this.state !== 'recording') return;
        if (window.__DEV123_FAIL_RECORDER_STOP) {
          state.recorderStopFailures += 1;
          throw new Error('fake recorder stop failure');
        }
        this.state = 'inactive';
        state.recorderStops += 1;
        this.ondataavailable?.({ data: new Blob(['dev123-fake-audio-final'], { type: 'audio/webm' }) });
        setTimeout(() => this.onstop?.(), 0);
      }
    }
    window.MediaRecorder = FakeMediaRecorder;
  });

  await page.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/functions/v1/meeting_capture_control')) {
      if (request.method() === 'OPTIONS') return route.fulfill(json({}, 204));
      let body = {};
      try { body = request.postDataJSON() || {}; } catch { body = {}; }
      const operation = String(body.operation ?? '');
      operations.push({ operation, body });
      if (operation === 'begin') {
        captureState = 'recording';
        return route.fulfill(json({ captureId, state: captureState, sourceVersion, startedAt: new Date().toISOString() }));
      }
      if (operation === 'status') return route.fulfill(json(progress()));
      if (operation === 'review') {
        const segments = analysisReady ? [{
          segmentId: 'transcript-segment-1',
          audioSegmentId: `${captureId}:0`,
          transcriptRevisionId: 'transcript-revision-1',
          text: '確認登入修正',
          startOffsetMs: 0,
          endOffsetMs: 3000,
          wordOffsets: [],
          resolutionId: 'resolution-1',
          resolutionRevision: reviewRevision,
          decision: candidateDecision === 'accepted' ? 'accepted' : 'needs_review',
          humanReviewed: candidateDecision === 'accepted',
          humanEmptyDecision: false,
          candidates: [{
            taskId: 'task-a',
            title: '登入修正',
            path: '登入',
            semanticScore: 0.9,
            pointerFeature: 0.5,
            quoteRange: { fromWord: 0, toWord: 1 },
            source: 'lexical',
            snapshotHash: 'sha256:dev123',
            decision: candidateDecision,
          }, {
            taskId: 'task-pointer',
            title: '鼠標停留任務',
            path: '線索',
            semanticScore: 0,
            pointerFeature: 0.8,
            quoteRange: null,
            source: 'pointer',
            snapshotHash: 'sha256:dev123-pointer',
            decision: 'suggested',
          }],
        }] : [];
        return route.fulfill(json({ captureId, state: analysisReady ? 'ready' : captureState, reviewRevision, segments }));
      }
      if (operation === 'decide-match') {
        decisionCalls.push(body);
        const requestedActions = Array.isArray(body.operations) ? body.operations : [];
        if (requestedActions.some(action => ['accept', 'add', 'replace'].includes(String(action?.action)))) candidateDecision = 'accepted';
        if (requestedActions.some(action => String(action?.action) === 'reject' || String(action?.action) === 'clear-all')) candidateDecision = 'rejected';
        reviewRevision += 1;
        return route.fulfill(json({ resolutionId: 'resolution-1', resolutionRevision: reviewRevision, reviewRevision, state: 'ready' }));
      }
      if (operation === 'progress') return route.fulfill(json(progress()));
      if (operation === 'pause') { captureState = 'paused'; return route.fulfill(json(progress())); }
      if (operation === 'resume') { captureState = 'recording'; return route.fulfill(json(progress())); }
      if (operation === 'append-pointer') return route.fulfill(json({ ackSequence: Number(body.intervals?.at?.(-1)?.sequence ?? 0) }));
      if (operation === 'reserve-segment') {
        const segmentIndex = Number(body.segmentIndex ?? nextSegmentId++);
        return route.fulfill(json({
          segmentId: `${captureId}:${segmentIndex}`,
          sourceVersion,
          segmentIndex,
          path: `dev123/${captureId}/${segmentIndex}.webm`,
          token: `dev123-token-${segmentIndex}`,
          signedUrl: null,
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          uploadState: 'pending',
        }));
      }
      if (operation === 'verify-segment') {
        const segmentIndex = Number(body.segmentIndex ?? 0);
        return route.fulfill(json({ segment: {
          id: `${captureId}:${segmentIndex}`,
          segment_index: segmentIndex,
          source_version: sourceVersion,
          bytes: 32,
          sha256: 'd'.repeat(64),
          upload_state: 'verified',
          object_path: `dev123/${captureId}/${segmentIndex}.webm`,
        } }));
      }
      if (operation === 'stop') { captureState = 'stopped'; return route.fulfill(json(progress())); }
      if (operation === 'complete-upload') {
        captureState = 'queued';
        analysisReady = true;
        return route.fulfill(json({ state: captureState, runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sourceVersion, sourceComplete: true }));
      }
      if (operation === 'cancel') { captureState = 'cancelled'; return route.fulfill(json(progress())); }
      return route.fulfill(json({ error: `unhandled operation ${operation}` }, 400));
    }
    if (url.includes('/storage/v1/object/upload/sign/')) return route.fulfill(json({ Key: url.split('/storage/v1/object/upload/sign/')[1].split('?')[0] }));
    if (url.includes('/auth/v1/')) return route.fulfill(json({}));
    return route.continue();
  });

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
    const loginButton = page.getByRole('button', { name: /使用固定測試環境/ }).first();
    if (await loginButton.count() && await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
      await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 });
    }
    const openMeeting = page.getByRole('button', { name: '新增會議記錄', exact: true });
    await openMeeting.waitFor({ state: 'visible' });
    await openMeeting.click();
    const controls = page.locator('[data-meeting-recording-controls="true"]');
    await controls.waitFor({ state: 'visible' });
    const startButton = page.getByRole('button', { name: '開始收音', exact: true });
    const beforeStartCalls = await page.evaluate(() => window.__DEV123_MEDIA.getUserMediaCalls);
    record('B04-no-auto-mic', beforeStartCalls === 0, { getUserMediaCalls: beforeStartCalls });

    // A recorder start failure must stop the server capture and freeze a
    // missing source instead of leaving the UI/server in recording state.
    await page.evaluate(() => { window.__DEV123_FAIL_RECORDER_START = true; });
    await startButton.click();
    await page.waitForFunction(() => document.querySelector('[data-meeting-recording-controls="true"]')?.getAttribute('data-meeting-recording-state') === 'safe', null, { timeout: 10000 });
    await page.waitForTimeout(250);
    const failedStartOperations = operations.map(item => item.operation);
    const failedStartRecorderCount = await page.evaluate(() => window.__DEV123_MEDIA.recorderStartFailures);
    record('B04-recorder-start-failure', failedStartRecorderCount === 1 && failedStartOperations.includes('stop') && failedStartOperations.includes('complete-upload'), { failedStartOperations, failedStartRecorderCount, captureState });
    await page.evaluate(async () => {
      window.__DEV123_FAIL_RECORDER_START = false;
      Object.assign(window.__DEV123_MEDIA, { getUserMediaCalls: 0, tracksStopped: 0, recorderStarts: 0, recorderStops: 0, recorderStartFailures: 0, recorderStopFailures: 0 });
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase('projed-dev123-meeting-audio');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    });
    operations.length = 0;
    decisionCalls.length = 0;
    captureState = 'created';
    sourceVersion = 1;
    nextSegmentId = 0;
    analysisReady = false;
    candidateDecision = 'suggested';
    reviewRevision = 0;

    // A live audio track ending must converge to the same server-visible
    // missing-source recovery as a recorder-start failure.
    await startButton.click();
    await page.locator('[data-meeting-recording-controls="true"][data-meeting-recording-state="recording"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.evaluate(() => window.__DEV123_END_ACTIVE_TRACK());
    await page.waitForFunction(() => document.querySelector('[data-meeting-recording-controls="true"]')?.getAttribute('data-meeting-recording-state') === 'safe', null, { timeout: 10000 });
    await page.waitForTimeout(300);
    const deviceLossOperations = operations.map(item => item.operation);
    record('B04-device-loss', deviceLossOperations.includes('stop') && deviceLossOperations.includes('complete-upload') && captureState === 'queued', { deviceLossOperations, captureState });
    await page.evaluate(async () => {
      Object.assign(window.__DEV123_MEDIA, { getUserMediaCalls: 0, tracksStopped: 0, recorderStarts: 0, recorderStops: 0, recorderStartFailures: 0 });
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase('projed-dev123-meeting-audio');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    });
    operations.length = 0;
    decisionCalls.length = 0;
    captureState = 'created';
    sourceVersion = 1;
    nextSegmentId = 0;
    analysisReady = false;
    candidateDecision = 'suggested';
    reviewRevision = 0;

    // A synchronous MediaRecorder.stop failure must still freeze the server
    // capture as missing instead of leaving it in recording state.
    await page.evaluate(() => { window.__DEV123_FAIL_RECORDER_STOP = true; });
    await startButton.click();
    await page.locator('[data-meeting-recording-controls="true"][data-meeting-recording-state="recording"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-meeting-recording-controls="true"]')?.getAttribute('data-meeting-recording-state') === 'safe', null, { timeout: 10000 });
    await page.waitForTimeout(300);
    const stopFailureOperations = operations.map(item => item.operation);
    const stopFailureCount = await page.evaluate(() => window.__DEV123_MEDIA.recorderStopFailures);
    record('B04-recorder-stop-failure', stopFailureCount === 1 && stopFailureOperations.includes('stop') && stopFailureOperations.includes('complete-upload') && captureState === 'queued', { stopFailureOperations, stopFailureCount, captureState });
    await page.evaluate(async () => {
      window.__DEV123_FAIL_RECORDER_STOP = false;
      Object.assign(window.__DEV123_MEDIA, { getUserMediaCalls: 0, tracksStopped: 0, recorderStarts: 0, recorderStops: 0, recorderStartFailures: 0, recorderStopFailures: 0 });
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase('projed-dev123-meeting-audio');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    });
    operations.length = 0;
    decisionCalls.length = 0;
    captureState = 'created';
    sourceVersion = 1;
    nextSegmentId = 0;
    analysisReady = false;
    candidateDecision = 'suggested';
    reviewRevision = 0;

    await startButton.click();
    await page.locator('[data-meeting-recording-controls="true"][data-meeting-recording-state="recording"]').waitFor({ state: 'visible', timeout: 10000 });
    const beginCount = operations.filter(item => item.operation === 'begin').length;
    const startCalls = await page.evaluate(() => window.__DEV123_MEDIA.getUserMediaCalls);
    record('B05-start-lifecycle', beginCount === 1 && startCalls === 1, { beginCount, getUserMediaCalls: startCalls, state: await controls.getAttribute('data-meeting-recording-state') });

    await page.getByRole('button', { name: '暫停收音', exact: true }).click();
    await page.locator('[data-meeting-recording-controls="true"][data-meeting-recording-state="paused"]').waitFor({ state: 'visible', timeout: 10000 });
    const pauseCount = operations.filter(item => item.operation === 'pause').length;
    record('B06-pause-freezes', pauseCount === 1, { pauseCount, state: await controls.getAttribute('data-meeting-recording-state') });

    await page.getByRole('button', { name: '繼續收音', exact: true }).click();
    await page.locator('[data-meeting-recording-controls="true"][data-meeting-recording-state="recording"]').waitFor({ state: 'visible', timeout: 10000 });
    const resumeOperation = operations.find(item => item.operation === 'resume');
    const resumeCalls = await page.evaluate(() => window.__DEV123_MEDIA.getUserMediaCalls);
    const resumeEpochManifest = Array.isArray(resumeOperation?.body?.epochManifest) ? resumeOperation.body.epochManifest : [];
    const resumeEpoch = resumeEpochManifest.at(-1)?.epoch ?? null;
    record('B07-resume-new-epoch', Boolean(resumeEpoch >= 1) && resumeEpochManifest.length >= 2 && resumeCalls === 2, { resumeCalls, resumeEpoch, epochManifestLength: resumeEpochManifest.length });

    await page.getByRole('button', { name: '暫停收音', exact: true }).click();
    await page.locator('[data-meeting-recording-controls="true"][data-meeting-recording-state="paused"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await controls.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-meeting-recording-controls="true"]')?.getAttribute('data-meeting-recording-state') === 'safe', null, { timeout: 15000 });
    const stopCount = operations.filter(item => item.operation === 'stop').length;
    const completeCount = operations.filter(item => item.operation === 'complete-upload').length;
    const outboxCount = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('projed-dev123-meeting-audio', 1);
      request.onerror = () => resolve(-1);
      request.onsuccess = () => {
        const db = request.result;
        const count = db.transaction('segments', 'readonly').objectStore('segments').count();
        count.onsuccess = () => { resolve(count.result); db.close(); };
        count.onerror = () => { resolve(-1); db.close(); };
      };
    }));
    const mediaState = await page.evaluate(() => ({ ...window.__DEV123_MEDIA }));
    record('B08-stop-finalize-once', stopCount === 1 && completeCount === 1 && captureState === 'queued' && outboxCount === 0, { stopCount, completeCount, captureState, outboxCount, mediaState });
    record('B09-no-duplicate-run', beginCount === 1 && operations.filter(item => item.operation === 'complete-upload').length === 1, { beginCount, completeCount });
    const refreshReview = page.getByRole('button', { name: '重新整理辨識任務', exact: true });
    await refreshReview.click();
    await page.locator('[data-meeting-review-segment="transcript-segment-1"]').waitFor({ state: 'visible', timeout: 10000 });
    const candidate = page.locator('[data-meeting-review-candidate="task-a"]');
    const evidenceVisible = await candidate.locator('[data-meeting-review-evidence="quote"]').isVisible();
    const pointerCandidate = page.locator('[data-meeting-review-candidate="task-pointer"]');
    const pointerAccept = pointerCandidate.getByRole('button', { name: '採用任務 鼠標停留任務', exact: true });
    const pointerAcceptDisabled = await pointerAccept.isDisabled();
    const pointerEvidenceVisible = await pointerCandidate.getByText('鼠標線索，仍需原句確認', { exact: true }).isVisible();
    record('B10-review-task-candidate', await candidate.isVisible() && await page.getByText('確認登入修正', { exact: true }).isVisible() && evidenceVisible && pointerAcceptDisabled && pointerEvidenceVisible, { candidateVisible: await candidate.isVisible(), evidenceVisible, pointerAcceptDisabled, pointerEvidenceVisible, reviewRevision });
    await page.getByRole('button', { name: '採用任務 登入修正', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-meeting-review-candidate="task-a"]')?.textContent?.includes('已採用'), null, { timeout: 10000 });
    const decisionDeadline = Date.now() + 10000;
    while (decisionCalls.length === 0 && Date.now() < decisionDeadline) await page.waitForTimeout(25);
    const acceptedCall = decisionCalls.find(call => Array.isArray(call.operations) && call.operations.some(action => action.action === 'accept' && action.taskId === 'task-a'));
    await page.waitForFunction(() => document.querySelector('[data-record-summary-kind="meeting"]')?.getAttribute('data-record-summary-task-count') === '1', null, { timeout: 10000 });
    const draftTaskCount = await page.locator('[data-record-summary-kind="meeting"]').getAttribute('data-record-summary-task-count');
    record('B11-human-accept-link', Boolean(acceptedCall) && reviewRevision === 1 && draftTaskCount === '1', { decisionCalls, reviewRevision, draftTaskCount });
    await page.screenshot({ path: `${outputDir}/meeting-recording-media-candidate.png`, fullPage: false });
    result.screenshots.push(`${outputDir}/meeting-recording-media-candidate.png`);
    result.status = failures.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.browserErrors.push(error instanceof Error ? error.message : String(error));
    failures.push('UNCAUGHT');
  }
  result.operations = operations.map(item => item.operation);
  result.decisionCalls = decisionCalls;
  result.failures = failures;
  await page.evaluate(({ result, outputDir }) => { window.__DEV123_MEDIA_ARTIFACT = result; window.__DEV123_MEDIA_ARTIFACT_PATH = outputDir; }, { result, outputDir });
  if (failures.length) throw new Error(`DEV-123 browser/media verification failed: ${failures.join(', ')} | ${JSON.stringify(result.cases)}${result.browserErrors.length ? ` | ${result.browserErrors.join(' | ')}` : ''}`);
}
