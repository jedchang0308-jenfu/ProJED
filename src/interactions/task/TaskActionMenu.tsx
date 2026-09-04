import React from 'react';
import {
  Archive,
  ClipboardPaste,
  Copy,
  CornerLeftUp,
  CornerRightDown,
  GitBranch,
  Link2,
  LockKeyhole,
  Unlink,
  PanelRight,
  Plus,
  Scissors,
  UserRound,
} from 'lucide-react';
import { getTaskActionCatalog, getTaskActionDefinition } from './taskActionCatalog';
import type { TaskActionId } from './types';

type TaskActionMenuProps = {
  actionIds: readonly TaskActionId[];
  enabled: Readonly<Partial<Record<TaskActionId, boolean>>>;
  disabledReasons?: Readonly<Partial<Record<TaskActionId, string>>>;
  onAction: (actionId: TaskActionId) => void | Promise<void>;
  hideDisabled?: boolean;
  compact?: boolean;
  assignmentOpen?: boolean;
  assignmentSummary?: React.ReactNode;
  assignmentContent?: React.ReactNode;
  onToggleAssignment?: () => void;
};

const ICONS: Partial<Record<TaskActionId, React.ReactNode>> = {
  'task.open-details': <PanelRight size={14} className="flex-shrink-0 text-indigo-500" />,
  'task.create-sibling': <Plus size={14} className="flex-shrink-0 text-sky-500" />,
  'task.create-child': <CornerRightDown size={14} className="flex-shrink-0 text-blue-500" />,
  'task.create-relationship': <Link2 size={14} className="flex-shrink-0 text-indigo-500" />,
  'task.duplicate': <Copy size={14} className="flex-shrink-0 text-slate-500" />,
  'task.copy': <Copy size={14} className="flex-shrink-0 text-slate-500" />,
  'task.cut': <Scissors size={14} className="flex-shrink-0 text-slate-500" />,
  'task.paste-after': <ClipboardPaste size={14} className="flex-shrink-0 text-slate-500" />,
  'task.create-tracking-reference': <Link2 size={14} className="flex-shrink-0 text-violet-500" />,
  'task.remove-tracking-reference': <Unlink size={14} className="flex-shrink-0 text-rose-500" />,
  'task.assign': <UserRound size={14} className="flex-shrink-0 text-blue-500" />,
  'task.dependency-start': <GitBranch size={14} className="flex-shrink-0 text-amber-500" />,
  'task.dependency-end': <GitBranch size={14} className="flex-shrink-0 text-purple-500" />,
  'task.promote': <CornerLeftUp size={14} className="flex-shrink-0 text-emerald-500" />,
  'task.demote': <CornerRightDown size={14} className="flex-shrink-0 text-emerald-500" />,
  'task.archive': <Archive size={14} className="flex-shrink-0 text-amber-600" />,
};

const LABELS: Partial<Record<TaskActionId, string>> = {
  'task.open-details': '開啟明細',
  'task.create-sibling': '新增並列任務',
  'task.create-child': '新增子任務',
  'task.create-relationship': '建立關聯線',
  'task.duplicate': '複製任務',
  'task.copy': '複製',
  'task.cut': '剪下',
  'task.paste-after': '貼在此任務之後',
  'task.create-tracking-reference': '建立追蹤副本',
  'task.remove-tracking-reference': '移除此處追蹤',
  'task.assign': '主責／協作',
  'task.dependency-start': '設定依賴關係（開始日）',
  'task.dependency-end': '設定依賴關係（結束日）',
  'task.promote': '往上一階',
  'task.demote': '往下一階',
  'task.archive': '封存任務',
};

const TITLES: Partial<Record<TaskActionId, string>> = {
  'task.create-sibling': '與目前任務同層新增',
  'task.create-child': '放在目前任務底下新增',
  'task.create-relationship': '以目前任務為起點選擇目標',
};

const SECTION_ORDER = ['create', 'clipboard', 'assignment', 'tracking-reference', 'dependency', 'hierarchy', 'lifecycle', 'danger'] as const;

const actionLabel = (actionId: TaskActionId) => (
  LABELS[actionId] || getTaskActionDefinition(actionId)?.label || actionId
);

