import {
  getTaskPlacementCanonicalId,
  getTaskPlacementHoverSurface,
} from '../../interactions/task/taskPlacementHover';
import type { MeetingPointerInterval } from './meetingAnalysisContract';

export type MeetingPointerObserver = {
  flush: (terminationReason?: string) => MeetingPointerInterval[];
  dispose: () => MeetingPointerInterval[];
};

type PointerObserverOptions = {
  captureId: string;
  now?: () => number;
  getCaptureOffsetMs: () => number;
  getClockEpoch: () => number;
  isRecording: () => boolean;
  onFlush?: (intervals: MeetingPointerInterval[]) => void;
};

export const attachMeetingPointerObserver = ({
  captureId,
  now = () => performance.now(),
  getCaptureOffsetMs,
  getClockEpoch,
  isRecording,
  onFlush,
}: PointerObserverOptions): MeetingPointerObserver => {
  let current: { taskId: string; surfaceKind: string; surface: Element; startedAt: number; startedOffsetMs: number } | null = null;
  let sequence = 0;
  const pending: MeetingPointerInterval[] = [];

  const finish = (terminationReason: string) => {
    if (!current || !isRecording()) {
      current = null;
      return null;
    }
    const endedOffsetMs = getCaptureOffsetMs();
    if (endedOffsetMs <= current.startedOffsetMs) {
      current = null;
      return null;
    }
    const item: MeetingPointerInterval = {
      captureId,
      clockEpoch: getClockEpoch(),
      sequence: sequence++,
      canonicalTaskId: current.taskId,
      surfaceKind: current.surfaceKind,
      startedOffsetMs: current.startedOffsetMs,
      endedOffsetMs,
      visible: document.visibilityState === 'visible',
      terminationReason,
    };
    pending.push(item);
    current = null;
    return item;
  };

  const handleOver = (event: PointerEvent) => {
    if (!isRecording() || (event.pointerType && event.pointerType !== 'mouse')) return;
    const surface = getTaskPlacementHoverSurface(event.target);
    if (!surface) return;
    const taskId = getTaskPlacementCanonicalId(surface);
    if (!taskId) return;
    const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (related && surface.contains(related)) return;
    finish('surface-change');
    current = {
      taskId,
      surfaceKind: surface.getAttribute('data-task-placement-kind') || 'unknown',
      surface,
      startedAt: now(),
      startedOffsetMs: getCaptureOffsetMs(),
    };
  };

  const handleOut = (event: PointerEvent) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const surface = getTaskPlacementHoverSurface(event.target);
    if (!surface) return;
    const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (related && surface.contains(related)) return;
    finish('pointerout');
  };
  const finishForLifecycle = () => finish(document.visibilityState === 'hidden' ? 'hidden' : 'focus-loss');
  const finishForPointerLifecycle = () => finish('pointer-cancel');
  const finishForDrag = () => finish('drag');
  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
    if (current && !current.surface.isConnected) finish('element-disconnect');
  });
  const flush = (terminationReason = 'flush') => {
    finish(terminationReason);
    const result = pending.splice(0, pending.length);
    if (result.length > 0) onFlush?.(result);
    return result;
  };

  document.addEventListener('pointerover', handleOver);
  document.addEventListener('pointerout', handleOut);
  document.addEventListener('pointercancel', finishForPointerLifecycle);
  document.addEventListener('dragstart', finishForDrag, true);
  window.addEventListener('blur', finishForLifecycle);
  document.addEventListener('visibilitychange', finishForLifecycle);
  window.addEventListener('scroll', finishForLifecycle, true);
  mutationObserver?.observe(document.body, { childList: true, subtree: true });
  return {
    flush,
    dispose: () => {
      const result = flush('dispose');
      document.removeEventListener('pointerover', handleOver);
      document.removeEventListener('pointerout', handleOut);
      document.removeEventListener('pointercancel', finishForPointerLifecycle);
      document.removeEventListener('dragstart', finishForDrag, true);
      window.removeEventListener('blur', finishForLifecycle);
      document.removeEventListener('visibilitychange', finishForLifecycle);
      window.removeEventListener('scroll', finishForLifecycle, true);
      mutationObserver?.disconnect();
      return result;
    },
  };
};
