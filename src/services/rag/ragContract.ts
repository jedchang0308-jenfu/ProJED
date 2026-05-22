import type { DocumentSourceType, RagSyncStatus, RagVisibility } from '../supabase/database.types';

export const RAG_EMBEDDING_PROVIDER = 'google' as const;
export const RAG_EMBEDDING_MODEL = 'gemini-embedding-001' as const;
export const RAG_EMBEDDING_DIMENSIONS = 3072 as const;

export const RAG_CHUNK_TARGET_CHARS = 1800;
export const RAG_CHUNK_OVERLAP_CHARS = 240;

export type RagSourceTable = 'wbs_items' | 'projects' | 'documents';

export interface RagCitation {
  documentId: string | null;
  chunkId: string | null;
  sourceTable: RagSourceTable;
  sourceId: string;
  sourceType: DocumentSourceType;
  title: string;
}

export interface RagDocumentDraft {
  tenantId: string;
  projectId: string | null;
  sourceType: DocumentSourceType;
  sourceTable: RagSourceTable;
  sourceId: string;
  title: string;
  content: string;
  contentHash: string;
  visibility: RagVisibility;
  metadata: Record<string, unknown>;
}

export interface RagChunkDraft {
  tenantId: string;
  sourceDocumentId: string;
  chunkIndex: number;
  content: string;
  estimatedTokenCount: number;
  metadata: {
    citation: RagCitation;
    sourceContentHash: string;
    startChar: number;
    endChar: number;
  };
}

export interface RagDocumentVersionDraft {
  sourceDocumentKey: string;
  tenantId: string;
  version: number;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface RagSyncJobDraft {
  sourceDocumentKey: string;
  tenantId: string;
  provider: typeof RAG_EMBEDDING_PROVIDER;
  targetStoreId: string | null;
  status: RagSyncStatus;
  metadata: Record<string, unknown>;
}

export interface RagEmbeddingInputDraft {
  sourceDocumentKey: string;
  chunkIndex: number;
  provider: typeof RAG_EMBEDDING_PROVIDER;
  model: typeof RAG_EMBEDDING_MODEL;
  dimensions: typeof RAG_EMBEDDING_DIMENSIONS;
  content: string;
  contentHash: string;
  citation: RagCitation;
}

export interface RagIndexPlan {
  documents: Array<RagDocumentDraft & { sourceDocumentKey: string }>;
  documentVersions: RagDocumentVersionDraft[];
  chunks: Array<RagChunkDraft & { sourceDocumentKey: string; documentVersion: number }>;
  embeddingInputs: RagEmbeddingInputDraft[];
  syncJobs: RagSyncJobDraft[];
}

export interface RagRetrievalRequest {
  tenantId: string;
  projectId: string | null;
  query: string;
  generationModel?: string;
  matchThreshold?: number;
  matchCount?: number;
}

export interface RagRetrievalResult {
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  similarity: number;
  citation: RagCitation;
}

export interface RagRetrievalResponse {
  answer: string;
  chunks: RagRetrievalResult[];
}
