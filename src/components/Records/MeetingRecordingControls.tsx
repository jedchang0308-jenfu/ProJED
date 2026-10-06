import React from 'react';
import { Loader2, Mic, Pause, Play, Square } from 'lucide-react';
import {
  MEETING_AUDIO_SEGMENT_MS,
  createCaptureEpoch,
  type MeetingAudioSegmentManifest,
  type MeetingPointerInterval,
} from '../../features/meetingTaskResolution/meetingAnalysisContract';
import { attachMeetingPointerObserver, type MeetingPointerObserver } from '../../features/meetingTaskResolution/meetingPointerEvidence';
import { meetingAnalysisService } from '../../features/meetingTaskResolution/meetingAnalysisService';
import {
  deleteMeetingAudioSegment,
  deleteMeetingPointerBatch,
  listMeetingAudioSegments,
  listMeetingPointerBatches,
  putMeetingAudioSegment,
  putMeetingPointerBatch,
} from '../../features/meetingTaskResolution/meetingAudioOutbox';

type Props = {
  tenantId: string | null;
  projectId: string | null;
  initialCaptureId?: string | null;
  onEnsureSaved: () => Promise<string | null>;
  onCaptureStarted?: (captureId: string) => void;
};

const hashText = async (value: unknown) => {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const MeetingRecordingControls: React.FC<Props> = ({ tenantId, projectId, initialCaptureId = null, onEnsureSaved, onCaptureStarted }) => {
  const [isRecording, setIsRecording] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isWorking, setIsWorking] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [recovery, setRecovery] = React.useState<{ captureId: string; state: string; pendingCount: number } | null>(null);
  const [recoveryBusy, setRecoveryBusy] = React.useState(false);
  const recordingStateRef = React.useRef(false);
  const captureIdRef = React.useRef<string | null>(null);
  const sourceVersionRef = React.useRef(1);
  const startedAtRef = React.useRef(0);
  const pausedAtRef = React.useRef<number | null>(null);
  const pausedDurationRef = React.useRef(0);
  const clockEpochRef = React.useRef(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const segmentStartRef = React.useRef(0);
  const segmentEpochRef = React.useRef(0);
  const segmentGapBeforeRef = React.useRef(0);
  const pendingGapBeforeRef = React.useRef(0);
  const segmentIndexRef = React.useRef(0);
  const manifestsRef = React.useRef<MeetingAudioSegmentManifest[]>([]);
  const pointerRef = React.useRef<MeetingPointerObserver | null>(null);
  const rotateTimerRef = React.useRef<number | null>(null);
  const stopResolveRef = React.useRef<(() => void) | null>(null);
  const pendingSegmentUploadsRef = React.useRef<Promise<void>[]>([]);
  const pendingPointerUploadsRef = React.useRef<Promise<unknown>[]>([]);
  const pointerIntervalsRef = React.useRef<MeetingPointerInterval[]>([]);
  const pointerLossRef = React.useRef(false);
  const epochManifestRef = React.useRef<Array<ReturnType<typeof createCaptureEpoch>>>([]);

  const stopRecorderSafely = (recorder: MediaRecorder | null) => {
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.stop();
    } catch {
      // The caller owns the server-side recovery decision.  This helper only
      // prevents a synchronous MediaRecorder exception from masking it.
    }
  };

  const settleCaptureAfterError = async (captureId: string | null, finalizeMissing = false) => {
    recordingStateRef.current = false;
    pointerRef.current?.dispose();
    pointerRef.current = null;
    stopRecorderSafely(recorderRef.current);
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    if (!captureId) return;
    try {
      let status = await meetingAnalysisService.status(captureId);
      if (finalizeMissing && ['recording', 'paused'].includes(status.state)) {
        await meetingAnalysisService.stop(captureId, {
          expectedSourceVersion: sourceVersionRef.current,
          stoppedAt: Date.now(),
          pointerLoss: true,
          epochManifest: snapshotEpochManifest(),
          finalPointerSequence: pointerIntervalsRef.current.length > 0
            ? Math.max(...pointerIntervalsRef.current.map(interval => interval.sequence))
            : null,
          gaps: snapshotEpochManifest().filter(entry => entry.gapBeforeMs > 0 && entry.captureOffsetMs > Math.max(0, entry.captureOffsetMs - entry.gapBeforeMs)).map(entry => ({
            startOffsetMs: Math.max(0, entry.captureOffsetMs - entry.gapBeforeMs),
            endOffsetMs: entry.captureOffsetMs,
            reason: 'pause',
          })),
        });
        await meetingAnalysisService.completeUpload(captureId, {
          expectedSourceVersion: sourceVersionRef.current,
          audioManifestHash: await hashText([]),
          pointerManifestHash: await hashText({ recorderStartFailed: true }),
          sourceCompleteness: 'missing',
          audioManifest: [],
        });
        status = await meetingAnalysisService.status(captureId);
      }
      const pending = await listMeetingAudioSegments(`capture:${captureId}`);
      /*
       * A recorder-start failure is a server-visible stopped/missing source,
       * while ordinary finalize/API failures remain recoverable.  Read status
       * again after the explicit missing freeze so the recovery banner cannot
       * present stale recording state.
       */
      if (pending.length > 0 || ['recording', 'paused', 'stopped', 'uploading'].includes(status.state)) {
        setRecovery({ captureId, state: status.state, pendingCount: pending.length });
      } else {
        setRecovery(null);
      }
    } catch {
      setRecovery({ captureId, state: 'unknown', pendingCount: 0 });
    }
  };

  React.useEffect(() => {
    if (!initialCaptureId || isRecording || isPaused || isWorking) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const [status, pending] = await Promise.all([
          meetingAnalysisService.status(initialCaptureId),
          listMeetingAudioSegments(`capture:${initialCaptureId}`),
        ]);
        if (cancelled) return;
        if (pending.length > 0 || ['recording', 'paused', 'stopped', 'uploading'].includes(status.state)) {
          setRecovery({ captureId: initialCaptureId, state: status.state, pendingCount: pending.length });
        } else {
          setRecovery(null);
        }
      } catch {
        if (!cancelled) setRecovery(null);
      }
    })();
    return () => { cancelled = true; };
  }, [initialCaptureId, isPaused, isRecording, isWorking]);

  React.useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => setElapsedMs(Math.max(0, performance.now() - startedAtRef.current)), 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  React.useEffect(() => {
    if (!isRecording) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecording]);

  const currentOffset = () => {
    const now = performance.now();
    const activePauseMs = pausedAtRef.current == null ? 0 : Math.max(0, now - pausedAtRef.current);
    return Math.max(0, Math.floor(now - startedAtRef.current - pausedDurationRef.current - activePauseMs));
  };

  const snapshotEpochManifest = () => {
    const offset = currentOffset();
    return epochManifestRef.current.map((entry, index) => index === epochManifestRef.current.length - 1
      ? { ...entry, durationMs: Math.max(0, offset - entry.captureOffsetMs) }
      : entry);
  };

  const bindTrackLossHandler = (stream: MediaStream, captureId: string) => {
    const handleTrackEnded = () => {
      if (!recordingStateRef.current || captureIdRef.current !== captureId) return;
      setMessage('麥克風裝置中斷；已停止收音並標記來源不完整。');
      void settleCaptureAfterError(captureId, true);
    };
    stream.getTracks().forEach(track => {
      if (typeof track.addEventListener === 'function') track.addEventListener('ended', handleTrackEnded, { once: true });
    });
  };

  const persistSegment = async (blob: Blob, endOffsetMs: number) => {
    const captureId = captureIdRef.current;
    if (!captureId || blob.size === 0) return;
    const scopeKey = `capture:${captureId}`;
    const segmentIndex = segmentIndexRef.current++;
    const startOffsetMs = Math.max(0, Math.floor(segmentStartRef.current));
    const segmentId = `${captureId}:${segmentIndex}`;
    const manifest: MeetingAudioSegmentManifest = {
      segmentId,
      segmentIndex,
      epoch: segmentEpochRef.current,
      startOffsetMs,
      endOffsetMs,
      // MediaRecorder rotation stops the previous recorder before starting the next one;
      // declare measured overlap honestly until a dual-recorder overlap path exists.
      overlapMs: 0,
      gapBeforeMs: segmentGapBeforeRef.current,
      mime: blob.type || 'audio/webm',
      bytes: blob.size,
      uploadState: 'pending',
    };
    await putMeetingAudioSegment(scopeKey, manifest, blob);
    try {
      const uploaded = await meetingAnalysisService.uploadSegment(captureId, segmentIndex, blob, {
        epoch: manifest.epoch,
        startOffsetMs: manifest.startOffsetMs,
        endOffsetMs: manifest.endOffsetMs,
        overlapMs: manifest.overlapMs,
        gapBeforeMs: manifest.gapBeforeMs,
      });
      manifest.objectPath = uploaded.path;
      manifest.sha256 = uploaded.sha256;
      manifest.bytes = uploaded.bytes;
      manifest.uploadState = 'verified';
      manifestsRef.current = [...manifestsRef.current, manifest];
      await deleteMeetingAudioSegment(scopeKey, manifest.segmentId);
      await meetingAnalysisService.progress(captureId, {
        epochManifest: snapshotEpochManifest(),
        lastProgressAt: Date.now(),
      });
    } catch (error) {
      manifest.uploadState = 'pending';
      manifestsRef.current = [...manifestsRef.current, manifest];
      throw error;
    }
  };

  const queuePointerBatch = (intervals: MeetingPointerInterval[]) => {
    const captureId = captureIdRef.current;
    if (!captureId || intervals.length === 0) return;
    pointerIntervalsRef.current = [...pointerIntervalsRef.current, ...intervals];
    const batchKey = `${captureId}:pointer:${intervals[0].sequence}`;
    const promise = hashText(intervals).then(async digest => {
      await putMeetingPointerBatch(`capture:${captureId}`, batchKey, digest, intervals);
      await meetingAnalysisService.appendPointer(captureId, { batchKey, digest, intervals });
      await deleteMeetingPointerBatch(`capture:${captureId}`, batchKey);
    }).catch(error => {
      pointerLossRef.current = true;
      throw error;
    });
    pendingPointerUploadsRef.current.push(promise);
  };

  const startRecorder = (): boolean => {
    const stream = streamRef.current;
    if (!stream || !recordingStateRef.current) return false;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '無法建立錄音器。');
      void settleCaptureAfterError(captureIdRef.current, true);
      return false;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    segmentStartRef.current = currentOffset();
    segmentEpochRef.current = clockEpochRef.current;
    segmentGapBeforeRef.current = pendingGapBeforeRef.current;
    pendingGapBeforeRef.current = 0;
    recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      chunksRef.current = [];
      const endOffset = currentOffset();
      const upload = persistSegment(blob, endOffset);
      pendingSegmentUploadsRef.current.push(upload);
      void upload.then(() => stopResolveRef.current?.()).catch(error => {
        setMessage(error instanceof Error ? error.message : String(error));
        stopResolveRef.current?.();
      });
    };
    try {
      recorder.start(1000);
    } catch (error) {
      recorderRef.current = null;
      setMessage(error instanceof Error ? error.message : '無法開始收音。');
      void settleCaptureAfterError(captureIdRef.current, true);
      return false;
    }
    if (rotateTimerRef.current) window.clearTimeout(rotateTimerRef.current);
    rotateTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current !== recorder || recorder.state !== 'recording') return;
      try {
        recorder.stop();
      } catch (error) {
        recorderRef.current = null;
        setMessage(error instanceof Error ? error.message : '錄音分段停止失敗。');
        void settleCaptureAfterError(captureIdRef.current, true);
        return;
      }
      recorderRef.current = null;
      window.setTimeout(startRecorder, 0);
    }, Math.max(1000, MEETING_AUDIO_SEGMENT_MS - (currentOffset() - segmentStartRef.current)));
    return true;
  };

  const finalizeCurrentRecorder = async () => {
    if (rotateTimerRef.current) window.clearTimeout(rotateTimerRef.current);
    await new Promise<void>((resolve, reject) => {
      stopResolveRef.current = resolve;
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') {
        try {
          recorder.stop();
        } catch (error) {
          recorderRef.current = null;
          reject(error);
        }
      } else resolve();
    });
    recorderRef.current = null;
    await Promise.all(pendingSegmentUploadsRef.current);
  };

  const recoverFinalizedSegments = async () => {
    if (!recovery || recoveryBusy) return;
    setRecoveryBusy(true);
    setMessage(null);
    try {
      const captureId = recovery.captureId;
      const status = await meetingAnalysisService.status(captureId);
      sourceVersionRef.current = status.sourceVersion;
      const pendingPointers = await listMeetingPointerBatches(`capture:${captureId}`);
      for (const pointer of pendingPointers) {
        await meetingAnalysisService.appendPointer(captureId, {
          batchKey: pointer.batchKey,
          digest: pointer.digest,
          intervals: pointer.intervals,
        });
        await deleteMeetingPointerBatch(`capture:${captureId}`, pointer.batchKey);
      }
      const rows = await listMeetingAudioSegments(`capture:${captureId}`);
      const manifests: MeetingAudioSegmentManifest[] = [];
      for (const row of rows) {
        const manifest = { ...row.manifest };
        const uploaded = await meetingAnalysisService.uploadSegment(captureId, manifest.segmentIndex, row.blob, {
          epoch: manifest.epoch,
          startOffsetMs: manifest.startOffsetMs,
          endOffsetMs: manifest.endOffsetMs,
          overlapMs: manifest.overlapMs,
          gapBeforeMs: manifest.gapBeforeMs,
        });
        manifest.objectPath = uploaded.path;
        manifest.sha256 = uploaded.sha256;
        manifest.bytes = uploaded.bytes;
        manifest.uploadState = 'verified';
        manifests.push(manifest);
        await deleteMeetingAudioSegment(`capture:${captureId}`, manifest.segmentId);
      }
      if (['stopped', 'uploading'].includes(status.state) && manifests.length > 0) {
        await meetingAnalysisService.completeUpload(captureId, {
          expectedSourceVersion: status.sourceVersion,
          audioManifestHash: await hashText(manifests),
          // Reload cannot prove that in-memory pointer batches were acked, and
          // the local outbox only contains finalized audio. Freeze this
          // recovery as partial instead of silently converting unknown pointer
          // evidence or an incomplete manifest into a complete source.
          pointerManifestHash: await hashText({ recoveredAfterReload: true, pointerLoss: status.pointerLoss }),
          sourceCompleteness: 'partial',
          audioManifest: manifests,
        });
      }
      setRecovery(null);
      setMessage(manifests.length > 0 ? '已續傳本機已封存音訊；來源仍標記為不完整，需重新確認後才能分析。' : '目前沒有可續傳的本機音訊。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const start = async () => {
    if (!tenantId || !projectId || isWorking || isRecording) return;
    setIsWorking(true);
    setMessage(null);
    let stream: MediaStream | null = null;
    try {
      const ensuredRecordId = await onEnsureSaved();
      if (!ensuredRecordId) throw new Error('請先儲存會議草稿，再開始收音。');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const begin = await meetingAnalysisService.begin({
        tenantId,
        projectId,
        recordId: ensuredRecordId,
        idempotencyKey: `${ensuredRecordId}:${Date.now()}`,
      });
      streamRef.current = stream;
      captureIdRef.current = begin.captureId;
      sourceVersionRef.current = begin.sourceVersion;
      setRecovery(null);
      onCaptureStarted?.(begin.captureId);
      startedAtRef.current = performance.now();
      pausedAtRef.current = null;
      pausedDurationRef.current = 0;
      clockEpochRef.current = 0;
      epochManifestRef.current = [createCaptureEpoch(0, 0, startedAtRef.current)];
      segmentIndexRef.current = 0;
      manifestsRef.current = [];
      pendingSegmentUploadsRef.current = [];
      pendingPointerUploadsRef.current = [];
      pointerIntervalsRef.current = [];
      pointerLossRef.current = false;
      pointerRef.current = attachMeetingPointerObserver({
        captureId: begin.captureId,
        getCaptureOffsetMs: currentOffset,
        getClockEpoch: () => clockEpochRef.current,
        isRecording: () => recordingStateRef.current,
        onFlush: intervals => queuePointerBatch(intervals),
      });
      setElapsedMs(0);
      setIsPaused(false);
      recordingStateRef.current = true;
      bindTrackLossHandler(stream, begin.captureId);
      if (!startRecorder()) return;
      setIsRecording(true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      streamRef.current?.getTracks().forEach(track => track.stop());
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const pauseRecording = async () => {
    if (!isRecording || isWorking) return;
    setIsWorking(true);
    const captureId = captureIdRef.current;
    try {
      pointerRef.current?.flush('pause');
      pointerRef.current?.dispose();
      recordingStateRef.current = false;
      pausedAtRef.current = performance.now();
      await finalizeCurrentRecorder();
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (captureId) {
        await meetingAnalysisService.progress(captureId, {
          epochManifest: snapshotEpochManifest(),
          lastProgressAt: Date.now(),
        });
        await meetingAnalysisService.pause(captureId);
      }
      setIsRecording(false);
      setIsPaused(true);
      setMessage('已暫停收音；鼠標線索與音訊均已封存到目前分段。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await settleCaptureAfterError(captureId, true);
    } finally {
      setIsWorking(false);
    }
  };

  const resumeRecording = async () => {
    if (!isPaused || isWorking || !captureIdRef.current) return;
    setIsWorking(true);
    const captureId = captureIdRef.current;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextEpoch = clockEpochRef.current + 1;
      const captureOffsetMs = currentOffset();
      const gapBeforeMs = pausedAtRef.current == null ? 0 : Math.max(0, performance.now() - pausedAtRef.current);
      const nextEpochManifest = [
        ...snapshotEpochManifest(),
        createCaptureEpoch(nextEpoch, captureOffsetMs, performance.now()),
      ].map((entry, index, entries) => index === entries.length - 1 ? { ...entry, gapBeforeMs } : entry);
      await meetingAnalysisService.resume(captureId, nextEpochManifest);
      epochManifestRef.current = nextEpochManifest;
      if (pausedAtRef.current != null) {
        pausedDurationRef.current += gapBeforeMs;
        pendingGapBeforeRef.current = gapBeforeMs;
        pausedAtRef.current = null;
      }
      clockEpochRef.current = nextEpoch;
      streamRef.current = stream;
      pointerRef.current = attachMeetingPointerObserver({
        captureId,
        getCaptureOffsetMs: currentOffset,
        getClockEpoch: () => clockEpochRef.current,
        isRecording: () => recordingStateRef.current,
        onFlush: intervals => queuePointerBatch(intervals),
      });
      recordingStateRef.current = true;
      bindTrackLossHandler(stream, captureId);
      setMessage(null);
      if (!startRecorder()) return;
      setIsPaused(false);
      setIsRecording(true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const stop = async () => {
    if ((!isRecording && !isPaused) || isWorking) return;
    setIsWorking(true);
    const captureId = captureIdRef.current;
    try {
      if (isRecording) {
        pointerRef.current?.flush('stop');
        pointerRef.current?.dispose();
        recordingStateRef.current = false;
        await finalizeCurrentRecorder();
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      let completion: { sourceComplete?: boolean } | null = null;
      let pointerLoss = pointerLossRef.current;
      try {
        await Promise.all(pendingPointerUploadsRef.current);
      } catch (error) {
        pointerLoss = true;
        setMessage(error instanceof Error ? `部分鼠標線索未送達：${error.message}` : '部分鼠標線索未送達；已標記為不完整來源。');
      }
      if (captureId) {
        const finalEpochManifest = snapshotEpochManifest();
        await meetingAnalysisService.stop(captureId, {
          expectedSourceVersion: sourceVersionRef.current,
          stoppedAt: Date.now(),
          pointerLoss,
          epochManifest: finalEpochManifest,
          finalPointerSequence: pointerIntervalsRef.current.length > 0
            ? Math.max(...pointerIntervalsRef.current.map(interval => interval.sequence))
            : null,
          gaps: finalEpochManifest.filter(entry => entry.gapBeforeMs > 0 && entry.captureOffsetMs > Math.max(0, entry.captureOffsetMs - entry.gapBeforeMs)).map(entry => ({
            startOffsetMs: Math.max(0, entry.captureOffsetMs - entry.gapBeforeMs),
            endOffsetMs: entry.captureOffsetMs,
            reason: 'pause',
          })),
        });
        completion = await meetingAnalysisService.completeUpload(captureId, {
          expectedSourceVersion: sourceVersionRef.current,
          audioManifestHash: await hashText(manifestsRef.current),
          pointerManifestHash: await hashText(pointerIntervalsRef.current),
          sourceCompleteness: manifestsRef.current.length > 0 && !pointerLoss ? 'complete' : manifestsRef.current.length > 0 ? 'partial' : 'missing',
          audioManifest: manifestsRef.current.map(item => ({
            segmentId: item.segmentId,
            segmentIndex: item.segmentIndex,
            epoch: item.epoch,
            startOffsetMs: item.startOffsetMs,
            endOffsetMs: item.endOffsetMs,
            overlapMs: item.overlapMs,
            gapBeforeMs: item.gapBeforeMs,
            mime: item.mime,
            bytes: item.bytes,
            objectPath: item.objectPath,
            uploadState: item.uploadState,
          })),
        });
      }
      setIsRecording(false);
      setIsPaused(false);
      setMessage(completion?.sourceComplete === false
        ? pointerLoss ? '已停止；部分鼠標線索未送達，來源標記為不完整，未排入付費分析。' : '已停止；目前沒有完整音訊來源，未排入付費分析。'
        : pointerLoss ? '已停止；部分鼠標線索未送達，來源標記為不完整。' : '已停止收音，分析工作已排入佇列。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await settleCaptureAfterError(captureId, true);
    } finally {
      setIsWorking(false);
    }
  };

  React.useEffect(() => () => {
    if (rotateTimerRef.current) window.clearTimeout(rotateTimerRef.current);
    recordingStateRef.current = false;
    stopRecorderSafely(recorderRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    pointerRef.current?.dispose();
  }, []);

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
