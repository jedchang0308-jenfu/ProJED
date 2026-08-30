import React from 'react';
import dayjs from 'dayjs';
import { Calendar, Minus, Plus } from 'lucide-react';
import type { TaskNode } from '../../types';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';
import { useTouchTapGuard } from '../../hooks/useTouchTapGuard';
import { useTaskInteractionBinding } from '../../interactions/task/useTaskInteractionBinding';
import {
  useMindMapNodeSelected,
  type MindMapSelectionStore,
} from './mindMapSelectionStore';

export type MindMapDirection = 'left' | 'right';
export type MindMapDropMode = 'before' | 'after' | 'child';
export type MindMapQuickCreateIntent = 'sibling' | 'child';

export interface MindMapDropTarget {
  nodeId: string;
  mode: MindMapDropMode;
}

interface MindMapNodeProps {
  node: TaskNode;
  childrenNodes: TaskNode[];
  direction: MindMapDirection;
  level: number;
  selectionStore: MindMapSelectionStore;
  dev075ProbeEnabled?: boolean;
  expandedNodeIds: Set<string>;
  dropTarget: MindMapDropTarget | null;
  isRelationshipModeActive?: boolean;
  showStartDate: boolean;
  canMoveTask: boolean;
  canManageTaskReference?: boolean;
  isTitleEditing?: boolean;
  autoFocusTitleInput?: boolean;
  onTitleEditCommit?: (nodeId: string, title: string, restoreNodeFocus?: boolean) => void;
  onTitleEditContinue?: (nodeId: string, title: string, intent: MindMapQuickCreateIntent) => void;
  onTitleEditCancel?: (nodeId: string, restoreNodeFocus?: boolean) => void;
  onTitleEditDelete?: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onPointerPrimary: (nodeId: string) => void;
  onOpenDetails: (nodeId: string, trackingReferenceId?: string) => void;
  onOpenContextMenu: (nodeId: string, title: string, event: React.MouseEvent) => void;
  onToggleExpanded: (nodeId: string) => void;
  onDragStart: (nodeId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onDragMove: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOverNode: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onDropOnNode: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onNodeElementChange: (nodeId: string, element: HTMLElement | null) => void;
  renderChild: (node: TaskNode, direction: MindMapDirection, level: number) => React.ReactNode;
}

const getDropClasses = (target: MindMapDropTarget | null, nodeId: string) => {
  if (!target || target.nodeId !== nodeId) return '';
  if (target.mode === 'child') return 'ring-2 ring-blue-300 ring-offset-2 bg-blue-50';
  if (target.mode === 'before') return 'before:absolute before:left-1 before:right-1 before:top-[-10px] before:h-1 before:rounded-full before:bg-blue-500 before:shadow-[0_0_0_3px_rgba(99,102,241,0.14)]';
  return 'after:absolute after:bottom-[-10px] after:left-1 after:right-1 after:h-1 after:rounded-full after:bg-blue-500 after:shadow-[0_0_0_3px_rgba(99,102,241,0.14)]';
};

interface MindMapNodeSelectionSurfaceProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'aria-selected'> {
  nodeId: string;
  selectionStore: MindMapSelectionStore;
  dev075ProbeEnabled: boolean;
  selectedClassName: string;
  unselectedClassName: string;
  onNodeElementChange: (nodeId: string, element: HTMLElement | null) => void;
}

const MindMapNodeSelectionSurface: React.FC<MindMapNodeSelectionSurfaceProps> = ({
  nodeId,
  selectionStore,
  dev075ProbeEnabled,
  selectedClassName,
  unselectedClassName,
  onNodeElementChange,
  className = '',
  children,
  ...elementProps
}) => {
  const isSelected = useMindMapNodeSelected(selectionStore, nodeId);
  const elementRef = React.useRef<HTMLDivElement | null>(null);
  const renderCountRef = React.useRef(0);
  const handleElementRef = React.useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element;
    onNodeElementChange(nodeId, element);
  }, [nodeId, onNodeElementChange]);

  React.useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    renderCountRef.current += 1;
    if (dev075ProbeEnabled) {
      element.setAttribute('data-mindmap-node-render-count', String(renderCountRef.current));
    } else {
      element.removeAttribute('data-mindmap-node-render-count');
    }
  });

  return (
    <div
      {...elementProps}
      ref={handleElementRef}
      aria-selected={isSelected}
      className={`${className} ${isSelected ? selectedClassName : unselectedClassName}`}
    >
      {children}
    </div>
  );
};

