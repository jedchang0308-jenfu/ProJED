// @ts-nocheck
import React from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { WbsNodeItem } from './WbsNodeItem';
import { Button } from '../ui/Button';
import { Plus, GitBranch, Link, X, Edit2, ArrowRight } from 'lucide-react';
import type { TaskNode, TaskStatus } from '../../types';
import useDialogStore from '../../store/useDialogStore';

interface WbsListViewProps {
  boardId: string;
}

export const WbsListView: React.FC<WbsListViewProps> = ({ boardId }) => {
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const statusFilters = useBoardStore(s => s.statusFilters);
  const toggleStatusFilter = useBoardStore(s => s.toggleStatusFilter);
  const dependencySelection = useBoardStore(s => s.dependencySelection);
  const setDependencySelection = useBoardStore(s => s.setDependencySelection);
  const dependencyMenuState = useBoardStore(s => s.dependencyMenuState);
  const setDependencyMenuState = useBoardStore(s => s.setDependencyMenuState);
  const { dependencies, addDependency, removeDependency, updateDependency, addNode } = useWbsStore();

  const [showDependencies, setShowDependencies] = React.useState(true);

  // 監聽 ESC 取消依賴選取 / 依賴選單
  React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              if (dependencyMenuState) setDependencyMenuState(null);
              else if (dependencySelection) setDependencySelection(null);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [dependencySelection, dependencyMenuState]);

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
          // 檢查這個端點是否已經有連線，有的話就開 Menu，沒有的話就進入選取模式
          const hasExisting = dependencies.some(
              dep => (dep.fromId === targetId && dep.fromSide === targetSide) || 
                     (dep.toId === targetId && dep.toSide === targetSide)
          );
          if (hasExisting) {
              setDependencyMenuState({ id: targetId, side: targetSide, title: targetTitle });
          } else {
              setDependencySelection({ id: targetId, side: targetSide, title: targetTitle });
          }
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
  }, [dependencySelection, dependencies, addDependency, setDependencySelection, setDependencyMenuState]);

  // 計算依賴關係圖示 (全域 a,b,c 編號)
  const dependencyMarkers = React.useMemo(() => {
      const getLabel = (index: number) => {
          let label = '';
          let i = index;
          while (i >= 0) {
              label = String.fromCharCode(97 + (i % 26)) + label;
              i = Math.floor(i / 26) - 1;
          }
          return label;
      };

      const markers: Record<string, Array<{ id: string, label: string, role: 'active' | 'passive', isSelf?: boolean, offset?: number }>> = {};
      const sortedDeps = [...dependencies].sort((a, b) => a.id.localeCompare(b.id));

      sortedDeps.forEach((dep, index) => {
          const label = getLabel(index);
          const isSelf = dep.fromId === dep.toId;
          
          const fromKey = `${dep.fromId}_${dep.fromSide}`;
          if (!markers[fromKey]) markers[fromKey] = [];
          markers[fromKey].push({ id: dep.id, label, role: 'active', isSelf, offset: dep.offset });

          const toKey = `${dep.toId}_${dep.toSide}`;
          if (!markers[toKey]) markers[toKey] = [];
          markers[toKey].push({ id: dep.id, label, role: 'passive', isSelf, offset: dep.offset });
      });

      return markers;
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
      <div className="flex flex-col w-full h-full bg-white dark:bg-gray-900 overflow-hidden pt-4 px-6 md:px-8 relative">
        

        {/* 依賴選單 Modal (行內) */}
        {dependencyMenuState && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setDependencyMenuState(null)}>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col m-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                            <Link size={16} className="text-blue-500" />
                            <span>{dependencyMenuState.title} ({dependencyMenuState.side === 'start' ? '開始日期' : '結束日期'}) 依賴線設定</span>
                        </h3>
                        <button onClick={() => setDependencyMenuState(null)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="p-3 max-h-[50vh] overflow-y-auto bg-gray-50 dark:bg-gray-900 space-y-2">
                        {dependencies.filter(dep => 
                            (dep.fromId === dependencyMenuState.id && dep.fromSide === dependencyMenuState.side) || 
                            (dep.toId === dependencyMenuState.id && dep.toSide === dependencyMenuState.side)
                        ).map(dep => {
                            const isSelfPassive = dep.toId === dependencyMenuState.id;
                            const otherId = isSelfPassive ? dep.fromId : dep.toId;
                            const otherSide = isSelfPassive ? dep.fromSide : dep.toSide;
                            const otherTitle = getTaskTitle(otherId);
                            
                            return (
                                <div key={dep.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm w-fit ${isSelfPassive ? 'bg-gray-400 text-white' : 'bg-gray-800 text-white'}`}>
                                                {isSelfPassive ? '被動跟隨' : '主動驅動'}
                                            </span>
                                            <div className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                                                <ArrowRight size={14} className={isSelfPassive ? "text-gray-400" : "text-gray-800 dark:text-gray-400"} />
                                                <span>{otherTitle} ({otherSide === 'start' ? '開始日期' : '結束日期'})</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-600 min-w-[60px] text-center">
                                            間隔 {dep.offset || 0} 工作天
                                        </span>
                                        <button 
                                            title="修改天數"
                                            onClick={async () => {
                                                const res = await useDialogStore.getState().showPrompt(`修改與 [${otherTitle}] 的間隔工作天數:\n(請輸入正或負整數)`, String(dep.offset || 0));
                                                if (res !== null && res.trim() !== '') {
                                                    const offset = parseInt(res, 10);
                                                    if (!isNaN(offset)) updateDependency(dep.id, { offset });
                                                }
                                            }}
                                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                        >
                                            <Edit2 size={15} />
                                        </button>
                                        <button 
                                            title="刪除連線"
                                            onClick={() => removeDependency(dep.id)}
                                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}

      {/* 狀態篩選器 + 操作區 */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto no-scrollbar py-1">
          {[
            { key: 'todo', label: '待辦', color: 'bg-status-todo' },
            { key: 'in_progress', label: '進行中', color: 'bg-blue-500' },
            { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
            { key: 'completed', label: '完成', color: 'bg-status-completed' },
            { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
            { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => toggleStatusFilter(s.key as TaskStatus)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all whitespace-nowrap ${
                statusFilters[s.key as TaskStatus]
                  ? 'bg-white border-slate-200 text-slate-700 shadow-sm'
                  : 'bg-slate-50 border-transparent text-slate-300 scale-95 opacity-50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${s.color}`} />
              <span className="text-[10px] sm:text-xs font-bold">{s.label}</span>
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button
              onClick={() => setShowDependencies(prev => !prev)}
              title={showDependencies ? '隱藏日期的關聯線標記' : '顯示日期的關聯線標記'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${
                  showDependencies
                      ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm'
                      : 'bg-gray-50 border-transparent text-gray-400 hover:text-gray-600 dark:bg-gray-800'
              }`}
          >
              <GitBranch size={14} />
              <span>依賴線</span>
          </button>
          
          <Button onClick={handleCreateRootNode} className="flex items-center gap-2 shrink-0">
            <Plus size={18} />
            <span>建立頂層群組</span>
          </Button>
        </div>
      </div>

      {/* 清單容器 */}
      <div className="flex-1 overflow-y-auto w-full pb-20 pr-2 custom-scrollbar">
        {rootNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg text-gray-400">
            <p className="mb-4">此專案目前沒有任何任務或群組</p>
            <Button variant="outline" as any onClick={handleCreateRootNode}>
              開始建立第一個節點
            </Button>
          </div>
        ) : (
          <div className="flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
            {/* Header Column Titles (Tree Grid) */}
            <div className="grid grid-cols-[minmax(300px,1fr)_100px_130px_130px] py-2 px-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 rounded-t-sm text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider sticky top-0 z-10">
                <div className="flex items-center">任務名稱</div>
                <div className="flex items-center">狀態</div>
                <div className="flex items-center">開始日期</div>
                <div className="flex items-center">結束日期</div>
            </div>
            
            {/* 遞迴列表本體 */}
            {rootNodes.map(node => (
              <WbsNodeItem key={node.id} nodeId={node.id} level={0} />
            ))}
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
