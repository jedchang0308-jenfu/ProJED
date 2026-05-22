// @ts-nocheck
import React, { useState } from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { WbsNodeItem } from './WbsNodeItem';
import { Button } from '../ui/Button';
import { Plus, GitBranch, Link, X, Edit2, ArrowRight, Trash2 } from 'lucide-react';
import type { TaskNode, TaskStatus } from '../../types';
import useDialogStore from '../../store/useDialogStore';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../../hooks/useDragSensors';
import { StatusFilterBar } from '../ui/StatusFilterBar';

interface WbsListViewProps {
  boardId: string;
}

export const WbsListView: React.FC<WbsListViewProps> = ({ boardId }) => {
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const statusFilters = useBoardStore(s => s.statusFilters);
  const dependencySelection = useBoardStore(s => s.dependencySelection);
  const setDependencySelection = useBoardStore(s => s.setDependencySelection);
  // 從全域 Store 取出顯示狀態
  const showDependencies = useBoardStore(s => s.showDependencies);
  const showStartDate = useBoardStore(s => s.showStartDate);
  const { dependencies, addDependency, removeDependency, updateDependency, addNode, updateNode } = useWbsStore();

  // DnD 狀態
  const sensors = useDragSensors();
  const [activeSortableItem, setActiveSortableItem] = useState<TaskNode | null>(null);

  const handleDragEnd = (event: any) => {
      const { active, over } = event;
      setActiveSortableItem(null);
      if (!over || active.id === over.id) return;

      const activeItem = active.data.current?.item;
      const overItem = over.data.current?.item;
      if (!activeItem || !overItem) return;

      if (activeItem.parentId === overItem.parentId) {
          // 同層級交換順序
          const tempOrder = activeItem.order;
          updateNode(activeItem.id, { order: overItem.order });
          updateNode(overItem.id, { order: tempOrder });
      } else {
          // 跨層級移動
          updateNode(activeItem.id, { parentId: overItem.parentId, order: overItem.order + 0.5 });
      }
  };

  // 監聽 ESC 取消依賴選取
  React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              if (dependencySelection) setDependencySelection(null);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [dependencySelection]);

  // 取得任意節點名稱
  const getTaskTitle = (id: string) => {
      const node = useWbsStore.getState().nodes[id];
      return node ? node.title : '未知任務';
  };

  /**
   * 處理依賴關係的點擊選取（復刻舊版行內點選邏輯）
   */
  const handleDependencySelect = React.useCallback(async (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => {
      if (!dependencySelection) {
          // 選取模式外的點擊已被移除或忽略，這裡直接 return
          return;
      } else {
          // 正在選取模式中，現在點擊的是目標
          if (dependencySelection.id === targetId && dependencySelection.side === targetSide) {
              // 點同一個端點，取消選取
              setDependencySelection(null);
              return;
          }

          const isSelfDependency = dependencySelection.id === targetId;

          if (isSelfDependency && targetSide === 'end' && dependencySelection.side === 'start') {
              useDialogStore.getState().showConfirm('系統提示：您試圖在同一任務建立「結束日跟隨開始日」的自我連線\n請由「結束日」的圓點「開始日」來設定順序與工期天數。');
              setDependencySelection(null);
              return;
          }

          // 如果是同一任務，表示設定自己的工期 (start -> end)
          const promptMessage = isSelfDependency
              ? `請設定此任務 [${dependencySelection.title}] 的工作天數:\n(預設為 0 代表「首尾同天」，輸入 1 代表首尾跨兩天，以此類推)`
              : `請設定 [${dependencySelection.title}] 依賴於 [${targetTitle}] 的間隔工作天數:\n(零天表示銜接，負數為重疊，正數為延遲)`;

          const offsetStr = await useDialogStore.getState().showPrompt(promptMessage, '0');
          if (offsetStr !== null && offsetStr.trim() !== '') {
              const offset = parseInt(offsetStr, 10);
              if (!isNaN(offset)) {
                  addDependency({
                      fromId: targetId,
                      fromSide: targetSide,
                      toId: dependencySelection.id,
                      toSide: dependencySelection.side,
                      offset
                  });
              }
          }
          setDependencySelection(null);
      }
  }, [dependencySelection, dependencies, addDependency, setDependencySelection]);

  // 計算依賴關係圖示 (全域 a,b,c 編號)
  const dependencyMarkers = React.useMemo(() => {
      return useWbsStore.getState().getDependencyMarkers();
  }, [dependencies]);

  // 利用 Context 提供遞迴子元件存取
  const dependencyContextValue = React.useMemo(() => ({
      showDependencies,
      handleDependencySelect,
      dependencySelection,
      dependencyMarkers,
      dependencies
  }), [showDependencies, handleDependencySelect, dependencySelection, dependencyMarkers, dependencies]);

  // ===== 列表計算 =====
  const rootIds = useWbsStore(s => s.parentNodesIndex['root']);
  const altRootIds = useWbsStore(s => s.parentNodesIndex[boardId]);

  // ✅ 只有當索引陣列變更時 (Add/Remove/Move)，才重新評估根節點集合
  const rootNodes = React.useMemo(() => {
      const state = useWbsStore.getState();
      const arr1 = (rootIds || []).map(id => state.nodes[id]).filter(node => node && node.boardId === boardId && !node.isArchived && statusFilters[node.status || 'todo']);
      const arr2 = (altRootIds || []).map(id => state.nodes[id]).filter(node => node && !node.isArchived && statusFilters[node.status || 'todo']);
      return [...arr1, ...arr2].sort((a, b) => a.order - b.order);
  }, [rootIds, altRootIds, boardId, statusFilters]);

  const handleCreateRootNode = () => {
    const newNode: TaskNode = {
      id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      workspaceId: activeWorkspaceId || '', 
      boardId: boardId,
      parentId: null, // 頂層節點沒有 parentId
      title: '新群組/任務',
      status: 'todo',
      nodeType: 'group', // 預設頂層可能為群組，若不要也可以設定為 task
      order: rootNodes.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    addNode(newNode);
  };

  return (
    <WbsDependencyContext.Provider value={dependencyContextValue}>
      <div className="flex flex-col w-full h-full bg-white overflow-hidden pt-4 px-6 md:px-8 relative">
        

        {/* 依賴選單 Modal 已經移除，統一由右鍵選單進入選取模式 */}

      {/* 狀態篩選器 + 操作區 */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 shrink-0">
        <StatusFilterBar />
        
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <Button onClick={handleCreateRootNode} className="flex items-center gap-2 shrink-0">
            <Plus size={18} />
            <span>建立頂層群組</span>
          </Button>
        </div>
      </div>

      {/* 依賴關係選取模式橫幅 (與看板模式一致) */}
      {dependencySelection && (
          <div className="mb-4 shrink-0 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2.5 text-amber-700 text-sm font-semibold">
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
                  </div>
                  <span>
                      選取模式：已選取 <strong className="text-amber-800">[{dependencySelection.title}]</strong> 的
                      <span className={`mx-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${dependencySelection.side === 'start' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-purple-100 text-purple-700 border border-purple-200'}`}>
                          {dependencySelection.side === 'start' ? '開始日期' : '結束日期'}
                      </span>
                      — 請點擊清單中任一任務的「日期」作為依賴目標
                  </span>
              </div>
              <button
                  onClick={() => setDependencySelection(null)}
                  className="bg-white border border-amber-200 text-amber-600 hover:bg-amber-100 hover:text-amber-700 text-xs font-bold px-3 py-1.5 rounded-md transition-all flex-shrink-0 shadow-sm active:scale-95"
              >
                  取消 (ESC)
              </button>
          </div>
      )}

      {/* 清單容器 */}
      <div className="flex-1 overflow-y-auto w-full pb-20 pr-2 custom-scrollbar">
        {rootNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
            <p className="mb-4">此專案目前沒有任何任務或群組</p>
            <Button variant="outline" as any onClick={handleCreateRootNode}>
              開始建立第一個節點
            </Button>
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm relative">
            {/* Header Column Titles (Tree Grid) */}
            <div className={`grid ${showStartDate ? 'grid-cols-[minmax(300px,1fr)_100px_100px_130px_130px_80px]' : 'grid-cols-[minmax(300px,1fr)_100px_100px_130px_80px]'} py-2 px-4 bg-slate-50 border-b border-slate-200 rounded-t-sm text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10`}>
                <div className="flex items-center pl-[28px]">任務名稱</div>
                <div className="flex items-center">負責人</div>
                <div className="flex items-center">狀態</div>
                {showStartDate && <div className="flex items-center">開始日期</div>}
                <div className="flex items-center">結束日期</div>
                <div className="flex items-center">工期(天)</div>
            </div>
            
            {/* 遞迴列表本體包裝 DnD */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={(e) => setActiveSortableItem(e.active.data.current?.item)}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={rootNodes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                    {rootNodes.map(node => (
                        <WbsNodeItem key={node.id} nodeId={node.id} level={0} />
                    ))}
                </SortableContext>
                
                <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                    {activeSortableItem ? (
                        <div className="opacity-95 shadow-2xl border border-slate-200 bg-white rounded overflow-hidden ring-2 ring-primary/30 cursor-grabbing rotate-1 scale-[1.02] transform-gpu pointer-events-none z-50">
                            <WbsNodeItem nodeId={activeSortableItem.id} level={0} />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
          </div>
        )}
      </div>
    </div>
    </WbsDependencyContext.Provider>
  );
};

// 匯出 Context 以供 WbsNodeItem 讀取
export const WbsDependencyContext = React.createContext<{
    showDependencies: boolean;
    handleDependencySelect: (id: string, side: 'start'|'end', title: string) => void;
    dependencySelection: { id: string; side: 'start'|'end'; title: string } | null;
    dependencyMarkers: Record<string, Array<{ id: string, label: string, role: 'active' | 'passive', isSelf?: boolean, offset?: number }>>;
    dependencies: import('../../types').Dependency[];
} | null>(null);
