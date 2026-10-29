import React from 'react';
import { Loader2, Mic, Pause, Play, Square } from 'lucide-react';
import {
  MEETING_AUDIO_SEGMENT_MS, createCaptureEpoch,
  type MeetingAudioSegmentManifest, type MeetingPointerInterval,
} from '../../features/meetingTaskResolution/meetingAnalysisContract';
import { attachMeetingPointerObserver, type MeetingPointerObserver } from '../../features/meetingTaskResolution/meetingPointerEvidence';
import { createScopedMeetingRecordingService } from '../../features/meetingTaskResolution/meetingAnalysisService';
import { MeetingRecordingScopeFence, meetingRecordingScopeKey, type MeetingRecordingScope } from '../../features/meetingTaskResolution/meetingRecordingScope';
import {
  deleteMeetingAudioSegment, deleteMeetingPointerBatch, listMeetingAudioSegments,
  listMeetingPointerBatches, putMeetingAudioSegment, putMeetingPointerBatch,
  type MeetingAudioOutboxScope,
} from '../../features/meetingTaskResolution/meetingAudioOutbox';

type Props = {
  tenantId: string | null;
  projectId: string | null;
  scope: MeetingRecordingScope;
  readCurrentScope: () => MeetingRecordingScope;
  initialCaptureId?: string | null;
  onEnsureSaved: () => Promise<string | null>;
  onCaptureStarted?: (captureId: string) => void;
};
type Operation = {
  fence: MeetingRecordingScopeFence;
  service: ReturnType<typeof createScopedMeetingRecordingService>;
};
type CaptureRun = Operation & {
  outbox: MeetingAudioOutboxScope;
  startedAt: number;
  pausedAt: number | null;
  pausedDuration: number;
  epoch: number;
  gapBefore: number;
  recording: boolean;
  stream: MediaStream | null;
  recorder: { stop: () => Promise<void> } | null;
  timer: number | null;
  pointer: MeetingPointerObserver | null;
  segmentIndex: number;
  manifests: MeetingAudioSegmentManifest[];
  segmentUploads: Promise<void>[];
  pointerUploads: Promise<void>[];
  pointerIntervals: MeetingPointerInterval[];
  pointerLoss: boolean;
  epochs: Array<ReturnType<typeof createCaptureEpoch>>;
};
type Recovery = { scope: MeetingAudioOutboxScope; state: string; pendingCount: number };

const hashText = async (value: unknown) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const currentOffset = (run: CaptureRun) => Math.max(0, Math.floor(
  (run.pausedAt ?? performance.now()) - run.startedAt - run.pausedDuration,
));
const snapshotEpochManifest = (run: CaptureRun) => run.epochs.map((entry, index) => index === run.epochs.length - 1
  ? { ...entry, durationMs: Math.max(0, currentOffset(run) - entry.captureOffsetMs) } : entry);
const sourceGaps = (run: CaptureRun) => snapshotEpochManifest(run)
  .filter(entry => entry.gapBeforeMs > 0 && entry.captureOffsetMs > 0)
  .map(entry => ({ startOffsetMs: Math.max(0, entry.captureOffsetMs - entry.gapBeforeMs), endOffsetMs: entry.captureOffsetMs, reason: 'pause' }));
const makeOutboxScope = (scope: MeetingRecordingScope, captureId: string, sourceVersion: number): MeetingAudioOutboxScope => {
  if (!scope.accountId || !scope.tenantId || !scope.projectId || !scope.recordId) throw new Error('請先登入並儲存會議草稿。');
  return { accountId: scope.accountId, tenantId: scope.tenantId, projectId: scope.projectId, recordId: scope.recordId, captureId, sourceVersion };
};

