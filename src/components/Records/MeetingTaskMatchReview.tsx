import React from 'react';
import { Check, ChevronDown, Loader2, Play, RotateCcw, X } from 'lucide-react';
import type { MeetingReviewSegment } from '../../features/meetingTaskResolution/meetingAnalysisContract';
import { meetingAnalysisService } from '../../features/meetingTaskResolution/meetingAnalysisService';
import {
  MeetingReviewRequestGate,
  meetingReviewScopeKey,
  type MeetingReviewCallbackBinding,
  type MeetingReviewScope,
} from './meetingReviewRequestGate';

type Props = {
  captureId: string | null;
  recordId: string | null;
  accountId: string | null;
  authContextId: string | null;
  workspaceId: string | null;
  boardId: string | null;
  scopeGeneration: number;
  draftSignature: string;
  taskOptions?: Array<{ id: string; title: string; nodeType?: string }>;
  onReviewApplied?: (
    reviewRevision: number,
    acceptedTaskIds: string[],
    manuallyResolvedTaskIds: string[],
    binding: MeetingReviewCallbackBinding,
  ) => void;
};

type ReviewViewState = {
  scopeKey: string;
  segments: MeetingReviewSegment[];
  summary: string | null;
  state: string;
  reviewRevision: number;
  loading: boolean;
  error: string | null;
};

const emptyReviewView = (scopeKey: string, loading = false): ReviewViewState => ({
  scopeKey,
  segments: [],
  summary: null,
  state: 'idle',
  reviewRevision: 0,
  loading,
  error: null,
});

