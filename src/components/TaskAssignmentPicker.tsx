import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Users } from 'lucide-react';
import type { TaskNode } from '../types';
import {
  getTaskAssigneeIds,
  normalizeTaskAssignmentSelection,
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
  fullSummary?: boolean;
  /** Goal uses the quiet surface; default keeps every existing consumer unchanged. */
  triggerVariant?: 'default' | 'quiet';
  portal?: boolean;
  /** Decorative trigger icon can be hidden by dense mode-specific surfaces. */
  showIcon?: boolean;
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
  fullSummary = false,
  triggerVariant = 'default',
  portal = false,
  showIcon = true,
  onChange,
}) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(inline);
  const [portalStyle, setPortalStyle] = React.useState<React.CSSProperties>();
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
  const getMemberLabel = React.useCallback(
    (id: string) => optionsById.get(id)?.label || `已離開成員 (${id})`,
    [optionsById]
  );
  const primarySummary = formatSelectedLabels(currentSelection.primaryIds, optionsById);
  const collaboratorSummary = currentSelection.collaboratorIds.length > 0
    ? currentSelection.collaboratorIds.map(getMemberLabel).join('、')
    : '未設定';
  const fullSummaryTitle = `主責：${primarySummary}；協作：${collaboratorSummary}`;
  const assignmentSummary = currentSelection.collaboratorIds.length > 0
    ? `${primarySummary}・協作 ${currentSelection.collaboratorIds.length} 人`
    : primarySummary;

  React.useEffect(() => {
    if (inline || !isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setIsOpen(false);
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

  const updatePortalPosition = React.useCallback(() => {
    if (!portal || !rootRef.current) return;
    const triggerRect = rootRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    const width = Math.max(250, triggerRect.width);
    const left = Math.min(
      Math.max(8, triggerRect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const belowTop = triggerRect.bottom + 4;
    const aboveTop = triggerRect.top - panelHeight - 4;
    const top = panelHeight > 0 && belowTop + panelHeight > window.innerHeight - 8 && aboveTop >= 8
      ? aboveTop
      : Math.min(belowTop, Math.max(8, window.innerHeight - panelHeight - 8));
    setPortalStyle({ left, top, width });
  }, [portal]);

  React.useLayoutEffect(() => {
    if (!portal || !isOpen) return undefined;
    updatePortalPosition();
    const frame = window.requestAnimationFrame(updatePortalPosition);
    window.addEventListener('resize', updatePortalPosition);
    window.addEventListener('scroll', updatePortalPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePortalPosition);
      window.removeEventListener('scroll', updatePortalPosition, true);
    };
  }, [isOpen, portal, updatePortalPosition]);

  const commit = (primaryIds: string[], collaboratorIds: string[]) => {
    const selection = normalizeTaskAssignmentSelection(primaryIds, collaboratorIds);
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
          className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
            checked
              ? 'bg-primary/10 text-primary ring-1 ring-primary/15'
              : 'text-slate-600 hover:bg-primary/5 hover:text-primary'
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
        </label>
      );
    });
  };

  const panel = (
    <div
      ref={panelRef}
      className={`${inline ? '' : portal ? 'fixed z-[10020]' : 'absolute left-0 top-full z-[80] mt-1'} w-full min-w-[250px] space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-xl`}
      style={portal ? portalStyle : undefined}
      data-task-assignment-picker-panel="true"
      onClick={event => event.stopPropagation()}
    >
      <div className="space-y-1.5" data-task-assignment-section="primary">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          主責
        </div>
        <div className="max-h-40 overflow-y-auto">{renderMemberList('primary')}</div>
      </div>
      <div className="border-t border-slate-100" />
      <div className="space-y-1.5" data-task-assignment-section="collaborator">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          協作
        </div>
        <div className="max-h-40 overflow-y-auto">{renderMemberList('collaborator')}</div>
      </div>
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
    <div
      ref={rootRef}
      className="relative w-full"
      data-task-assignment-picker="true"
      data-task-assignment-trigger-variant={triggerVariant}
      data-task-assignment-full-summary={fullSummary ? 'true' : undefined}
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={fullSummary ? fullSummaryTitle : undefined}
        data-task-assignment-trigger="true"
        className={triggerVariant === 'quiet'
          ? `group flex h-7 w-full min-w-0 items-center gap-1 rounded-sm border border-transparent bg-transparent px-1 text-left text-sm text-slate-700 outline-none transition hover:bg-slate-100/70 focus-visible:bg-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/50 disabled:cursor-not-allowed disabled:text-slate-400 ${compact ? 'text-xs' : ''}`
          : `flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-left text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${compact ? 'text-xs' : ''}`}
      >
        {showIcon ? <Users size={compact ? 13 : 15} className="flex-shrink-0 text-blue-500" data-task-assignment-trigger-icon="true" /> : null}
        <span className="min-w-0 flex-1 truncate">
          {fullSummary ? assignmentSummary : primarySummary}
        </span>
        {!fullSummary && currentSelection.primaryIds.length > 1 ? (
          <span className="flex-shrink-0 text-[10px] text-slate-400">{currentSelection.primaryIds.length} 人</span>
        ) : null}
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-[opacity,transform] ${isOpen ? 'rotate-180 opacity-100' : triggerVariant === 'quiet' ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : ''}`} />
      </button>
      {isOpen ? (portal ? createPortal(panel, document.body) : panel) : null}
      {!fullSummary && currentSelection.collaboratorIds.length > 0 ? (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400" title="協作成員數量">
          <Users size={11} /> 協作 {currentSelection.collaboratorIds.length} 人
        </div>
      ) : null}
    </div>
  );
};

export default TaskAssignmentPicker;
