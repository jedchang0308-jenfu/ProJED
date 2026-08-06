import React, { useState } from 'react';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import type { TaskStatus } from '../../types';
import { ChevronRight, ChevronDown, Link, Lock, Unlock } from 'lucide-react';
import { WbsDependencyContext } from './WbsListView';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import dayjs from 'dayjs';
import { useTagStore } from '../../store/useTagStore';
import { useMemberStore } from '../../store/useMemberStore';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import { getNodeTags } from '../../utils/tags';
import { TagChip } from '../Tags/TagChip';
import { matchesTaskFilters } from '../../features/taskFilters';
import { compactClassNames } from '../ui/compactTokens';
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import { useTouchTapGuard } from '../../hooks/useTouchTapGuard';
import { isMobileTaskActionMode } from './mobileTaskActionContext';
import TaskAssignmentPicker from '../TaskAssignmentPicker';
import { getTaskProgressFillClass, getTaskStatusSelectClass, taskStatusTitleClass } from '../ui/taskStatusStyles';
import { normalizeManualTaskStatus } from '../../utils/taskStatus';

interface WbsNodeItemProps {
  nodeId: string;
  level?: number;
  ancestorIds?: string[];
}

export const WbsNodeItem: React.FC<WbsNodeItemProps> = ({ nodeId, level = 0, ancestorIds = [] }) => {
  const node = useWbsStore(s => s.nodes[nodeId]); // ✅ 從 Store 中 Reactively 綁定該節點的最新狀態
  const [isExpanded, setIsExpanded] = useState(true);
  
  const wbsDependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);

  const isRecursiveNode = ancestorIds.includes(nodeId);

  const nextAncestorIds = [...ancestorIds, nodeId];
  const nextAncestorKey = nextAncestorIds.join('|');

  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const isEndDateEffectivelyLocked = lockStatus.endLocked || Boolean(node?.isDurationLocked);
  const { canEditTask, canAssignTask, canMoveTask, canCreateDependency } = useBoardPermissions();
  const selectedTaskId = useBoardStore(s => s.selectedTaskId);
  const touchTapGuard = useTouchTapGuard();
  const mobileActionMode = isMobileTaskActionMode();

  // 取得全域顯示設定與依賴選取狀態
  const dependencyContext = React.useContext(WbsDependencyContext);
  const showDependencies = dependencyContext?.showDependencies ?? false;
  const handleDependencySelect = dependencyContext?.handleDependencySelect;
  const dependencySelection = dependencyContext?.dependencySelection ?? null;
  const dependencyMarkers =
    dependencyContext?.dependencyMarkers ??
    ({} as NonNullable<React.ContextType<typeof WbsDependencyContext>>['dependencyMarkers']);
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';

  const [localStartDate, setLocalStartDate] = useState(node?.startDate || '');
  const [localEndDate, setLocalEndDate] = useState(node?.endDate || '');

  // DnD Sortable Hook
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: nodeId,
      disabled: !canMoveTask || isSelectingMode || mobileActionMode,
      data: { item: node }
  });

  const dndStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
      position: 'relative' as any,
      zIndex: isDragging ? 50 : 1,
  };

  const dragSurfaceBindings = mobileActionMode || isSelectingMode
    ? {}
    : { ...attributes, ...listeners };

  React.useEffect(() => {
      setLocalStartDate(node?.startDate || '');
      setLocalEndDate(node?.endDate || '');
  }, [node?.startDate, node?.endDate]);

  const showStartDate = useBoardStore(s => s.showStartDate);
  const showTags = useBoardStore(s => s.showTags);
  
  const setContextMenuState = useBoardStore(s => s.setContextMenuState);

  const updateNode = useWbsStore(s => s.updateNode);
  const statusFilters = useBoardStore(s => s.statusFilters);
  const dueWithinDays = useBoardStore(s => s.dueWithinDays);
  const overdueOnly = useBoardStore(s => s.overdueOnly);
  const selectedAssigneeIds = useBoardStore(s => s.selectedAssigneeIds);
  const tags = useTagStore(s => s.tags);
  const selectedTagIds = useTagStore(s => s.selectedTagIds);
  const taskFilters = React.useMemo(() => ({
    statusFilters,
    dueWithinDays,
    overdueOnly,
    selectedAssigneeIds,
    selectedTagIds,
    keyword: '',
  }), [dueWithinDays, overdueOnly, selectedAssigneeIds, selectedTagIds, statusFilters]);
  const boardMembers = useMemberStore(s => s.boardMembers);
  const membersLoading = useMemberStore(s => s.loading);
  const assigneeOptions = React.useMemo(
    () => boardMembers.map(member => ({
      id: member.userId,
      label: member.profile?.displayName || member.profile?.email || member.userId,
      role: member.role,
    })),
    [boardMembers]
  );
  
  // ✅ 使用 Stable Selector 訂閱「子節點 ID 陣列」，避免 Zustand 無限 Render Loop
  const childrenIds = useWbsStore(s => s.parentNodesIndex[nodeId]); 
  
  // ✅ 只有當 childrenIds 陣列變更時，才重新抓取最新的 node references
  const children = React.useMemo(() => {
      const state = useWbsStore.getState();
      const nextAncestors = new Set(nextAncestorKey.split('|'));
      return (childrenIds || [])
        .filter(id => !nextAncestors.has(id))
        .map(id => state.nodes[id])
        .filter(n => n && !n.isArchived && matchesTaskFilters(n, taskFilters))
        .sort((a,b) => a.order - b.order);
  }, [childrenIds, taskFilters, nextAncestorKey]);

  const hasChildren = children.length > 0;
  const progress = useWbsStore(s => s.getNodeProgress(nodeId)); // 進度是原始型別 (number)，安全且具備 Reactive
  const nodeTags = getNodeTags(node, tags);
  const isDueToday = node?.status !== 'completed' && !!localEndDate && dayjs(localEndDate).isSame(dayjs(), 'day');
  const isStartDateReadOnly = !canEditTask || lockStatus.startLocked;
  const isEndDateReadOnly = !canEditTask || isEndDateEffectivelyLocked;

  // 緊湊的縮排 (使用 1.25rem 取代原本的 1.5rem 以節省空間)
  const indentPadding = level * 1.25;

  const handleToggle = () => setIsExpanded(!isExpanded);

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
      if (!canEditTask) return;
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
      if (!canEditTask) return;
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
      if (!canEditTask) return;
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
      if (!canEditTask) return;
      updateNode(node.id, { isDurationLocked: !node.isDurationLocked });
  };

  const durationDays = (localStartDate && localEndDate && dayjs(localStartDate).isValid() && dayjs(localEndDate).isValid())
      ? dayjs(localEndDate).diff(dayjs(localStartDate), 'day')
      : '';

  

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      if (!canEditTask) return;
      updateNode(nodeId, { status: e.target.value as TaskStatus });
  };

  const handleAssignmentChange = (primaryIds: string[], collaboratorIds: string[]) => {
      if (!canAssignTask) return;
      updateNode(nodeId, {
        assigneeIds: primaryIds,
        collaboratorIds,
        updatedAt: Date.now(),
      });
  };

  // Keep all hooks above this guard so missing/cyclic data never changes hook order.
  if (!node || isRecursiveNode) return null;

  return (
    <>
      <div 
        ref={setNodeRef}
        style={dndStyle}
        {...dragSurfaceBindings}
        {...touchTapGuard.handlers}
        onContextMenu={(e) => {
            e.preventDefault();
            setContextMenuState({
                kind: 'task',
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                nodeId: node.id,
                title: node.title
            });
        }}
        onClick={(event) => {
            if (isDragging || isSelectingMode || isTaskPrimaryActionTarget(event.target)) return;
            selectAndOpenTaskDetails(node.id);
        }}
        data-task-id={node.id}
        data-mobile-drop-target={node.id}
        data-task-drag-surface="true"
        data-task-drag-surface-kind="wbs-list-row"
        data-task-surface-source="true"
        data-task-selected={selectedTaskId === node.id ? 'true' : undefined}
        data-touch-tap-guard="true"
        className={`mobile-pan-item grid ${showStartDate ? 'grid-cols-[minmax(300px,1fr)_100px_100px_130px_130px_80px]' : 'grid-cols-[minmax(300px,1fr)_100px_100px_130px_80px]'} min-h-[30px] items-center py-0.5 px-[10px] border-b border-l-[3px] border-l-transparent ${level === 0 ? 'border-b-slate-200 bg-surface-panel/80' : level === 1 ? 'border-b-slate-100 bg-white' : 'border-b-slate-100 bg-slate-50/40'} group hover:bg-primary/5 transition-colors ${compactClassNames.taskTitle} active:bg-slate-100 cursor-pointer ${isDragging ? 'opacity-50 bg-slate-100/50' : ''}`}
      >
        
        {/* Col 1: 任務名稱與階層結構 */}
        <div
          className="relative flex items-center gap-1 overflow-hidden pr-[10px]"
          style={{ paddingLeft: `${indentPadding}rem` }}
        >
          <button 
            onClick={handleToggle}
            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors text-slate-400 ${!hasChildren && 'invisible'}`}
            title={isExpanded ? '收合' : '展開'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {node.nodeType === 'milestone' ? (
              <span className="flex-shrink-0 text-[10px] text-amber-600 border border-amber-300 bg-amber-50 px-1 py-0.5 rounded leading-none mr-1">里程碑</span>
          ) : null}

          <span
            className={`task-title-text relative flex-1 min-w-0 px-1 text-sm ${level === 0 ? 'font-semibold' : 'font-medium'} ${taskStatusTitleClass[node.status]}`}
            aria-label={node.title || '未命名任務'}
          >
            <span className="block truncate">{node.title || '未命名任務'}</span>
          </span>

          <div className="flex items-center gap-1 flex-shrink-0 w-24">
              <div className={`w-full bg-slate-200 overflow-hidden ${hasChildren ? 'h-1.5 rounded-full' : 'h-1 rounded-sm opacity-70'}`}>
                  <div 
                  className={`h-full ${getTaskProgressFillClass(progress)} transition-all`}
                  style={{ width: `${progress}%` }} 
                  />
              </div>
              <span className={`text-[10px] min-w-[2.5ch] text-right font-medium ${progress === 100 ? 'text-slate-400' : 'text-slate-500'}`}>
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
            <TaskAssignmentPicker
                node={node}
                options={assigneeOptions}
                membersLoading={membersLoading}
                disabled={!canAssignTask}
                compact
                onChange={handleAssignmentChange}
            />
        </div>

        <div className="flex items-center">
            <select
                value={normalizeManualTaskStatus(node.status)}
                onChange={handleStatusChange}
                onClick={(e) => e.stopPropagation()}
                disabled={!canEditTask}
                className={getTaskStatusSelectClass(node.status)}
                title="修改狀態"
            >
                <option value="todo">待辦</option>
                <option value="in_progress">進行中</option>
                <option value="onhold">暫緩</option>
                <option value="completed">完成</option>
            </select>
        </div>

        {/* Col 3: 開始日期 */}
        {showStartDate && (<div 
            data-task-interaction-control="true"
            className={`flex h-8 items-center group/date relative w-36 flex-shrink-0 px-1.5 transition-all border border-transparent rounded-md
                ${isSelfStart ? 'bg-amber-100/50 ring-2 ring-inset ring-amber-400' : ''}
                ${isSelectingMode && !isSelfStart ? 'hover:bg-amber-50 cursor-crosshair outline-dashed outline-1 outline-amber-300 -outline-offset-1' : ''}
            `}
            data-wbs-list-date-control="start"
            onClick={canCreateDependency && isSelectingMode && !isSelfStart && handleDependencySelect ? (e) => { e.stopPropagation(); handleDependencySelect(nodeId, 'start', node.title || '未命名任務'); } : undefined}
        >
            <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-1 whitespace-nowrap overflow-hidden">
                <input 
                    type="date" 
                    value={localStartDate}
                    onChange={handleStartDateChange}
                    readOnly={isStartDateReadOnly}
                    className={`h-full min-h-0 min-w-0 flex-1 rounded-md px-2 text-xs cursor-pointer transition-all
                        ${isStartDateReadOnly ? 'border border-dashed border-slate-300 bg-slate-50/50 text-slate-700 pointer-events-none' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 focus:border-primary focus:outline-none'}
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
                                <span key={m.id} title="間隔天數" className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded text-[9px] font-semibold whitespace-nowrap cursor-help">
                                    {m.offset || 0} 工作天
                                </span>
                            ) : (
                                <span key={m.id} title={m.role === 'active' ? '主動驅動' : '被動跟隨'} className={`w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7.5px] font-semibold text-white shadow-sm leading-none ${m.role === 'active' ? 'bg-gray-800' : 'bg-gray-400'}`}>
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
            data-task-interaction-control="true"
            className={`flex h-8 items-center group/date relative w-36 flex-shrink-0 px-1.5 transition-all border border-transparent rounded-md
                ${isDueToday ? 'border-orange-300 bg-orange-50/80 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]' : ''}
                ${isSelfEnd ? 'bg-amber-100/50 ring-2 ring-inset ring-amber-400' : ''}
                ${isSelectingMode && !isSelfEnd ? 'hover:bg-amber-50 cursor-crosshair outline-dashed outline-1 outline-amber-300 -outline-offset-1' : ''}
            `}
            data-wbs-list-date-control="end"
            onClick={canCreateDependency && isSelectingMode && !isSelfEnd && handleDependencySelect ? (e) => { e.stopPropagation(); handleDependencySelect(nodeId, 'end', node.title || '未命名任務'); } : undefined}
        >
            <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-1 whitespace-nowrap overflow-hidden">
                <input 
                    type="date" 
                    value={localEndDate}
                    onChange={handleEndDateChange}
                    readOnly={isEndDateReadOnly}
                    className={`h-full min-h-0 min-w-0 flex-1 rounded-md px-2 text-xs cursor-pointer transition-all
                        ${isEndDateReadOnly ? 'border border-dashed border-slate-300 bg-slate-50/50 text-slate-700 pointer-events-none' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 focus:border-primary focus:outline-none'}
                        ${isSelectingMode ? 'pointer-events-none text-slate-400' : ''}`}
                    title={isEndDateEffectivelyLocked ? (node.isDurationLocked ? '因工期鎖定，請調整開始日期或修改工期' : '此日期受依賴關係鎖定，請至甘特圖追蹤') : ''}
                />
                {isEndDateEffectivelyLocked && (
                    <span className="text-slate-400 absolute right-8 flex items-center bg-slate-50/50 pr-1 pl-0.5">
                        {node.isDurationLocked && !lockStatus.endLocked ? (
                            <span className="opacity-60 text-[10px] font-semibold">L</span>
                        ) : (
                            <Link size={12} className="opacity-60" />
                        )}
                    </span>
                )}
                {showDependencies && dependencyMarkers?.[`${nodeId}_end`]?.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        {dependencyMarkers[`${nodeId}_end`].filter(m => !m.isSelf || m.role === 'passive').map(m => (
                            m.isSelf ? (
                                <span key={m.id} title="間隔天數" className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded text-[9px] font-semibold whitespace-nowrap cursor-help">
                                    {m.offset || 0} 工作天
                                </span>
                            ) : (
                                <span key={m.id} title={m.role === 'active' ? '主動驅動' : '被動跟隨'} className={`w-[13px] h-[13px] rounded-full flex items-center justify-center text-[7.5px] font-semibold text-white shadow-sm leading-none ${m.role === 'active' ? 'bg-gray-800' : 'bg-gray-400'}`}>
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
        <div
            className={`flex h-8 items-stretch overflow-hidden rounded-md border px-0 ${
                node.isDurationLocked ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/80'
            }`}
            data-wbs-list-duration-control="true"
        >
             <button
                 type="button"
                 onClick={handleToggleDurationLock}
                 disabled={!canEditTask}
                 className={`flex h-full w-8 flex-shrink-0 items-center justify-center rounded-none border-r p-0 transition-colors ${node.isDurationLocked ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100' : 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
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
                 disabled={!canEditTask || !node.isDurationLocked}
                 className={`h-full w-12 border-0 bg-transparent px-1 text-center text-xs focus:outline-none ${!node.isDurationLocked ? 'pointer-events-none text-slate-400 opacity-70' : 'text-slate-600 focus:bg-white'} ${isSelectingMode ? 'pointer-events-none text-slate-400' : ''}`}
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
