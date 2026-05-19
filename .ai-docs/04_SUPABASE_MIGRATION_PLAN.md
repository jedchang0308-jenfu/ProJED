# ProJED Supabase Migration Plan

## Current State

ProJED currently persists workspaces, boards, WBS nodes, and dependencies in Firebase/Firestore. The Supabase migration keeps the existing UI contract intact by mapping:

- Firestore `workspaces` to Supabase `tenants`
- Firestore `boards` to Supabase `projects`
- Firestore board `nodes` to Supabase `wbs_items`
- Firestore board `dependencies` to Supabase `wbs_dependencies`

## Implemented Baseline

- `supabase/migrations/202605140001_initial_projed_schema.sql`
  - Multi-tenant core tables
  - WBS tables
  - Dependency tables
  - RAG-ready documents, chunks, embeddings, Gemini/File Search sync metadata
  - RLS policies and helper functions
  - `match_project_knowledge` RPC for pgvector cosine search
- `src/services/supabase/client.ts`
  - Browser Supabase client
- `src/services/supabase/projedService.ts`
  - Initial service adapter that maps Supabase rows back to current ProJED types
- `.env.example`
  - Supabase environment variables

## Migration Order

1. Create the Supabase project.
2. Run the SQL migration with Supabase CLI or Dashboard SQL Editor.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Decide the auth cutover:
   - Recommended: move app auth to Supabase Auth so `auth.uid()` drives RLS directly.
   - Transitional: keep Firebase Auth only for legacy UI while a backend service-role migration imports data.
5. Import Firestore data using a server-side script with Supabase service role:
   - Create one `tenant` per workspace.
   - Create one `project` per board.
   - Insert `wbs_items` with `legacy_node_id`.
   - Resolve parent references from `legacy_node_id` to `wbs_items.id`.
   - Insert dependencies after all WBS ids are resolved.
6. Switch read path from `useFirestoreSync` to a Supabase sync hook.
7. Switch write services from `firestoreService` to the Supabase adapter.
8. Add RAG indexing:
   - Convert WBS/tasks/notes/files to `documents`.
   - Chunk into `document_chunks`.
   - Generate Gemini embeddings into `document_embeddings`.
   - Query via `match_project_knowledge`.

## RAG Guardrails

- Gemini should not read raw tables directly.
- Retrieval must go through tenant-aware RPC or trusted backend endpoints.
- Store citations as `document_id`, `chunk_id`, source table, and source id.
- Log LLM retrieval in `llm_access_logs`.
- Removing user access or disabling `rag_enabled` must remove that content from retrieval.
