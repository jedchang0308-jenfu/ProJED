import React from 'react';
import { createPortal } from 'react-dom';
import { useWbsStore } from '../store/useWbsStore';

const TASK_DESCRIPTION_HOVER_DELAY_MS = 1000;

const TASK_SELECTED_PREVIEW_SURFACE = '[data-task-surface-source="true"][data-task-id]';
const TASK_DESCRIPTION_EXPLICIT_SURFACE = '[data-task-description-hover-trigger="true"][data-task-id]';
const TASK_DESCRIPTION_HOVER_TRIGGER = `${TASK_SELECTED_PREVIEW_SURFACE}, ${TASK_DESCRIPTION_EXPLICIT_SURFACE}`;
const TASK_DESCRIPTION_HOVER_CARD = '[data-task-description-hover-card="true"]';
const TASK_DESCRIPTION_HOVER_CARD_ID = 'task-description-hover-card';
const CLOSE_GRACE_MS = 120;
const VIEWPORT_MARGIN_PX = 12;
const CARD_GAP_PX = 8;

type HoverCardState = {
  taskId: string;
  sourceKind: HoverSourceKind;
  description: string;
  anchorRect: DOMRect;
};

type HoverSourceKind = 'store' | 'inline';

type HoverCandidate = {
  trigger: HTMLElement;
  taskId: string;
  sourceKind: HoverSourceKind;
  description: string;
};

type HoverCardPosition = {
  left: number;
  top: number;
};

const getTrigger = (target: EventTarget | null) => (
  target instanceof Element
    ? target.closest<HTMLElement>(TASK_DESCRIPTION_HOVER_TRIGGER)
    : null
);

const resolveHoverCandidate = (trigger: HTMLElement): HoverCandidate | null => {
  const taskId = trigger.getAttribute('data-task-id')?.trim() || '';
  if (!taskId) return null;

  if (trigger.hasAttribute('data-task-description-hover-content')) {
    return {
      trigger,
      taskId,
      sourceKind: 'inline',
      description: trigger.getAttribute('data-task-description-hover-content')?.trim() || '',
    };
  }

  return {
    trigger,
    taskId,
    sourceKind: 'store',
    description: useWbsStore.getState().nodes[taskId]?.description?.trim() || '',
  };
};

