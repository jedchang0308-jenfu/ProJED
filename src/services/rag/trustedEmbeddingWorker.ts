import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/database.types';
import type { EmbeddingProvider } from './geminiEmbeddingProvider';
import type { RagIndexPlan } from './ragContract';

export interface TrustedEmbeddingWorkerOptions {
  dryRun?: boolean;
  maxEmbeddings?: number;
}

export interface TrustedEmbeddingWorkerResult {
  ok: boolean;
  dryRun: boolean;
  documents: number;
  documentVersions: number;
  chunks: number;
  embeddings: number;
  syncJobs: number;
}

type SupabaseRagClient = SupabaseClient<Database>;

interface SavedDocument {
  sourceDocumentKey: string;
  id: string;
}

interface SavedVersion {
  sourceDocumentKey: string;
  id: string;
}

interface SavedChunk {
  sourceDocumentKey: string;
  chunkIndex: number;
  id: string;
}

const assertNoError = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const vectorLiteral = (values: number[]): string => `[${values.join(',')}]`;

const json = (value: Record<string, unknown>): Json => value as Json;

export const runTrustedEmbeddingWorker = async (
  supabase: SupabaseRagClient,
  embeddingProvider: EmbeddingProvider,
  plan: RagIndexPlan,
  options: TrustedEmbeddingWorkerOptions = {},
): Promise<TrustedEmbeddingWorkerResult> => {
  const dryRun = options.dryRun ?? true;
  const maxEmbeddings = options.maxEmbeddings ?? plan.embeddingInputs.length;

  if (dryRun) {
    return {
      ok: true,
      dryRun,
      documents: plan.documents.length,
      documentVersions: plan.documentVersions.length,
      chunks: plan.chunks.length,
      embeddings: Math.min(plan.embeddingInputs.length, maxEmbeddings),
      syncJobs: plan.syncJobs.length,
    };
  }

  const savedDocuments: SavedDocument[] = [];

  for (const document of plan.documents) {
    const existing = await supabase
      .from('documents')
      .select('id')
      .eq('tenant_id', document.tenantId)
      .eq('source_table', document.sourceTable)
      .eq('source_id', document.sourceId)
      .maybeSingle();
    assertNoError('documents select', existing.error);

    if (existing.data?.id) {
      const updated = await supabase
        .from('documents')
        .update({
          project_id: document.projectId,
          source_type: document.sourceType,
          title: document.title,
          content_hash: document.contentHash,
          visibility: document.visibility,
          rag_enabled: true,
          metadata: json(document.metadata),
        })
        .eq('id', existing.data.id)
        .select('id')
        .single();
      assertNoError('documents update', updated.error);
      if (!updated.data) throw new Error(`Document update returned no row for ${document.sourceDocumentKey}.`);
      savedDocuments.push({ sourceDocumentKey: document.sourceDocumentKey, id: updated.data.id });
      continue;
    }

    const inserted = await supabase
      .from('documents')
      .insert({
        tenant_id: document.tenantId,
        project_id: document.projectId,
        source_type: document.sourceType,
        source_table: document.sourceTable,
        source_id: document.sourceId,
        title: document.title,
        content_hash: document.contentHash,
        visibility: document.visibility,
        rag_enabled: true,
        metadata: json(document.metadata),
      })
      .select('id')
      .single();
    assertNoError('documents insert', inserted.error);
    if (!inserted.data) throw new Error(`Document insert returned no row for ${document.sourceDocumentKey}.`);
    savedDocuments.push({ sourceDocumentKey: document.sourceDocumentKey, id: inserted.data.id });
  }

  const documentIdByKey = new Map(savedDocuments.map(document => [document.sourceDocumentKey, document.id]));
  const savedVersions: SavedVersion[] = [];

  for (const version of plan.documentVersions) {
    const documentId = documentIdByKey.get(version.sourceDocumentKey);
    if (!documentId) throw new Error(`Missing document id for ${version.sourceDocumentKey}.`);

    const inserted = await supabase
      .from('document_versions')
      .upsert({
        tenant_id: version.tenantId,
        document_id: documentId,
        version: version.version,
        content: version.content,
        content_hash: version.contentHash,
        metadata: json(version.metadata),
      }, { onConflict: 'document_id,version' })
      .select('id')
      .single();
    assertNoError('document_versions upsert', inserted.error);
    if (!inserted.data) throw new Error(`Document version upsert returned no row for ${version.sourceDocumentKey}.`);
    savedVersions.push({ sourceDocumentKey: version.sourceDocumentKey, id: inserted.data.id });
  }

  const versionIdByKey = new Map(savedVersions.map(version => [version.sourceDocumentKey, version.id]));
  const savedChunks: SavedChunk[] = [];

  for (const document of savedDocuments) {
    const deleted = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', document.id);
    assertNoError('document_chunks delete', deleted.error);
  }

  for (const chunk of plan.chunks) {
    const documentId = documentIdByKey.get(chunk.sourceDocumentKey);
    const versionId = versionIdByKey.get(chunk.sourceDocumentKey);
    if (!documentId) throw new Error(`Missing document id for chunk ${chunk.sourceDocumentKey}.`);
    if (!versionId) throw new Error(`Missing document version id for chunk ${chunk.sourceDocumentKey}.`);

    const inserted = await supabase
      .from('document_chunks')
      .insert({
        tenant_id: chunk.tenantId,
        document_id: documentId,
        document_version_id: versionId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_count: chunk.estimatedTokenCount,
        metadata: json(chunk.metadata),
      })
      .select('id')
      .single();
    assertNoError('document_chunks insert', inserted.error);
    if (!inserted.data) throw new Error(`Document chunk insert returned no row for ${chunk.sourceDocumentKey}:${chunk.chunkIndex}.`);
    savedChunks.push({
      sourceDocumentKey: chunk.sourceDocumentKey,
      chunkIndex: chunk.chunkIndex,
      id: inserted.data.id,
    });
  }

  const chunkIdByKey = new Map(savedChunks.map(chunk => [`${chunk.sourceDocumentKey}:${chunk.chunkIndex}`, chunk.id]));
  let embeddings = 0;

  for (const input of plan.embeddingInputs.slice(0, maxEmbeddings)) {
    const chunkId = chunkIdByKey.get(`${input.sourceDocumentKey}:${input.chunkIndex}`);
    const document = plan.documents.find(item => item.sourceDocumentKey === input.sourceDocumentKey);
    if (!chunkId) throw new Error(`Missing chunk id for ${input.sourceDocumentKey}:${input.chunkIndex}.`);
    if (!document) throw new Error(`Missing document for embedding ${input.sourceDocumentKey}.`);

    const values = await embeddingProvider.embed(input);
    const inserted = await supabase
      .from('document_embeddings')
      .upsert({
        tenant_id: document.tenantId,
        chunk_id: chunkId,
        provider: input.provider,
        model: input.model,
        dimensions: input.dimensions,
        embedding: vectorLiteral(values),
        content_hash: input.contentHash,
      }, { onConflict: 'chunk_id,provider,model,dimensions' });
    assertNoError('document_embeddings upsert', inserted.error);
    embeddings += 1;
  }

  for (const job of plan.syncJobs) {
    const sourceDocumentId = documentIdByKey.get(job.sourceDocumentKey);
    if (!sourceDocumentId) throw new Error(`Missing sync job document id for ${job.sourceDocumentKey}.`);

    const inserted = await supabase
      .from('rag_sync_jobs')
      .insert({
        tenant_id: job.tenantId,
        provider: job.provider,
        target_store_id: job.targetStoreId,
        source_document_id: sourceDocumentId,
        status: embeddings > 0 ? 'synced' : job.status,
        last_synced_at: embeddings > 0 ? new Date().toISOString() : null,
        metadata: json(job.metadata),
      });
    assertNoError('rag_sync_jobs insert', inserted.error);
  }

  return {
    ok: true,
    dryRun,
    documents: savedDocuments.length,
    documentVersions: savedVersions.length,
    chunks: savedChunks.length,
    embeddings,
    syncJobs: plan.syncJobs.length,
  };
};
