/**
 * 拖動感應器配置
 * 設計意圖：支援桌面（滑鼠）和鍵盤無障礙操作。
 *
 * 【響應式政策】滑鼠與觸控拖曳都只由明確的拖曳把手啟動。
 *   手機端與桌機端共用同一顆 TaskDragHandle，差異只交給 CSS 觸控熱區處理。
 *   手機端仍支援長按 500ms 開啟右鍵選單（useLongPress Hook）。
 *
 * 【行內編輯保護】SmartKeyboardSensor 集中式防禦：
 *   當鍵盤事件來源是 input/textarea/select/button 等互動元素時，
 *   在 Sensor 層直接返回 false，不啟動拖曳行為。
 *   無需在任何元件內加 stopPropagation()，未來新增行內編輯自動安全。
 */
import { useSensor, useSensors, MouseSensor, TouchSensor, KeyboardSensor } from '@dnd-kit/core';
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core';

/**
 * SmartKeyboardSensor — 集中式行內編輯保護
 *
 * 原理：覆寫 KeyboardSensor.activators，在轉發給原始 handler 之前，
 * 先檢查事件來源是否為表單互動元素。若是，直接返回 false 阻止拖曳啟動。
 *
 * 效益：一次設定，全域生效。未來任何新增的行內編輯欄位都自動受到保護，
 * 不需在每個元件的 handleKeyDown 裡加 stopPropagation()。
 */
const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

class SmartKeyboardSensor extends KeyboardSensor {
    static activators = KeyboardSensor.activators.map((activator) => ({
        ...activator,
        handler: (...args: Parameters<typeof activator.handler>) => {
            const [event] = args;
            const target = (event as React.KeyboardEvent).target;
            // 若事件來源為互動元素（表單欄位），不啟動拖曳
            if (target instanceof HTMLElement && INTERACTIVE_TAGS.has(target.tagName)) {
                return false;
            }
            return activator.handler(...args);
        },
    })) as typeof KeyboardSensor.activators;
}

export function useDragSensors(): SensorDescriptor<SensorOptions>[] {
    return useSensors(
        // 桌面滑鼠支援
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8, // 移動 8px 後才啟動拖動（避免誤觸）
            },
        }),

        // 鍵盤無障礙支援（已內建行內編輯保護）
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 120,
                tolerance: 14,
            },
        }),

        useSensor(SmartKeyboardSensor)
    );
}
