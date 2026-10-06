import type { HierarchicalTaskViewItem } from '../../utils/taskHierarchy';

export type GoalHierarchyContinuation = Readonly<{
  guideLevel: number;
  ownerTaskId: string;
}>;

export type GoalHierarchyDecoration = Readonly<{
  parentId: string | null;
  isLastVisibleSibling: boolean;
  hasVisibleChildren: boolean;
  ancestorTaskIds: readonly string[];
  ancestorContinuations: readonly GoalHierarchyContinuation[];
  eligibleDescendantCount: number;
}>;

type HierarchyItem = Pick<HierarchicalTaskViewItem, 'id' | 'parentId' | 'level'>;

const parentKey = (parentId: string | null | undefined): string | null => parentId || null;

const hasUniqueIdsAndValidLevels = (items: readonly HierarchyItem[]): boolean => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) || !Number.isInteger(item.level) || item.level < 0) return false;
    seen.add(item.id);
  }
  return true;
};

const hasValidDfsParents = (items: readonly HierarchyItem[]): boolean => {
  const stack: string[] = [];
  for (const item of items) {
    if (item.level > stack.length || item.level > 0 && !stack[item.level - 1]) return false;
    stack.length = item.level;
    if (item.level > 0 && parentKey(item.parentId) !== stack[item.level - 1]) return false;
    stack.push(item.id);
  }
  return items.length === 0 || items[0].level === 0;
};

const isRenderedSubsequence = (
  renderedItems: readonly HierarchyItem[],
  fullyExpandedItems: readonly HierarchyItem[],
): boolean => {
  let fullIndex = 0;
  for (const renderedItem of renderedItems) {
    while (fullIndex < fullyExpandedItems.length && fullyExpandedItems[fullIndex].id !== renderedItem.id) fullIndex += 1;
    if (fullIndex >= fullyExpandedItems.length) return false;
    const fullItem = fullyExpandedItems[fullIndex];
    if (fullItem.level !== renderedItem.level || parentKey(fullItem.parentId) !== parentKey(renderedItem.parentId)) return false;
    fullIndex += 1;
  }
  return true;
};

const buildEligibleDescendantCounts = (items: readonly HierarchyItem[]): Map<string, number> => {
  const stack: Array<{ id: string; level: number; subtreeSize: number }> = [];
  const counts = new Map<string, number>();
  const closeThroughLevel = (level: number) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const completed = stack.pop();
      if (!completed) break;
      counts.set(completed.id, completed.subtreeSize - 1);
      const parent = stack[stack.length - 1];
      if (parent && parent.level === completed.level - 1) parent.subtreeSize += completed.subtreeSize;
    }
  };

  for (const item of items) {
    closeThroughLevel(item.level);
    stack.push({ id: item.id, level: item.level, subtreeSize: 1 });
  }
  closeThroughLevel(-1);
  return counts;
};

/**
 * Derives Goal-only visual hierarchy facts from the canonical rendered and
 * fully-expanded rows. It never decides ordering, visibility, ownership, or
 * mutation. Invalid or mismatched projections fail closed to an empty map.
 */
export const buildGoalHierarchyDecorations = ({
  renderedItems,
  fullyExpandedItems,
}: Readonly<{
  renderedItems: readonly HierarchicalTaskViewItem[];
  fullyExpandedItems: readonly HierarchicalTaskViewItem[];
}>): ReadonlyMap<string, GoalHierarchyDecoration> => {
  if (!hasUniqueIdsAndValidLevels(renderedItems) || !hasUniqueIdsAndValidLevels(fullyExpandedItems)) return new Map();
  if (!hasValidDfsParents(fullyExpandedItems) || !hasValidDfsParents(renderedItems)) return new Map();
  if (!isRenderedSubsequence(renderedItems, fullyExpandedItems)) return new Map();

  const lastVisibleSiblingByParent = new Map<string | null, string>();
  const renderedParentById = new Map<string, string | null>();
  const visibleParentIds = new Set<string>();
  for (const item of renderedItems) {
    const normalizedParentId = parentKey(item.parentId);
    lastVisibleSiblingByParent.set(normalizedParentId, item.id);
    renderedParentById.set(item.id, normalizedParentId);
    if (normalizedParentId) visibleParentIds.add(normalizedParentId);
  }

  const eligibleDescendantCounts = buildEligibleDescendantCounts(fullyExpandedItems);
  const decorations = new Map<string, GoalHierarchyDecoration>();
  const visibleStack: string[] = [];

  for (const item of renderedItems) {
    visibleStack.length = item.level;
    const ancestorTaskIds = visibleStack.slice(0, item.level);
    const ancestorContinuations: GoalHierarchyContinuation[] = [];
    for (let ancestorLevel = 1; ancestorLevel < item.level; ancestorLevel += 1) {
      const ancestorId = visibleStack[ancestorLevel];
      const ownerTaskId = ancestorId ? renderedParentById.get(ancestorId) : null;
      if (ancestorId && ownerTaskId && lastVisibleSiblingByParent.get(ownerTaskId) !== ancestorId) {
        ancestorContinuations.push(Object.freeze({
          guideLevel: ancestorLevel - 1,
          ownerTaskId,
        }));
      }
    }

    decorations.set(item.id, Object.freeze({
      parentId: parentKey(item.parentId),
      isLastVisibleSibling: lastVisibleSiblingByParent.get(parentKey(item.parentId)) === item.id,
      hasVisibleChildren: visibleParentIds.has(item.id),
      ancestorTaskIds: Object.freeze(ancestorTaskIds),
      ancestorContinuations: Object.freeze(ancestorContinuations),
      eligibleDescendantCount: eligibleDescendantCounts.get(item.id) || 0,
    }));
    visibleStack.push(item.id);
  }

  return decorations;
};