const MeetingRecordingControls: React.FC<Props> = ({ tenantId, projectId, scope, readCurrentScope, initialCaptureId = null, onEnsureSaved, onCaptureStarted }) => {
  const [isRecording, setIsRecording] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isWorking, setIsWorking] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [recovery, setRecovery] = React.useState<Recovery | null>(null);
  const [recoveryBusy, setRecoveryBusy] = React.useState(false);
  const mountedRef = React.useRef(true);
  const operationRef = React.useRef<Operation | null>(null);
  const runRef = React.useRef<CaptureRun | null>(null);
  const readScopeRef = React.useRef(readCurrentScope);
  readScopeRef.current = readCurrentScope;
  const scopeKey = meetingRecordingScopeKey(scope);
  const active = (operation: Operation) => mountedRef.current && operationRef.current === operation && operation.fence.isCurrent();
  const makeOperation = (): Operation => {
    operationRef.current?.fence.invalidate();
    const fence = new MeetingRecordingScopeFence({ ...scope }, () => readScopeRef.current());
    const operation: Operation = { fence, service: createScopedMeetingRecordingService(() => active(operation), fence.signal) };
    operationRef.current = operation;
    return operation;
  };
  const stopRecorderSafely = (run: CaptureRun) => {
    // A late onstop may still seal bytes into the original owner's outbox.
    // Observe rejection now; finalizeCurrentRecorder retains the original promise.
    void run.recorder?.stop().catch(() => undefined);
  };
  const releaseDevices = (run: CaptureRun) => {
    run.recording = false;
    run.pausedAt ??= performance.now();
    if (run.timer != null) window.clearTimeout(run.timer);
    run.timer = null;
    run.pointer?.dispose();
    run.pointer = null;
    stopRecorderSafely(run);
    run.stream?.getTracks().forEach(track => track.stop());
    run.stream = null;
  };
  React.useLayoutEffect(() => {
    const operation = operationRef.current;
    if (operation && !active(operation)) {
      operation.fence.invalidate();
      const run = runRef.current;
      if (run) releaseDevices(run);
      runRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      setIsWorking(false);
      setRecoveryBusy(false);
      setRecovery(null);
      setMessage(null);
    }
  }, [scopeKey]);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current?.fence.invalidate();
      if (runRef.current) releaseDevices(runRef.current);
    };
  }, []);

  const settleCaptureAfterError = async (run: CaptureRun, finalizeMissing = false) => {
    if (!active(run)) return;
    releaseDevices(run);
    setIsRecording(false);
    setIsPaused(false);
    try {
      let status = await run.service.status(run.outbox.captureId);
      run.fence.assertCurrent();
      if (status.sourceVersion !== run.outbox.sourceVersion) throw new Error('會議來源版本已變更；本機音訊未續傳。');
      if (finalizeMissing && ['recording', 'paused'].includes(status.state)) {
        await run.service.stop(run.outbox.captureId, {
          expectedSourceVersion: run.outbox.sourceVersion, stoppedAt: Date.now(), pointerLoss: true,
          epochManifest: snapshotEpochManifest(run),
          finalPointerSequence: run.pointerIntervals.length ? Math.max(...run.pointerIntervals.map(item => item.sequence)) : null,
          gaps: sourceGaps(run),
        });
        await run.service.completeUpload(run.outbox.captureId, {
          expectedSourceVersion: run.outbox.sourceVersion, audioManifestHash: await hashText([]),
          pointerManifestHash: await hashText({ recorderStartFailed: true }), sourceCompleteness: 'missing', audioManifest: [],
        });
        status = await run.service.status(run.outbox.captureId);
      }
      const pending = await listMeetingAudioSegments(run.outbox);
      if (!active(run)) return;
      setRecovery(pending.length || ['recording', 'paused', 'stopped', 'uploading'].includes(status.state)
        ? { scope: run.outbox, state: status.state, pendingCount: pending.length } : null);
    } catch {
      if (active(run)) setRecovery({ scope: run.outbox, state: 'unknown', pendingCount: 0 });
    }
  };

  React.useEffect(() => {
    if (!initialCaptureId || isRecording || isPaused || isWorking || recoveryBusy) return undefined;
    const operation = makeOperation();
    void (async () => {
      try {
        const status = await operation.service.status(initialCaptureId);
        operation.fence.assertCurrent();
        const outbox = makeOutboxScope(scope, initialCaptureId, status.sourceVersion);
        const pending = await listMeetingAudioSegments(outbox);
        if (!active(operation)) return;
        setRecovery(pending.length || ['recording', 'paused', 'stopped', 'uploading'].includes(status.state)
          ? { scope: outbox, state: status.state, pendingCount: pending.length } : null);
      } catch { if (active(operation)) setRecovery(null); }
    })();
    return () => operation.fence.invalidate();
  }, [initialCaptureId, scopeKey, isPaused, isRecording, isWorking, recoveryBusy]);

  React.useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => {
      const run = runRef.current;
      if (run && active(run)) setElapsedMs(currentOffset(run));
    }, 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);
  React.useEffect(() => {
    if (!isRecording && !isWorking) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isRecording, isWorking]);

  const persistSegment = async (run: CaptureRun, blob: Blob, manifest: MeetingAudioSegmentManifest) => {
    if (!blob.size) return;
    // Sealing survives scope invalidation; only network and acknowledgements are fenced.
    await putMeetingAudioSegment(run.outbox, manifest, blob);
    if (!active(run)) return;
    try {
      const uploaded = await run.service.uploadSegment(run.outbox.captureId, manifest.segmentIndex, blob, {
        epoch: manifest.epoch, startOffsetMs: manifest.startOffsetMs, endOffsetMs: manifest.endOffsetMs,
        expectedSourceVersion: run.outbox.sourceVersion, overlapMs: manifest.overlapMs, gapBeforeMs: manifest.gapBeforeMs,
      });
      if (!active(run)) return;
      manifest.objectPath = uploaded.path;
      manifest.sha256 = uploaded.sha256;
      manifest.bytes = uploaded.bytes;
      manifest.uploadState = 'verified';
      run.manifests.push(manifest);
      await deleteMeetingAudioSegment(run.outbox, manifest.segmentId);
      await run.service.progress(run.outbox.captureId, { expectedSourceVersion: run.outbox.sourceVersion, epochManifest: snapshotEpochManifest(run), lastProgressAt: Date.now() });
    } catch (error) {
      if (active(run) && !run.manifests.includes(manifest)) run.manifests.push(manifest);
      throw error;
    }
  };
  const queuePointerBatch = (run: CaptureRun, intervals: MeetingPointerInterval[]) => {
    if (!intervals.length) return;
    run.pointerIntervals.push(...intervals);
    const batchKey = `${run.outbox.captureId}:pointer:${intervals[0].sequence}`;
    const promise = (async () => {
      const digest = await hashText(intervals);
      await putMeetingPointerBatch(run.outbox, batchKey, digest, intervals);
      if (!active(run)) return;
      await run.service.appendPointer(run.outbox.captureId, { expectedSourceVersion: run.outbox.sourceVersion, batchKey, digest, intervals });
      if (!active(run)) return;
      await deleteMeetingPointerBatch(run.outbox, batchKey);
    })().catch(error => { run.pointerLoss = true; throw error; });
    void promise.catch(() => undefined);
    run.pointerUploads.push(promise);
  };
  const attachPointer = (run: CaptureRun) => attachMeetingPointerObserver({
    captureId: run.outbox.captureId, initialSequence: run.pointerIntervals.length ? Math.max(...run.pointerIntervals.map(item => item.sequence)) + 1 : 0,
    getCaptureOffsetMs: () => currentOffset(run), getClockEpoch: () => run.epoch,
    isRecording: () => active(run) && run.recording, onFlush: intervals => queuePointerBatch(run, intervals),
  });
  const bindTrackLossHandler = (stream: MediaStream, run: CaptureRun) => {
    const ended = () => {
      if (!active(run) || !run.recording || run.stream !== stream) return;
      setMessage('麥克風裝置中斷；已停止收音並標記來源不完整。');
      void settleCaptureAfterError(run, true);
    };
    stream.getTracks().forEach(track => track.addEventListener?.('ended', ended, { once: true }));
  };

  const startRecorder = (run: CaptureRun): boolean => {
    const stream = run.stream;
    if (!stream || !active(run) || !run.recording) return false;
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream); }
    catch (error) {
      setMessage(error instanceof Error ? error.message : '無法建立錄音器。');
      void settleCaptureAfterError(run, true);
      return false;
    }
    const chunks: BlobPart[] = [];
    const startOffsetMs = currentOffset(run);
    const index = run.segmentIndex++;
    const epoch = run.epoch;
    const gapBeforeMs = run.gapBefore;
    run.gapBefore = 0;
    let endOffsetMs: number | null = null;
    let sealed = false;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    // Attach a rejection handler immediately, retaining the rejection for finalization.
    void done.catch(() => undefined);
    run.segmentUploads.push(done);
    const recording = {
      stop: () => {
        if (endOffsetMs == null) endOffsetMs = currentOffset(run);
        if (recorder.state !== 'inactive') {
          try { recorder.stop(); } catch (error) { reject(error); }
        }
        return done;
      },
    };
    run.recorder = recording;
    recorder.ondataavailable = event => { if (!sealed && event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (sealed) return;
      sealed = true;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const manifest: MeetingAudioSegmentManifest = {
        segmentId: `${run.outbox.captureId}:${index}`, segmentIndex: index, epoch,
        startOffsetMs, endOffsetMs: Math.max(startOffsetMs + 1, endOffsetMs ?? currentOffset(run)),
        overlapMs: 0, gapBeforeMs, mime: blob.type || 'audio/webm', bytes: blob.size, uploadState: 'pending',
      };
      void persistSegment(run, blob, manifest).then(resolve, reject);
    };
    try { recorder.start(1000); }
    catch (error) {
      reject(error);
      run.recorder = null;
      setMessage(error instanceof Error ? error.message : '無法開始收音。');
      void settleCaptureAfterError(run, true);
      return false;
    }
    if (run.timer != null) window.clearTimeout(run.timer);
    run.timer = window.setTimeout(() => {
      if (!active(run) || !run.recording || run.recorder !== recording) return;
      void recording.stop().catch(error => {
        if (active(run)) setMessage(error instanceof Error ? error.message : '錄音分段停止失敗。');
      });
      run.recorder = null;
      run.timer = window.setTimeout(() => { if (active(run)) startRecorder(run); }, 0);
    }, MEETING_AUDIO_SEGMENT_MS);
    return true;
  };
  const finalizeCurrentRecorder = async (run: CaptureRun) => {
    if (run.timer != null) window.clearTimeout(run.timer);
    await run.recorder?.stop();
    run.recorder = null;
    await Promise.all(run.segmentUploads);
    run.fence.assertCurrent();
  };

  const recoverFinalizedSegments = async () => {
    if (!recovery || recoveryBusy) return;
    const saved = recovery;
    const operation = makeOperation();
    setRecoveryBusy(true);
    setMessage(null);
    try {
      const status = await operation.service.status(saved.scope.captureId);
      if (status.sourceVersion !== saved.scope.sourceVersion) throw new Error('會議來源版本已變更；舊版音訊保留於本機，不會改用新版續傳。');
      operation.fence.assertCurrent();
      const pointers = await listMeetingPointerBatches(saved.scope);
      for (const pointer of pointers) {
        await operation.service.appendPointer(saved.scope.captureId, { expectedSourceVersion: saved.scope.sourceVersion, batchKey: pointer.batchKey, digest: pointer.digest, intervals: pointer.intervals });
        operation.fence.assertCurrent();
        await deleteMeetingPointerBatch(saved.scope, pointer.batchKey);
      }
      const rows = await listMeetingAudioSegments(saved.scope);
      const manifests: MeetingAudioSegmentManifest[] = [];
      for (const row of rows) {
        const manifest = { ...row.manifest };
        const uploaded = await operation.service.uploadSegment(saved.scope.captureId, manifest.segmentIndex, row.blob, {
          epoch: manifest.epoch, startOffsetMs: manifest.startOffsetMs, endOffsetMs: manifest.endOffsetMs,
          expectedSourceVersion: saved.scope.sourceVersion, overlapMs: manifest.overlapMs, gapBeforeMs: manifest.gapBeforeMs,
        });
        operation.fence.assertCurrent();
        Object.assign(manifest, { objectPath: uploaded.path, sha256: uploaded.sha256, bytes: uploaded.bytes, uploadState: 'verified' });
        manifests.push(manifest);
        await deleteMeetingAudioSegment(saved.scope, manifest.segmentId);
      }
      if (['stopped', 'uploading'].includes(status.state) && manifests.length) {
        await operation.service.completeUpload(saved.scope.captureId, {
          expectedSourceVersion: saved.scope.sourceVersion, audioManifestHash: await hashText(manifests),
          pointerManifestHash: await hashText({ recoveredAfterReload: true, pointerLoss: status.pointerLoss }),
          sourceCompleteness: 'partial', audioManifest: manifests,
        });
      }
      if (!active(operation)) return;
      setRecovery(null);
      setMessage(manifests.length ? '已續傳本機已封存音訊；來源仍標記為不完整，需重新確認後才能分析。' : '目前沒有可續傳的本機音訊。');
    } catch (error) { if (active(operation)) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (active(operation)) setRecoveryBusy(false); }
  };
  const start = async () => {
    if (!tenantId || !projectId || isWorking || isRecording || isPaused) return;
    const operation = makeOperation();
    setIsWorking(true);
    setMessage(null);
    let stream: MediaStream | null = null;
    try {
      operation.fence.assertCurrent();
      const recordId = await onEnsureSaved();
      operation.fence.assertCurrent();
      if (!recordId || recordId !== scope.recordId) throw new Error('請先儲存會議草稿，再開始收音。');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      operation.fence.assertCurrent();
      const begin = await operation.service.begin({ tenantId, projectId, recordId, idempotencyKey: `${recordId}:${crypto.randomUUID()}` });
      operation.fence.publishCapture(begin.captureId, () => onCaptureStarted?.(begin.captureId));
      const now = performance.now();
      const run: CaptureRun = Object.assign(operation, {
        outbox: makeOutboxScope(scope, begin.captureId, begin.sourceVersion),
        startedAt: now, pausedAt: null, pausedDuration: 0, epoch: 0, gapBefore: 0,
        recording: true, stream, recorder: null, timer: null, pointer: null, segmentIndex: 0,
        manifests: [], segmentUploads: [], pointerUploads: [], pointerIntervals: [], pointerLoss: false,
        epochs: [createCaptureEpoch(0, 0, now)],
      });
      runRef.current = run;
      setRecovery(null);
      run.pointer = attachPointer(run);
      setElapsedMs(0);
      setIsPaused(false);
      bindTrackLossHandler(stream, run);
      if (!startRecorder(run)) return;
      setIsRecording(true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (active(operation)) setMessage(error instanceof Error ? error.message : String(error));
    } finally { if (active(operation)) setIsWorking(false); }
  };
  const pauseRecording = async () => {
    const run = runRef.current;
    if (!run || !active(run) || !isRecording || isWorking) return;
    setIsWorking(true);
    try {
      run.pointer?.flush('pause');
      run.pointer?.dispose();
      run.pointer = null;
      run.recording = false;
      run.pausedAt = performance.now();
      await finalizeCurrentRecorder(run);
      run.stream?.getTracks().forEach(track => track.stop());
      run.stream = null;
      await run.service.progress(run.outbox.captureId, { expectedSourceVersion: run.outbox.sourceVersion, epochManifest: snapshotEpochManifest(run), lastProgressAt: Date.now() });
      await run.service.pause(run.outbox.captureId, run.outbox.sourceVersion);
      if (!active(run)) return;
      setIsRecording(false);
      setIsPaused(true);
      setMessage('已暫停收音；鼠標線索與音訊均已封存到目前分段。');
    } catch (error) {
      if (active(run)) { setMessage(error instanceof Error ? error.message : String(error)); await settleCaptureAfterError(run); }
    } finally { if (active(run)) setIsWorking(false); }
  };
  const resumeRecording = async () => {
    const run = runRef.current;
    if (!run || !active(run) || !isPaused || isWorking) return;
    setIsWorking(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      run.fence.assertCurrent();
      const now = performance.now();
      const gapBeforeMs = run.pausedAt == null ? 0 : Math.max(0, now - run.pausedAt);
      const epochs = [...snapshotEpochManifest(run), { ...createCaptureEpoch(run.epoch + 1, currentOffset(run), now), gapBeforeMs }];
      await run.service.resume(run.outbox.captureId, epochs, run.outbox.sourceVersion);
      run.fence.assertCurrent();
      run.epochs = epochs;
      run.pausedDuration += gapBeforeMs;
      run.pausedAt = null;
      run.gapBefore = gapBeforeMs;
      run.epoch += 1;
      run.stream = stream;
      run.recording = true;
      run.pointer = attachPointer(run);
      bindTrackLossHandler(stream, run);
      setMessage(null);
      if (!startRecorder(run)) return;
      setIsPaused(false);
      setIsRecording(true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (active(run)) setMessage(error instanceof Error ? error.message : String(error));
    } finally { if (active(run)) setIsWorking(false); }
  };
  const stop = async () => {
    const run = runRef.current;
    if (!run || !active(run) || (!isRecording && !isPaused) || isWorking) return;
    setIsWorking(true);
    try {
      if (isRecording) {
        run.pointer?.flush('stop');
        run.pointer?.dispose();
        run.pointer = null;
        run.recording = false;
        run.pausedAt ??= performance.now();
        await finalizeCurrentRecorder(run);
      }
      run.stream?.getTracks().forEach(track => track.stop());
      run.stream = null;
      let pointerLoss = run.pointerLoss;
      try { await Promise.all(run.pointerUploads); }
      catch { pointerLoss = true; }
      run.fence.assertCurrent();
      await run.service.stop(run.outbox.captureId, {
        expectedSourceVersion: run.outbox.sourceVersion, stoppedAt: Date.now(), pointerLoss,
        epochManifest: snapshotEpochManifest(run),
        finalPointerSequence: run.pointerIntervals.length ? Math.max(...run.pointerIntervals.map(item => item.sequence)) : null,
        gaps: sourceGaps(run),
      });
      run.manifests.sort((left, right) => left.segmentIndex - right.segmentIndex);
      const completion = await run.service.completeUpload(run.outbox.captureId, {
        expectedSourceVersion: run.outbox.sourceVersion, audioManifestHash: await hashText(run.manifests),
        pointerManifestHash: await hashText(run.pointerIntervals),
        sourceCompleteness: run.manifests.length > 0 && !pointerLoss ? 'complete' : run.manifests.length > 0 ? 'partial' : 'missing',
        audioManifest: run.manifests.map(item => ({ ...item })),
      });
      if (!active(run)) return;
      setIsRecording(false);
      setIsPaused(false);
      setMessage(completion.sourceComplete === false ? '已停止；來源不完整，未排入付費分析。' : '已停止收音，分析工作已排入佇列。');
    } catch (error) {
      if (active(run)) { setMessage(error instanceof Error ? error.message : String(error)); await settleCaptureAfterError(run); }
    } finally { if (active(run)) setIsWorking(false); }
  };

  return (
    <div data-meeting-recording-controls data-meeting-recording-state={isWorking ? 'working' : isRecording ? 'recording' : isPaused ? 'paused' : 'safe'} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isRecording ? 'bg-rose-100 text-rose-700' : isPaused ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'}`}>
            {isPaused ? <Pause size={14} /> : <Mic size={14} />}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-700">會議收音與任務定位</div>
            <div className="text-[10px] text-slate-500">{isRecording ? `收音中 ${Math.floor(elapsedMs / 60000)}:${String(Math.floor(elapsedMs / 1000) % 60).padStart(2, '0')}` : isPaused ? '已暫停；按繼續收音建立新時間段' : '手動開始；鼠標停留只作輔助證據'}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-meeting-recording-toggle
            disabled={isWorking}
            onClick={() => void (isPaused ? resumeRecording() : isRecording ? pauseRecording() : start())}
            className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-white ${isRecording ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 hover:bg-slate-700'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isWorking ? <Loader2 size={13} className="animate-spin" /> : isPaused ? <Play size={12} /> : isRecording ? <Pause size={12} /> : <Mic size={13} />}
            {isWorking ? '處理中…' : isPaused ? '繼續收音' : isRecording ? '暫停收音' : '開始收音'}
          </button>
          {(isRecording || isPaused) ? (
            <button
              type="button"
              data-meeting-recording-stop
              disabled={isWorking}
              onClick={() => void stop()}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-rose-600 px-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square size={12} />
              停止
            </button>
          ) : null}
        </div>
      </div>
      {recovery ? (
        <div data-meeting-capture-recovery className="mt-1.5 flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
          <span>{recovery.pendingCount > 0 ? `偵測到 ${recovery.pendingCount} 段尚未確認上傳的本機音訊（${recovery.state}）。` : `偵測到未完成的會議收音（${recovery.state}）；不會自動重新開啟麥克風。`}</span>
          {recovery.pendingCount > 0 ? (
            <button
              type="button"
              onClick={() => void recoverFinalizedSegments()}
              disabled={recoveryBusy || isWorking}
              className="shrink-0 rounded bg-amber-700 px-1.5 py-1 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {recoveryBusy ? '續傳中…' : '續傳已封存音訊'}
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? <div role="status" className="mt-1 text-[10px] leading-4 text-slate-600">{message}</div> : null}
    </div>
  );
};

export default MeetingRecordingControls;
