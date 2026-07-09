/**
 * 拖動感應器配置
 * 設計意圖：支援桌面（滑鼠）和鍵盤無障礙操作。
 *
 * 【響應式政策】任務列、卡片、待辦清單列由整個任務 surface 承接拖曳。
 *   桌機使用 MouseSensor/KeyboardSensor，手機可見任務 surface 交由 compact action rail 長按流程處理。
 *   感應器層會排除互動子元件，避免按鈕、輸入框、選單等操作誤觸拖曳。
 *
 * 【行內編輯保護】Smart*Sensor 集中式防禦：
 *   當鍵盤事件來源是 input/textarea/select/button/contentEditable 等互動元素時，
 *   或指標事件來源是任務內互動控制，或 IME 正在組字時，
 *   在 Sensor 層直接返回 false，不啟動拖曳行為。
 *   無需在任何元件內加 stopPropagation()，未來新增行內編輯自動安全。
 */
import { useSensor, useSensors, MouseSensor, TouchSensor, KeyboardSensor } from '@dnd-kit/core';
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core';

/**
 * Smart*Sensor — 集中式互動控制保護
 *
 * 原理：覆寫 Sensor.activators，在轉發給原始 handler 之前，
 * 先檢查事件來源是否為表單或任務互動元素。若是，直接返回 false 阻止拖曳啟動。
 *
 * 效益：一次設定，全域生效。未來任何新增的行內編輯欄位都自動受到保護，
 * 不需在每個元件的 handleKeyDown 裡加 stopPropagation()。
 */
const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);

const DRAG_SUPPRESSED_SELECTOR = [
    '[contenteditable="true"]',
    '[data-task-interaction-control="true"]',
    '[data-task-primary-action-control="true"]',
    '[data-task-title-input="true"]',
    '[data-filter-menu-panel]',
    '[data-tag-picker-panel]',
    '.global-dialog-content',
].join(',');

const isInteractiveEditingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return INTERACTIVE_TAGS.has(target.tagName) || target.isContentEditable || Boolean(target.closest(DRAG_SUPPRESSED_SELECTOR));
};

class SmartMouseSensor extends MouseSensor {
    static activators = MouseSensor.activators.map((activator) => ({
        ...activator,
        handler: (...args: Parameters<typeof activator.handler>) => {
            const [event] = args;
            const target = (event as React.SyntheticEvent).target;
            if (isInteractiveEditingTarget(target)) {
                return false;
            }
            return activator.handler(...args);
        },
    })) as typeof MouseSensor.activators;
}

class SmartTouchSensor extends TouchSensor {
    static activators = TouchSensor.activators.map((activator) => ({
        ...activator,
        handler: (...args: Parameters<typeof activator.handler>) => {
            const [event] = args;
            const target = (event as React.SyntheticEvent).target;
            if (isInteractiveEditingTarget(target)) {
                return false;
            }
            return activator.handler(...args);
        },
    })) as typeof TouchSensor.activators;
}

class SmartKeyboardSensor extends KeyboardSensor {
    static activators = KeyboardSensor.activators.map((activator) => ({
        ...activator,
        handler: (...args: Parameters<typeof activator.handler>) => {
            const [event] = args;
            const target = (event as React.KeyboardEvent).target;
            const nativeEvent = (event as React.KeyboardEvent).nativeEvent as KeyboardEvent;
            // 若事件來源為互動元素或 IME 組字中，不啟動拖曳
            if (isInteractiveEditingTarget(target) || nativeEvent.isComposing) {
                return false;
            }
            return activator.handler(...args);
        },
    })) as typeof KeyboardSensor.activators;
}

export function useDragSensors(): SensorDescriptor<SensorOptions>[] {
    return useSensors(
        // 桌面滑鼠支援
        useSensor(SmartMouseSensor, {
            activationConstraint: {
                distance: 8, // 移動 8px 後才啟動拖動（避免誤觸）
            },
        }),

        // 鍵盤無障礙支援（已內建行內編輯保護）
        useSensor(SmartTouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 8,
            },
        }),

        useSensor(SmartKeyboardSensor)
    );
}
