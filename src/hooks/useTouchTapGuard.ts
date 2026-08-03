import React from 'react';

interface UseTouchTapGuardOptions {
  threshold?: number;
}

interface TouchTapGuardHandlers {
  onTouchStart: React.TouchEventHandler;
  onTouchMove: React.TouchEventHandler;
  onTouchEnd: React.TouchEventHandler;
  onTouchCancel: React.TouchEventHandler;
  onPointerDown: React.PointerEventHandler;
  onPointerMove: React.PointerEventHandler;
  onPointerUp: React.PointerEventHandler;
  onPointerCancel: React.PointerEventHandler;
  onClickCapture: React.MouseEventHandler;
}

export const useTouchTapGuard = ({ threshold = 10 }: UseTouchTapGuardOptions = {}) => {
  const startPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const pannedRef = React.useRef(false);
  const suppressNextTapRef = React.useRef(false);
  const suppressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuppressTimer = React.useCallback(() => {
    if (!suppressTimerRef.current) return;
    clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = null;
  }, []);

  const scheduleSuppressReset = React.useCallback(() => {
    clearSuppressTimer();
    suppressTimerRef.current = setTimeout(() => {
      suppressNextTapRef.current = false;
      suppressTimerRef.current = null;
    }, 700);
  }, [clearSuppressTimer]);

  React.useEffect(() => () => clearSuppressTimer(), [clearSuppressTimer]);

  const startAt = React.useCallback((x: number, y: number) => {
    pannedRef.current = false;
    startPositionRef.current = { x, y };
  }, []);

  const moveAt = React.useCallback((x: number, y: number) => {
    if (!startPositionRef.current) return;
    const deltaX = Math.abs(x - startPositionRef.current.x);
    const deltaY = Math.abs(y - startPositionRef.current.y);
    if (deltaX <= threshold && deltaY <= threshold) return;
    pannedRef.current = true;
    suppressNextTapRef.current = true;
  }, [threshold]);

  const finish = React.useCallback(() => {
    startPositionRef.current = null;
    if (!pannedRef.current) return;
    suppressNextTapRef.current = true;
    scheduleSuppressReset();
  }, [scheduleSuppressReset]);

  const onTouchStart = React.useCallback<React.TouchEventHandler>((event) => {
    const touch = event.touches[0];
    if (!touch) return;
    startAt(touch.clientX, touch.clientY);
  }, [startAt]);

  const onTouchMove = React.useCallback<React.TouchEventHandler>((event) => {
    const touch = event.touches[0];
    if (!touch) return;
    moveAt(touch.clientX, touch.clientY);
  }, [moveAt]);

  const onTouchEnd = React.useCallback<React.TouchEventHandler>(() => finish(), [finish]);

  const onTouchCancel = React.useCallback<React.TouchEventHandler>(() => finish(), [finish]);

  const onPointerDown = React.useCallback<React.PointerEventHandler>((event) => {
    if (event.pointerType === 'touch') startAt(event.clientX, event.clientY);
  }, [startAt]);

  const onPointerMove = React.useCallback<React.PointerEventHandler>((event) => {
    if (event.pointerType === 'touch') moveAt(event.clientX, event.clientY);
  }, [moveAt]);

  const onPointerUp = React.useCallback<React.PointerEventHandler>((event) => {
    if (event.pointerType === 'touch') finish();
  }, [finish]);

  const onPointerCancel = onPointerUp;

  const onClickCapture = React.useCallback<React.MouseEventHandler>((event) => {
    if (!suppressNextTapRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextTapRef.current = false;
    clearSuppressTimer();
  }, [clearSuppressTimer]);

  const shouldSuppressTap = React.useCallback(() => suppressNextTapRef.current, []);

  const handlers = React.useMemo<TouchTapGuardHandlers>(() => ({
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  }), [onClickCapture, onPointerCancel, onPointerDown, onPointerMove, onPointerUp, onTouchCancel, onTouchEnd, onTouchMove, onTouchStart]);

  return {
    handlers,
    shouldSuppressTap,
  };
};
