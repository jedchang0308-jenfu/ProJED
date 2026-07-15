import React from 'react';
import { ChevronDown, Users } from 'lucide-react';
import type { TaskNode } from '../types';
import { toast } from '../store/useToastStore';
import {
  getTaskAssigneeIds,
  normalizeTaskAssignmentSelection,
  requiresPrimaryAssignee,
} from '../utils/taskAssignments';

export type TaskAssignmentOption = {
  id: string;
  label: string;
  role?: string;
};

interface TaskAssignmentPickerProps {
  node: Pick<TaskNode, 'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'nodeType' | 'isArchived' | 'status'>;
  options: TaskAssignmentOption[];
  membersLoading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  inline?: boolean;
  onChange: (primaryIds: string[], collaboratorIds: string[]) => void;
}

const formatSelectedLabels = (ids: string[], optionsById: Map<string, TaskAssignmentOption>) => {
  if (ids.length === 0) return '未指派';
  if (ids.length > 2) return `共同主責 ${ids.length} 人`;
  return ids.map(id => optionsById.get(id)?.label || `已離開成員 (${id})`).join('、');
};

export const TaskAssignmentPicker: React.FC<TaskAssignmentPickerProps> = ({
  node,
  options,
  membersLoading = false,
  disabled = false,
  compact = false,
  inline = false,
  onChange,
}) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(inline);
  const currentSelection = React.useMemo(
    () => normalizeTaskAssignmentSelection(
      getTaskAssigneeIds(node),
      node.collaboratorIds ?? [],
    ),
    [node]
  );
  const optionsWithSelected = React.useMemo<TaskAssignmentOption[]>(() => {
    const knownIds = new Set(options.map(option => option.id));
    const missingIds = [
      ...currentSelection.primaryIds,
      ...currentSelection.collaboratorIds,
    ].filter(id => !knownIds.has(id));
    return [
      ...options,
      ...Array.from(new Set(missingIds)).map(id => ({
        id,
        label: `已離開成員 (${id})`,
      })),
    ];
  }, [currentSelection.collaboratorIds, currentSelection.primaryIds, options]);
  const optionsById = React.useMemo(
    () => new Map(optionsWithSelected.map(option => [option.id, option])),
    [optionsWithSelected]
  );
  const primaryRequired = requiresPrimaryAssignee(node);

  React.useEffect(() => {
    if (inline || !isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [inline, isOpen]);

  const commit = (primaryIds: string[], collaboratorIds: string[]) => {
    const selection = normalizeTaskAssignmentSelection(primaryIds, collaboratorIds);
    if (primaryRequired && selection.primaryIds.length === 0) {
      toast.warning('執行中的任務至少要保留一位主責成員。');
      return;
    }
    onChange(selection.primaryIds, selection.collaboratorIds);
  };

  const togglePrimary = (id: string) => {
    if (disabled) return;
    const isSelected = currentSelection.primaryIds.includes(id);
    const nextPrimaryIds = isSelected
      ? currentSelection.primaryIds.filter(currentId => currentId !== id)
      : [...currentSelection.primaryIds, id];
    commit(nextPrimaryIds, currentSelection.collaboratorIds.filter(currentId => currentId !== id));
  };

  const toggleCollaborator = (id: string) => {
    if (disabled || currentSelection.primaryIds.includes(id)) return;
    const nextCollaboratorIds = currentSelection.collaboratorIds.includes(id)
      ? currentSelection.collaboratorIds.filter(currentId => currentId !== id)
      : [...currentSelection.collaboratorIds, id];
    commit(currentSelection.primaryIds, nextCollaboratorIds);
  };

  const renderMemberList = (role: 'primary' | 'collaborator') => {
    const selectedIds = role === 'primary'
      ? currentSelection.primaryIds
      : currentSelection.collaboratorIds;
    const toggle = role === 'primary' ? togglePrimary : toggleCollaborator;
    const visibleOptions = role === 'collaborator'
      ? optionsWithSelected.filter(option => !currentSelection.primaryIds.includes(option.id))
      : optionsWithSelected;

    if (visibleOptions.length === 0) {
      return <div className="px-2 py-2 text-xs text-slate-400">{membersLoading ? '載入成員中...' : '沒有可選成員'}</div>;
    }

    return visibleOptions.map(option => {
      const checked = selectedIds.includes(option.id);
      return (
        <label
          key={`${role}-${option.id}`}
          className={`flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
            checked ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => toggle(option.id)}
            className="h-4 w-4 flex-shrink-0 accent-blue-600"
          />
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {option.role ? <span className="text-[10px] text-slate-400">{option.role}</span> : null}
        </label>
      );
    });
  };

  const panel = (
    <div
      className={`${inline ? '' : 'absolute left-0 top-full z-[80] mt-1'} w-full min-w-[250px] rounded-lg border border-slate-200 bg-white p-2 text-left shadow-xl`}
      data-task-assignment-picker-panel="true"
      onClick={event => event.stopPropagation()}
    >
      <div className="mb-2 flex items-start gap-2 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700">
        <Users size={14} className="mt-0.5 flex-shrink-0" />
        <span className="min-w-0 flex-1">主責對成果、期限與狀態負責；協作成員提供執行或支援。</span>
        {currentSelection.primaryIds.length > 3 ? (
          <span className="flex-shrink-0 font-semibold">共同主責較多</span>
        ) : null}
      </div>
      <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold text-slate-500">
        <span>主責成員（可複選）</span>
        {!primaryRequired && currentSelection.primaryIds.length > 0 ? (
          <button
            type="button"
            onClick={() => commit([], currentSelection.collaboratorIds)}
            disabled={disabled}
            className="text-[10px] font-medium text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed"
          >
            清除主責
          </button>
        ) : null}
      </div>
      <div className="max-h-40 overflow-y-auto">{renderMemberList('primary')}</div>
      <div className="my-2 border-t border-slate-100" />
      <div className="mb-1 px-2 text-[11px] font-semibold text-slate-500">協作成員（可複選）</div>
      <div className="max-h-40 overflow-y-auto">{renderMemberList('collaborator')}</div>
    </div>
  );

  if (inline) {
    return (
      <div ref={rootRef} className="w-full" data-task-assignment-picker="true" onClick={event => event.stopPropagation()}>
        {panel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative w-full" data-task-assignment-picker="true" onClick={event => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-left text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${compact ? 'text-xs' : ''}`}
      >
        <Users size={compact ? 13 : 15} className="flex-shrink-0 text-blue-500" />
        <span className="min-w-0 flex-1 truncate">{formatSelectedLabels(currentSelection.primaryIds, optionsById)}</span>
        {currentSelection.primaryIds.length > 1 ? (
          <span className="flex-shrink-0 text-[10px] text-slate-400">{currentSelection.primaryIds.length} 人</span>
        ) : null}
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen ? panel : null}
      {currentSelection.collaboratorIds.length > 0 ? (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400" title="協作成員數量">
          <Users size={11} /> 協作 {currentSelection.collaboratorIds.length} 人
        </div>
      ) : null}
    </div>
  );
};

export default TaskAssignmentPicker;
