/**
 * KanbanChecklist — 遞迴渲染 WBS Level 3+ 子節點為待辦清單
 * 設計意圖：在 KanbanCard 內部呈現深層子節點，保留 WBS 階層關係。
 * 每一層透過 depth 增加縮排，點擊勾選方塊直接觸發 useWbsStore 狀態更新。
 * 
 * 【編輯功能】點擊待辦事項標題可行內編輯，Enter 或失焦即儲存，ESC 取消。
 */
import React, { useState, useRef, useEffect } from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import dayjs from 'dayjs';
import { Input } from '../ui/Input';
import type { TaskStatus, TaskNode } from '../../types';

interface KanbanChecklistProps {
  parentId: string;   // 父節點 ID (Level 2 或更深)
  depth?: number;     // 遞迴深度，用於縮排計算
}

/** 狀態對應的背景色 (用於勾選方塊的視覺回饋) */
const statusColorMap: Record<TaskStatus, string> = {
  todo: 'border-slate-300 bg-white',
  in_progress: 'border-blue-400 bg-blue-50',
  completed: 'border-emerald-400 bg-emerald-400',
  delayed: 'border-orange-400 bg-orange-50',
  unsure: 'border-purple-400 bg-purple-50',
  onhold: 'border-slate-300 bg-slate-100',
};

/** 狀態對應的文字色 */
const statusTextMap: Record<TaskStatus, string> = {
  todo: 'text-slate-600',
  in_progress: 'text-blue-600',
  completed: 'text-emerald-600 line-through',
  delayed: 'text-orange-600',
  unsure: 'text-purple-600',
  onhold: 'text-slate-400 line-through',
};

export const KanbanChecklist: React.FC<KanbanChecklistProps> = ({ parentId, depth = 0 }) => {
  // 訂閱該父節點的子節點 ID 陣列
  const childIds = useWbsStore(s => s.parentNodesIndex[parentId]);
  const updateNode = useWbsStore(s => s.updateNode);
  const recalculateAncestorStatus = useWbsStore(s => s.recalculateAncestorStatus);
  const statusFilters = useBoardStore(s => s.statusFilters);

  // 行內編輯狀態管理
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 進入編輯模式時自動聚焦並全選文字
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  /** 開始編輯 */
  const handleStartEdit = (e: React.MouseEvent, child: TaskNode) => {
    e.stopPropagation();
    setEditingId(child.id);
    setEditValue(child.title || '');
  };

  /** 儲存變更 */
  const handleSave = (child: TaskNode) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== child.title) {
      updateNode(child.id, { title: trimmed, updatedAt: Date.now() });
    }
    setEditingId(null);
  };

  /** 鍵盤事件 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, child: TaskNode) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(child);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  // 取得子節點的完整資料，按 order 排序
  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    return (childIds || [])
      .map(id => state.nodes[id])
      .filter(n => n && !n.isArchived && statusFilters[n.status || 'todo'])
      .sort((a, b) => a.order - b.order);
  }, [childIds, statusFilters]);

  // 無子節點則不渲染
  if (children.length === 0) return null;

  /** 
   * 點擊勾選方塊：切換狀態 (todo ↔ completed)
   * 設計意圖：待辦清單的勾選是最直覺的操作，
   * 只需要在 todo 與 completed 之間切換，其餘狀態維持不變。
   */
  const handleToggle = (nodeId: string, currentStatus: TaskStatus) => {
    const newStatus: TaskStatus = currentStatus === 'completed' ? 'todo' : 'completed';
    updateNode(nodeId, { status: newStatus });
    // 觸發祖先節點的 Roll-up 重新計算
    recalculateAncestorStatus(nodeId);
  };

  return (
    <div className={depth === 0 ? 'mt-2 pt-2 border-t border-slate-100' : ''}>
      {children.map(child => {
        const status = child.status || 'todo';
        const isCompleted = status === 'completed';
        // 判斷此子節點是否還有更深的子節點
        const grandchildIds = useWbsStore.getState().parentNodesIndex[child.id];
        const hasGrandchildren = grandchildIds && grandchildIds.length > 0;

        return (
          <div key={child.id}>
            {/* 單一待辦項目列 — 右鍵/長按觸發全域選單 */}
            <div
              className="flex items-center gap-2 py-1 group hover:bg-slate-50 rounded transition-colors"
              style={{ paddingLeft: `${depth * 16 + 4}px` }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                useBoardStore.getState().setContextMenuState({
                  isOpen: true,
                  x: e.clientX,
                  y: e.clientY,
                  nodeId: child.id,
                  title: child.title || '未命名項目'
                });
              }}
            >
              {/* 勾選方塊 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(child.id, status);
                }}
                className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 ${statusColorMap[status]}`}
                title={isCompleted ? '標記為未完成' : '標記為完成'}
              >
                {isCompleted && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              {/* 項目標題 — 行內編輯支援 */}
              {editingId === child.id ? (
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onVoiceResult={setEditValue}
                  onBlur={() => handleSave(child)}
                  onKeyDown={(e) => handleKeyDown(e, child)}
                  onClick={(e) => e.stopPropagation()}
                  voiceEnabled
                  className="h-auto min-w-0 flex-1 rounded border border-primary bg-white px-1 py-0.5 text-xs text-slate-700 outline-none ring-1 ring-primary/30 focus:ring-1 focus:ring-primary/30 focus:ring-offset-0"
                />
              ) : (
                <span
                  className={`text-xs leading-tight flex-1 truncate cursor-text hover:text-primary transition-colors ${statusTextMap[status]}`}
                  onClick={(e) => handleStartEdit(e, child)}
                  title="點擊以編輯待辦事項"
                >
                  {child.title || '未命名項目'}
                </span>
              )}

              {/* 到期日標籤 */}
              {!editingId && child.endDate && (
                <span className="text-[9px] text-slate-400 border border-slate-200 rounded px-1 py-0.5 flex-shrink-0 bg-white ml-1">
                  {dayjs(child.endDate).year() !== dayjs().year() ? dayjs(child.endDate).format('YY/MM/DD') : dayjs(child.endDate).format('MM/DD')}
                </span>
              )}

              {/* 子項目數量指示器 (僅在有更深子節點時顯示) */}
              {hasGrandchildren && (
                <span className="text-[9px] text-slate-400 bg-slate-100 rounded px-1 flex-shrink-0">
                  {grandchildIds.length}
                </span>
              )}
            </div>

            {/* 遞迴渲染更深層的子節點 */}
            {hasGrandchildren && (
              <KanbanChecklist parentId={child.id} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
};
