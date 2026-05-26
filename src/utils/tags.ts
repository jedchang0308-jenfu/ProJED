import type { TagColor, TaskNode, TaskTag } from '../types';

export const TAG_COLORS: TagColor[] = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
  'gray',
];

export const DEFAULT_TAG_COLOR: TagColor = 'green';

export const createTagId = () =>
  `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const getTagStyle = (color: TagColor) => {
  switch (color) {
    case 'green':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'yellow':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'orange':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'red':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'purple':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'blue':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'sky':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'lime':
      return 'bg-lime-100 text-lime-800 border-lime-200';
    case 'pink':
      return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'black':
      return 'bg-slate-800 text-white border-slate-700';
    case 'gray':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const getTagDotStyle = (color: TagColor) => {
  switch (color) {
    case 'green':
      return 'bg-emerald-500';
    case 'yellow':
      return 'bg-yellow-400';
    case 'orange':
      return 'bg-orange-500';
    case 'red':
      return 'bg-red-500';
    case 'purple':
      return 'bg-purple-500';
    case 'blue':
      return 'bg-blue-500';
    case 'sky':
      return 'bg-sky-500';
    case 'lime':
      return 'bg-lime-500';
    case 'pink':
      return 'bg-pink-500';
    case 'black':
      return 'bg-slate-900';
    case 'gray':
    default:
      return 'bg-slate-400';
  }
};

export const sortTags = (tags: TaskTag[]) =>
  [...tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

export const getNodeTags = (node: Pick<TaskNode, 'tagIds'> | null | undefined, tags: TaskTag[]) => {
  const ids = new Set(node?.tagIds ?? []);
  return sortTags(tags.filter(tag => ids.has(tag.id)));
};

export const matchesTagFilters = (node: Pick<TaskNode, 'tagIds'> | null | undefined, selectedTagIds: string[]) => {
  if (selectedTagIds.length === 0) return true;
  const tagIds = node?.tagIds ?? [];
  return selectedTagIds.some(tagId => tagIds.includes(tagId));
};

