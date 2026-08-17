import type { CSSProperties, MouseEventHandler } from 'react';
import { getTaskActionDefinition } from './taskActionCatalog';
import type { TaskActionId } from './types';

export type TaskActionMenuProps = {
  actionIds: readonly TaskActionId[];
  enabled?: Readonly<Record<string, boolean>>;
  onAction: (actionId: TaskActionId) => void;
  style?: CSSProperties;
  className?: string;
};

export const TaskActionMenu = ({ actionIds, enabled = {}, onAction, style, className = '' }: TaskActionMenuProps) => {
  const handleClick = (actionId: TaskActionId): MouseEventHandler<HTMLButtonElement> => (event) => {
    event.stopPropagation();
    if (enabled[actionId] === false) return;
    onAction(actionId);
  };

  return (
    <div className={`flex min-w-52 flex-col rounded-lg border border-slate-200 bg-white p-1 shadow-xl ${className}`} style={style} role="menu">
      {actionIds.map(actionId => {
        const action = getTaskActionDefinition(actionId);
        if (!action) return null;
        const isEnabled = enabled[actionId] !== false;
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            disabled={!isEnabled}
            aria-label={action.label}
            data-task-action-id={action.id}
            className="flex items-center rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={handleClick(action.id)}
          >
            <span className="mr-2 w-4 text-center text-xs text-slate-500" aria-hidden="true">{action.icon.slice(0, 1).toUpperCase()}</span>
            {action.label}
          </button>
        );
      })}
    </div>
  );
};
