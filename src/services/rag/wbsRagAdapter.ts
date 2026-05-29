import type { TaskDetailNote, TaskNode, TaskTag } from '../../types';
import { chunkText } from './chunking';
import type { RagChunkDraft, RagCitation, RagDocumentDraft } from './ragContract';

export interface WbsRagBuildInput {
  tenantId: string;
  projectId: string;
  nodes: TaskNode[];
  tags?: TaskTag[];
}

export interface WbsRagBuildResult {
  documents: RagDocumentDraft[];
  chunks: RagChunkDraft[];
}

const stableHash = (content: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const formatDateRange = (node: TaskNode): string | null => {
  if (node.startDate && node.endDate) return `${node.startDate} 至 ${node.endDate}`;
  if (node.startDate) return `開始：${node.startDate}`;
  if (node.endDate) return `結束：${node.endDate}`;
  return null;
};

const formatDetailNotes = (detailNotes: TaskDetailNote[] | undefined): string[] =>
  (detailNotes ?? [])
    .map(note => {
      const title = note.title.trim();
      const content = note.content.trim();
      if (!title && !content) return null;
      return [`備註：${title || '未命名'}`, content].filter(Boolean).join('\n');
    })
    .filter((note): note is string => Boolean(note));

const formatTags = (node: TaskNode, tagById: Map<string, TaskTag>): string | null => {
  const names = (node.tagIds ?? [])
    .map(tagId => tagById.get(tagId)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? `標籤：${names.join(', ')}` : null;
};

const buildNodeContent = (node: TaskNode, tagById: Map<string, TaskTag>): string => {
  const parts = [
    `標題：${node.title}`,
    `類型：${node.nodeType ?? 'task'}`,
    `狀態：${node.status}`,
    formatTags(node, tagById),
    formatDateRange(node) ? `排程：${formatDateRange(node)}` : null,
    node.description?.trim() ? `描述：\n${node.description.trim()}` : null,
    ...formatDetailNotes(node.detailNotes),
  ];

  return parts.filter((part): part is string => Boolean(part)).join('\n\n');
};

export const buildWbsRagDocuments = ({ tenantId, projectId, nodes, tags = [] }: WbsRagBuildInput): WbsRagBuildResult => {
  const documents: RagDocumentDraft[] = [];
  const chunks: RagChunkDraft[] = [];
  const tagById = new Map(tags.map(tag => [tag.id, tag]));

  for (const node of nodes) {
    if (node.isArchived) continue;

    const content = buildNodeContent(node, tagById);
    if (!content.trim()) continue;

    const contentHash = stableHash(content);
    const document: RagDocumentDraft = {
      tenantId,
      projectId,
      sourceType: 'wbs_item',
      sourceTable: 'wbs_items',
      sourceId: node.id,
      title: node.title || '未命名 WBS 項目',
      content,
      contentHash,
      visibility: 'project',
      metadata: {
        legacyWorkspaceId: node.workspaceId,
        legacyBoardId: node.boardId,
        legacyNodeId: node.id,
        parentId: node.parentId,
        status: node.status,
        nodeType: node.nodeType ?? 'task',
        tagIds: node.tagIds ?? [],
        tags: (node.tagIds ?? []).map(tagId => tagById.get(tagId)?.name).filter(Boolean),
        order: node.order,
      },
    };

    const citation: RagCitation = {
      documentId: null,
      chunkId: null,
      sourceTable: 'wbs_items',
      sourceId: node.id,
      sourceType: 'wbs_item',
      title: document.title,
    };

    documents.push(document);
    chunks.push(
      ...chunkText({
        tenantId,
        sourceDocumentId: node.id,
        content,
        citation,
        sourceContentHash: contentHash,
      }),
    );
  }

  return { documents, chunks };
};
