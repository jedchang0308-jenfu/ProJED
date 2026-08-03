/**
 * useLongPress — 觸控長按識別 Hook
 *
 * 設計意圖：
 *   手機端 task surface 採 pan-first: quick tap 開詳情、short pan 捲動、
 *   long press 進入 compact action rail / drag-action mode。
 *
 *   此 Hook 透過「獨立計時器」識別長按行為：
 *   - touchstart：啟動長按計時器（預設 delay: 500ms）
 *   - touchmove：若手指位移超過容差值（tolerance: 8px），取消計時器並保留 pan-first
 *   - touchend：在計時器觸發前放開手指，視為一般點擊，取消計時器
 *
 *   手機 task drag 由 dedicated long-press session 管理；使用者靜止長按 500ms，
 *   才會觸發 onLongPress 回調（compact action rail / drag-action mode）。
 */

import { useRef, useCallback, useEffect } from 'react';

interface UseLongPressOptions {
  /** 長按觸發所需的靜止時間（ms） */
  delay?: number;
  /** 允許的手指位移容差（px），超過此值視為 pan 意圖，取消長按 */
  tolerance?: number;
}

interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onMouseDownCapture: (e: React.MouseEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onContextMenuCapture: (e: React.MouseEvent) => void;
}

export function useLongPress(
  onLongPress: (e: React.TouchEvent) => void,
  { delay = 500, tolerance = 8 }: UseLongPressOptions = {}
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPositionRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPositionRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (suppressClickTimerRef.current) {
        clearTimeout(suppressClickTimerRef.current);
      }
    };
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      triggeredRef.current = false;
      const touch = e.touches[0];
      startPositionRef.current = { x: touch.clientX, y: touch.clientY };

      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        suppressNextClickRef.current = true;
        if (suppressClickTimerRef.current) {
          clearTimeout(suppressClickTimerRef.current);
        }
        suppressClickTimerRef.current = setTimeout(() => {
          suppressNextClickRef.current = false;
          suppressClickTimerRef.current = null;
        }, 700);
        onLongPress(e);
      }, delay);
    },
    [cancel, onLongPress, delay]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPositionRef.current) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startPositionRef.current.x);
      const deltaY = Math.abs(touch.clientY - startPositionRef.current.y);

      // 若手指移動超過容差，判定為滑動/拖曳，取消長按計時器
      if (deltaX > tolerance || deltaY > tolerance) {
        cancel();
      }
    },
    [cancel, tolerance]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (triggeredRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
      cancel();
    },
    [cancel]
  );

  const onTouchCancel = useCallback(
    () => {
      cancel();
    },
    [cancel]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || !startPositionRef.current) return;
      const deltaX = Math.abs(e.clientX - startPositionRef.current.x);
      const deltaY = Math.abs(e.clientY - startPositionRef.current.y);
      if (deltaX > tolerance || deltaY > tolerance) cancel();
    },
    [cancel, tolerance]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') cancel();
    },
    [cancel]
  );

  const onPointerCancel = onPointerUp;

  const suppressCompatibilityEvent = useCallback((e: React.MouseEvent) => {
    if (!suppressNextClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onMouseDownCapture = suppressCompatibilityEvent;
  const onClickCapture = suppressCompatibilityEvent;
  const onContextMenuCapture = suppressCompatibilityEvent;

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onMouseDownCapture,
    onClickCapture,
    onContextMenuCapture,
  };
}