const formatOffset = (offsetMs: number) => {
  const seconds = Math.max(0, Math.floor(offsetMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const MeetingTaskMatchReview: React.FC<Props> = ({
  captureId,
  recordId,
  accountId,
  authContextId,
  workspaceId,
  boardId,
  scopeGeneration,
  draftSignature,
  taskOptions = [],
  onReviewApplied,
}) => {
  const scope: MeetingReviewScope = {
    accountId,
    authContextId,
    workspaceId,
    boardId,
    recordId,
    captureId,
    scopeGeneration,
  };
  const scopeKey = meetingReviewScopeKey(scope);
  const gateRef = React.useRef<MeetingReviewRequestGate | null>(null);
  if (!gateRef.current) gateRef.current = new MeetingReviewRequestGate();
  const gate = gateRef.current;
  gate.reconcile(scope);

  const [reviewView, setReviewView] = React.useState<ReviewViewState>(() => emptyReviewView(scopeKey));
  const [busyRequest, setBusyRequest] = React.useState<{
    resolutionId: string;
    token: ReturnType<MeetingReviewRequestGate['begin']>;
  } | null>(null);
  const [playbackRequest, setPlaybackRequest] = React.useState<{
    segmentId: string;
    token: ReturnType<MeetingReviewRequestGate['begin']>;
  } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<Record<string, string>>({});
  const audioRef = React.useRef<{
    audio: HTMLAudioElement;
    token: ReturnType<MeetingReviewRequestGate['begin']>;
  } | null>(null);
  const loadRef = React.useRef<() => Promise<void>>(async () => {});
  const stopAudioRef = React.useRef<(clearPlaybackState?: boolean) => void>(() => {});

  const currentReview = reviewView.scopeKey === scopeKey
    ? reviewView
    : emptyReviewView(scopeKey, Boolean(captureId));
  const segments = currentReview.segments;
  const state = currentReview.state;
  const reviewRevision = currentReview.reviewRevision;
  const loading = currentReview.loading;
  const error = currentReview.error;
  const busyResolutionId = busyRequest && gate.isCurrent(busyRequest.token, scope)
    ? busyRequest.resolutionId
    : null;
  const playingSegmentId = playbackRequest && gate.isCurrent(playbackRequest.token, scope)
    ? playbackRequest.segmentId
    : null;

  const stopAudio = (clearPlaybackState = true) => {
    const active = audioRef.current;
    audioRef.current = null;
    if (active) {
      const source = active.audio.src;
      active.audio.onended = null;
      active.audio.onerror = null;
      active.audio.onloadedmetadata = null;
      active.audio.ontimeupdate = null;
      active.audio.pause();
      active.audio.removeAttribute('src');
      active.audio.load();
      if (source.startsWith('blob:')) URL.revokeObjectURL(source);
    }
    if (clearPlaybackState) setPlaybackRequest(null);
  };
  stopAudioRef.current = stopAudio;

  const load = async () => {
    if (!captureId) return;
    const requestScope = scope;
    const token = gate.begin(requestScope, 'review');
    setReviewView(previous => {
      if (!gate.isCurrent(token, requestScope)) return previous;
      const base = previous.scopeKey === token.scopeKey ? previous : emptyReviewView(token.scopeKey);
      return { ...base, loading: true, error: null };
    });
    try {
      const result = await meetingAnalysisService.review(captureId);
      if (result.captureId !== requestScope.captureId || !gate.isCurrent(token, requestScope)) return;
      const callbackBinding: MeetingReviewCallbackBinding = {
        ...requestScope,
        draftSignature,
        requestGeneration: token.generation,
        requestId: token.requestId,
      };
      const acceptedTaskIds = Array.from(new Set(
        result.segments.flatMap(segment => segment.candidates
          .filter(candidate => candidate.decision === 'accepted')
          .map(candidate => candidate.taskId)),
      ));
      const manuallyResolvedTaskIds = Array.from(new Set(
        result.segments.flatMap(segment => segment.candidates
          .filter(candidate => candidate.decision === 'accepted' && candidate.source === 'human')
          .map(candidate => candidate.taskId)),
      ));
      setReviewView(previous => gate.isCurrent(token, requestScope)
        ? {
          scopeKey: token.scopeKey,
          segments: result.segments,
          summary: result.summary,
          state: result.state,
          reviewRevision: result.reviewRevision,
          loading: true,
          error: null,
        }
        : previous);
      if (gate.isCurrent(token, requestScope)) {
        onReviewApplied?.(result.reviewRevision, acceptedTaskIds, manuallyResolvedTaskIds, callbackBinding);
      }
    } catch (cause) {
      if (gate.isCurrent(token, requestScope)) {
        setReviewView(previous => gate.isCurrent(token, requestScope)
          ? { ...previous, scopeKey: token.scopeKey, error: cause instanceof Error ? cause.message : String(cause) }
          : previous);
      }
    } finally {
      if (gate.isCurrent(token, requestScope)) {
        setReviewView(previous => gate.isCurrent(token, requestScope)
          ? { ...previous, scopeKey: token.scopeKey, loading: false }
          : previous);
      }
    }
  };
  loadRef.current = load;

  React.useLayoutEffect(() => {
    stopAudioRef.current(false);
    setReviewView(emptyReviewView(scopeKey, Boolean(captureId)));
    setBusyRequest(null);
    setPlaybackRequest(null);
    setSelectedTaskIds({});
    if (captureId) void loadRef.current();
    return () => {
      gate.cancelPending();
      stopAudioRef.current(false);
    };
  }, [scopeKey, captureId, gate]);

  React.useEffect(() => () => {
    gate.cancelPending();
    stopAudioRef.current(false);
  }, [gate]);

  const pollMillis = state === 'ready' ? 10000 : 4000;
  React.useEffect(() => {
    if (!captureId) return undefined;
    const timer = window.setInterval(() => void loadRef.current(), pollMillis);
    return () => window.clearInterval(timer);
  }, [scopeKey, captureId, pollMillis]);

  const decide = async (
    segment: MeetingReviewSegment,
    operations: Array<{ action: 'accept' | 'reject' | 'add' | 'replace' | 'clear-all'; taskId?: string }>,
  ) => {
    if (!segment.resolutionId) return;
    const requestScope = scope;
    const token = gate.begin(requestScope, `decision:${segment.resolutionId}`);
    setBusyRequest({ resolutionId: segment.resolutionId, token });
    try {
      await meetingAnalysisService.decideMatch({
        resolutionId: segment.resolutionId,
        expectedResolutionRevision: segment.resolutionRevision,
        operations,
      });
      if (gate.isCurrent(token, requestScope)) await loadRef.current();
    } catch (cause) {
      if (gate.isCurrent(token, requestScope)) {
        setReviewView(previous => gate.isCurrent(token, requestScope)
          ? { ...previous, scopeKey: token.scopeKey, error: cause instanceof Error ? cause.message : String(cause) }
          : previous);
      }
    } finally {
      if (gate.isCurrent(token, requestScope)) {
        setBusyRequest(previous => previous?.token.requestId === token.requestId ? null : previous);
      }
    }
  };

  const playSource = async (segment: MeetingReviewSegment) => {
    if (!recordId || !segment.audioSegmentId) return;
    const requestScope = scope;
    const token = gate.begin(requestScope, 'playback');
    stopAudioRef.current();
    setPlaybackRequest({ segmentId: segment.segmentId, token });
    try {
      const playback = await meetingAnalysisService.playbackUrl(recordId, segment.audioSegmentId);
      if (playback.segmentId !== segment.audioSegmentId || !gate.isCurrent(token, requestScope)) {
        if (playback.url.startsWith('blob:')) URL.revokeObjectURL(playback.url);
        return;
      }
      const audio = new Audio(playback.url);
      audioRef.current = { audio, token };
      const sourceStart = segment.audioSourceStartOffsetMs;
      const hasClip = typeof sourceStart === 'number' && Number.isFinite(sourceStart)
        && Number.isFinite(segment.startOffsetMs) && Number.isFinite(segment.endOffsetMs)
        && segment.endOffsetMs > segment.startOffsetMs;
      const clipStart = hasClip ? Math.max(0, (segment.startOffsetMs - sourceStart) / 1000) : 0;
      const clipEnd = hasClip ? (segment.endOffsetMs - sourceStart) / 1000 : undefined;
      const currentAudio = () => gate.isCurrent(token, requestScope) && audioRef.current?.audio === audio;
      audio.onended = () => {
        if (!currentAudio()) return;
        stopAudioRef.current();
      };
      const playbackFailed = () => {
        if (!currentAudio()) return;
        stopAudioRef.current();
        setReviewView(previous => gate.isCurrent(token, requestScope)
          ? { ...previous, scopeKey: token.scopeKey, error: '原音目前無法播放，請重新取得短效連結。' }
          : previous);
      };
      audio.onerror = playbackFailed;
      const seekToSegment = () => {
        if (!currentAudio() || !hasClip) return;
        try {
          if (clipEnd === undefined || clipEnd <= clipStart
            || (Number.isFinite(audio.duration) && clipStart >= audio.duration)) {
            playbackFailed();
            return;
          }
          audio.currentTime = clipStart;
        } catch { playbackFailed(); }
      };
      audio.onloadedmetadata = seekToSegment;
      audio.ontimeupdate = () => {
        if (currentAudio() && clipEnd !== undefined && audio.currentTime >= clipEnd) stopAudioRef.current();
      };
      if (audio.readyState >= 1) seekToSegment();
      if (!currentAudio()) return;
      await audio.play();
      if (!gate.isCurrent(token, requestScope) && audioRef.current?.audio === audio) stopAudioRef.current(false);
    } catch (cause) {
      if (gate.isCurrent(token, requestScope)) {
        if (audioRef.current?.token.requestId === token.requestId) stopAudioRef.current();
        setPlaybackRequest(previous => previous?.token.requestId === token.requestId ? null : previous);
        setReviewView(previous => gate.isCurrent(token, requestScope)
          ? { ...previous, scopeKey: token.scopeKey, error: cause instanceof Error ? cause.message : String(cause) }
          : previous);
      }
    }
  };

  if (!captureId) return null;

  return (
    <section
      data-meeting-task-match-review="true"
      aria-label="辨識任務"
      className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-700">辨識任務</div>
          <div className="text-[10px] text-slate-500">
            {state === 'ready' ? `已完成 · revision ${reviewRevision}` : `分析狀態：${state}`}
          </div>
        </div>
        <button
          type="button"
          aria-label="重新整理辨識任務"
          title="重新整理辨識任務"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
        </button>
      </div>

      {error ? <div role="alert" className="mt-2 rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700">{error}</div> : null}
      {currentReview.summary ? (
        <p data-meeting-review-summary="true" className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">
          <span className="font-medium text-slate-500">摘要：</span>{currentReview.summary}
        </p>
      ) : null}
      {!loading && state !== 'ready' && segments.length === 0 ? (
        <div className="mt-2 text-[10px] leading-4 text-slate-500">完成上傳後會在這裡顯示原句、候選任務與人工決定。</div>
      ) : null}
      {segments.length > 0 ? (
        <div className="mt-2 space-y-2">
          {segments.map(segment => {
            const busy = busyResolutionId === segment.resolutionId;
            const selectedTaskId = selectedTaskIds[segment.segmentId] ?? segment.candidates[0]?.taskId ?? '';
            return (
              <article key={segment.segmentId} data-meeting-review-segment={segment.segmentId} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                <div className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-slate-400">{formatOffset(segment.startOffsetMs)}</span>
                  <p className="min-w-0 flex-1 text-[11px] leading-4 text-slate-700">{segment.text || '（無可引用文字）'}</p>
                  <button
                    type="button"
                    aria-label={segment.audioSegmentId ? `播放 ${formatOffset(segment.startOffsetMs)} 的原音` : '此段沒有可回聽音訊'}
                    title={segment.audioSegmentId ? '回聽原音（短效連結）' : '此段沒有可回聽音訊'}
                    onClick={() => void playSource(segment)}
                    disabled={!segment.audioSegmentId || !recordId || playingSegmentId === segment.segmentId}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {playingSegmentId === segment.segmentId ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  </button>
                </div>
                {segment.candidates.length > 0 ? (
                  <div className="mt-1.5 space-y-1">
                    {segment.candidates.map(candidate => (
                      <div key={`${segment.segmentId}:${candidate.taskId}`} className="flex items-center gap-1.5 rounded bg-white px-1.5 py-1" data-meeting-review-candidate={candidate.taskId}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-medium text-slate-700">{candidate.title}</div>
                          {candidate.path ? <div className="truncate text-[10px] text-slate-400">{candidate.path}</div> : null}
                          {candidate.quoteRange ? (
                            <div className="text-[9px] text-slate-400" data-meeting-review-evidence="quote">
                              原句證據：詞 {candidate.quoteRange.fromWord + 1}–{candidate.quoteRange.toWord + 1}
                            </div>
                          ) : candidate.pointerFeature > 0 ? (
                            <div className="text-[9px] text-slate-400" data-meeting-review-evidence="pointer">鼠標線索，仍需原句確認</div>
                          ) : null}
                        </div>
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] ${candidate.decision === 'accepted' ? 'bg-emerald-50 text-emerald-700' : candidate.decision === 'rejected' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                          {candidate.decision === 'accepted' ? '已採用' : candidate.decision === 'rejected' ? '已排除' : '待確認'}
                        </span>
                        <button
                          type="button"
                          aria-label={`採用任務 ${candidate.title}`}
                          title={candidate.quoteRange ? '採用' : '需要原句證據才能採用'}
                          onClick={() => void decide(segment, [{ action: 'accept', taskId: candidate.taskId }])}
                          disabled={busy || !candidate.quoteRange}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label={`排除任務 ${candidate.title}`}
                          title="排除"
                          onClick={() => void decide(segment, [{ action: 'reject', taskId: candidate.taskId }])}
                          disabled={busy}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : <div className="mt-1 text-[10px] text-slate-500">沒有自動候選；可保留待確認。</div>}
                {segment.resolutionId ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">{segment.humanReviewed ? '已有人工作業' : '模型建議，尚未確認'}</span>
                      <button
                        type="button"
                        onClick={() => void decide(segment, [{ action: 'clear-all' }])}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <ChevronDown size={11} /> 清除本段任務
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <select
                        aria-label="選擇要連結的任務"
                        value={selectedTaskId}
                        onChange={event => setSelectedTaskIds(current => ({ ...current, [segment.segmentId]: event.target.value }))}
                        disabled={busy || taskOptions.length === 0}
                        className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 disabled:bg-slate-50"
                        data-meeting-review-task-picker={segment.segmentId}
                      >
                        <option value="">選擇任務以補連或改連</option>
                        {taskOptions.map(task => (
                          <option key={task.id} value={task.id}>
                            {task.title || task.id}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => selectedTaskId && void decide(segment, [{ action: 'add', taskId: selectedTaskId }])}
                        disabled={busy || !selectedTaskId}
                        className="rounded bg-blue-50 px-1.5 py-1 text-[10px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        data-meeting-review-add-task
                      >
                        補連
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedTaskId && void decide(segment, [{ action: 'replace', taskId: selectedTaskId }])}
                        disabled={busy || !selectedTaskId}
                        className="rounded bg-violet-50 px-1.5 py-1 text-[10px] text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                        data-meeting-review-replace-task
                      >
                        改連
                      </button>
                    </div>
                    {taskOptions.length === 0 ? <div className="text-[10px] text-slate-400">目前沒有可選任務，請先載入此專案的 WBS。</div> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};

export default MeetingTaskMatchReview;
