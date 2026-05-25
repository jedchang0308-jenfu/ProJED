import dayjs from 'dayjs';

const WORKSPACE_ID = 'local-test-workspace';
const BOARD_ID = 'local-test-mobile-ui-board';
const STATUSES = ['todo', 'in_progress', 'completed', 'unsure', 'delayed', 'onhold'];
const COLUMN_IDS = ['local-col-todo', 'local-col-progress', 'local-col-done'];

const clampTaskCount = (value) => Math.max(12, Math.min(1000, Math.floor(value || 12)));

const makeNode = (id, title, parentId, order, status = 'todo', daysFromNow) => ({
  id,
  workspaceId: WORKSPACE_ID,
  boardId: BOARD_ID,
  parentId,
  title,
  status,
  nodeType: parentId ? 'task' : 'group',
  order,
  startDate: daysFromNow === undefined ? undefined : dayjs().add(daysFromNow, 'day').format('YYYY-MM-DD'),
  endDate: daysFromNow === undefined ? undefined : dayjs().add(daysFromNow + 2, 'day').format('YYYY-MM-DD'),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const createNodes = (requestedTaskCount) => {
  const taskCount = clampTaskCount(requestedTaskCount);
  const nodes = [
    makeNode(COLUMN_IDS[0], 'Todo', null, 0, 'todo'),
    makeNode(COLUMN_IDS[1], 'In progress', null, 1, 'in_progress'),
    makeNode(COLUMN_IDS[2], 'Done', null, 2, 'completed'),
  ];

  let createdTasks = 0;
  let cardOrder = 0;
  while (createdTasks < taskCount) {
    const columnId = COLUMN_IDS[cardOrder % COLUMN_IDS.length];
    const cardId = `qc-card-${cardOrder + 1}`;
    nodes.push(makeNode(cardId, `QC task ${cardOrder + 1}`, columnId, cardOrder, STATUSES[cardOrder % STATUSES.length], (cardOrder % 18) - 6));
    createdTasks += 1;

    const childCount = Math.min(3, taskCount - createdTasks);
    for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
      const childId = `qc-card-${cardOrder + 1}-child-${childIndex + 1}`;
      nodes.push(makeNode(childId, `QC task ${cardOrder + 1}.${childIndex + 1}`, cardId, childIndex, STATUSES[(cardOrder + childIndex + 1) % STATUSES.length], (cardOrder % 18) - 5));
      createdTasks += 1;

      if (createdTasks < taskCount && childIndex === 0 && cardOrder % 2 === 0) {
        const grandchildId = `${childId}-deep-1`;
        nodes.push(makeNode(grandchildId, `QC task ${cardOrder + 1}.${childIndex + 1}.1`, childId, 0, STATUSES[(cardOrder + 2) % STATUSES.length], (cardOrder % 18) - 4));
        createdTasks += 1;
      }
    }

    cardOrder += 1;
  }

  return Object.fromEntries(nodes.map(node => [node.id, node]));
};

const validateTree = (nodes) => {
  const cycles = [];
  const missingParents = [];
  let maxDepth = 0;

  Object.values(nodes).forEach(node => {
    const visited = new Set([node.id]);
    let depth = 0;
    let current = node.parentId;

    while (current) {
      const parent = nodes[current];
      if (!parent) {
        missingParents.push(node.id);
        return;
      }
      if (visited.has(current)) {
        cycles.push(node.id);
        return;
      }
      visited.add(current);
      depth += 1;
      current = parent.parentId;
    }

    maxDepth = Math.max(maxDepth, depth);
  });

  const roots = Object.values(nodes).filter(node => !node.parentId);
  const badOrders = Object.values(nodes).filter(node => !Number.isFinite(node.order)).map(node => node.id);
  return { cycles, missingParents, rootCount: roots.length, badOrders, maxDepth };
};

const isDescendantOf = (nodes, nodeId, possibleAncestorId) => {
  let current = nodes[nodeId]?.parentId;
  const visited = new Set();

  while (current) {
    if (current === possibleAncestorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = nodes[current]?.parentId || null;
  }

  return false;
};

const moveNode = (nodes, nodeId, newParentId, order) => {
  if (nodeId === newParentId) return false;
  if (newParentId && isDescendantOf(nodes, newParentId, nodeId)) return false;
  nodes[nodeId] = { ...nodes[nodeId], parentId: newParentId, order, updatedAt: Date.now() };
  return true;
};

const runStress = (taskCount, moves) => {
  const nodes = createNodes(taskCount);
  const movableIds = Object.keys(nodes).filter(id => !COLUMN_IDS.includes(id));
  const parentIds = Object.keys(nodes);
  let appliedMoves = 0;

  for (let index = 0; index < moves; index += 1) {
    const nodeId = movableIds[index % movableIds.length];
    const parentId = parentIds[(index * 17 + 11) % parentIds.length];
    if (moveNode(nodes, nodeId, parentId, index)) {
      appliedMoves += 1;
    }

    if (index % 50 === 0) {
      const partial = validateTree(nodes);
      if (partial.cycles.length || partial.missingParents.length) {
        throw new Error(`Tree integrity failed during ${taskCount}-task stress at move ${index}`);
      }
    }
  }

  const result = validateTree(nodes);
  if (result.cycles.length || result.missingParents.length || result.rootCount !== COLUMN_IDS.length || result.badOrders.length) {
    throw new Error(`QC stress failed for ${taskCount} tasks: ${JSON.stringify(result)}`);
  }

  return {
    requestedTasks: clampTaskCount(taskCount),
    nodeCount: Object.keys(nodes).length,
    appliedMoves,
    maxDepth: result.maxDepth,
  };
};

const scenarios = [
  { taskCount: 100, moves: 250 },
  { taskCount: 300, moves: 500 },
  { taskCount: 1000, moves: 1000 },
];

const results = scenarios.map(({ taskCount, moves }) => runStress(taskCount, moves));
console.log(JSON.stringify({ ok: true, results }, null, 2));
