import type { TaskNode, TaskTag } from '../../types';
import { buildWbsRagSource } from '../../../shared/wbsRagSource.js';
import { chunkText } from './chunking';
import type { RagChunkDraft, RagCitation, RagDocumentDraft } from './ragContract';
import { taskNoteToAiMarkdown } from '../../utils/taskNoteRichContent';

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

export const buildWbsRagDocuments = ({ tenantId, projectId, nodes, tags = [] }: WbsRagBuildInput): WbsRagBuildResult => {
  const documents: RagDocumentDraft[] = [];
  const chunks: RagChunkDraft[] = [];
  const tagById = new Map(tags.map(tag => [tag.id, tag]));

  for (const node of nodes) {
    if (node.isArchived) continue;

    const tagNames=(node.tagIds??[]).map(tagId=>tagById.get(tagId)?.name)
      .filter((name):name is string=>Boolean(name));
    const {content,contentHash}=buildWbsRagSource(node,tagNames);
    if (!content.trim()) continue;

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
        updatedAt: node.updatedAt,
        detailNotes: (node.detailNotes ?? [])
          .filter(note => Boolean(note.title.trim() || taskNoteToAiMarkdown(note).trim()))
          .map(note => ({
            taskId: node.id,
            noteId: note.id,
            noteTitle: note.title.trim() || '未命名',
            updatedAt: node.updatedAt,
          })),
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