export const TaskActionMenu = ({
  actionIds,
  enabled,
  disabledReasons = {},
  onAction,
  hideDisabled = false,
  compact = false,
  assignmentOpen = false,
  assignmentSummary,
  assignmentContent,
  onToggleAssignment,
}: TaskActionMenuProps) => {
  const actionsBySection = new Map<string, TaskActionId[]>();
  for (const section of SECTION_ORDER) actionsBySection.set(section, []);
  const navigationActions: TaskActionId[] = [];
  const visibleActionIds = hideDisabled
    ? actionIds.filter(actionId => enabled[actionId] !== false)
    : actionIds;
  const rowBaseClassName = compact
    ? 'flex min-h-8 w-full items-center gap-2 px-2.5 py-1 text-left text-[13px] leading-5 transition-colors focus-visible:bg-indigo-50 focus-visible:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:focus-visible:bg-indigo-950/40 dark:focus-visible:text-white'
    : 'flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500';
  const dividerClassName = compact
    ? 'my-0.5 border-t border-slate-200 dark:border-gray-700'
    : 'my-1 border-t border-gray-100 dark:border-gray-700';
  for (const action of getTaskActionCatalog()) {
    if (!visibleActionIds.includes(action.id)) continue;
    if (!action.section) {
      navigationActions.push(action.id);
      continue;
    }
    const section = action.id === 'task.create-tracking-reference' ? 'tracking-reference' : action.section;
    actionsBySection.get(section)?.push(action.id);
  }

  const renderAction = (actionId: TaskActionId) => {
    const actionEnabled = enabled[actionId] !== false;
    const disabledReason = actionEnabled ? undefined : disabledReasons[actionId] || '目前無法使用此功能';
    if (actionId === 'task.assign') {
      return (
        <React.Fragment key={actionId}>
          <button
            type="button"
            onClick={() => {
              if (actionEnabled) onToggleAssignment?.();
            }}
            aria-disabled={!actionEnabled}
            title={disabledReason}
            data-task-action-id={actionId}
            className={`${rowBaseClassName} ${actionEnabled ? 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-700' : 'cursor-not-allowed text-slate-400 opacity-55'}`}
          >
            {ICONS[actionId]}
            <span className="min-w-0 flex-1">
              <span className="block">{actionLabel(actionId)}</span>
              {assignmentSummary ? <span className={`block truncate text-gray-500 ${compact ? 'text-[10px] leading-4' : 'text-[11px]'}`}>{assignmentSummary}</span> : null}
              {disabledReason ? <span className={`block text-amber-700 ${compact ? 'text-[10px] leading-4' : 'text-[11px]'}`}>{disabledReason}</span> : null}
            </span>
            {!actionEnabled ? <LockKeyhole size={12} aria-hidden="true" className="flex-shrink-0 text-amber-600" /> : null}
            <span aria-hidden="true" className={`text-gray-400 transition-transform ${assignmentOpen ? 'rotate-90' : ''}`}>›</span>
          </button>
          {assignmentOpen && actionEnabled ? (
            <div className={`border-y border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/30 ${compact ? 'py-0.5' : 'py-1'}`}>
              {assignmentContent}
            </div>
          ) : null}
        </React.Fragment>
      );
    }
    return (
      <button
        key={actionId}
        type="button"
        onClick={() => {
          if (actionEnabled) void onAction(actionId);
        }}
        aria-disabled={!actionEnabled}
        title={disabledReason || TITLES[actionId]}
        data-task-action-id={actionId}
        className={`${rowBaseClassName} ${!actionEnabled ? 'cursor-not-allowed text-slate-400 opacity-55' : actionId === 'task.remove-tracking-reference' ? 'text-rose-700 hover:bg-rose-50 dark:text-rose-400' : actionId === 'task.archive' ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-400' : 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-700'}`}
      >
        {ICONS[actionId]}
        <span className="min-w-0 flex-1">
          <span className="block">{actionLabel(actionId)}</span>
          {disabledReason ? <span className="block text-[11px] text-amber-700">{disabledReason}</span> : null}
        </span>
        {!actionEnabled ? <LockKeyhole size={12} aria-hidden="true" className="flex-shrink-0 text-amber-600" /> : null}
      </button>
    );
  };

  return (
    <>
      {navigationActions.map(renderAction)}
      {navigationActions.length > 0 && SECTION_ORDER.some(section => (actionsBySection.get(section) || []).length > 0) ? (
        <div className={dividerClassName} />
      ) : null}
      {SECTION_ORDER.flatMap((section, sectionIndex) => {
        const actions = actionsBySection.get(section) || [];
        if (actions.length === 0) return [];
        const content = actions.map(renderAction);
        return [
          sectionIndex > 0 ? <div key={`${section}-divider`} className={dividerClassName} /> : null,
          ...content,
        ];
      })}
    </>
  );
};
