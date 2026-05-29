# P9 Gemini / RAG Design

Last updated: 2026-05-18

## Decision

P9 design and local prototype work may continue before P8 production sign-off, but production traffic remains on Firebase and Supabase production cutover remains blocked until P8 passes.

Allowed before P8:

- Retrieval contract design.
- WBS-to-document mapping.
- Chunking and citation prototype.
- Service-role worker design.
- Local TypeScript helpers that do not call Gemini or write production Supabase data.

Blocked before P8:

- Production Supabase cutover.
- Frontend-triggered service-role embedding writes.
- Cross-tenant retrieval access.
- Marking P8 as complete.

## Embedding Model Position

The current Supabase schema uses `document_embeddings.embedding vector(3072)`, `model = gemini-embedding-001`, and `dimensions = 3072`.

Google currently documents `gemini-embedding-2` as the latest multimodal embedding model, while `gemini-embedding-001` remains available for pure text use. Because the existing schema and HNSW index are already fixed at 3072 dimensions, P9 should keep `gemini-embedding-001` for the first text-only implementation unless a new migration is written and validated.

If moving to `gemini-embedding-2`, create a separate migration rather than silently changing runtime behavior. The migration must define the target dimension, rebuild vector indexes, and reindex all stored chunks.

Reference: https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-tw

## Retrieval Contract

Browser code must not call Gemini directly and must not hold service-role credentials.

Recommended flow:

1. Authenticated browser calls a tenant-aware retrieval endpoint or Supabase Edge Function.
2. Endpoint validates user membership through Supabase Auth and RLS-safe queries.
3. Endpoint embeds the query with the same provider/model/dimensions used for indexed chunks.
4. Endpoint calls `match_project_knowledge(target_tenant_id, target_project_id, query_embedding, match_threshold, match_count)`.
5. Endpoint returns chunks with citations and writes `llm_access_logs`.

Request shape:

```ts
{
  tenantId: string;
  projectId: string | null;
  query: string;
  matchThreshold?: number;
  matchCount?: number;
}
```

Result shape:

```ts
{
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  similarity: number;
  citation: {
    documentId: string;
    chunkId: string;
    sourceTable: 'wbs_items' | 'projects' | 'documents';
    sourceId: string;
    sourceType: string;
    title: string;
  };
}
```

## Indexing Contract

Indexing must run only from trusted backend code with service-role credentials.

Initial P9 source scope:

- WBS item title, type, status, dates, description, and detail notes.
- Project notes once a stable project-note source exists.
- Uploaded files only after file storage and malware/type validation are defined.

For each source record:

1. Convert source into one `documents` row.
2. Insert one `document_versions` row with full normalized content.
3. Split content into `document_chunks`.
4. Generate embeddings and insert `document_embeddings`.
5. Track status in `rag_sync_jobs`.

Disabling `rag_enabled` or removing membership must exclude content from retrieval.

## Citation Rules

Every retrieved chunk must carry:

- `document_id`
- `chunk_id`
- `source_table`
- `source_id`
- `source_type`
- `title`

LLM answers may summarize retrieved content, but UI and logs must retain the original citation identifiers so a user can navigate back to the ProJED record.

## Prototype Files

- `src/services/rag/ragContract.ts`
- `src/services/rag/chunking.ts`
- `src/services/rag/wbsRagAdapter.ts`

These files are intentionally pure TypeScript. They do not call Gemini, Supabase, or any production credential path.
