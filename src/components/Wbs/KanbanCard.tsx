/**
 * KanbanCard — 渲染 WBS Level 2 節點為可拖曳的 Kanban 任務卡
 * 設計意圖：取代舊版 Card.tsx，資料來源改為 useWbsStore 的 TaskNode。
 * 卡片內部嵌入 KanbanChecklist 以遞迴呈現 Level 3+ 的待辦清單。
 */
import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Calendar, CheckSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanChecklist } from './KanbanChecklist';
import { Badge } from '../ui/Badge';
import dayjs from 'dayjs';
import type { TaskStatus } from '../../types';

interface KanbanCardProps {
  nodeId: string;       // Level 2 TaskNode 的 ID
  columnId: string;     // 所屬的 Level 1 列表 ID（用於 DnD 跨列識別）
}

/** 狀態色彩對應 */
const statusTextColorMap: Record<TaskStatus, string> = {
  todo: 'text-slate-600',
  in_progress: 'text-blue-600',
  completed: 'text-emerald-500',
  delayed: 'text-orange-500',
  unsure: 'text-purple-500',
  onhold: 'text-slate-400',
};

export const KanbanCard: React.FC<KanbanCardProps> = ({ nodeId, columnId }) => {
  const node = useWbsStore(s => s.nodes[nodeId]);
  const progress = useWbsStore(s => s.getNodeProgress(nodeId));
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);
  const setContextMenuState = useBoardStore(s => s.setContextMenuState);

  // 訂閱子節點 (Level 3) ID 陣列，用於顯示進度統計
  const childIds = useWbsStore(s => s.parentNodesIndex[nodeId]);

  // 計算子節點的完成數量
  const childStats = React.useMemo(() => {
    const state = useWbsStore.getState();
    const children = (childIds || [])
      .map(id => state.nodes[id])
      .filter(n => n && !n.isArchived);
    const total = children.length;
    const completed = children.filter(c => c.status === 'completed').length;
    return { total, completed };
  }, [childIds]);

  // dnd-kit 拖動邏輯
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: nodeId,
    data: {
      type: 'wbs-card',
      nodeId,
      columnId,  // 讓 DragEnd 知道此卡片來自哪一列
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 安全檢查
  if (!node) return null;

  const status = node.status || 'todo';
  const hasChildren = childStats.total > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuState({ isOpen: true, x: e.clientX, y: e.clientY, nodeId, title: node.title });
      }}
      className={`bg-white border border-slate-200 rounded-lg shadow-sm hover:border-primary hover:shadow-md transition-all group mb-2 ${
        isDragging ? 'opacity-50 shadow-2xl scale-105 rotate-2' : ''
      }`}
    >
      <div className="flex items-start gap-2 p-2.5">
        {/* 拖動手柄 */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors p-1 -ml-1 -mt-1 touch-none"
          onClick={(e) => e.stopPropagation()}
          title="拖動卡片"
        >
          <GripVertical size={16} />
        </div>

        {/* 卡片內容 */}
        <div className="flex-1 min-w-0">
          {/* 標題列 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {/* 狀態圓點 */}
              <div className={`w-2 h-2 rounded-full bg-status-${status} flex-shrink-0`} />
              <h4 className={`text-sm font-semibold leading-tight flex-1 truncate ${statusTextColorMap[status]}`}>
                {node.title || '未命名任務'}
              </h4>
            </div>
          </div>

          {/* 日期與進度指標 */}
          {(node.startDate || node.endDate || hasChildren) && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-slate-400">
              {/* 日期區間 */}
              {(node.startDate || node.endDate) && (
                <Badge variant="default" size="sm" icon={<Calendar size={10} />}>
                  <span>{node.startDate ? dayjs(node.startDate).format('MM/DD') : '...'}</span>
                  <span className="opacity-50">→</span>
                  <span>{node.endDate ? dayjs(node.endDate).format('MM/DD') : '...'}</span>
                </Badge>
              )}

              {/* 子節點完成進度 */}
              {hasChildren && (
                <Badge
                  variant={childStats.completed === childStats.total ? 'success' : 'default'}
                  size="sm"
                  icon={<CheckSquare size={10} />}
                >
                  <span className="font-bold">{childStats.completed}/{childStats.total}</span>
                </Badge>
              )}
            </div>
          )}

          {/* 進度條 (僅在有子節點時顯示) */}
          {hasChildren && (
            <div className="mt-2">
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    progress === 100 ? 'bg-emerald-400' : progress > 0 ? 'bg-blue-400' : 'bg-slate-200'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Level 3+ 待辦清單展開區 */}
          {hasChildren && (
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsChecklistExpanded(!isChecklistExpanded);
                }}
                className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                {isChecklistExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{isChecklistExpanded ? '收合' : '展開'}待辦清單</span>
              </button>

              {isChecklistExpanded && (
                <KanbanChecklist parentId={nodeId} depth={0} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
