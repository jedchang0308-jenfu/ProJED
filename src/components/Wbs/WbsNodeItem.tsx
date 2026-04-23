import React, { useState } from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore'; // 引入舊 store
import type { TaskNode, TaskStatus } from '../../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore'; // Optional if needed for new tasks

interface WbsNodeItemProps {
  nodeId: string;
  level?: number;
}

export const WbsNodeItem: React.FC<WbsNodeItemProps> = ({ nodeId, level = 0 }) => {
  const node = useWbsStore(s => s.nodes[nodeId]); // ✅ 從 Store 中 Reactively 綁定該節點的最新狀態
  const [isExpanded, setIsExpanded] = useState(true);
  
  // 安全檢查，避免節點已被砍除仍在渲染導致 crash
  if (!node) return null;

  const [localTitle, setLocalTitle] = useState(node.title);
  const [localStartDate, setLocalStartDate] = useState(node.startDate || '');
  const [localEndDate, setLocalEndDate] = useState(node.endDate || '');

  const updateNode = useWbsStore(s => s.updateNode);
  const addNode = useWbsStore(s => s.addNode);
  const removeNode = useWbsStore(s => s.removeNode);
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  
  // ✅ 使用 Stable Selector 訂閱「子節點 ID 陣列」，避免 Zustand 無限 Render Loop
  const childrenIds = useWbsStore(s => s.parentNodesIndex[nodeId]); 
  
  // ✅ 只有當 childrenIds 陣列變更時，才重新抓取最新的 node references
  const children = React.useMemo(() => {
      const state = useWbsStore.getState();
      return (childrenIds || []).map(id => state.nodes[id]).filter(Boolean).sort((a,b) => a.order - b.order);
  }, [childrenIds]);

  const hasChildren = children.length > 0;
  const progress = useWbsStore(s => s.getNodeProgress(nodeId)); // 進度是原始型別 (number)，安全且具備 Reactive

  // 緊湊的縮排 (使用 1.25rem 取代原本的 1.5rem 以節省空間)
  const indentPadding = level * 1.25;

  const handleToggle = () => setIsExpanded(!isExpanded);

  const handleAddChild = () => {
    // 防呆機制：結案不可新增偷渡
    if (node.status === 'completed') {
        alert('防呆機制：此群組已結案。如需新增任務，請先將此群組的狀態退回「進行中」或「待辦」。');
        return;
    }

    const newNode: TaskNode = {
      id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      workspaceId: activeWorkspaceId || '',
      boardId: node.boardId,
      parentId: node.id,
      title: '新任務',
      status: 'todo',
      nodeType: 'task',
      order: children.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    addNode(newNode);
    setIsExpanded(true);
  };

  const handleDelete = () => {
    if (confirm(`確定要刪除「${node.title}」嗎？`)) {
        removeNode(node.id);
    }
  };

  // ----- 行內編輯處理 -----
  const handleTitleBlur = () => {
    if (localTitle.trim() !== node.title) {
        updateNode(node.id, { title: localTitle.trim() || '未命名任務' });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
    }
  };

  // ----- 日期防呆機制 (Date Boundary Protection) -----
  const validateDateBoundary = (fieldType: 'startDate' | 'endDate', newValue: string): boolean => {
      // 允許清除日期
      if (!newValue) return true;

      const currentStart = fieldType === 'startDate' ? newValue : localStartDate;
      const currentEnd = fieldType === 'endDate' ? newValue : localEndDate;

      // 1. 自身邏輯防呆 (Self-consistency)
      if (currentStart && currentEnd && currentStart > currentEnd) {
          alert('防呆機制：結束日期不得早於開始日期。');
          return false;
      }

      // 2. 父節點約束條件 (Top-down constraints)
      const state = useWbsStore.getState();
      const parentNode = node.parentId ? state.nodes[node.parentId] : null;

      if (parentNode) {
          const pStart = parentNode.startDate;
          const pEnd = parentNode.endDate;

          if (pStart && newValue < pStart) {
              alert(`防呆機制：子任務的日期不得超出父層級的範圍\n(父層最早開始日期為 ${pStart})`);
              return false;
          }
          if (pEnd && newValue > pEnd) {
              alert(`防呆機制：子任務的日期不得超出父層級的範圍\n(父層最晚結束日期為 ${pEnd})`);
              return false;
          }
      }

      // 3. 子節點約束條件 (Bottom-up constraints)
      const childrenIds = state.parentNodesIndex[node.id] || [];
      if (childrenIds.length > 0) {
          const childrenNodes = childrenIds.map(cid => state.nodes[cid]).filter(Boolean);
          
          if (fieldType === 'startDate') {
              for (const child of childrenNodes) {
                  if (child.startDate && newValue > child.startDate) {
                      alert(`防呆機制：父群組的開始日期不能晚於其子任務\n(子任務「${child.title}」已排定於 ${child.startDate} 開始)`);
                      return false;
                  }
              }
          }

          if (fieldType === 'endDate') {
              for (const child of childrenNodes) {
                  if (child.endDate && newValue < child.endDate) {
                      alert(`防呆機制：父群組的結束日期不能早於其子任務\n(子任務「${child.title}」排定至 ${child.endDate} 才結束)`);
                      return false;
                  }
              }
          }
      }

      return true;
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!validateDateBoundary('startDate', val)) {
          e.target.value = localStartDate; // 拒絕變更，強制將這一次的前端 DOM 輸入復原
          return;
      }

      setLocalStartDate(val);
      updateNode(node.id, { startDate: val });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!validateDateBoundary('endDate', val)) {
          e.target.value = localEndDate; // 拒絕變更，強制將這一次的前端 DOM 輸入復原
          return;
      }

      setLocalEndDate(val);
      updateNode(node.id, { endDate: val });
  };

  // 渲染狀態與 Badge 色系
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'primary';
      case 'delayed': return 'danger';
      case 'onhold': return 'warning';
      default: return 'secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
        case 'completed': return '完成';
        case 'in_progress': return '進行中';
        case 'delayed': return '延遲';
        case 'todo': return '待辦';
        case 'unsure': return '未定';
        case 'onhold': return '暫停';
        default: return status;
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      updateNode(nodeId, { status: e.target.value as TaskStatus });
  };

  // 生成 Native Select 專用 Tailwind Class
  const getStatusSelectClass = (status: string) => {
    const baseClass = "w-20 text-[11px] py-1 px-1 rounded border outline-none cursor-pointer appearance-none text-center font-medium transition-colors";
    switch (status) {
      case 'completed': return `${baseClass} bg-green-50 text-green-700 border-green-200 hover:bg-green-100 focus:ring-1 focus:ring-green-400`;
      case 'in_progress': return `${baseClass} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 focus:ring-1 focus:ring-blue-400`;
      case 'delayed': return `${baseClass} bg-red-50 text-red-700 border-red-200 hover:bg-red-100 focus:ring-1 focus:ring-red-400`;
      case 'onhold': return `${baseClass} bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 focus:ring-1 focus:ring-amber-400`;
      default: return `${baseClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 focus:ring-1 focus:ring-gray-400`;
    }
  };

  return (
    <>
      <div className="grid grid-cols-[minmax(300px,1fr)_100px_130px_130px_80px] items-center py-1 px-4 border-b border-gray-200 dark:border-gray-800/50 group hover:bg-white dark:hover:bg-gray-800 transition-colors bg-gray-50/50 dark:bg-transparent text-sm">
        
        {/* Col 1: 任務名稱與階層結構 */}
        <div className="flex items-center gap-1.5 overflow-hidden pr-4" style={{ paddingLeft: `${indentPadding}rem` }}>
          <button 
            onClick={handleToggle}
            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-400 ${!hasChildren && 'invisible'}`}
            title={isExpanded ? '收合' : '展開'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {node.nodeType === 'group' ? (
              <span className="flex-shrink-0 text-[10px] text-blue-600 border border-blue-300 bg-blue-50 px-1 py-0.5 rounded leading-none mr-1">Group</span>
          ) : node.nodeType === 'milestone' ? (
              <span className="flex-shrink-0 text-[10px] text-amber-600 border border-amber-300 bg-amber-50 px-1 py-0.5 rounded leading-none mr-1">MS</span>
          ) : null}

          {/* 表格感 Input：透明背景、無邊框、focus時顯示底線或底色 */}
          <input
             type="text"
             value={localTitle}
             onChange={(e) => setLocalTitle(e.target.value)}
             onBlur={handleTitleBlur}
             onKeyDown={handleTitleKeyDown}
             className={`flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none focus:bg-white dark:focus:bg-gray-900 px-1 py-0.5 transition-all truncate text-sm ${node.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}
             placeholder="任務名稱"
          />

          <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
              <div className={`w-full bg-gray-200 dark:bg-gray-700 overflow-hidden ${hasChildren ? 'h-1.5 rounded-full' : 'h-1 rounded-sm opacity-70'}`}>
                  <div 
                  className={`h-full ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'} transition-all`} 
                  style={{ width: `${progress}%` }} 
                  />
              </div>
              <span className={`text-[10px] min-w-[2.5ch] text-right font-medium ${progress === 100 ? 'text-green-600 dark:text-green-500' : 'text-gray-500'}`}>
                  {progress}%
              </span>
          </div>
        </div>

        {/* Col 2: 狀態 (原生 Select 偽裝 Badge) */}
        <div className="flex items-center">
            <select
                value={node.status}
                onChange={handleStatusChange}
                onClick={(e) => e.stopPropagation()}
                className={getStatusSelectClass(node.status)}
                title="修改狀態"
            >
                <option value="todo">待辦</option>
                <option value="in_progress">進行中</option>
                <option value="delayed">延遲</option>
                <option value="onhold">暫停</option>
                <option value="completed">完成</option>
                <option value="unsure">未定</option>
            </select>
        </div>

        {/* Col 3: 開始日期 */}
        <div className="flex items-center">
            <input 
                type="date" 
                value={localStartDate}
                onChange={handleStartDateChange}
                className="w-28 text-xs bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none rounded px-1 min-h-[24px] text-gray-600 dark:text-gray-400 cursor-pointer"
            />
        </div>

        {/* Col 4: 結束日期 */}
        <div className="flex items-center">
            <input 
                type="date" 
                value={localEndDate}
                onChange={handleEndDateChange}
                className="w-28 text-xs bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none rounded px-1 min-h-[24px] text-gray-600 dark:text-gray-400 cursor-pointer"
            />
        </div>

        {/* Col 5: 動作按鈕 */}
        <div className="flex items-center justify-end pr-2 gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
           <Button variant="ghost" size="sm" onClick={handleAddChild} className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600" title="新增子任務">
             <Plus size={14} />
           </Button>
           <Button variant="ghost" size="sm" onClick={handleDelete} className="h-6 w-6 p-0 text-gray-400 hover:text-red-600" title="刪除">
             <Trash2 size={14} />
           </Button>
        </div>

      </div>

      {/* 遞迴渲染子節點 */}
      {isExpanded && hasChildren && (
        <div className="flex flex-col w-full">
          {children.map(child => (
            <WbsNodeItem key={child.id} nodeId={child.id} level={level + 1} />
          ))}
        </div>
      )}
    </>
  );
};
