import React from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Check,
  ClipboardPaste,
  Copy,
  CornerLeftUp,
  CornerRightDown,
  Clock3,
  ChevronRight,
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

const SUBMENU_SURFACE_CLASSNAME = 'overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-800';

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
  onAssignmentOpenChange?: (open: boolean) => void;
  combineCreateActions?: boolean;
  combineDependencyActions?: boolean;
  inlineActionId?: TaskActionId | null;
  inlineActionContent?: React.ReactNode;
  actionLabelOverrides?: Partial<Record<TaskActionId, string>>;
};

const ICONS: Partial<Record<TaskActionId, React.ReactNode>> = {
  'task.toggle-complete': <Check size={14} className="flex-shrink-0 text-emerald-500" />,
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
  'task.edit-meeting-reservation': <Clock3 size={14} className="flex-shrink-0 text-indigo-500" />,
  'task.assign': <UserRound size={14} className="flex-shrink-0 text-blue-500" />,
  'task.dependency-start': <GitBranch size={14} className="flex-shrink-0 text-amber-500" />,
  'task.dependency-end': <GitBranch size={14} className="flex-shrink-0 text-purple-500" />,
  'task.promote': <CornerLeftUp size={14} className="flex-shrink-0 text-emerald-500" />,
  'task.demote': <CornerRightDown size={14} className="flex-shrink-0 text-emerald-500" />,
  'task.archive': <Archive size={14} className="flex-shrink-0 text-amber-600" />,
};

