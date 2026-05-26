import React from 'react';
import type { TaskTag } from '../../types';
import { getTagStyle } from '../../utils/tags';

interface TagChipProps {
  tag: TaskTag;
  compact?: boolean;
  onRemove?: () => void;
}

export const TagChip: React.FC<TagChipProps> = ({ tag, compact = false, onRemove }) => {
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

