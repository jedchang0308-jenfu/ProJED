import React from 'react';

type TaskDragOverlayPreviewProps = {
  title: string;
  widthClass?: string;
};

export const TaskDragOverlayPreview: React.FC<TaskDragOverlayPreviewProps> = ({
  title,
  widthClass = 'w-[240px]',
}) => (
  <div
    className={`task-title-text ${widthClass} rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg will-change-transform`}
  >
    {title || '未命名任務'}
  </div>
);
