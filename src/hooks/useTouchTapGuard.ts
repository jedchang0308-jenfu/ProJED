import React from 'react';

interface UseTouchTapGuardOptions {
  threshold?: number;
}

interface TouchTapGuardHandlers {
  onTouchStart: React.TouchEventHandler;
  onTouchMove: React.TouchEventHandler;
  onTouchEnd: React.TouchEventHandler;
  onTouchCancel: React.TouchEventHandler;
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

  const onTouchStart = React.useCallback<React.TouchEventHandler>((event) => {
    const touch = event.touches[0];
    if (!touch) return;
    pannedRef.current = false;
    startPositionRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchMove = React.useCallback<React.TouchEventHandler>((event) => {
    if (!startPositionRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = Math.abs(touch.clientX - startPositionRef.current.x);
    const deltaY = Math.abs(touch.clientY - startPositionRef.current.y);
    if (deltaX <= threshold && deltaY <= threshold) return;
    pannedRef.current = true;
    suppressNextTapRef.current = true;
  }, [threshold]);

  const onTouchEnd = React.useCallback<React.TouchEventHandler>(() => {
    startPositionRef.current = null;
    if (!pannedRef.current) return;
    suppressNextTapRef.current = true;
    scheduleSuppressReset();
  }, [scheduleSuppressReset]);

  const onTouchCancel = React.useCallback<React.TouchEventHandler>(() => {
    startPositionRef.current = null;
    if (!pannedRef.current) return;
    suppressNextTapRef.current = true;
    scheduleSuppressReset();
  }, [scheduleSuppressReset]);

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
    onClickCapture,
  }), [onClickCapture, onTouchCancel, onTouchEnd, onTouchMove, onTouchStart]);

  return {
    handlers,
    shouldSuppressTap,
  };
};

