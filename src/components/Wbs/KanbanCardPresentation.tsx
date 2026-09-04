import React from 'react';
import type { TaskStatus } from '../../types';
import { taskStatusTitleClass } from '../ui/taskStatusStyles';
import { TaskDateBadge } from './TaskDateBadge';

export const KANBAN_CARD_FRAME_CLASS = 'kanban-task-card relative mb-[6px] rounded-lg border border-slate-300 bg-surface-task shadow-[0_2px_7px_rgba(15,23,42,0.14)] transition-shadow';

export type KanbanCardPresentationModel = {
  title: string;
  status: TaskStatus | null;
  startDate: string | null;
  endDate: string | null;
  isDurationLocked: boolean;
  startLocked: boolean;
  endLocked: boolean;
};

type KanbanCardPresentationProps = {
  model: KanbanCardPresentationModel;
  bodyAs?: 'div' | 'span';
  titleAs?: 'h4' | 'span';
  bodyProps?: React.HTMLAttributes<HTMLElement>;
  bodyClassName?: string;
  titleProps?: React.HTMLAttributes<HTMLElement>;
  titleTextProps?: React.HTMLAttributes<HTMLElement>;
  titleClassName?: string;
  showDate?: boolean;
  showTags?: boolean;
  titleTrailing?: React.ReactNode;
  tags?: React.ReactNode;
  meta?: React.ReactNode;
};

export const KanbanCardPresentation: React.FC<KanbanCardPresentationProps> = ({
  model,
  bodyAs = 'div',
  titleAs = 'h4',
  bodyProps,
  bodyClassName = '',
  titleProps,
  titleTextProps,
  titleClassName = '',
  showDate = true,
  showTags = true,
  titleTrailing,
  tags,
  meta,
}) => {
  const Body = bodyAs;
  const Row = bodyAs === 'span' ? 'span' : 'div';
  const Content = bodyAs === 'span' ? 'span' : 'div';
  const Title = titleAs;
  const TitleText = bodyAs === 'span' ? 'span' : 'span';

  return (
    <Body
      {...bodyProps}
      className={`kanban-task-card-body mobile-pan-item kanban-scroll-touch group min-w-0 px-[9px] py-[6px] transition-[background-color,box-shadow] ${bodyClassName}`}
    >
      <Row className="kanban-task-title-row flex items-start justify-between gap-1">
        <Content className="kanban-task-title-content flex min-w-0 flex-1 items-center gap-1">
          <Title
            {...titleProps}
            className={`task-title-text relative min-w-0 flex-1 pr-2 text-sm font-medium leading-tight transition-colors ${model.status ? taskStatusTitleClass[model.status] : ''} ${titleClassName}`}
          >
            <TitleText
              {...titleTextProps}
              className="inline-block max-w-full truncate align-top"
            >
              {model.title || '未命名任務'}
            </TitleText>
          </Title>
          {showTags ? tags : null}
          {titleTrailing}
        </Content>
        {showDate && model.status ? (
          <TaskDateBadge
            startDate={model.startDate}
            endDate={model.endDate}
            status={model.status}
            showStartDate={false}
            startLocked={model.startLocked}
            endLocked={model.endLocked}
            durationLocked={model.isDurationLocked}
            surface="checklist"
            className="ml-0.5 self-center"
          />
        ) : null}
      </Row>
      {meta}
    </Body>
  );
};
