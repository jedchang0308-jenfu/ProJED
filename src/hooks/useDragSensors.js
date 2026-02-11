import { useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from '@dnd-kit/core';

/**
 * 拖動感應器配置
 * 支援桌面（滑鼠）、觸控裝置（手機/平板）和鍵盤無障礙操作
 * 預留未來 Capacitor APP 化的擴充性
 */
export function useDragSensors() {
    return useSensors(
        // 桌面滑鼠/觸控板支援
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 移動 8px 後才啟動拖動（避免誤觸）
            },
        }),

        // 觸控裝置支援（手機/平板）
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,      // 長按 250ms 後啟動拖動
                tolerance: 5,    // 容許 5px 的手指抖動
            },
        }),

        // 鍵盤無障礙支援
        // Space/Enter 選取，方向鍵移動，Esc 取消
        useSensor(KeyboardSensor)
    );
}