const updateTooltipRelationship = (trigger: HTMLElement, shouldLink: boolean) => {
  const describedBy = (trigger.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(id => id !== TASK_DESCRIPTION_HOVER_CARD_ID);

  if (shouldLink) describedBy.push(TASK_DESCRIPTION_HOVER_CARD_ID);
  if (describedBy.length > 0) trigger.setAttribute('aria-describedby', describedBy.join(' '));
  else trigger.removeAttribute('aria-describedby');
};

const TaskDescriptionHoverCard: React.FC = () => {
  const [card, setCard] = React.useState<HoverCardState | null>(null);
  const [position, setPosition] = React.useState<HoverCardPosition | null>(null);
  const cardElementRef = React.useRef<HTMLDivElement | null>(null);
  const openTriggerRef = React.useRef<HTMLElement | null>(null);
  const pendingCandidateRef = React.useRef<HoverCandidate | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const pointerHeldRef = React.useRef(false);
  const dragActiveRef = React.useRef(false);

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    pendingCandidateRef.current = null;
  }, []);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeCard = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    if (openTriggerRef.current) updateTooltipRelationship(openTriggerRef.current, false);
    openTriggerRef.current = null;
    setCard(null);
    setPosition(null);
  }, [clearCloseTimer, clearOpenTimer]);

  const scheduleClose = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(closeCard, CLOSE_GRACE_MS);
  }, [clearCloseTimer, clearOpenTimer, closeCard]);

  const scheduleOpen = React.useCallback((trigger: HTMLElement) => {
    clearCloseTimer();
    if (pointerHeldRef.current || dragActiveRef.current) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (trigger.closest('[data-mindmap-inline-title-editing="true"]')) return;

    const candidate = resolveHoverCandidate(trigger);
    if (!candidate?.description) {
      closeCard();
      return;
    }

    if (openTriggerRef.current === trigger) return;
    if (pendingCandidateRef.current?.trigger === trigger) return;

    clearOpenTimer();
    if (openTriggerRef.current) updateTooltipRelationship(openTriggerRef.current, false);
    openTriggerRef.current = null;
    setCard(null);
    setPosition(null);
    pendingCandidateRef.current = candidate;

    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      if (!trigger.isConnected || !trigger.matches(':hover') || pointerHeldRef.current || dragActiveRef.current) {
        pendingCandidateRef.current = null;
        return;
      }

      const latestCandidate = resolveHoverCandidate(trigger);
      if (!latestCandidate
        || latestCandidate.trigger !== candidate.trigger
        || latestCandidate.taskId !== candidate.taskId
        || latestCandidate.sourceKind !== candidate.sourceKind
        || !latestCandidate.description) {
        pendingCandidateRef.current = null;
        return;
      }

      pendingCandidateRef.current = null;
      openTriggerRef.current = trigger;
      updateTooltipRelationship(trigger, true);
      setPosition(null);
      setCard({
        taskId: latestCandidate.taskId,
        sourceKind: latestCandidate.sourceKind,
        description: latestCandidate.description,
        anchorRect: trigger.getBoundingClientRect(),
      });
    }, TASK_DESCRIPTION_HOVER_DELAY_MS);
  }, [clearCloseTimer, clearOpenTimer, closeCard]);

  React.useLayoutEffect(() => {
    const element = cardElementRef.current;
    if (!card || !element) return;

    const rect = element.getBoundingClientRect();
    const preferredLeft = card.anchorRect.left + (card.anchorRect.width - rect.width) / 2;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN_PX, preferredLeft),
      Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX),
    );
    const belowTop = card.anchorRect.bottom + CARD_GAP_PX;
    const aboveTop = card.anchorRect.top - rect.height - CARD_GAP_PX;
    const top = belowTop + rect.height <= window.innerHeight - VIEWPORT_MARGIN_PX
      ? belowTop
      : Math.max(VIEWPORT_MARGIN_PX, aboveTop);

    setPosition({ left, top });
  }, [card]);

  React.useEffect(() => {
    const handlePointerOver = (event: PointerEvent) => {
      const targetElement = event.target instanceof Element ? event.target : null;
      if (targetElement?.closest(TASK_DESCRIPTION_HOVER_CARD)) {
        clearCloseTimer();
        return;
      }

      const previousTrigger = getTrigger(event.relatedTarget);
      const nextTrigger = getTrigger(event.target);
      if (previousTrigger === nextTrigger) return;

      if (previousTrigger === pendingCandidateRef.current?.trigger || previousTrigger === openTriggerRef.current) {
        scheduleClose();
      }
      if (nextTrigger) scheduleOpen(nextTrigger);
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      const trigger = getTrigger(event.target);
      if (trigger === pendingCandidateRef.current?.trigger || trigger === openTriggerRef.current) scheduleClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      pointerHeldRef.current = true;
      const targetElement = event.target instanceof Element ? event.target : null;
      if (!targetElement?.closest(TASK_DESCRIPTION_HOVER_CARD)) closeCard();
    };
    const handlePointerUp = () => {
      pointerHeldRef.current = false;
    };
    const handleDragStart = () => {
      dragActiveRef.current = true;
      closeCard();
    };
    const handleDragEnd = () => {
      dragActiveRef.current = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCard();
    };
    const handleScroll = (event: Event) => {
      const targetElement = event.target instanceof Element ? event.target : null;
      if (targetElement && cardElementRef.current?.contains(targetElement)) return;
      closeCard();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        pointerHeldRef.current = false;
        dragActiveRef.current = false;
        closeCard();
      }
    };
    const handleWindowBlur = () => {
      pointerHeldRef.current = false;
      dragActiveRef.current = false;
      closeCard();
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
    window.addEventListener('dragstart', handleDragStart, true);
    window.addEventListener('dragend', handleDragEnd, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', closeCard);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
      window.removeEventListener('dragstart', handleDragStart, true);
      window.removeEventListener('dragend', handleDragEnd, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', closeCard);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      closeCard();
    };
  }, [clearCloseTimer, closeCard, scheduleClose, scheduleOpen]);

  React.useEffect(() => {
    const trigger = openTriggerRef.current;
    if (!card || !trigger) return undefined;

    const closeIfInvalidCandidate = () => {
      if (!trigger.isConnected) {
        closeCard();
        return;
      }
      const latestCandidate = resolveHoverCandidate(trigger);
      if (!latestCandidate
        || latestCandidate.taskId !== card.taskId
        || latestCandidate.sourceKind !== card.sourceKind
        || !latestCandidate.description) {
        closeCard();
      }
    };
    const observer = new MutationObserver(closeIfInvalidCandidate);
    observer.observe(trigger, {
      attributes: true,
      attributeFilter: [
        'data-task-id',
        'data-task-description-hover-content',
        'data-task-description-hover-trigger',
        'data-task-surface-source',
      ],
    });
    const connectivityObserver = new MutationObserver(() => {
      if (!trigger.isConnected) closeCard();
    });
    if (document.body) connectivityObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      connectivityObserver.disconnect();
    };
  }, [card, closeCard]);

  if (!card) return null;

  return createPortal(
    <div
      ref={cardElementRef}
      id={TASK_DESCRIPTION_HOVER_CARD_ID}
      role="tooltip"
      data-task-description-hover-card="true"
      data-task-id={card.taskId}
      onPointerEnter={clearCloseTimer}
      onPointerLeave={scheduleClose}
      className="fixed z-[10050] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-900 px-3 py-2.5 text-sm leading-5 text-white shadow-xl"
      style={{
        left: position?.left ?? card.anchorRect.left,
        top: position?.top ?? card.anchorRect.bottom + CARD_GAP_PX,
        maxWidth: 'min(380px, calc(100vw - 24px))',
        maxHeight: 'min(320px, calc(100vh - 24px))',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {card.description}
    </div>,
    document.body,
  );
};

export default TaskDescriptionHoverCard;
