import React from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore'; // 引入舊 store 以取得全域環境變數
import { WbsNodeItem } from './WbsNodeItem';
import { Button } from '../ui/Button';
import { Plus } from 'lucide-react';
import type { TaskNode } from '../../types';

interface WbsListViewProps {
  boardId: string;
}

export const WbsListView: React.FC<WbsListViewProps> = ({ boardId }) => {
  const addNode = useWbsStore(s => s.addNode);
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);

  // ✅ 使用 Stable Selector 訂閱「索引陣列」，避免 Zustand 無限 Render Loop
  const rootIds = useWbsStore(s => s.parentNodesIndex['root']);
  const altRootIds = useWbsStore(s => s.parentNodesIndex[boardId]);

  // ✅ 只有當索引陣列變更時 (Add/Remove/Move)，才重新評估根節點集合
  const rootNodes = React.useMemo(() => {
      const state = useWbsStore.getState();
      const arr1 = (rootIds || []).map(id => state.nodes[id]).filter(node => node && node.boardId === boardId);
      const arr2 = (altRootIds || []).map(id => state.nodes[id]).filter(Boolean);
      return [...arr1, ...arr2].sort((a, b) => a.order - b.order);
  }, [rootIds, altRootIds, boardId]);

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
    <div className="flex flex-col w-full h-full bg-white dark:bg-gray-900 overflow-hidden pt-4 px-6 md:px-8">
      
      {/* 標題與操作區 */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">WBS 任務清單</h2>
          <p className="text-sm text-gray-500 mt-1">樹狀階層結構 (Adjacency List)</p>
        </div>
        
        <Button onClick={handleCreateRootNode} className="flex items-center gap-2">
          <Plus size={18} />
          <span>建立頂層群組</span>
        </Button>
      </div>

      {/* 清單容器 */}
      <div className="flex-1 overflow-y-auto w-full pb-20 pr-2 custom-scrollbar">
        {rootNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg text-gray-400">
            <p className="mb-4">此專案目前沒有任何任務或群組</p>
            <Button variant="outline" onClick={handleCreateRootNode}>
              開始建立第一個節點
            </Button>
          </div>
        ) : (
          <div className="flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
            {/* Header Column Titles (Tree Grid) */}
            <div className="grid grid-cols-[minmax(300px,1fr)_100px_130px_130px_80px] py-2 px-4 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 rounded-t-sm text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider sticky top-0 z-10">
                <div className="flex items-center">任務名稱</div>
                <div className="flex items-center">狀態</div>
                <div className="flex items-center">開始日期</div>
                <div className="flex items-center">結束日期</div>
                <div className="flex items-center justify-end pr-2">動作</div>
            </div>
            
            {/* 遞迴列表本體 */}
            {rootNodes.map(node => (
              <WbsNodeItem key={node.id} nodeId={node.id} level={0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