export const MindMapNode: React.FC<MindMapNodeProps> = ({
  node,
  childrenNodes,
  direction,
  level,
  selectionStore,
  dev075ProbeEnabled = false,
  expandedNodeIds,
  dropTarget,
  isRelationshipModeActive = false,
  showStartDate,
  canMoveTask,
  canManageTaskReference = false,
  isTitleEditing = false,
  autoFocusTitleInput = true,
  onTitleEditCommit,
  onTitleEditContinue,
  onTitleEditCancel,
  onTitleEditDelete,
  onSelect,
  onPointerPrimary,
  onOpenDetails,
  onOpenContextMenu,
  onToggleExpanded,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragOverNode,
  onDropOnNode,
  onNodeElementChange,
  renderChild,
}) => {
  const isCoarsePointer = useCoarsePointer();
  const touchTapGuard = useTouchTapGuard();
  const isTrackingReference = Boolean(node.isTrackingReference && node.trackingReferenceId);
  const canonicalTaskId = node.canonicalTaskId || node.id;
  const isExpanded = expandedNodeIds.has(node.id);
  const hasChildren = childrenNodes.length > 0;
  const isLeft = direction === 'left';
  const hasVisibleDates = (showStartDate && node.startDate) || node.endDate;
  const [titleDraft, setTitleDraft] = React.useState(node.title || '');
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);
  const nodeTitleRef = React.useRef(node.title || '');
  const titleEditActionHandledRef = React.useRef(false);
  React.useEffect(() => {
    nodeTitleRef.current = node.title || '';
  }, [node.title]);
  const interactionCommandDependencies = React.useMemo(() => ({
    'task.select': () => isCoarsePointer ? onSelect(node.id) : onPointerPrimary(node.id),
    'task.open-details': () => onOpenDetails(node.id, node.trackingReferenceId),
  }), [isCoarsePointer, node.id, node.trackingReferenceId, onOpenDetails, onPointerPrimary, onSelect]);
  const interactionBinding = useTaskInteractionBinding({
    taskId: canonicalTaskId,
    title: node.title || '未命名任務',
    trackingReferenceId: node.trackingReferenceId,
    surfaceId: 'mindmap.node',
    origin: 'mode-primary',
    commandDependencies: interactionCommandDependencies,
  });
  const commitTitleEdit = React.useCallback((restoreNodeFocus = false) => {
    if (titleEditActionHandledRef.current) return;
    titleEditActionHandledRef.current = true;
    onTitleEditCommit?.(node.id, titleDraft, restoreNodeFocus);
  }, [node.id, onTitleEditCommit, titleDraft]);
  const continueTitleEdit = React.useCallback((intent: MindMapQuickCreateIntent) => {
    if (titleEditActionHandledRef.current) return;
    titleEditActionHandledRef.current = true;
    if (onTitleEditContinue) {
      onTitleEditContinue(node.id, titleDraft, intent);
      return;
    }
    onTitleEditCommit?.(node.id, titleDraft);
  }, [node.id, onTitleEditCommit, onTitleEditContinue, titleDraft]);
  const cancelTitleEdit = React.useCallback((restoreNodeFocus = false) => {
    if (titleEditActionHandledRef.current) return;
    titleEditActionHandledRef.current = true;
    onTitleEditCancel?.(node.id, restoreNodeFocus);
  }, [node.id, onTitleEditCancel]);

  React.useEffect(() => {
    if (!isTitleEditing) return;
    titleEditActionHandledRef.current = false;
    setTitleDraft(nodeTitleRef.current);
    if (!autoFocusTitleInput) return;
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [autoFocusTitleInput, isTitleEditing, node.id]);
  const formatDate = (value?: string) => {
    if (!value) return '';
    const date = dayjs(value);
    if (!date.isValid()) return value;
    return date.year() === dayjs().year() ? date.format('MM/DD') : date.format('YY/MM/DD');
  };

  return (
    <div
      className={`flex items-center gap-[var(--mindmap-node-gap)] ${isLeft ? 'flex-row-reverse text-right' : 'text-left'}`}
      data-mindmap-branch-level={level}
      data-mindmap-branch-direction={direction}
    >
      <div className={`relative flex items-center ${isLeft ? 'flex-row-reverse' : ''}`}>
        <MindMapNodeSelectionSurface
          nodeId={node.id}
          selectionStore={selectionStore}
          dev075ProbeEnabled={dev075ProbeEnabled}
          selectedClassName="border-primary-500 ring-2 ring-primary-100"
          unselectedClassName="border-slate-200 hover:border-primary-300 hover:bg-primary-50/30"
          onNodeElementChange={onNodeElementChange}
          role="treeitem"
          tabIndex={0}
          aria-expanded={hasChildren ? isExpanded : undefined}
          data-mindmap-node={node.id}
          data-task-placement-id={node.trackingReferenceId || `primary:${node.id}`}
          data-mindmap-placement-kind={isTrackingReference ? 'tracking-reference' : 'primary'}
          aria-label={isTrackingReference ? `追蹤副本：${node.title || '未命名任務'}` : node.title || '未命名任務'}
          data-mindmap-node-title={node.title || '未命名任務'}
          data-mindmap-node-level={level}
          data-mindmap-node-direction={direction}
          data-mindmap-parent-id={node.parentId || ''}
          data-mindmap-node-order={node.order}
          data-mindmap-inline-title-editing={isTitleEditing ? 'true' : 'false'}
          draggable={(isTrackingReference ? canManageTaskReference : canMoveTask) && !isCoarsePointer}
          {...touchTapGuard.handlers}
          onClick={(event) => {
            event.stopPropagation();
            void interactionBinding.dispatch('pointer.primary');
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !isTitleEditing || autoFocusTitleInput) return;
            if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault();
              event.stopPropagation();
              onTitleEditDelete?.(node.id);
              return;
            }
            if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            event.stopPropagation();
            setTitleDraft(event.key);
            window.requestAnimationFrame(() => {
              titleInputRef.current?.focus();
              titleInputRef.current?.setSelectionRange(1, 1);
            });
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (isTitleEditing) commitTitleEdit();
            void interactionBinding.dispatch('pointer.double');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenContextMenu(node.id, node.title || '未命名任務', event);
          }}
          onFocus={() => {
            if (!isRelationshipModeActive) onSelect(node.id);
          }}
          onDragStart={(event) => {
            if ((isTrackingReference ? !canManageTaskReference : !canMoveTask) || isCoarsePointer) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', node.id);
            onDragStart(node.id, event);
          }}
          onDrag={onDragMove}
          onDragEnd={onDragEnd}
          onDragOver={(event) => onDragOverNode(event, node.id)}
          onDrop={(event) => onDropOnNode(event, node.id)}
          data-touch-tap-guard="true"
          className={`mobile-pan-item relative z-10 flex min-h-[var(--mindmap-node-min-height)] max-w-[var(--mindmap-node-max-width)] items-center gap-[calc(var(--mindmap-node-gap)*0.3)] rounded-[var(--mindmap-node-radius)] border bg-white px-[var(--mindmap-node-pad-x)] py-[var(--mindmap-node-pad-y)] text-[length:var(--mindmap-node-font-size)] font-semibold text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.08)] outline-none transition-colors ${isLeft ? 'flex-row-reverse' : ''} ${(isTrackingReference ? canManageTaskReference : canMoveTask) && !isCoarsePointer ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isTrackingReference ? 'border-2 border-dashed border-violet-300 bg-violet-50/40' : ''} ${getDropClasses(dropTarget, node.id)}`}
        >
          <span className={`flex min-w-0 flex-col ${isLeft ? 'items-end' : 'items-start'}`}>
            <span className="relative inline-block max-w-full">
              {isTitleEditing ? (
                <>
                  <span
                    aria-hidden="true"
                    className="invisible block max-w-full truncate whitespace-nowrap"
                    data-mindmap-quick-title-layout-anchor="true"
                  >
                    {node.title || '未命名任務'}
                  </span>
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      commitTitleEdit();
                      onOpenDetails(node.id);
                    }}
                    onBlur={() => commitTitleEdit()}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        commitTitleEdit(true);
                      } else if (event.key === 'Tab') {
                        event.preventDefault();
                        event.stopPropagation();
                        continueTitleEdit('child');
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelTitleEdit(true);
                      } else if (event.key === 'Delete') {
                        // The quick naming input is intentionally focused for
                        // XMind-style typing, but Delete is a task command,
                        // not text editing. Handle it at the input boundary so
                        // native text deletion and bubbling races cannot win.
                        event.preventDefault();
                        event.stopPropagation();
                        onTitleEditDelete?.(node.id);
                      }
                    }}
                    aria-label="快速命名任務"
                    data-mindmap-inline-title-input="true"
                    data-mindmap-quick-title-input="true"
                    className="pointer-events-none absolute inset-0 block h-full w-full min-w-0 border-0 bg-transparent p-0 text-center text-inherit outline-none selection:bg-transparent selection:text-inherit"
                  />
                </>
              ) : (
                <span className="block truncate" title={node.title || '未命名任務'}>
                  {node.title || '未命名任務'}
                </span>
              )}
            </span>
            {hasVisibleDates ? (
              <span
                className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-[var(--mindmap-date-pad-x)] py-[var(--mindmap-date-pad-y)] text-[length:var(--mindmap-date-font-size)] font-semibold leading-none text-amber-700"
                title={`${showStartDate && node.startDate ? node.startDate : ''}${showStartDate && node.startDate && node.endDate ? ' ~ ' : ''}${node.endDate || ''}`}
                data-mindmap-node-dates
                data-start-date={showStartDate ? node.startDate || '' : ''}
                data-end-date={node.endDate || ''}
              >
                <Calendar size="var(--mindmap-date-icon-size)" className="shrink-0" />
                <span className="truncate">
                  {showStartDate && node.startDate ? (
                    <>
                      <span>{formatDate(node.startDate)}</span>
                      {node.endDate ? <span className="px-0.5 text-amber-500">~</span> : null}
                    </>
                  ) : null}
                  {node.endDate ? <span>{formatDate(node.endDate)}</span> : null}
                </span>
              </span>
            ) : null}
          </span>
        </MindMapNodeSelectionSurface>
        {hasChildren ? (
          <div
            className="group absolute top-1/2 z-20 flex h-8 w-[var(--mindmap-node-gap)] -translate-y-1/2 items-center justify-center"
            style={isLeft
              ? { left: 'calc(0px - var(--mindmap-node-gap))' }
              : { left: '100%' }}
            data-mindmap-toggle-hover-target={node.id}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0"
              data-mindmap-toggle-hover-hitbox
            />
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpanded(node.id);
              }}
              className="pointer-events-none relative flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 bg-white text-slate-500 opacity-0 shadow-sm transition-[opacity,color,border-color,background-color] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:border-slate-600 hover:bg-slate-50 hover:text-slate-700 focus:pointer-events-auto focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-200"
              title={isExpanded ? '收合分支' : '展開分支'}
              aria-label={isExpanded ? '收合分支' : '展開分支'}
              aria-expanded={isExpanded}
              data-mindmap-toggle
              data-mindmap-toggle-parent-id={node.id}
            >
              {isExpanded ? <Minus size="10" strokeWidth={2.5} /> : <Plus size="10" strokeWidth={2.5} />}
            </button>
          </div>
        ) : null}
      </div>

      {hasChildren && isExpanded && (
        <div
          className="flex flex-col gap-[var(--mindmap-children-gap)]"
          data-mindmap-children-group
          data-mindmap-children-parent-id={node.id}
          data-mindmap-children-direction={direction}
        >
          {childrenNodes.map(child => renderChild(child, direction, level + 1))}
        </div>
      )}
    </div>
  );
};

export default MindMapNode;
