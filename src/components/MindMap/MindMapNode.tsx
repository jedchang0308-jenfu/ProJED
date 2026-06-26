import React from 'react';
import dayjs from 'dayjs';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import type { TaskNode } from '../../types';

export type MindMapDirection = 'left' | 'right';
export type MindMapDropMode = 'before' | 'after' | 'child';

export interface MindMapDropTarget {
  nodeId: string;
  mode: MindMapDropMode;
}

interface MindMapNodeProps {
  node: TaskNode;
  childrenNodes: TaskNode[];
  direction: MindMapDirection;
  level: number;
  selectedNodeId: string | null;
  editingNodeId: string | null;
  editingTitle: string;
  expandedNodeIds: Set<string>;
  dropTarget: MindMapDropTarget | null;
  isRelationshipModeActive?: boolean;
  showStartDate: boolean;
  canEditTask: boolean;
  canMoveTask: boolean;
  onSelect: (nodeId: string) => void;
  onToggleExpanded: (nodeId: string) => void;
  onEditStart: (nodeId: string, title?: string) => void;
  onEditingTitleChange: (title: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onDragStart: (nodeId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onDragMove: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOverNode: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onDropOnNode: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onRelationshipStart: (nodeId: string) => void;
  renderChild: (node: TaskNode, direction: MindMapDirection, level: number) => React.ReactNode;
}

const getDropClasses = (target: MindMapDropTarget | null, nodeId: string) => {
  if (!target || target.nodeId !== nodeId) return '';
  if (target.mode === 'child') return 'ring-2 ring-blue-300 ring-offset-2 bg-blue-50';
  if (target.mode === 'before') return 'before:absolute before:left-1 before:right-1 before:top-[-10px] before:h-1 before:rounded-full before:bg-blue-500 before:shadow-[0_0_0_3px_rgba(59,130,246,0.14)]';
  return 'after:absolute after:bottom-[-10px] after:left-1 after:right-1 after:h-1 after:rounded-full after:bg-blue-500 after:shadow-[0_0_0_3px_rgba(59,130,246,0.14)]';
};

export const MindMapNode: React.FC<MindMapNodeProps> = ({
  node,
  childrenNodes,
  direction,
  level,
  selectedNodeId,
  editingNodeId,
  editingTitle,
  expandedNodeIds,
  dropTarget,
  isRelationshipModeActive = false,
  showStartDate,
  canEditTask,
  canMoveTask,
  onSelect,
  onToggleExpanded,
  onEditStart,
  onEditingTitleChange,
  onEditCommit,
  onEditCancel,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragOverNode,
  onDropOnNode,
  onRelationshipStart,
  renderChild,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isSelected = selectedNodeId === node.id;
  const isEditing = editingNodeId === node.id;
  const isExpanded = expandedNodeIds.has(node.id);
  const hasChildren = childrenNodes.length > 0;
  const isLeft = direction === 'left';
  const hasVisibleDates = (showStartDate && node.startDate) || node.endDate;
  const formatDate = (value?: string) => {
    if (!value) return '';
    const date = dayjs(value);
    if (!date.isValid()) return value;
    return date.year() === dayjs().year() ? date.format('MM/DD') : date.format('YY/MM/DD');
  };

  React.useEffect(() => {
    if (!isEditing) return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isEditing]);

  return (
    <div
      className={`flex items-center gap-[var(--mindmap-node-gap)] ${isLeft ? 'flex-row-reverse text-right' : 'text-left'}`}
      data-mindmap-branch-level={level}
      data-mindmap-branch-direction={direction}
    >
      <div className={`relative flex items-center ${isLeft ? 'flex-row-reverse' : ''}`}>
        <div
          role="treeitem"
          tabIndex={0}
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          data-mindmap-node={node.id}
          data-mindmap-node-title={node.title || '未命名任務'}
          data-mindmap-node-level={level}
          data-mindmap-node-direction={direction}
          data-mindmap-parent-id={node.parentId || ''}
          data-mindmap-node-order={node.order}
          draggable={canMoveTask && !isEditing}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(node.id);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (canEditTask) onEditStart(node.id);
          }}
          onContextMenu={(event) => {
            if (!canEditTask) return;
            event.preventDefault();
            event.stopPropagation();
            onRelationshipStart(node.id);
          }}
          onFocus={() => {
            if (!isRelationshipModeActive) onSelect(node.id);
          }}
          onDragStart={(event) => {
            if (!canMoveTask || isEditing) {
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
          className={`relative z-10 flex min-h-[var(--mindmap-node-min-height)] max-w-[var(--mindmap-node-max-width)] items-center gap-[calc(var(--mindmap-node-gap)*0.3)] rounded-[var(--mindmap-node-radius)] border bg-white px-[var(--mindmap-node-pad-x)] py-[var(--mindmap-node-pad-y)] text-[length:var(--mindmap-node-font-size)] font-semibold text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.08)] outline-none transition-all ${isLeft ? 'flex-row-reverse' : ''} ${isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'} ${canMoveTask && !isEditing ? 'cursor-grab active:cursor-grabbing' : ''} ${getDropClasses(dropTarget, node.id)}`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpanded(node.id);
              }}
              className="flex h-[var(--mindmap-toggle-size)] w-[var(--mindmap-toggle-size)] shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title={isExpanded ? '收合分支' : '展開分支'}
              data-mindmap-toggle
            >
              {isExpanded ? <ChevronDown size="var(--mindmap-toggle-icon-size)" /> : <ChevronRight size="var(--mindmap-toggle-icon-size)" className={isLeft ? 'rotate-180' : ''} />}
            </button>
          ) : (
            <span className="h-[var(--mindmap-toggle-size)] w-[var(--mindmap-toggle-size)] shrink-0" aria-hidden="true" />
          )}

          {isEditing ? (
            <input
              ref={inputRef}
              value={editingTitle}
              onChange={(event) => onEditingTitleChange(event.target.value)}
              onBlur={onEditCommit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter') onEditCommit();
                if (event.key === 'Escape') onEditCancel();
              }}
              className="min-w-[var(--mindmap-input-min-width)] flex-1 rounded border border-blue-200 bg-white px-1.5 py-0.5 text-[length:var(--mindmap-node-font-size)] font-semibold text-slate-800 outline-none ring-2 ring-blue-100"
              data-mindmap-title-input
            />
          ) : (
            <span className={`flex min-w-0 flex-col ${isLeft ? 'items-end' : 'items-start'}`}>
              <span className="max-w-full truncate" title={node.title || '未命名任務'}>
                {node.title || '未命名任務'}
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
          )}
        </div>
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
