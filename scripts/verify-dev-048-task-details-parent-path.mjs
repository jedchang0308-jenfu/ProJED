import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TaskDetailsModal.tsx', import.meta.url), 'utf8');

const checks = [
  {
    name: 'TaskDetailsModal reads the full node index',
    pass: source.includes('const nodes = useWbsStore((state) => state.nodes);'),
  },
  {
    name: 'ancestor path is built from parentId',
    pass: source.includes('const buildAncestorPath =') &&
      source.includes('const ancestorPath = buildAncestorPath(node, nodes);') &&
      source.includes('let currentParentId: string | null = node.parentId;'),
  },
  {
    name: 'ancestor walk guards against circular parent links',
    pass: source.includes('const seenAncestorIds = new Set<string>();') &&
      source.includes('seenAncestorIds.has(currentParentId)') &&
      source.includes('seenAncestorIds.add(currentParentId)'),
  },
  {
    name: 'ancestor path excludes archived or missing parents',
    pass: source.includes('if (!parent || parent.isArchived) break;'),
  },
  {
    name: 'parent path has stable DOM hooks for browser QC',
    pass: source.includes('data-task-details-parent-path="true"') &&
      source.includes('data-task-details-parent-name="true"'),
  },
  {
    name: 'long parent names stay inspectable with title fallback',
    pass: source.includes("title={ancestor.title || '未命名任務'}") &&
      source.includes("ancestor.title || '未命名任務'"),
  },
];

const failed = checks.filter((check) => !check.pass);

if (failed.length) {
  console.error('DEV-048 task details parent path contract failed:');
  failed.forEach((check) => console.error(`- ${check.name}`));
  process.exit(1);
}

console.log('DEV-048 task details parent path contract passed.');
