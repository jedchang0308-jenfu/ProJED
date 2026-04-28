// @ts-nocheck
/**
 * GlobalContextMenu — 全域任務右鍵/長按漂浮選單
 *
 * 設計意圖：
 *   統一管理所有視圖（清單、看板、甘特、月曆）的任務操作快捷選單。
 *   任何元件只需呼叫 useBoardStore.setContextMenuState 即可觸發此選單，
 *   無需在各視圖內重複建立 UI。
 *
 * 關閉機制：
 *   - 點擊選單外的任意區域
 *   - 按下 Escape 鍵
 *   - 視窗滾動時 (capture phase)
 */
import React, { useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import type { TaskNode } from '../types';

export const GlobalContextMenu: React.FC = () => {
    const contextMenuState = useBoardStore(s => s.contextMenuState);
    const setContextMenuState = useBoardStore(s => s.setContextMenuState);
    const addNode = useWbsStore(s => s.addNode);
    const removeNode = useWbsStore(s => s.removeNode);

    // 監聽全域點擊與滾動以關閉選單
    useEffect(() => {
        if (!contextMenuState) return;

        const close = () => setContextMenuState(null);
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

        // capture phase 捕獲 scroll 事件（包含所有子容器內的滾動）
        window.addEventListener('scroll', close, true);
        window.addEventListener('click', close);
        window.addEventListener('keydown', handleKey);

        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('click', close);
            window.removeEventListener('keydown', handleKey);
        };
    }, [contextMenuState]);

    if (!contextMenuState || !contextMenuState.isOpen) return null;

    // 防止選單超出視窗邊界
    const menuX = Math.min(contextMenuState.x, window.innerWidth - 200);
    const menuY = Math.min(contextMenuState.y, window.innerHeight - 160);

    /** 新增子任務 */
    const handleAddChild = () => {
        const state = useWbsStore.getState();
        const node = state.nodes[contextMenuState.nodeId];
        if (!node) return;

        if (node.status === 'completed') {
            alert('防呆機制：此群組已結案。如需新增任務，請先將此群組的狀態退回「進行中」或「待辦」。');
            setContextMenuState(null);
            return;
        }

        const childrenIds = state.parentNodesIndex[contextMenuState.nodeId] || [];
        const newNode: TaskNode = {
            id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
            workspaceId: node.workspaceId,
            boardId: node.boardId,
            parentId: node.id,
            title: '新任務',
            status: 'todo',
            nodeType: 'task',
            order: childrenIds.length,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        addNode(newNode);
        setContextMenuState(null);
    };

    /** 刪除任務 */
    const handleDelete = () => {
        if (confirm(`確定要刪除「${contextMenuState.title}」嗎？`)) {
            removeNode(contextMenuState.nodeId);
        }
        setContextMenuState(null);
    };

    return (
        <div
            // 阻止點擊選單本身時關閉（讓 window click 事件不向上冒泡）
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 w-52 text-sm flex flex-col"
            style={{ top: menuY, left: menuX }}
        >
            {/* 標題 */}
            <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/50 mb-1">
                <p className="text-xs font-semibold text-gray-500 truncate" title={contextMenuState.title}>
                    {contextMenuState.title}
                </p>
            </div>

            {/* 新增子任務 */}
            <button
                onClick={handleAddChild}
                className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5"
            >
                <Plus size={14} className="text-blue-500 flex-shrink-0" />
                <span>新增子任務</span>
            </button>

            {/* 分隔線 */}
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

            {/* 刪除 */}
            <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2.5"
            >
                <Trash2 size={14} className="text-red-500 flex-shrink-0" />
                <span>刪除任務</span>
            </button>
        </div>
    );
};
