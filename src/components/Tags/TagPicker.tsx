import React from 'react';
import { Check, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useTagStore } from '../../store/useTagStore';
import type { TagColor, TaskTag } from '../../types';
import { DEFAULT_TAG_COLOR, getTagDotStyle, TAG_COLORS } from '../../utils/tags';
import { TagChip } from './TagChip';

interface TagPickerProps {
  workspaceId: string;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const TagPicker: React.FC<TagPickerProps> = ({ workspaceId, selectedTagIds, onChange, disabled = false, compact = false }) => {
  const tags = useTagStore(s => s.tags);
  const createTag = useTagStore(s => s.createTag);
  const updateTag = useTagStore(s => s.updateTag);
  const deleteTag = useTagStore(s => s.deleteTag);
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [newColor, setNewColor] = React.useState<TagColor>(DEFAULT_TAG_COLOR);
  const [editingTagId, setEditingTagId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id));
  const visibleTags = tags.filter(tag => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const canCreate = query.trim().length > 0 && !tags.some(tag => tag.name.toLowerCase() === query.trim().toLowerCase());

  React.useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (editingTagId) {
        setEditingTagId(null);
        setEditingName('');
        return;
      }

      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [editingTagId, isOpen]);

  const toggleTag = (tagId: string) => {
    if (disabled) return;
    onChange(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter(id => id !== tagId)
        : [...selectedTagIds, tagId]
    );
  };

  const handleCreate = async () => {
    if (disabled) return;
    const created = await createTag(workspaceId, query, newColor);
    if (!created) return;
    onChange([...selectedTagIds, created.id]);
    setQuery('');
    setNewColor(DEFAULT_TAG_COLOR);
  };

  const startEditing = (tag: TaskTag) => {
    if (disabled) return;
    setEditingTagId(tag.id);
    setEditingName(tag.name);
  };

  const saveEditing = async (tag: TaskTag) => {
    if (disabled) return;
    const nextName = editingName.trim();
    if (nextName && nextName !== tag.name) {
      await updateTag(workspaceId, tag.id, { name: nextName });
    }
    setEditingTagId(null);
    setEditingName('');
  };

  const handleDeleteTag = async (tag: TaskTag) => {
    if (disabled) return;
    const confirmed = window.confirm(`刪除標籤「${tag.name}」？這會從所有任務移除此標籤。`);
    if (!confirmed) return;
    await deleteTag(workspaceId, tag.id);
  };

  return (
    <div className="relative" ref={panelRef} data-tag-picker-compact={compact ? 'true' : undefined}>
      <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
        {selectedTags.map(tag => (
          <TagChip key={tag.id} tag={tag} />
        ))}
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          disabled={disabled}
          data-tag-picker-trigger="true"
          className={`inline-flex items-center rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 ${
            compact ? 'h-7 gap-1 px-2' : 'h-8 gap-1.5 px-2.5'
          }`}
        >
          <Tag size={13} />
          標籤
        </button>
      </div>

      {isOpen && (
        <div
          data-tag-picker-panel
          className="absolute left-0 top-[calc(100%+6px)] z-[300] w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋或建立標籤"
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {canCreate && (
              <div className="mt-2">
                <div className="mb-2 flex flex-wrap gap-1">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`h-5 w-5 rounded border-2 ${getTagDotStyle(color)} ${
                        newColor === color ? 'border-slate-900' : 'border-white ring-1 ring-slate-200'
                      }`}
                      title={color}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  <Plus size={13} />
                  建立「{query.trim()}」
                </button>
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-auto p-2">
            {visibleTags.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-slate-400">沒有符合的標籤</div>
            )}
            {visibleTags.map(tag => {
              const selected = selectedTagIds.includes(tag.id);
              const editing = editingTagId === tag.id;
              return (
                <div key={tag.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                      selected ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white'
                    }`}
                    aria-label={selected ? `移除 ${tag.name}` : `套用 ${tag.name}`}
                  >
                    {selected && <Check size={13} />}
                  </button>
                  {editing ? (
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onBlur={() => saveEditing(tag)}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === 'Enter') void saveEditing(tag);
                        if (event.key === 'Escape') setEditingTagId(null);
                      }}
                      className="h-7 min-w-0 flex-1 rounded border border-primary px-2 text-xs outline-none"
                      autoFocus
                    />
                  ) : (
                    <button type="button" onClick={() => toggleTag(tag.id)} className="min-w-0 flex-1 text-left">
                      <TagChip tag={tag} />
                    </button>
                  )}
                  <div className="pointer-events-none flex items-center gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                    <select
                      value={tag.color}
                      onChange={(event) => updateTag(workspaceId, tag.id, { color: event.target.value as TagColor })}
                      className="h-7 rounded border border-slate-200 bg-white text-[10px] text-slate-500"
                      aria-label={`變更 ${tag.name} 顏色`}
                    >
                      {TAG_COLORS.map(color => (
                        <option key={color} value={color}>{color}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => startEditing(tag)} className="p-1 text-slate-400 hover:text-slate-700" title="重新命名" aria-label={`重新命名 ${tag.name}`}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => handleDeleteTag(tag)} className="p-1 text-slate-400 hover:text-red-600" title="刪除標籤" aria-label={`刪除 ${tag.name}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
