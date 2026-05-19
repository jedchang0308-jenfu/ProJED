import type { DocumentSourceType, RagVisibility } from '../supabase/database.types';

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

export interface RagRetrievalRequest {
  tenantId: string;
  projectId: string | null;
  query: string;
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