const LABELS: Partial<Record<TaskActionId, string>> = {
  'task.open-details': '開啟明細',
  'task.toggle-complete': '狀態改完成',
  'task.create-relationship': '建立關聯線',
  'task.duplicate': '複製任務',
  'task.copy': '複製',
  'task.cut': '剪下',
  'task.paste-after': '貼上',
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

const SECTION_ORDER = ['create', 'clipboard', 'assignment', 'planning', 'dependency', 'hierarchy', 'lifecycle', 'danger'] as const;

const actionLabel = (
  actionId: TaskActionId,
  overrides: Partial<Record<TaskActionId, string>> = {},
) => overrides[actionId] || LABELS[actionId] || getTaskActionDefinition(actionId)?.label || actionId;

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
  onAssignmentOpenChange,
  combineCreateActions = false,
  combineDependencyActions = false,
  inlineActionId = null,
  inlineActionContent,
  actionLabelOverrides = {},
}: TaskActionMenuProps) => {
  const assignmentTriggerRef = React.useRef<HTMLButtonElement>(null);
  const assignmentPanelRef = React.useRef<HTMLDivElement>(null);
  const submenuTriggerRefs = React.useRef<Partial<Record<'create' | 'dependency', HTMLButtonElement | null>>>({});
  const submenuPanelRef = React.useRef<HTMLDivElement>(null);
  const assignmentPanelId = React.useId();
  const submenuPanelId = React.useId();
  const closeAssignmentTimer = React.useRef<number | undefined>(undefined);
  const closeSubmenuTimer = React.useRef<number | undefined>(undefined);
  const focusAssignmentPanel = React.useRef(false);
  const focusSubmenuPanel = React.useRef(false);
  const [flyoutPosition, setFlyoutPosition] = React.useState<React.CSSProperties | null>();
  const [openSubmenu, setOpenSubmenu] = React.useState<'create' | 'dependency' | null>(null);
  const [submenuPosition, setSubmenuPosition] = React.useState<React.CSSProperties | null>();
  const isFlyoutPositioned = Boolean(flyoutPosition);
  const hasAssignmentFlyout = Boolean(onAssignmentOpenChange);

  const clearAssignmentTimer = React.useCallback(() => {
    window.clearTimeout(closeAssignmentTimer.current);
  }, []);
  const clearSubmenuTimer = React.useCallback(() => {
    window.clearTimeout(closeSubmenuTimer.current);
  }, []);
  React.useEffect(() => clearAssignmentTimer, [clearAssignmentTimer]);
  React.useEffect(() => clearSubmenuTimer, [clearSubmenuTimer]);
  React.useEffect(() => {
    if (!assignmentOpen) {
      clearAssignmentTimer();
      focusAssignmentPanel.current = false;
    }
  }, [assignmentOpen, clearAssignmentTimer]);

  React.useLayoutEffect(() => {
    if (!hasAssignmentFlyout || !assignmentOpen) {
      setFlyoutPosition(undefined);
      return;
    }
    const trigger = assignmentTriggerRef.current;
    const parentMenu = trigger?.closest('[data-global-context-menu]');
    if (!trigger || !parentMenu) return;

    const viewport = window.visualViewport;
    const positionFlyout = () => {
      const menuRect = parentMenu.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const panelWidth = 250;
      const inset = 12;
      const maxHeight = Math.max(0, viewportHeight - inset * 2);
      const panelHeight = Math.min(assignmentPanelRef.current?.scrollHeight ?? 0, maxHeight);
      const right = menuRect.right - 1;
      const left = menuRect.left - panelWidth + 1;
      const side = right + panelWidth <= viewportWidth - inset ? right : left >= inset ? left : null;
      setFlyoutPosition(side === null ? null : {
        left: side,
        top: Math.max(inset, Math.min(triggerRect.top, viewportHeight - inset - panelHeight)),
        width: panelWidth,
        maxHeight,
      });
    };

    positionFlyout();
    let frame = 0;
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(positionFlyout);
    };
    const resize = new ResizeObserver(schedulePosition);
    resize.observe(parentMenu);
    if (assignmentPanelRef.current) resize.observe(assignmentPanelRef.current);
    parentMenu.addEventListener('scroll', schedulePosition);
    window.addEventListener('resize', schedulePosition);
    viewport?.addEventListener('resize', schedulePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      parentMenu.removeEventListener('scroll', schedulePosition);
      window.removeEventListener('resize', schedulePosition);
      viewport?.removeEventListener('resize', schedulePosition);
    };
  }, [assignmentOpen, hasAssignmentFlyout, isFlyoutPositioned]);

  React.useLayoutEffect(() => {
    if (!openSubmenu) {
      setSubmenuPosition(undefined);
      return;
    }
    const trigger = submenuTriggerRefs.current[openSubmenu];
    const parentMenu = trigger?.closest('[data-global-context-menu]');
    if (!trigger || !parentMenu) {
      setSubmenuPosition(null);
      return;
    }

    const positionFlyout = () => {
      const menuRect = parentMenu.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const panelWidth = 220;
      const inset = 12;
      const panelHeight = Math.min(submenuPanelRef.current?.scrollHeight ?? 0, viewportHeight - inset * 2);
      const right = menuRect.right - 1;
      const left = menuRect.left - panelWidth + 1;
      const side = right + panelWidth <= viewportWidth - inset ? right : left >= inset ? left : null;
      setSubmenuPosition(side === null ? null : {
        left: side,
        top: Math.max(inset, Math.min(triggerRect.top, viewportHeight - inset - panelHeight)),
        width: panelWidth,
        maxHeight: Math.max(0, viewportHeight - inset * 2),
      });
    };

    positionFlyout();
    let frame = 0;
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(positionFlyout);
    };
    const resize = new ResizeObserver(schedulePosition);
    resize.observe(parentMenu);
    if (submenuPanelRef.current) resize.observe(submenuPanelRef.current);
    parentMenu.addEventListener('scroll', schedulePosition);
    window.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      parentMenu.removeEventListener('scroll', schedulePosition);
      window.removeEventListener('resize', schedulePosition);
      window.visualViewport?.removeEventListener('resize', schedulePosition);
    };
  }, [openSubmenu]);

  React.useLayoutEffect(() => {
    if (!assignmentOpen || flyoutPosition === undefined || !focusAssignmentPanel.current) return;
    focusAssignmentPanel.current = false;
    const panel = assignmentPanelRef.current;
    (panel?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? panel)?.focus();
  }, [assignmentOpen, flyoutPosition]);

  React.useLayoutEffect(() => {
    if (!openSubmenu || submenuPosition === undefined || !focusSubmenuPanel.current) return;
    focusSubmenuPanel.current = false;
    submenuPanelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [openSubmenu, submenuPosition]);

  const scheduleAssignmentClose = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || !onAssignmentOpenChange) return;
    clearAssignmentTimer();
    closeAssignmentTimer.current = window.setTimeout(() => onAssignmentOpenChange(false), 180);
  };
  const scheduleSubmenuClose = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    clearSubmenuTimer();
    closeSubmenuTimer.current = window.setTimeout(() => setOpenSubmenu(null), 180);
  };

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
    actionsBySection.get(action.section)?.push(action.id);
  }

  const renderActionSubmenu = (kind: 'create' | 'dependency'): React.ReactNode => {
    const options = kind === 'create'
      ? [
          { id: 'task.create-sibling' as const, label: '同階任務', icon: <Plus size={14} className="shrink-0 text-sky-500" /> },
          { id: 'task.create-child' as const, label: '子任務', icon: <CornerRightDown size={14} className="shrink-0 text-blue-500" /> },
        ]
      : [
          { id: 'task.dependency-start' as const, label: '開始日', icon: <GitBranch size={14} className="shrink-0 text-amber-500" /> },
          { id: 'task.dependency-end' as const, label: '結束日', icon: <GitBranch size={14} className="shrink-0 text-purple-500" /> },
        ];
    const choices = options.filter(option => actionIds.includes(option.id))
      .filter(option => !hideDisabled || enabled[option.id] !== false);
    if (!choices.length) return null;
    const firstActionEnabled = choices.some(option => enabled[option.id] !== false);
    const isOpen = openSubmenu === kind;
    const triggerActionId = options[0].id;
    const parentLabel = kind === 'create' ? '新增任務' : '設定依賴關係';
    const parentIcon = kind === 'create'
      ? <Plus size={14} className="shrink-0 text-sky-500" />
      : <GitBranch size={14} className="shrink-0 text-amber-500" />;
    const panel = isOpen ? (
      <div
        ref={submenuPanelRef}
        id={submenuPanelId}
        role="menu"
        onPointerEnter={event => { if (event.pointerType === 'mouse') clearSubmenuTimer(); }}
        onPointerLeave={scheduleSubmenuClose}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || (event.key !== 'Escape' && event.key !== 'ArrowLeft')) return;
          event.preventDefault();
          event.stopPropagation();
          setOpenSubmenu(null);
          submenuTriggerRefs.current[kind]?.focus();
        }}
        className={`${SUBMENU_SURFACE_CLASSNAME} ${submenuPosition !== null && submenuPosition !== undefined ? 'fixed z-[10030]' : 'relative'}`}
        style={submenuPosition || undefined}
        data-task-action-submenu={kind}
      >
        {choices.map(option => {
          const optionEnabled = enabled[option.id] !== false;
          return (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              disabled={!optionEnabled}
              onClick={() => { if (optionEnabled) void onAction(option.id); }}
              className={`${rowBaseClassName} ${optionEnabled ? 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-700' : 'cursor-not-allowed text-slate-400 dark:text-gray-500'}`}
              data-task-action-id={option.id}
            >
              {option.icon}<span className="flex-1">{option.label}</span>
            </button>
          );
        })}
      </div>
    ) : null;

    return (
      <React.Fragment key={`task.${kind}-menu`}>
        <button
          ref={element => { submenuTriggerRefs.current[kind] = element; }}
          type="button"
          disabled={!firstActionEnabled}
          onPointerEnter={event => {
            if (event.pointerType !== 'mouse' || !firstActionEnabled) return;
            clearSubmenuTimer();
            setOpenSubmenu(kind);
          }}
          onPointerLeave={scheduleSubmenuClose}
          onClick={event => {
            if (!firstActionEnabled) return;
            const isMouseClick = 'pointerType' in event.nativeEvent && event.nativeEvent.pointerType === 'mouse';
            if (isMouseClick && openSubmenu === kind) return;
            setOpenSubmenu(current => current === kind ? null : kind);
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.key !== 'ArrowRight') return;
            event.preventDefault();
            clearSubmenuTimer();
            if (isOpen) submenuPanelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
            else {
              focusSubmenuPanel.current = true;
              setOpenSubmenu(kind);
            }
          }}
          aria-expanded={isOpen}
          aria-controls={isOpen ? submenuPanelId : undefined}
          aria-haspopup="menu"
          data-task-action-id={triggerActionId}
          className={`${rowBaseClassName} ${firstActionEnabled ? 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-700' : 'cursor-not-allowed text-slate-400 dark:text-gray-500'}`}
        >
          {parentIcon}
          <span className="flex-1">{parentLabel}</span>
          <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-slate-400" />
        </button>
        {panel && submenuPosition ? createPortal(panel, document.body) : panel}
      </React.Fragment>
    );
  };

  const renderAction = (actionId: TaskActionId): React.ReactNode => {
    if (combineCreateActions && actionId === 'task.create-sibling') return renderActionSubmenu('create');
    if (combineCreateActions && actionId === 'task.create-child') return null;
    if (combineDependencyActions && actionId === 'task.dependency-start') return renderActionSubmenu('dependency');
    if (combineDependencyActions && actionId === 'task.dependency-end') return null;
    const actionEnabled = enabled[actionId] !== false;
    const disabledReason = actionEnabled ? undefined : disabledReasons[actionId] || '目前無法使用此功能';
    if (actionId === inlineActionId && inlineActionContent) {
      return (
        <div key={actionId} data-task-action-inline-editor="true">
          {inlineActionContent}
        </div>
      );
    }
    if (actionId === 'task.assign') {
      const assignmentPanel = assignmentOpen && actionEnabled ? (
        <div
          ref={assignmentPanelRef}
          id={assignmentPanelId}
          tabIndex={hasAssignmentFlyout ? -1 : undefined}
          onPointerEnter={hasAssignmentFlyout ? clearAssignmentTimer : undefined}
          onPointerLeave={hasAssignmentFlyout ? scheduleAssignmentClose : undefined}
          onKeyDown={hasAssignmentFlyout ? event => {
            if (event.nativeEvent.isComposing || (event.key !== 'Escape' && event.key !== 'ArrowLeft')) return;
            event.preventDefault();
            event.stopPropagation();
            onAssignmentOpenChange?.(false);
            assignmentTriggerRef.current?.focus();
          } : undefined}
          className={`${SUBMENU_SURFACE_CLASSNAME} ${hasAssignmentFlyout && flyoutPosition ? 'fixed z-[10030]' : 'relative my-1 w-full'} [&_[data-task-assignment-picker-panel]]:min-w-0`}
          style={hasAssignmentFlyout && flyoutPosition ? flyoutPosition : undefined}
          data-task-assignment-flyout={hasAssignmentFlyout && flyoutPosition ? 'true' : undefined}
        >
          {assignmentContent}
        </div>
      ) : null;
      return (
        <React.Fragment key={actionId}>
          <button
            ref={assignmentTriggerRef}
            type="button"
            onPointerEnter={hasAssignmentFlyout ? event => {
              if (!actionEnabled || event.pointerType !== 'mouse') return;
              clearAssignmentTimer();
              onAssignmentOpenChange?.(true);
            } : undefined}
            onPointerLeave={hasAssignmentFlyout ? scheduleAssignmentClose : undefined}
            onClick={event => {
              if (!actionEnabled) return;
              if (hasAssignmentFlyout && event.detail === 0 && !assignmentOpen) focusAssignmentPanel.current = true;
              const isMouseClick = 'pointerType' in event.nativeEvent && event.nativeEvent.pointerType === 'mouse';
              if (hasAssignmentFlyout && isMouseClick && flyoutPosition && assignmentOpen) return;
              onToggleAssignment?.();
            }}
            onKeyDown={hasAssignmentFlyout ? event => {
              if (!actionEnabled || event.nativeEvent.isComposing || event.key !== 'ArrowRight') return;
              event.preventDefault();
              clearAssignmentTimer();
              if (assignmentOpen) {
                const panel = assignmentPanelRef.current;
                (panel?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? panel)?.focus();
              } else {
                focusAssignmentPanel.current = true;
                onAssignmentOpenChange?.(true);
              }
            } : undefined}
            aria-disabled={!actionEnabled}
            aria-expanded={actionEnabled && assignmentOpen}
            aria-controls={assignmentOpen && actionEnabled ? assignmentPanelId : undefined}
            title={disabledReason}
            data-task-action-id={actionId}
            className={`${rowBaseClassName} ${actionEnabled ? 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-700' : 'cursor-not-allowed text-slate-400 opacity-55'}`}
          >
            {ICONS[actionId]}
            <span className="min-w-0 flex-1">
              <span className="block">{actionLabel(actionId, actionLabelOverrides)}</span>
              {assignmentSummary ? <span className={`block truncate text-gray-500 ${compact ? 'text-[10px] leading-4' : 'text-[11px]'}`}>{assignmentSummary}</span> : null}
              {disabledReason ? <span className={`block text-amber-700 ${compact ? 'text-[10px] leading-4' : 'text-[11px]'}`}>{disabledReason}</span> : null}
            </span>
            {!actionEnabled ? <LockKeyhole size={12} aria-hidden="true" className="flex-shrink-0 text-amber-600" /> : null}
            <span aria-hidden="true" className={`text-gray-400 transition-transform ${assignmentOpen && !flyoutPosition ? 'rotate-90' : ''}`}>›</span>
          </button>
          {assignmentPanel && hasAssignmentFlyout && flyoutPosition ? createPortal(assignmentPanel, document.body) : assignmentPanel}
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
          <span className="block">{actionLabel(actionId, actionLabelOverrides)}</span>
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
