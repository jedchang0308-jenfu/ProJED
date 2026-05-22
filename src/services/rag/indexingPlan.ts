import {
  RAG_EMBEDDING_DIMENSIONS,
  RAG_EMBEDDING_MODEL,
  RAG_EMBEDDING_PROVIDER,
  type RagChunkDraft,
  type RagDocumentDraft,
  type RagIndexPlan,
} from './ragContract';

export interface BuildRagIndexPlanInput {
  documents: RagDocumentDraft[];
  chunks: RagChunkDraft[];
  version?: number;
  targetStoreId?: string | null;
}

export interface RagIndexPlanIssue {
  severity: 'error' | 'warning';
  message: string;
  sourceDocumentKey?: string;
}

export interface RagIndexPlanValidation {
  ok: boolean;
  issues: RagIndexPlanIssue[];
}

export const buildSourceDocumentKey = (document: Pick<RagDocumentDraft, 'tenantId' | 'sourceTable' | 'sourceId'>): string =>
  `${document.tenantId}:${document.sourceTable}:${document.sourceId}`;

export const buildRagIndexPlan = ({
  documents,
  chunks,
  version = 1,
  targetStoreId = null,
}: BuildRagIndexPlanInput): RagIndexPlan => {
  const documentKeyBySourceId = new Map<string, string>();

  const plannedDocuments = documents.map(document => {
    const sourceDocumentKey = buildSourceDocumentKey(document);
    documentKeyBySourceId.set(document.sourceId, sourceDocumentKey);
    return { ...document, sourceDocumentKey };
  });

  const plannedChunks = chunks.map(chunk => {
    const sourceDocumentKey = documentKeyBySourceId.get(chunk.sourceDocumentId) ?? chunk.sourceDocumentId;
    return {
      ...chunk,
      sourceDocumentKey,
      documentVersion: version,
    };
  });

  return {
    documents: plannedDocuments,
    documentVersions: plannedDocuments.map(document => ({
      sourceDocumentKey: document.sourceDocumentKey,
      tenantId: document.tenantId,
      version,
      content: document.content,
      contentHash: document.contentHash,
      metadata: {
        ...document.metadata,
        sourceTable: document.sourceTable,
        sourceId: document.sourceId,
        sourceType: document.sourceType,
      },
    })),
    chunks: plannedChunks,
    embeddingInputs: plannedChunks.map(chunk => ({
      sourceDocumentKey: chunk.sourceDocumentKey,
      chunkIndex: chunk.chunkIndex,
      provider: RAG_EMBEDDING_PROVIDER,
      model: RAG_EMBEDDING_MODEL,
      dimensions: RAG_EMBEDDING_DIMENSIONS,
      content: chunk.content,
      contentHash: chunk.metadata.sourceContentHash,
      citation: chunk.metadata.citation,
    })),
    syncJobs: plannedDocuments.map(document => ({
      sourceDocumentKey: document.sourceDocumentKey,
      tenantId: document.tenantId,
      provider: RAG_EMBEDDING_PROVIDER,
      targetStoreId,
      status: 'pending',
      metadata: {
        sourceTable: document.sourceTable,
        sourceId: document.sourceId,
        sourceType: document.sourceType,
        contentHash: document.contentHash,
        version,
      },
    })),
  };
};

export const validateRagIndexPlan = (plan: RagIndexPlan): RagIndexPlanValidation => {
  const issues: RagIndexPlanIssue[] = [];
  const documentKeys = new Set<string>();
  const chunkCountByDocument = new Map<string, number>();

  for (const document of plan.documents) {
    if (documentKeys.has(document.sourceDocumentKey)) {
      issues.push({
        severity: 'error',
        message: 'Duplicate source document key.',
        sourceDocumentKey: document.sourceDocumentKey,
      });
    }
    documentKeys.add(document.sourceDocumentKey);

    if (!document.contentHash) {
      issues.push({
        severity: 'error',
        message: 'Document content hash is required.',
        sourceDocumentKey: document.sourceDocumentKey,
      });
    }
  }

  for (const chunk of plan.chunks) {
    if (!documentKeys.has(chunk.sourceDocumentKey)) {
      issues.push({
        severity: 'error',
        message: 'Chunk references a document that is not in the plan.',
        sourceDocumentKey: chunk.sourceDocumentKey,
      });
    }
    chunkCountByDocument.set(chunk.sourceDocumentKey, (chunkCountByDocument.get(chunk.sourceDocumentKey) ?? 0) + 1);

    const citation = chunk.metadata.citation;
    if (!citation.sourceTable || !citation.sourceId || !citation.sourceType || !citation.title) {
      issues.push({
        severity: 'error',
        message: 'Chunk citation is missing required traceability fields.',
        sourceDocumentKey: chunk.sourceDocumentKey,
      });
    }
  }

  for (const documentKey of documentKeys) {
    if (!chunkCountByDocument.has(documentKey)) {
      issues.push({
        severity: 'warning',
        message: 'Document has no chunks and will not be embedded.',
        sourceDocumentKey: documentKey,
      });
    }
  }

  if (plan.embeddingInputs.length !== plan.chunks.length) {
    issues.push({
      severity: 'error',
      message: 'Embedding input count must match chunk count.',
    });
  }

  if (plan.syncJobs.length !== plan.documents.length) {
    issues.push({
      severity: 'error',
      message: 'Sync job count must match document count.',
    });
  }

  return {
    ok: issues.every(issue => issue.severity !== 'error'),
    issues,
  };
};
