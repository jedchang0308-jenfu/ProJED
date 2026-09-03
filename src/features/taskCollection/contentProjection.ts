import type { TaskCollectionSnapshot } from './types';

const escapeProjectionText = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const projectTaskCollectionContent = (snapshot: TaskCollectionSnapshot): string => {
  const nodesByParent = new Map<string | null, typeof snapshot.nodes>();
  snapshot.nodes.forEach(node => nodesByParent.set(node.parentId, [...(nodesByParent.get(node.parentId) ?? []), node]));
  const lines: string[] = [
    `收藏任務：${escapeProjectionText(snapshot.nodes.find(node => node.id === snapshot.rootItemId)?.title || snapshot.rootItemId)}`,
    `來源看板：${escapeProjectionText(snapshot.sourceBoardTitle || snapshot.sourceBoardId)}`,
    `典藏時間：${new Date(snapshot.collectedAt).toISOString()}`,
    '',
  ];
  const visit = (parentId: string | null, depth: number) => {
    (nodesByParent.get(parentId) ?? []).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).forEach(node => {
      lines.push(`${'  '.repeat(depth)}- ${escapeProjectionText(node.title)}（${node.status}）`);
      if (node.description) lines.push(`${'  '.repeat(depth + 1)}${escapeProjectionText(node.description)}`);
      visit(node.id, depth + 1);
    });
  };
  visit(null, 0);
  if (snapshot.activityEvents.length) {
    lines.push('', '歷程：');
    snapshot.activityEvents.forEach(event => lines.push(`- ${new Date(event.createdAt).toISOString()} ${event.eventType}`));
  }
  return lines.join('\n');
};
