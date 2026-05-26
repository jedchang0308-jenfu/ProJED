import React, { useState } from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import type { TaskStatus } from '../../types';
import { Input } from '../ui/Input';
import { ChevronRight, ChevronDown, Link, Lock, Unlock } from 'lucide-react';
import { WbsDependencyContext } from './WbsListView';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import dayjs from 'dayjs';
import { TaskDragHandle } from './TaskDragHandle';
import { useTagStore } from '../../store/useTagStore';
import { getNodeTags, matchesTagFilters } from '../../utils/tags';
import { TagChip } from '../Tags/TagChip';

interface WbsNodeItemProps {
  nodeId: string;
  level?: number;
  ancestorIds?: string[];
}

export const WbsNodeItem: React.FC<WbsNodeItemProps> = ({ nodeId, level = 0, ancestorIds = [] }) => {
  const node = useWbsStore(s => s.nodes[nodeId]); // ✅ 從 Store 中 Reactively 綁定該節點的最新狀態
  const [isExpanded, setIsExpanded] = useState(true);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  
  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);

  const isRecursiveNode = ancestorIds.includes(nodeId);

  const nextAncestorIds = [...ancestorIds, nodeId];
  const nextAncestorKey = nextAncestorIds.join('|');

  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const isEndDateEffectivelyLocked = lockStatus.endLocked || Boolean(node?.isDurationLocked);

  const [localTitle, setLocalTitle] = useState(node?.title || '');
  const [localStartDate, setLocalStartDate] = useState(node?.startDate || '');
  const [localEndDate, setLocalEndDate] = useState(node?.endDate || '');

  // DnD Sortable Hook
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: nodeId,
      data: { item: node }
  });

  const dndStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
      position: 'relative' as any,
      zIndex: isDragging ? 50 : 1,
  };

  // ✅ 同步 Store 狀態到 Local State (確保 Undo/Redo 發生時畫面能正確更新)
  React.useEffect(() => {
      setLocalTitle(node?.title || '');
  }, [node?.title]);

  React.useEffect(() => {
      setLocalStartDate(node?.startDate || '');
      setLocalEndDate(node?.endDate || '');
  }, [node?.startDate, node?.endDate]);

  // 取得全域顯示設定
  const dependencyContext = React.useContext(WbsDependencyContext);
  const showDependencies = dependencyContext?.showDependencies ?? false;
  const handleDependencySelect = dependencyContext?.handleDependencySelect;
  const dependencySelection = dependencyContext?.dependencySelection ?? null;
  const dependencyMarkers =
    dependencyContext?.dependencyMarkers ??
    ({} as NonNullable<React.ContextType<typeof WbsDependencyContext>>['dependencyMarkers']);

  const showStartDate = useBoardStore(s => s.showStartDate);
  const showTags = useBoardStore(s => s.showTags);

  // 確認選取狀態
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';
  
  const setContextMenuState = useBoardStore(s => s.setContextMenuState);

  const updateNode = useWbsStore(s => s.updateNode);
  const statusFilters = useBoardStore(s => s.statusFilters);
  const tags = useTagStore(s => s.tags);
  const selectedTagIds = useTagStore(s => s.selectedTagIds);
  
  // ✅ 使用 Stable Selector 訂閱「子節點 ID 陣列」，避免 Zustand 無限 Render Loop
  const childrenIds = useWbsStore(s => s.parentNodesIndex[nodeId]); 
  
  // ✅ 只有當 childrenIds 陣列變更時，才重新抓取最新的 node references
  const children = React.useMemo(() => {
      const state = useWbsStore.getState();
      const nextAncestors = new Set(nextAncestorKey.split('|'));
      return (childrenIds || [])
        .filter(id => !nextAncestors.has(id))
        .map(id => state.nodes[id])
        .filter(n => n && !n.isArchived && statusFilters[n.status || 'todo'] && matchesTagFilters(n, selectedTagIds))
        .sort((a,b) => a.order - b.order);
  }, [childrenIds, statusFilters, selectedTagIds, nextAncestorKey]);

  const hasChildren = children.length > 0;
  const progress = useWbsStore(s => s.getNodeProgress(nodeId)); // 進度是原始型別 (number)，安全且具備 Reactive
  const nodeTags = getNodeTags(node, tags);
  const isDueToday = node?.status !== 'completed' && !!localEndDate && dayjs(localEndDate).isSame(dayjs(), 'day');

  // 緊湊的縮排 (使用 1.25rem 取代原本的 1.5rem 以節省空間)
  const indentPadding = level * 1.25;

  const handleToggle = () => setIsExpanded(!isExpanded);

  // ----- 行內編輯處理 -----
  const handleTitleBlur = () => {
    setIsTitleEditing(false);
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
              alert(`防呆機制：下層任務的日期不得超出上層任務的範圍\n(上層任務最早開始日期為 ${pStart})`);
              return false;
          }
          if (pEnd && newValue > pEnd) {
              alert(`防呆機制：下層任務的日期不得超出上層任務的範圍\n(上層任務最晚結束日期為 ${pEnd})`);
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
                      alert(`防呆機制：上層任務的開始日期不能晚於其下層任務\n(下層任務「${child.title}」已排定於 ${child.startDate} 開始)`);
                      return false;
                  }
              }
          }

          if (fieldType === 'endDate') {
              for (const child of childrenNodes) {
                  if (child.endDate && newValue < child.endDate) {
                      alert(`防呆機制：上層任務的結束日期不能早於其下層任務\n(下層任務「${child.title}」排定至 ${child.endDate} 才結束)`);
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
      
      // 如果鎖定工期，連動推移結束日期
      if (node.isDurationLocked && durationDays !== '') {
          const newEndDate = dayjs(val).add(durationDays as number, 'day').format('YYYY-MM-DD');
          if (validateDateBoundary('endDate', newEndDate)) {
              setLocalEndDate(newEndDate);
              updateNode(node.id, { startDate: val, endDate: newEndDate });
              return;
          }
      }
      
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

  // 工期變更處理
  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const strVal = e.target.value;
      if (strVal === '') return; // 允許清空但不做計算
      const val = parseInt(strVal, 10);
      if (isNaN(val) || val < 0) return;

      if (!localStartDate) {
          alert('防呆機制：請先設定開始日期，才能計算工期');
          e.target.value = '';
          return;
      }
      
      const newEndDate = dayjs(localStartDate).add(val, 'day').format('YYYY-MM-DD');
      if (!validateDateBoundary('endDate', newEndDate)) {
          // 若防呆擋下，不更新 UI
          e.target.value = durationDays.toString();
          return;
      }
      setLocalEndDate(newEndDate);
      updateNode(node.id, { endDate: newEndDate });
  };

  const handleToggleDurationLock = () => {
      updateNode(node.id, { isDurationLocked: !node.isDurationLocked });
  };

  const durationDays = (localStartDate && localEndDate && dayjs(localStartDate).isValid() && dayjs(localEndDate).isValid())
      ? dayjs(localEndDate).diff(dayjs(localStartDate), 'day')
      : '';

  

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      updateNode(nodeId, { status: e.target.value as TaskStatus });
  };

  const handleAssigneeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      updateNode(nodeId, { assigneeId: e.target.value });
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

  // Keep all hooks above this guard so missing/cyclic data never changes hook order.
  if (!node || isRecursiveNode) return null;

  return (
    <>
      <div 
        ref={setNodeRef}
        style={dndStyle}
        onContextMenu={(e) => {
            e.preventDefault();
            setContextMenuState({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                nodeId: node.id,
                title: node.title
            });
        }}
        className={`grid ${showStartDate ? 'grid-cols-[minmax(300px,1fr)_100px_100px_130px_130px_80px]' : 'grid-cols-[minmax(300px,1fr)_100px_100px_130px_80px]'} items-center py-1 px-4 border-b border-slate-100 group hover:bg-slate-50 transition-colors bg-white text-sm active:bg-slate-100 ${isDragging ? 'opacity-50 bg-slate-100/50' : ''}`}
      >
        
        {/* Col 1: 任務名稱與階層結構 */}
        <div className="flex items-center gap-1.5 overflow-hidden pr-4 relative" style={{ paddingLeft: `${indentPadding}rem` }}>
          {/* 拖曳手把 */}
          <TaskDragHandle
              attributes={attributes}
              listeners={listeners}
              size="sm"
              title="拖曳以排序或移動"
              className="-ml-2 opacity-0 group-hover:opacity-100"
          />

          <button 
            onClick={handleToggle}
            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors text-slate-400 ${!hasChildren && 'invisible'}`}
            title={isExpanded ? '收合' : '展開'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {node.nodeType === 'milestone' ? (
              <span className="flex-shrink-0 text-[10px] text-amber-600 border border-amber-300 bg-amber-50 px-1 py-0.5 rounded leading-none mr-1">MS</span>
          ) : null}

          {/* 表格感 Input：透明背景、無邊框、focus時顯示底線或底色 */}
          <Input
             type="text"
             value={localTitle}
             onChange={(e) => setLocalTitle(e.target.value)}
             onVoiceResult={setLocalTitle}
             onFocus={() => setIsTitleEditing(true)}
             onBlur={handleTitleBlur}
             onKeyDown={handleTitleKeyDown}
             voiceEnabled={isTitleEditing}
             className={`flex-1 min-w-0 h-auto border-0 border-b border-transparent bg-transparent px-1 py-0.5 text-sm transition-all focus:bg-white focus:border-blue-400 focus:ring-0 focus:ring-offset-0 ${node.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}
             placeholder="任務名稱"
          />

          <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
              <div className={`w-full bg-slate-200 overflow-hidden ${hasChildren ? 'h-1.5 rounded-full' : 'h-1 rounded-sm opacity-70'}`}>
                  <div 
                  className={`h-full ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'} transition-all`} 
                  style={{ width: `${progress}%` }} 
                  />
              </div>
              <span className={`text-[10px] min-w-[2.5ch] text-right font-medium ${progress === 100 ? 'text-green-600' : 'text-slate-500'}`}>
                  {progress}%
              </span>
          </div>
          {showTags && nodeTags.length > 0 && (
            <div className="hidden max-w-[180px] flex-shrink-0 gap-1 lg:flex">
              {nodeTags.slice(0, 2).map(tag => (
                <TagChip key={tag.id} tag={tag} compact />
              ))}
            </div>
          )}
        </div>

        {/* Col 2: 狀態 (原生 Select 偽裝 Badge) */}
        <div className="flex items-center">
            <select
                value={node.assigneeId || ''}
                onChange={handleAssigneeChange}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded px-2 py-1 text-xs text-slate-600 bg-transparent border-0 outline-none appearance-none transition-colors hover:bg-slate-100 focus:bg-slate-100"
                title="指派負責人"
            >
                <option value="">未指派</option>
                <option value="user_jed">Jed (CTO)</option>
                <option value="user_pm">PM_A</option>
            </select>
        </div>

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
        {showStartDate && (<div 
            className={`flex items-center group/date relative w-36 flex-shrink-0 px-2 transition-all border border-transparent rounded
                ${isSelfStart ? 'bg-amber-100/50 ring-2 ring-inset ring-amber-400' : ''}
                ${isSelectingMode && !isSelfStart ? 'hover:bg-amber-50 cursor-crosshair outline-dashed outline-1 outline-amber-300 -outline-offset-1' : ''}
            `}
            onClick={isSelectingMode && !isSelfStart && handleDependencySelect ? (e) => { e.stopPropagation(); handleDependencySelect(nodeId, 'start', localTitle); } : undefined}
        >
            <div className="flex items-center gap-1.5 flex-1 pr-4 whitespace-nowrap overflow-hidden">
                <input 
                    type="date" 
                    value={localStartDate}
                    onChange={handleStartDateChange}
                    readOnly={lockStatus.startLocked}
                    className={`w-28 text-xs rounded px-1 min-h-[24px] cursor-pointer transition-all
                        ${lockStatus.startLocked ? 'border border-dashed border-slate-300 bg-slate-50/50 text-slate-700 pointer-events-none' : 'bg-transparent border border-transparent hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none text-slate-600'}
                        ${isSelectingMode ? 'pointer-events-none text-slate-400' : ''}`}
                    title={lockStatus.startLocked ? '此日期受依賴關係鎖定，請至甘特圖追蹤' : ''}
                />
                {lockStatus.startLocked && (
                    <span className="text-slate-400 absolute right-8 flex items-center bg-slate-50/50 pr-1 pl-0.5">
                        <Link size={12} className="opacity-60" />
                    </span>
                )}
                {showDependencies && dependencyMarkers?.[`${nodeId}_start`]?.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        {dependencyMarkers[`${nodeId}_start`].filter(m => !m.isSelf || m.role === 'passive').map(m => (
                            m.isSelf ? (
                                <span key={m.id} title="間隔天數" className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded text-[9px] font-bold whitespace-nowrap cursor-help">
                                    {m.offset || 0} 工作天
                                </span>
                            ) : (
                                <span key={m.id} title={m.role === 'active' ? '主動驅動' : '被動跟隨'} className={`w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7.5px] font-bold text-white shadow-sm leading-none ${m.role === 'active' ? 'bg-gray-800' : 'bg-gray-400'}`}>
                                    {m.label}
                                </span>
                            )
                        ))}
                    </div>
                )}
                {/* 簡單符號：若沒有顯示依賴，但有被依賴計算則提示 */}
                {!showDependencies && dependencyMarkers?.[`${nodeId}_start`]?.length > 0 && (
                    <span title="此日期由依賴排程管理" className="flex-shrink-0 text-amber-400/70">
                        <Link size={9} />
                    </span>
                )}
            </div>

            {isSelectingMode && !isSelfStart && (
                <div className="absolute right-1 p-1 text-amber-500 opacity-0 group-hover/date:opacity-100 transition-opacity">
                    <Link size={11} />
                </div>
            )}
        </div>)}

        {/* Col 4: 結束日期 */}
        <div 
            className={`flex items-center group/date relative w-36 flex-shrink-0 px-2 transition-all border border-transparent rounded
                ${isDueToday ? 'border-orange-300 bg-orange-50/80 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]' : ''}
                ${isSelfEnd ? 'bg-amber-100/50 ring-2 ring-inset ring-amber-400' : ''}
                ${isSelectingMode && !isSelfEnd ? 'hover:bg-amber-50 cursor-crosshair outline-dashed outline-1 outline-amber-300 -outline-offset-1' : ''}
            `}
            onClick={isSelectingMode && !isSelfEnd && handleDependencySelect ? (e) => { e.stopPropagation(); handleDependencySelect(nodeId, 'end', localTitle); } : undefined}
        >
            <div className="flex items-center gap-1.5 flex-1 pr-4 whitespace-nowrap overflow-hidden">
                <input 
                    type="date" 
                    value={localEndDate}
                    onChange={handleEndDateChange}
                    readOnly={isEndDateEffectivelyLocked}
                    className={`w-28 text-xs rounded px-1 min-h-[24px] cursor-pointer transition-all
                        ${isEndDateEffectivelyLocked ? 'border border-dashed border-slate-300 bg-slate-50/50 text-slate-700 pointer-events-none' : 'bg-transparent border border-transparent hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none text-slate-600'}
                        ${isSelectingMode ? 'pointer-events-none text-slate-400' : ''}`}
                    title={isEndDateEffectivelyLocked ? (node.isDurationLocked ? '因工期鎖定，請調整開始日期或修改工期' : '此日期受依賴關係鎖定，請至甘特圖追蹤') : ''}
                />
                {isEndDateEffectivelyLocked && (
                    <span className="text-slate-400 absolute right-8 flex items-center bg-slate-50/50 pr-1 pl-0.5">
                        {node.isDurationLocked && !lockStatus.endLocked ? (
                            <span className="opacity-60 text-[10px] font-bold">L</span>
                        ) : (
                            <Link size={12} className="opacity-60" />
                        )}
                    </span>
                )}
                {showDependencies && dependencyMarkers?.[`${nodeId}_end`]?.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        {dependencyMarkers[`${nodeId}_end`].filter(m => !m.isSelf || m.role === 'passive').map(m => (
                            m.isSelf ? (
                                <span key={m.id} title="間隔天數" className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded text-[9px] font-bold whitespace-nowrap cursor-help">
                                    {m.offset || 0} 工作天
                                </span>
                            ) : (
                                <span key={m.id} title={m.role === 'active' ? '主動驅動' : '被動跟隨'} className={`w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7.5px] font-bold text-white shadow-sm leading-none ${m.role === 'active' ? 'bg-gray-800' : 'bg-gray-400'}`}>
                                    {m.label}
                                </span>
                            )
                        ))}
                    </div>
                )}
                {/* 簡單符號：若沒有顯示依賴，但有被依賴計算則提示 */}
                {!showDependencies && dependencyMarkers?.[`${nodeId}_end`]?.length > 0 && (
                    <span title="此日期由依賴排程管理" className="flex-shrink-0 text-amber-400/70">
                        <Link size={9} />
                    </span>
                )}
            </div>

            {isSelectingMode && !isSelfEnd && (
                <div className="absolute right-1 p-1 text-amber-500 opacity-0 group-hover/date:opacity-100 transition-opacity">
                    <Link size={11} />
                </div>
            )}
        </div>



        {/* Col 5: 工期(天) */}
        <div className="flex items-center px-2 gap-1">
             <button
                 type="button"
                 onClick={handleToggleDurationLock}
                 className={`p-1 rounded flex-shrink-0 transition-colors ${node.isDurationLocked ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                 title={node.isDurationLocked ? '鎖定工期：開始日期變動時同步推動結束日期' : '非鎖定工期：日期各自獨立，自動計算天數'}
             >
                 {node.isDurationLocked ? <Lock size={12} /> : <Unlock size={12} />}
             </button>
             <input 
                 type="number"
                 min="0"
                 value={durationDays}
                 onChange={handleDurationChange}
                 placeholder="-"
                 disabled={!node.isDurationLocked}
                 className={`w-10 text-center text-xs bg-transparent border border-transparent focus:outline-none rounded py-0.5 ${!node.isDurationLocked ? 'pointer-events-none text-slate-400 opacity-70' : 'hover:border-slate-300 focus:border-primary focus:bg-white text-slate-600'} ${isSelectingMode ? 'pointer-events-none text-slate-400' : ''}`}
                 title={node.isDurationLocked ? "輸入工期天數自動推算結束日期" : "請先點擊鎖頭以鎖定工期，才能手動修改"}
             />
        </div>

      </div>

      {/* 遞迴渲染子節點 */}
      {isExpanded && hasChildren && (
        <div className="flex flex-col w-full">
          <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {children.map(child => (
              <WbsNodeItem key={child.id} nodeId={child.id} level={level + 1} ancestorIds={nextAncestorIds} />
            ))}
          </SortableContext>
        </div>
      )}
    </>
  );
};
