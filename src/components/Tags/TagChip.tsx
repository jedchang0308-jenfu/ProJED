import React from 'react';
import type { TaskTag } from '../../types';
import { getTagColorLabel, getTagDotStyle, getTagStyle } from '../../utils/tags';

interface TagChipProps {
  tag: TaskTag;
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onRemove?: () => void;
}

export const TagChip: React.FC<TagChipProps> = ({
  tag,
  compact = false,
  collapsed = false,
  onToggleCollapsed,
  onRemove,
}) => {
  const colorLabel = getTagColorLabel(tag.color);

  if (onToggleCollapsed) {
    const action = collapsed ? '展開' : '收合';
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapsed();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        className={collapsed
          ? 'inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-0 bg-transparent transition-[filter,box-shadow] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
          : `inline-flex max-w-full items-center gap-1 rounded-sm border font-semibold leading-none transition-[filter,box-shadow] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${getTagStyle(tag.color)} ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[11px]'}`
        }
        title={collapsed ? `顏色：${colorLabel}，標題：「${tag.name}」` : tag.name}
        aria-label={`${colorLabel}標籤「${tag.name}」，點擊${action}所有標籤名稱`}
        aria-pressed={!collapsed}
        data-task-interaction-control="true"
        data-kanban-tag-chip="true"
        data-tag-chip-collapsed={collapsed ? 'true' : 'false'}
        data-tag-name={tag.name}
      >
        {collapsed ? (
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${getTagDotStyle(tag.color)}`}
            data-kanban-tag-dot="true"
          />
        ) : (
          <span className="truncate">{tag.name}</span>
        )}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-sm border font-semibold leading-none ${getTagStyle(tag.color)} ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[11px]'
      }`}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-current opacity-70 hover:bg-white/40 hover:opacity-100"
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
};

