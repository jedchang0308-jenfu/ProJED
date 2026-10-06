import React from 'react';
import type { TaskNode } from '../../types';
import type { TaskAssignmentOption } from '../TaskAssignmentPicker';
import { getTaskAssigneeIds, normalizeTaskAssignmentSelection } from '../../utils/taskAssignments';

interface MindMapBatchAssignmentPickerProps {
  nodes: readonly TaskNode[];
  options: readonly TaskAssignmentOption[];
  disabled?: boolean;
  membersLoading?: boolean;
  onApply: (updatesById: Readonly<Record<string, Partial<TaskNode>>>) => void | Promise<void>;
}

const getAggregate = (nodes: readonly TaskNode[], memberId: string, role: 'primary' | 'collaborator') => {
  const count = nodes.filter(node => (
    role === 'primary'
      ? getTaskAssigneeIds(node).includes(memberId)
      : (node.collaboratorIds || []).includes(memberId)
  )).length;
  return count === 0 ? 'none' : count === nodes.length ? 'all' : 'some';
};

export const MindMapBatchAssignmentPicker: React.FC<MindMapBatchAssignmentPickerProps> = ({
  nodes,
  options,
  disabled = false,
  membersLoading = false,
  onApply,
}) => {
  const optionsWithSelected = React.useMemo(() => {
    const knownIds = new Set(options.map(option => option.id));
    const missingIds = Array.from(new Set(nodes.flatMap(node => [
      ...getTaskAssigneeIds(node),
      ...(node.collaboratorIds || []),
    ]))).filter(id => !knownIds.has(id));
    return [
      ...options,
      ...missingIds.map(id => ({ id, label: `已離開成員 (${id})` })),
    ];
  }, [nodes, options]);

  const toggle = (memberId: string, role: 'primary' | 'collaborator') => {
    if (disabled || nodes.length === 0) return;
    const aggregate = getAggregate(nodes, memberId, role);
    const shouldAdd = aggregate !== 'all';
    const updates = Object.fromEntries(nodes.map(node => {
      const currentPrimary = getTaskAssigneeIds(node);
      const currentCollaborators = node.collaboratorIds || [];
      const next = role === 'primary'
        ? normalizeTaskAssignmentSelection(
            shouldAdd
              ? [...currentPrimary, memberId]
              : currentPrimary.filter(id => id !== memberId),
            currentCollaborators.filter(id => id !== memberId),
          )
        : normalizeTaskAssignmentSelection(
            shouldAdd ? currentPrimary.filter(id => id !== memberId) : currentPrimary,
            shouldAdd
              ? [...currentCollaborators, memberId]
              : currentCollaborators.filter(id => id !== memberId),
          );
      return [node.id, {
        assigneeIds: next.primaryIds,
        assigneeId: next.primaryIds[0],
        collaboratorIds: next.collaboratorIds,
      } satisfies Partial<TaskNode>];
    }));
    void onApply(updates);
  };

  const renderRole = (role: 'primary' | 'collaborator', label: string) => (
    <div className="space-y-1.5" data-mindmap-batch-assignment-role={role}>
      <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="max-h-36 overflow-y-auto">
        {optionsWithSelected.length === 0 ? (
          <div className="px-2 py-2 text-xs text-slate-400">{membersLoading ? '載入成員中...' : '沒有可選成員'}</div>
        ) : optionsWithSelected.map(option => {
          const aggregate = getAggregate(nodes, option.id, role);
          return (
            <button
              key={`${role}-${option.id}`}
              type="button"
              disabled={disabled}
              onClick={() => toggle(option.id, role)}
              className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${aggregate === 'all' ? 'bg-primary/10 text-primary' : aggregate === 'some' ? 'bg-amber-50 text-amber-800' : 'text-slate-600 hover:bg-primary/5 hover:text-primary'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${aggregate === 'all' ? 'border-blue-600 bg-blue-600 text-white' : aggregate === 'some' ? 'border-amber-500 bg-amber-100 text-amber-700' : 'border-slate-300 bg-white'}`}
              >
                {aggregate === 'all' ? '✓' : aggregate === 'some' ? '−' : ''}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {aggregate === 'some' ? <span className="text-[10px] text-amber-600">部分</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-2 px-2 py-1" data-mindmap-batch-assignment-picker="true">
      {renderRole('primary', '主責')}
      <div className="border-t border-slate-100" />
      {renderRole('collaborator', '協作')}
    </div>
  );
};

export default MindMapBatchAssignmentPicker;
