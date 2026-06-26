export const addMindMapExpandedNodeIds = (
  expandedNodeIds: Set<string>,
  nodeIds: Array<string | null | undefined>,
) => {
  const next = new Set(expandedNodeIds);
  nodeIds.forEach((nodeId) => {
    if (nodeId) next.add(nodeId);
  });
  return next;
};

export const addMindMapExpandedNodeId = (
  expandedNodeIds: Set<string>,
  nodeId: string | null | undefined,
) => addMindMapExpandedNodeIds(expandedNodeIds, [nodeId]);

export const toggleMindMapExpandedNodeId = (
  expandedNodeIds: Set<string>,
  nodeId: string,
) => {
  const next = new Set(expandedNodeIds);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  return next;
};
