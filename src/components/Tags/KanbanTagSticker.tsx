import React from 'react';
import { createPortal } from 'react-dom';
import type { TaskTag } from '../../types';
import { getTagStyle } from '../../utils/tags';

interface KanbanTagStickerProps {
  tags: TaskTag[];
  compact?: boolean;
}

const PANEL_WIDTH = 184;
const VIEWPORT_GUTTER = 8;

export const KanbanTagSticker: React.FC<KanbanTagStickerProps> = ({ tags, compact = false }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [panelPosition, setPanelPosition] = React.useState<{ left: number; top: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const pointerFocusRef = React.useRef(false);
  const suppressFocusOpenRef = React.useRef(false);
  const panelId = React.useId();
  const firstTag = tags[0];
  const tagNames = tags.map(tag => tag.name).join('、');

  const updatePanelPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
    const estimatedHeight = Math.min(42 + tags.length * 25, 196);
    const hasRoomBelow = rect.bottom + 6 + estimatedHeight <= window.innerHeight - VIEWPORT_GUTTER;
    const top = hasRoomBelow
      ? rect.bottom + 6
      : Math.max(VIEWPORT_GUTTER, rect.top - estimatedHeight - 6);

    setPanelPosition({
      left: Math.min(
        Math.max(VIEWPORT_GUTTER, rect.right - width),
        Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER),
      ),
      top,
    });
  }, [tags.length]);

  const openPanel = React.useCallback(() => {
    updatePanelPosition();
    setIsOpen(true);
  }, [updatePanelPosition]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      suppressFocusOpenRef.current = true;
      setIsOpen(false);
      triggerRef.current?.focus();
      window.requestAnimationFrame(() => {
        suppressFocusOpenRef.current = false;
      });
    };

    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, updatePanelPosition]);

  if (!firstTag) return null;

  const visibleLayers = tags.slice(1, 3);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={(event) => {
          pointerFocusRef.current = true;
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          pointerFocusRef.current = false;
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          openPanel();
        }}
        onFocus={() => {
          if (!pointerFocusRef.current && !suppressFocusOpenRef.current) openPanel();
        }}
        onBlur={() => {
          pointerFocusRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        className={`kanban-tag-sticker group/tag relative -ml-2 inline-flex h-[15px] shrink-0 items-center justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          compact ? 'max-w-[58px]' : 'max-w-[72px]'
        }`}
        title={`標籤：${tagNames}`}
        aria-label={`標籤：${tagNames}。點擊查看此任務的全部標籤`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        data-task-interaction-control="true"
        data-kanban-tag-sticker="true"
        data-tag-count={tags.length}
      >
        {visibleLayers.map((tag, index) => (
          <span
            key={tag.id}
            aria-hidden="true"
            data-kanban-tag-layer="true"
            className={`absolute inset-y-[2px] left-[3px] right-0 rounded-[2px] opacity-70 shadow-[0_1px_1px_rgba(15,23,42,0.08)] ${getTagStyle(tag.color)}`}
            style={{
              clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 0 100%)',
              transform: `translate(${(visibleLayers.length - index) * 2}px, -${(visibleLayers.length - index) * 2}px)`,
              zIndex: index,
            }}
          />
        ))}

        <span
          data-kanban-tag-front="true"
          className={`relative z-[3] inline-flex h-[13px] min-w-0 items-center gap-0.5 rounded-[2px] px-1.5 text-[9px] font-semibold leading-none shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-[filter,transform] group-hover/tag:brightness-95 group-active/tag:translate-y-px ${getTagStyle(firstTag.color)}`}
          style={{ clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 0 100%)' }}
        >
          <span className="min-w-0 truncate">{firstTag.name}</span>
          {tags.length > 1 ? (
            <span className="shrink-0 opacity-75">+{tags.length - 1}</span>
          ) : null}
        </span>
      </button>

      {isOpen && panelPosition ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="此任務的標籤"
          data-kanban-tag-popover="true"
          className="fixed z-[10000] max-h-[196px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: panelPosition.left,
            top: panelPosition.top,
            width: Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2),
            zIndex: 10000,
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold tracking-wide text-slate-400">
            此任務的標籤
          </div>
          <div className="max-h-[158px] overflow-y-auto p-1.5">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="flex min-h-6 items-center gap-2 rounded px-1.5 py-1 text-xs font-medium text-slate-700"
                data-kanban-tag-popover-item="true"
                data-tag-name={tag.name}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-5 shrink-0 rounded-[2px] shadow-[0_1px_1px_rgba(15,23,42,0.12)] ${getTagStyle(tag.color)}`}
                  style={{ clipPath: 'polygon(0 0, calc(100% - 3px) 0, 100% 50%, calc(100% - 3px) 100%, 0 100%)' }}
                />
                <span className="min-w-0 flex-1 break-words">{tag.name}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
};
