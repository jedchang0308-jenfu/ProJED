import type { RagCitation, RagRetrievalRequest, RagRetrievalResponse, RagRetrievalResult } from '../rag/ragContract';
import { HttpApiClient } from './httpApiClient';

export interface HttpRagAdapter {
  query(request: RagRetrievalRequest, signal?: AbortSignal): Promise<RagRetrievalResponse>;
}

const SOURCE_TABLES = new Set(['wbs_items', 'projects', 'documents', 'knowledge_records']);
const SOURCE_TYPES = new Set([
  'wbs_item', 'task', 'project_note', 'meeting_note', 'work_log', 'risk', 'decision', 'uploaded_file', 'comment', 'manual',
]);
const GENERATION_MODELS = new Set(['gemini-3.1-flash-lite', 'gemini-3.5-flash']);
const MAX_ANSWER_CHARS = 256 * 1024;
const MAX_CHUNK_CONTENT_CHARS = 64 * 1024;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_RAG_${label}`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some(key => !expected.includes(key))) {
    throw new Error(`HTTP_API_INVALID_RAG_${label}`);
  }
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`HTTP_API_INVALID_RAG_${label}`);
  }
  return value;
}

function nullableId(value: unknown, label: string): string | null {
  if (value === null) return null;
  return boundedString(value, label, 256);
}

function resourceRef(value: string, label: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || hasControl) {
    throw new Error(`HTTP_API_INVALID_RAG_${label}`);
  }
  return encodeURIComponent(value);
}

function validateRequest(request: RagRetrievalRequest): {
  path: string;
  body: Record<string, unknown>;
} {
  const workspacePath = resourceRef(request.tenantId, 'WORKSPACE_REF');
  if (request.projectId !== null) resourceRef(request.projectId, 'PROJECT_REF');
  if (typeof request.query !== 'string' || request.query.trim().length === 0 || request.query.length > 4000) {
    throw new Error('HTTP_API_INVALID_RAG_QUERY');
  }
  if (request.generationModel !== undefined && !GENERATION_MODELS.has(request.generationModel)) {
    throw new Error('HTTP_API_INVALID_RAG_MODEL');
  }
  if (request.matchThreshold !== undefined
      && (!Number.isFinite(request.matchThreshold) || request.matchThreshold < 0 || request.matchThreshold > 1)) {
    throw new Error('HTTP_API_INVALID_RAG_THRESHOLD');
  }
  if (request.matchCount !== undefined
      && (!Number.isSafeInteger(request.matchCount) || request.matchCount < 1 || request.matchCount > 50)) {
    throw new Error('HTTP_API_INVALID_RAG_MATCH_COUNT');
  }

  const body: Record<string, unknown> = {
    projectId: request.projectId,
    query: request.query,
  };
  if (request.generationModel !== undefined) body.generationModel = request.generationModel;
  if (request.matchThreshold !== undefined) body.matchThreshold = request.matchThreshold;
  if (request.matchCount !== undefined) body.matchCount = request.matchCount;

  return { path: `/api/v1/workspaces/${workspacePath}/rag:query`, body };
}

function parseCitation(value: unknown): RagCitation {
  const row = record(value, 'CITATION');
  exactKeys(row, ['documentId', 'chunkId', 'sourceTable', 'sourceId', 'sourceType', 'title'], 'CITATION');
  if (typeof row.sourceTable !== 'string' || !SOURCE_TABLES.has(row.sourceTable)
      || typeof row.sourceType !== 'string' || !SOURCE_TYPES.has(row.sourceType)) {
    throw new Error('HTTP_API_INVALID_RAG_CITATION');
  }
  return {
    documentId: nullableId(row.documentId, 'CITATION_DOCUMENT_ID'),
    chunkId: nullableId(row.chunkId, 'CITATION_CHUNK_ID'),
    sourceTable: row.sourceTable as RagCitation['sourceTable'],
    sourceId: boundedString(row.sourceId, 'CITATION_SOURCE_ID', 256),
    sourceType: row.sourceType as RagCitation['sourceType'],
    title: boundedString(row.title, 'CITATION_TITLE', 2048),
  };
}

function parseChunk(value: unknown): RagRetrievalResult {
  const row = record(value, 'CHUNK');
  exactKeys(row, ['chunkId', 'documentId', 'title', 'content', 'similarity', 'citation'], 'CHUNK');
  if (typeof row.similarity !== 'number' || !Number.isFinite(row.similarity)
      || row.similarity < 0 || row.similarity > 1) {
    throw new Error('HTTP_API_INVALID_RAG_SIMILARITY');
  }
  return {
    chunkId: boundedString(row.chunkId, 'CHUNK_ID', 256),
    documentId: boundedString(row.documentId, 'DOCUMENT_ID', 256),
    title: boundedString(row.title, 'CHUNK_TITLE', 2048),
    content: boundedString(row.content, 'CHUNK_CONTENT', MAX_CHUNK_CONTENT_CHARS),
    similarity: row.similarity,
    citation: parseCitation(row.citation),
  };
}

function parseResponse(value: unknown): RagRetrievalResponse {
  const envelope = record(value, 'ENVELOPE');
  exactKeys(envelope, ['data'], 'ENVELOPE');
  const data = record(envelope.data, 'DATA');
  exactKeys(data, ['answer', 'chunks'], 'DATA');
  if (typeof data.answer !== 'string' || data.answer.length > MAX_ANSWER_CHARS
      || !Array.isArray(data.chunks) || data.chunks.length > 50) {
    throw new Error('HTTP_API_INVALID_RAG_DATA');
  }
  return {
    answer: data.answer,
    chunks: data.chunks.map(parseChunk),
  };
}

export function createHttpRagAdapter(client: HttpApiClient): HttpRagAdapter {
  return {
    async query(request, signal) {
      const { path, body } = validateRequest(request);
      return parseResponse(await client.request<unknown>(path, { method: 'POST', body, signal }));
    },
  };
}
