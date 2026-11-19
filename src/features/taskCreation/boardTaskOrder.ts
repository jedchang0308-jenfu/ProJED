import type { TaskNode } from '../../types';

export type BoardTaskOrderDestination = {
  parentId: string | null;
} & (
  | { position: 'append'; anchorId?: never }
  | { position: 'before' | 'after' | 'swap'; anchorId: string }
);

export type BoardTaskOrderIntent = {
  workspaceId: string;
  boardId: string;
  destination: BoardTaskOrderDestination;
} & (
  | { kind: 'create'; node: TaskNode; reopenParent?: boolean }
  | { kind: 'move'; taskId: string; sourceParentId: string | null }
);
export type BoardTaskOrderCommand = BoardTaskOrderIntent & { protectedTaskIds: readonly string[] };

export type BoardTaskOrderPatch = Pick<TaskNode, 'id' | 'parentId' | 'order' | 'status' | 'createdAt' | 'updatedAt' | 'storageId'>;
export type BoardTaskOrderResult = { nodes: BoardTaskOrderPatch[]; reopenedParent: boolean };

export const compareBoardTaskOrder = (left: TaskNode, right: TaskNode) =>
  left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

// Local and Firebase share the same rank rule. Supabase calculates the ranks
// from locked rows, because the browser's board snapshot may be out of date.
export function projectBoardTaskOrder(
  command: BoardTaskOrderCommand,
  snapshot: readonly TaskNode[],
  canEdit: boolean,
  now = Date.now(),
): BoardTaskOrderResult {
  const { boardId, workspaceId, destination } = command;
  const tasks = snapshot.filter(node => node.workspaceId === workspaceId && node.boardId === boardId && !node.isArchived);
  const byId = new Map(tasks.map(node => [node.id, node]));
  const parent = destination.parentId ? byId.get(destination.parentId) : undefined;
  if (destination.parentId && !parent) throw new Error('找不到目標父任務。');
  const target = command.kind === 'create' ? command.node : byId.get(command.taskId);
  if (!target || (command.kind === 'move' && target.parentId !== command.sourceParentId)) {
    throw new Error('來源任務已變更，請重新載入。');
  }
  if (command.kind === 'create' && snapshot.some(node => node.id === target.id)) throw new Error('任務已存在。');
  const visited = new Set<string>();
  for (let ancestor = parent; ancestor; ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined) {
    if (ancestor.id === target.id || visited.has(ancestor.id)) throw new Error('任務階層不能形成循環。');
    visited.add(ancestor.id);
  }
  const swap = destination.position === 'swap';
  const siblings = tasks.filter(node => node.parentId === destination.parentId && (swap || node.id !== target.id))
    .sort(compareBoardTaskOrder);
  const anchor = destination.position === 'append' ? -1 : siblings.findIndex(node => node.id === destination.anchorId);
  if (destination.position !== 'append' && (anchor < 0 || siblings[anchor].id === target.id)) throw new Error('找不到排序基準任務。');
  const index = destination.position === 'append' ? siblings.length : anchor + Number(destination.position === 'after');
  const before = siblings[index - 1]?.order;
  const after = siblings[index]?.order;
  const gap = before === undefined ? (after === undefined ? 0 : after - 1024)
    : after === undefined ? before + 1024
    : after - before >= 2 ? Math.floor((before + after) / 2) : undefined;
  if (swap) {
    const from = siblings.findIndex(node => node.id === target.id);
    if (from < 0) throw new Error('只能交換同層任務。');
    const anchorNode = siblings[index];
    const ordersAreUnique = target.order !== anchorNode.order && Number.isSafeInteger(target.order) && Number.isSafeInteger(anchorNode.order)
      && !siblings.some(node => node.id !== target.id && node.id !== anchorNode.id && (node.order === target.order || node.order === anchorNode.order));
    if (ordersAreUnique) {
      if (command.protectedTaskIds.some(id => id === '*' || id === target.id || id === anchorNode.id)) {
        throw new Error('前一筆操作仍待確認，暫時無法變更重疊任務。');
      }
      return {
        nodes: [target, anchorNode].map(node => ({
          id: node.id, parentId: node.parentId, order: node.id === target.id ? anchorNode.order : target.order,
          status: node.status, createdAt: node.createdAt, updatedAt: now,
        })),
        reopenedParent: false,
      };
    }
    [siblings[from], siblings[index]] = [siblings[index], siblings[from]];
  } else {
    siblings.splice(index, 0, target);
  }
  const compact = swap || !Number.isSafeInteger(gap);
  const nodes: BoardTaskOrderPatch[] = [];
  for (const [ordinal, node] of siblings.entries()) {
    const order = compact ? ordinal * 1024 : node.id === target.id ? gap! : node.order;
    if (node.id === target.id || node.order !== order) {
      nodes.push({ id: node.id, parentId: destination.parentId, order, status: node.status, createdAt: node.createdAt, updatedAt: now });
    }
  }
  const reopenedParent = command.kind === 'create' && Boolean(command.reopenParent) && parent?.status === 'completed' && canEdit;
  if (reopenedParent && parent) nodes.push({
    id: parent.id, parentId: parent.parentId, order: parent.order, status: 'in_progress',
    createdAt: parent.createdAt, updatedAt: now,
  });
  const protectedIds = new Set(command.protectedTaskIds);
  if (nodes.some(node => (command.kind === 'move' || node.id !== target.id) && (protectedIds.has('*') || protectedIds.has(node.id)))) {
    throw new Error('前一筆操作仍待確認，暫時無法變更重疊任務。');
  }
  return { nodes, reopenedParent };
}
