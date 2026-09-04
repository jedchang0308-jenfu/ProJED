import React from 'react';
import type { TaskStatus } from '../../types';
import { TaskDateBadge } from './TaskDateBadge';

export const KANBAN_COLUMN_FRAME_CLASS = 'relative flex max-h-full w-[270px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-panel shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-all';

type KanbanColumnPresentationProps = {
  title: string;
  status: TaskStatus;
  startDate: string | null;
  endDate: string | null;
  isDurationLocked: boolean;
  startLocked: boolean;
  endLocked: boolean;
  headerProps?: React.HTMLAttributes<HTMLDivElement>;
  headerClassName?: string;
  titleProps?: React.HTMLAttributes<HTMLHeadingElement>;
  titleTextProps?: React.HTMLAttributes<HTMLSpanElement>;
  titleTrailing?: React.ReactNode;
  headerMeta?: React.ReactNode;
  showDate?: boolean;
  placeholder?: boolean;
  bodyRef?: React.Ref<HTMLDivElement>;
  bodyProps?: React.HTMLAttributes<HTMLDivElement>;
  bodyClassName?: string;
  children: React.ReactNode;
};

export const KanbanColumnPresentation: React.FC<KanbanColumnPresentationProps> = ({
  title,
  status,
  startDate,
  endDate,
  isDurationLocked,
  startLocked,
  endLocked,
  headerProps,
  headerClassName = '',
  titleProps,
  titleTextProps,
  titleTrailing,
  headerMeta,
  showDate = true,
  placeholder = false,
  bodyRef,
  bodyProps,
  bodyClassName = '',
  children,
}) => (
  <>
    <div
      {...headerProps}
      className={`group mobile-pan-item flex flex-col gap-1 bg-slate-50 px-[10px] py-[8px] transition-colors hover:bg-white ${headerClassName}`}
    >
      {placeholder ? (
        <div
          className="invisible flex min-w-0 items-center gap-1.5"
          data-kanban-drag-source-placeholder-neutral="true"
          aria-hidden="true"
        >
          <h3 className="task-title-text relative min-w-0 flex-1 text-sm font-semibold text-slate-800" data-task-title-slot="true">
            <span className="inline-block max-w-full truncate align-top">{title || '未命名任務'}</span>
          </h3>
          <TaskDateBadge
            startDate={startDate}
            endDate={endDate}
            status={status}
            showStartDate={false}
            startLocked={startLocked}
            endLocked={endLocked}
            durationLocked={isDurationLocked}
            surface="checklist"
            className="ml-0.5"
          />
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            <h3
              {...titleProps}
              className="task-title-text relative min-w-0 flex-1 text-sm font-semibold text-slate-800"
            >
              <span {...titleTextProps} className="inline-block max-w-full truncate align-top">
                {title || '未命名任務'}
              </span>
            </h3>
            {titleTrailing}
            {showDate ? (
              <TaskDateBadge
                startDate={startDate}
                endDate={endDate}
                status={status}
                showStartDate={false}
                startLocked={startLocked}
                endLocked={endLocked}
                durationLocked={isDurationLocked}
                surface="checklist"
                className="ml-0.5"
              />
            ) : null}
          </div>
          {headerMeta}
        </>
      )}
    </div>

    <div
      ref={bodyRef}
      {...bodyProps}
      className={`scroll-container mobile-pan-surface flex-1 overflow-y-auto rounded-md px-[8px] py-[8px] scrollbar-thin scrollbar-thumb-slate-300 transition-[background-color,box-shadow] duration-100 mx-0 mb-0 bg-surface-panel ${bodyClassName}`}
    >
      {children}
      <div className="mobile-pan-rail" data-mobile-pan-rail="kanban-column" aria-hidden="true" />
    </div>
  </>
);

