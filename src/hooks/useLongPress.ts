/**
 * useLongPress — 觸控長按識別 Hook
 *
 * 設計意圖：
 *   手機端因 TouchSensor（delay: 250ms）會攔截所有長按事件以啟動拖曳，
 *   導致 onContextMenu 無法在手機端穩定觸發。
 *
 *   此 Hook 透過「獨立計時器」識別長按行為：
 *   - touchstart：啟動長按計時器（delay: 500ms，長於拖曳的 250ms）
 *   - touchmove：若手指位移超過容差值（tolerance: 8px），取消計時器（交由拖曳接管）
 *   - touchend：在計時器觸發前放開手指，視為一般點擊，取消計時器
 *
 *   由於長按時間窗（500ms）> 拖曳啟動時間（250ms），若使用者意圖拖曳，
 *   手指移動會先取消長按計時器，dnd-kit 正常接管。
 *   若使用者靜止長按 500ms，才會觸發 onLongPress 回調（開啟右鍵選單）。
 */

import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  /** 長按觸發所需的靜止時間（ms），建議設為 dnd-kit TouchSensor delay 的兩倍 */
  delay?: number;
  /** 允許的手指位移容差（px），超過此值視為拖曳意圖，取消長按 */
  tolerance?: number;
}

interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useLongPress(
  onLongPress: (e: React.TouchEvent) => void,
  { delay = 500, tolerance = 8 }: UseLongPressOptions = {}
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPositionRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPositionRef.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      triggeredRef.current = false;
      const touch = e.touches[0];
      startPositionRef.current = { x: touch.clientX, y: touch.clientY };

      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        onLongPress(e);
      }, delay);
    },
    [onLongPress, delay]
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
    (_e: React.TouchEvent) => {
      cancel();
    },
    [cancel]
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
