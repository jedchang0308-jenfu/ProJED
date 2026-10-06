import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TaskDetailsModal.tsx', import.meta.url), 'utf8');
const hierarchySource = readFileSync(new URL('../src/utils/taskHierarchy.ts', import.meta.url), 'utf8');

const checks = [
  {
    name: 'TaskDetailsModal reads the full node index',
    pass: source.includes('const nodes = useWbsStore((state) => state.nodes);'),
  },
  {
    name: 'ancestor path is built from parentId',
    pass: source.includes("import { buildAncestorPath } from '../utils/taskHierarchy';") &&
      source.includes('const ancestorPath = buildAncestorPath(node, nodes);') &&
      hierarchySource.includes('let currentParentId: string | null = node.parentId;'),
  },
  {
    name: 'ancestor walk guards against circular parent links',
    pass: hierarchySource.includes('const seenAncestorIds = new Set<string>();') &&
      hierarchySource.includes('seenAncestorIds.has(currentParentId)') &&
      hierarchySource.includes('seenAncestorIds.add(currentParentId)'),
  },
  {
    name: 'ancestor path excludes archived or missing parents',
    pass: hierarchySource.includes('if (!parent || parent.isArchived) break;'),
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
