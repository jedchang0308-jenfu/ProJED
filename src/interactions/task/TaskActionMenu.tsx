import React from 'react';
import {
  Archive,
  Copy,
  CornerLeftUp,
  CornerRightDown,
  GitBranch,
  Link2,
  Unlink,
  PanelRight,
  Plus,
  UserRound,
} from 'lucide-react';
import { getTaskActionCatalog, getTaskActionDefinition } from './taskActionCatalog';
import type { TaskActionId } from './types';

type TaskActionMenuProps = {
  actionIds: readonly TaskActionId[];
  enabled: Readonly<Partial<Record<TaskActionId, boolean>>>;
  onAction: (actionId: TaskActionId) => void | Promise<void>;
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
  'task.create-tracking-reference': <Link2 size={14} className="flex-shrink-0 text-violet-500" />,
  'task.remove-tracking-reference': <Unlink size={14} className="flex-shrink-0 text-rose-500" />,
  'task.assign': <UserRound size={14} className="flex-shrink-0 text-blue-500" />,
  'task.dependency-start': <GitBranch size={14} className="flex-shrink-0 text-amber-500" />,
  'task.dependency-end': <GitBranch size={14} className="flex-shrink-0 text-purple-500" />,
  'task.promote': <CornerLeftUp size={14} className="flex-shrink-0 text-emerald-500" />,
  'task.demote': <CornerRightDown size={14} className="flex-shrink-0 text-emerald-500" />,
  'task.archive': <Archive size={14} className="flex-shrink-0 text-amber-600" />,
  'task.collect': <Archive size={14} className="flex-shrink-0 text-blue-600" />,
};

const LABELS: Partial<Record<TaskActionId, string>> = {
  'task.open-details': '開啟明細',
  'task.create-sibling': '新增並列任務',
  'task.create-child': '新增子任務',
  'task.create-relationship': '建立關聯線',
  'task.duplicate': '複製任務',
  'task.create-tracking-reference': '建立追蹤副本',
  'task.remove-tracking-reference': '移除此處追蹤',
  'task.assign': '主責／協作',
  'task.dependency-start': '設定依賴關係（開始日）',
  'task.dependency-end': '設定依賴關係（結束日）',
  'task.promote': '往上一階',
  'task.demote': '往下一階',
  'task.archive': '封存任務',
  'task.collect': '典藏任務',
};

const TITLES: Partial<Record<TaskActionId, string>> = {
  'task.create-sibling': '與目前任務同層新增',
  'task.create-child': '放在目前任務底下新增',
  'task.create-relationship': '以目前任務為起點選擇目標',
};

const SECTION_ORDER = ['create', 'assignment', 'dependency', 'hierarchy', 'lifecycle', 'danger'] as const;

const actionLabel = (actionId: TaskActionId) => (
  LABELS[actionId] || getTaskActionDefinition(actionId)?.label || actionId
);

export const TaskActionMenu = ({
  actionIds,
  enabled,
  onAction,
  assignmentOpen = false,
  assignmentSummary,
  assignmentContent,
  onToggleAssignment,
}: TaskActionMenuProps) => {
  const actionsBySection = new Map<string, TaskActionId[]>();
  for (const section of SECTION_ORDER) actionsBySection.set(section, []);
  const navigationActions: TaskActionId[] = [];
  for (const action of getTaskActionCatalog()) {
    if (!actionIds.includes(action.id)) continue;
    if (!action.section) {
      navigationActions.push(action.id);
      continue;
    }
    actionsBySection.get(action.section)?.push(action.id);
  }

  const renderAction = (actionId: TaskActionId) => {
    const actionEnabled = enabled[actionId] !== false;
    if (actionId === 'task.assign') {
      return (
        <React.Fragment key={actionId}>
          <button
            type="button"
            onClick={onToggleAssignment}
            disabled={!actionEnabled}
            data-task-action-id={actionId}
            className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {ICONS[actionId]}
            <span className="min-w-0 flex-1">
              <span className="block">{actionLabel(actionId)}</span>
              {assignmentSummary ? <span className="block truncate text-[11px] text-gray-400">{assignmentSummary}</span> : null}
            </span>
            <span aria-hidden="true" className={`text-gray-400 transition-transform ${assignmentOpen ? 'rotate-90' : ''}`}>›</span>
          </button>
          {assignmentOpen ? (
            <div className="border-y border-gray-100 bg-gray-50/80 py-1 dark:border-gray-700 dark:bg-gray-900/30">
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
        onClick={() => void onAction(actionId)}
        disabled={!actionEnabled}
        title={TITLES[actionId]}
        data-task-action-id={actionId}
          className={`flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700 ${actionId === 'task.remove-tracking-reference' ? 'text-rose-700 hover:bg-rose-50 dark:text-rose-400' : actionId === 'task.archive' ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-400' : actionId === 'task.collect' ? 'text-blue-700 hover:bg-blue-50 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100'}`}
      >
        {ICONS[actionId]}
        <span>{actionLabel(actionId)}</span>
      </button>
    );
  };

  return (
    <>
      {navigationActions.map(renderAction)}
      {navigationActions.length > 0 && SECTION_ORDER.some(section => (actionsBySection.get(section) || []).length > 0) ? (
        <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
      ) : null}
      {SECTION_ORDER.flatMap((section, sectionIndex) => {
        const actions = actionsBySection.get(section) || [];
        if (actions.length === 0) return [];
        const content = actions.map(renderAction);
        return [
          sectionIndex > 0 ? <div key={`${section}-divider`} className="my-1 border-t border-gray-100 dark:border-gray-700" /> : null,
          ...content,
        ];
      })}
    </>
  );
};
