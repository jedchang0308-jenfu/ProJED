import React from 'react';
import {
  DndContext,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type SensorDescriptor,
} from '@dnd-kit/core';
import type { SensorOptions } from '@dnd-kit/core';
import DesktopTaskDragLayer from './DesktopTaskDragLayer';

export type DesktopTaskDragHostProps = {
  sensors?: SensorDescriptor<SensorOptions>[];
  collisionDetection?: CollisionDetection;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onPointerMove?: (point: { x: number; y: number }) => void;
  onExternalInvalidate?: (reason: 'scroll' | 'resize' | 'orientationchange') => void;
  children: React.ReactNode;
  overlay?: React.ReactNode;
};

/**
 * One desktop drag lifecycle host shared by Board and Goal. The host owns the
 * terminal guard so cancel/end cannot both commit a session; surface adapters
 * and presenters remain pure children of this boundary.
 */
export const DesktopTaskDragHost: React.FC<DesktopTaskDragHostProps> = ({
  sensors,
  collisionDetection,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragCancel,
  onDragEnd,
  onPointerMove,
  onExternalInvalidate,
  children,
  overlay,
}) => {
  const sessionActiveRef = React.useRef(false);
  const terminalRef = React.useRef(false);
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);
  const activeStartRef = React.useRef<DragStartEvent | null>(null);
  const clearTransientSession = React.useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    pointerRef.current = null;
    activeStartRef.current = null;
  }, []);
  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    sessionActiveRef.current = true;
    terminalRef.current = false;
    activeStartRef.current = event;
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerType === 'touch') return;
      pointerRef.current = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      onPointerMove?.(pointerRef.current);
    };
    const handleExternalCancel = (reason?: 'resize' | 'orientationchange') => {
      if (!sessionActiveRef.current || terminalRef.current) return;
      terminalRef.current = true;
      sessionActiveRef.current = false;
      const active = activeStartRef.current?.active;
      clearTransientSession();
      if (reason) onExternalInvalidate?.(reason);
      if (active) onDragCancel?.({ active } as DragCancelEvent);
    };
    const handlePointerCancel = () => handleExternalCancel();
    const handleBlur = () => handleExternalCancel();
    const handlePageHide = () => handleExternalCancel();
    const handleVisibilityChange = () => {
      // Treat either visibility signal as authoritative.  Some embedded
      // browsers expose a writable `visibilityState` while leaving
      // `document.hidden` unchanged; a drag must still terminate before the
      // browser can deliver a late pointer-up to the old target.
      if (document.hidden || document.visibilityState !== 'visible') handleExternalCancel();
    };
    const handleScroll = () => onExternalInvalidate?.('scroll');
    const handleResize = () => handleExternalCancel('resize');
    const handleOrientationChange = () => handleExternalCancel('orientationchange');
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') handleExternalCancel();
    };
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    window.addEventListener('blur', handleBlur, true);
    window.addEventListener('pagehide', handlePageHide, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize, true);
    window.addEventListener('orientationchange', handleOrientationChange, true);
    window.addEventListener('keydown', handleKeyDown, true);
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
      window.removeEventListener('blur', handleBlur, true);
      window.removeEventListener('pagehide', handlePageHide, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize, true);
      window.removeEventListener('orientationchange', handleOrientationChange, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
    onDragStart?.(event);
  }, [clearTransientSession, onDragCancel, onDragStart, onExternalInvalidate, onPointerMove]);
  const handleDragCancel = React.useCallback((event: DragCancelEvent) => {
    if (!sessionActiveRef.current || terminalRef.current) return;
    terminalRef.current = true;
    sessionActiveRef.current = false;
    clearTransientSession();
    onDragCancel?.(event);
  }, [clearTransientSession, onDragCancel]);
  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    if (!sessionActiveRef.current || terminalRef.current) return;
    terminalRef.current = true;
    sessionActiveRef.current = false;
    clearTransientSession();
    onDragEnd?.(event);
  }, [clearTransientSession, onDragEnd]);

  React.useEffect(() => () => {
    clearTransientSession();
    sessionActiveRef.current = false;
    terminalRef.current = true;
  }, [clearTransientSession]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DesktopTaskDragLayer>{overlay}</DesktopTaskDragLayer>
    </DndContext>
  );
};

export default DesktopTaskDragHost;
