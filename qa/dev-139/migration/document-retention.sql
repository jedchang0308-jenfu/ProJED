-- Disposable target only. Validate retained document state and access boundaries;
-- every mutation, including temporary permission grants and cascade checks, rolls back.
BEGIN;

DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.documents) <> 4
     OR (SELECT count(*) FROM projed_core.document_versions) <> 5
     OR (SELECT count(*) FROM projed_core.document_chunks) <> 5
     OR (SELECT count(*) FROM projed_core.document_embeddings) <> 2
     OR (SELECT count(*) FROM projed_core.rag_sync_jobs) <> 5
     OR (SELECT count(*) FROM projed_core.external_rag_objects) <> 2 THEN
    RAISE EXCEPTION 'document source fixture counts were not retained';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projed_core.documents
      WHERE id = 'd0000000-0000-4000-8000-000000000001'
        AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        AND visibility = 'project' AND rag_enabled
        AND metadata = '9007199254740993.1234567890123456789'::jsonb
        AND jsonb_typeof(metadata) = 'number'
        AND created_at = '2026-02-01T10:11:12.123456Z'::timestamptz
        AND updated_at = '2026-02-01T10:11:12.654321Z'::timestamptz)
     OR NOT EXISTS (SELECT 1 FROM projed_core.documents
      WHERE id = 'd0000000-0000-4000-8000-000000000002'
        AND project_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND visibility = 'project'
        AND metadata = 'null'::jsonb AND jsonb_typeof(metadata) = 'null')
     OR NOT EXISTS (SELECT 1 FROM projed_core.documents
      WHERE id = 'd0000000-0000-4000-8000-000000000003'
        AND visibility = 'private'
        AND metadata = '"private document scalar"'::jsonb
        AND jsonb_typeof(metadata) = 'string')
     OR NOT EXISTS (SELECT 1 FROM projed_core.documents
      WHERE id = 'd0000000-0000-4000-8000-000000000004'
        AND source_table = 'knowledge_records'
        AND source_id = '23456789-1234-4234-8234-123456789002'
        AND metadata = '{"kind":"mirror","source_rag_enabled":false}'::jsonb)
     OR NOT EXISTS (SELECT 1 FROM projed_core.knowledge_records
      WHERE id = '23456789-1234-4234-8234-123456789002'
        AND rag_enabled = false
        AND source_document_id = 'd0000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'document ids/scope, representative JSON and microseconds, or disabled mirror source were not retained';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projed_core.document_versions
      WHERE id = 'd1000000-0000-4000-8000-000000000001'
        AND document_id = 'd0000000-0000-4000-8000-000000000001'
        AND version = 1 AND content = 'Synthetic shared document version one.'
        AND metadata = '9007199254740993.1234567890123456789'::jsonb
        AND jsonb_typeof(metadata) = 'number'
        AND created_at = '2026-02-05T10:11:12.123456Z'::timestamptz)
     OR NOT EXISTS (SELECT 1 FROM projed_core.document_versions
      WHERE id = 'd1000000-0000-4000-8000-000000000002'
        AND document_id = 'd0000000-0000-4000-8000-000000000001'
        AND version = 2 AND content = 'Synthetic shared document version two.'
        AND metadata = 'null'::jsonb AND jsonb_typeof(metadata) = 'null') THEN
    RAISE EXCEPTION 'shared document version ids/content, JSON precision, or microseconds were not retained';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projed_core.document_chunks
      WHERE id = 'd2000000-0000-4000-8000-000000000001'
        AND document_id = 'd0000000-0000-4000-8000-000000000001'
        AND document_version_id = 'd1000000-0000-4000-8000-000000000001'
        AND chunk_index = 0 AND content = 'Synthetic shared version one chunk.'
        AND token_count = 7 AND metadata = '"chunk scalar"'::jsonb
        AND jsonb_typeof(metadata) = 'string'
        AND created_at = '2026-02-09T10:11:12.123456Z'::timestamptz)
     THEN
    RAISE EXCEPTION 'shared chunk id/content, JSON type, or microseconds were not retained';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projed_core.document_embeddings
      WHERE id = 'd3000000-0000-4000-8000-000000000001'
        AND chunk_id = 'd2000000-0000-4000-8000-000000000001'
        AND dimensions = 3072 AND cardinality(embedding) = 3072
        AND embedding = (ARRAY[0.125::real, -0.5::real, 3.1415927::real]
              || array_fill(0::real, ARRAY[3069]))
        AND created_at = '2026-02-13T10:11:12.123456Z'::timestamptz)
     THEN
    RAISE EXCEPTION 'complete 3072-dimensional float32 embedding or microseconds were not retained';
  END IF;
  IF COALESCE((SELECT array_agg(status ORDER BY status) FROM projed_core.rag_sync_jobs), ARRAY[]::text[])
       IS DISTINCT FROM ARRAY['deleted', 'failed', 'pending', 'running', 'synced']::text[]
     OR NOT EXISTS (SELECT 1 FROM projed_core.rag_sync_jobs
       WHERE id = 'd4000000-0000-4000-8000-000000000005'
         AND source_document_id IS NULL AND last_synced_at = '2026-02-14T10:11:20.123456Z'::timestamptz)
     OR NOT EXISTS (SELECT 1 FROM projed_core.external_rag_objects
       WHERE external_object_id = 'fixture-provider-object-main-001') THEN
    RAISE EXCEPTION 'RAG job statuses, NULL source, timestamp, or external object id was not retained';
  END IF;
END $$;

SAVEPOINT mirror_source_document_delete;
DELETE FROM projed_core.documents
 WHERE id = 'd0000000-0000-4000-8000-000000000004';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM projed_core.knowledge_records
      WHERE id = '23456789-1234-4234-8234-123456789002'
        AND rag_enabled = false AND source_document_id IS NULL) THEN
    RAISE EXCEPTION 'deleting a document mirror did not retain its record and clear source_document_id';
  END IF;
END $$;
ROLLBACK TO SAVEPOINT mirror_source_document_delete;
RELEASE SAVEPOINT mirror_source_document_delete;
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.documents) <> 4
     OR NOT EXISTS (SELECT 1 FROM projed_core.knowledge_records
       WHERE id = '23456789-1234-4234-8234-123456789002'
         AND source_document_id = 'd0000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'mirror delete savepoint did not restore the original retained corpus';
  END IF;
END $$;

-- Composite tenant/project and tenant/document/version boundaries must reject
-- mismatched rows even when each referenced UUID exists independently.
DO $$ BEGIN
  BEGIN
    INSERT INTO projed_core.documents
      (id, tenant_id, project_id, source_type, title, visibility, rag_enabled)
    VALUES ('d0000000-0000-4000-8000-000000000091',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc9', 'manual',
            'Synthetic cross-tenant rejection', 'project', true);
    RAISE EXCEPTION 'cross-tenant project/document relation was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO projed_core.document_chunks
      (id, tenant_id, document_id, document_version_id, chunk_index, content)
    VALUES ('d2000000-0000-4000-8000-000000000091',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'd0000000-0000-4000-8000-000000000001',
            'd1000000-0000-4000-8000-000000000003', 99,
            'Synthetic mismatched document/version rejection');
    RAISE EXCEPTION 'chunk/version from different documents was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

-- pgvector's source components are finite float32 values; reject NULL/NaN drift.
DO $$
DECLARE invalid_embedding real[];
BEGIN
  invalid_embedding := array_fill(0::real, ARRAY[3072]);
  invalid_embedding[1] := NULL;
  BEGIN
    INSERT INTO projed_core.document_embeddings
      (id, tenant_id, chunk_id, provider, model, dimensions, embedding)
    VALUES ('d3000000-0000-4000-8000-000000000091',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'd2000000-0000-4000-8000-000000000001', 'qa-null-component', 'fixture',
            3072, invalid_embedding);
    RAISE EXCEPTION 'NULL embedding component was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  invalid_embedding := array_fill(0::real, ARRAY[3072]);
  invalid_embedding[1] := 'NaN'::real;
  BEGIN
    INSERT INTO projed_core.document_embeddings
      (id, tenant_id, chunk_id, provider, model, dimensions, embedding)
    VALUES ('d3000000-0000-4000-8000-000000000092',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'd2000000-0000-4000-8000-000000000001', 'qa-nan-component', 'fixture',
            3072, invalid_embedding);
    RAISE EXCEPTION 'NaN embedding component was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision)
VALUES ('11111111-1111-4111-8111-111111111111', true, 1),
       ('22222222-2222-4222-8222-222222222222', true, 1)
ON CONFLICT (local_user_id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM projed_core.account_authorization_guards
     WHERE local_user_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
       AND (active IS DISTINCT FROM true OR revision <> 1)
  ) THEN
    RAISE EXCEPTION 'Existing account guard is not active at revision one';
  END IF;
END $$;

SET LOCAL ROLE projed_runtime_disposable;
-- A new psql connection has no actor GUCs. Do not fabricate an invalid bigint
-- revision while testing absence; malformed revisions are rejected separately.
DO $$
DECLARE relation_name text;
BEGIN
  IF (SELECT count(*) FROM projed_core.documents) <> 0
     OR (SELECT count(*) FROM projed_core.document_versions) <> 0
     OR (SELECT count(*) FROM projed_core.document_chunks) <> 0
     OR (SELECT count(*) FROM projed_core.document_embeddings) <> 0 THEN
    RAISE EXCEPTION 'document rows were readable without actor context';
  END IF;
  IF NOT has_table_privilege(current_user, 'projed_core.documents', 'SELECT')
     OR NOT has_table_privilege(current_user, 'projed_core.document_versions', 'SELECT')
     OR NOT has_table_privilege(current_user, 'projed_core.document_chunks', 'SELECT')
     OR NOT has_table_privilege(current_user, 'projed_core.document_embeddings', 'SELECT')
     OR has_table_privilege(current_user, 'projed_core.rag_sync_jobs', 'SELECT')
     OR has_table_privilege(current_user, 'projed_core.external_rag_objects', 'SELECT') THEN
    RAISE EXCEPTION 'runtime document/job/external-object SELECT grants differ from the retention boundary';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'documents', 'document_versions', 'document_chunks', 'document_embeddings',
    'rag_sync_jobs', 'external_rag_objects'
  ] LOOP
    IF has_table_privilege(current_user, format('projed_core.%I', relation_name), 'INSERT')
       OR has_table_privilege(current_user, format('projed_core.%I', relation_name), 'UPDATE')
       OR has_table_privilege(current_user, format('projed_core.%I', relation_name), 'DELETE') THEN
      RAISE EXCEPTION 'runtime has a write grant on projed_core.%', relation_name;
    END IF;
  END LOOP;
  BEGIN
    PERFORM 1 FROM projed_core.rag_sync_jobs;
    RAISE EXCEPTION 'runtime read RAG sync jobs without a grant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM projed_core.external_rag_objects;
    RAISE EXCEPTION 'runtime read external RAG objects without a grant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('projed.actor_principal_id', 'qa-document-owner', true),
       set_config('projed.actor_local_user_id', '11111111-1111-4111-8111-111111111111', true),
       set_config('projed.actor_entry', 'main', true),
       set_config('projed.actor_context_id', '33333333-3333-4333-8333-333333333333', true),
       set_config('projed.actor_guard_revision', '1', true);
DO $$ BEGIN
  IF COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.documents), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY[
         'd0000000-0000-4000-8000-000000000001'::uuid,
         'd0000000-0000-4000-8000-000000000002'::uuid,
         'd0000000-0000-4000-8000-000000000003'::uuid
       ]::uuid[]
     OR COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.document_versions), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY[
         'd1000000-0000-4000-8000-000000000001'::uuid,
         'd1000000-0000-4000-8000-000000000002'::uuid,
         'd1000000-0000-4000-8000-000000000003'::uuid,
         'd1000000-0000-4000-8000-000000000004'::uuid
       ]::uuid[]
     OR COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.document_chunks), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY[
         'd2000000-0000-4000-8000-000000000001'::uuid,
         'd2000000-0000-4000-8000-000000000002'::uuid,
         'd2000000-0000-4000-8000-000000000003'::uuid,
         'd2000000-0000-4000-8000-000000000004'::uuid
       ]::uuid[]
     OR COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.document_embeddings), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY[
         'd3000000-0000-4000-8000-000000000001'::uuid,
         'd3000000-0000-4000-8000-000000000002'::uuid
       ]::uuid[]
     OR EXISTS (SELECT 1 FROM projed_core.documents
       WHERE id = 'd0000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'owner document reads leaked the disabled mirror or lost private/project content';
  END IF;
END $$;

SELECT set_config('projed.actor_principal_id', 'qa-document-viewer', true),
       set_config('projed.actor_local_user_id', '22222222-2222-4222-8222-222222222222', true),
       set_config('projed.actor_entry', 'main', true),
       set_config('projed.actor_context_id', '33333333-3333-4333-8333-333333333333', true),
       set_config('projed.actor_guard_revision', '1', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.documents) <> 0
     OR (SELECT count(*) FROM projed_core.document_versions) <> 0
     OR (SELECT count(*) FROM projed_core.document_chunks) <> 0
     OR (SELECT count(*) FROM projed_core.document_embeddings) <> 0 THEN
    RAISE EXCEPTION 'viewer without read_board read document data';
  END IF;
END $$;

-- The source viewer remains unchanged. This transaction-only grant exercises a
-- positive shared-board read before proving that its immediate withdrawal hides it.
RESET ROLE;
UPDATE projed_core.board_role_permissions
   SET capabilities = ARRAY['read_board']::text[]
 WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   AND role = 'viewer';
SET LOCAL ROLE projed_runtime_disposable;
DO $$ BEGIN
  IF COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.documents), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY['d0000000-0000-4000-8000-000000000001'::uuid]
     OR COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.document_versions), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY[
         'd1000000-0000-4000-8000-000000000001'::uuid,
         'd1000000-0000-4000-8000-000000000002'::uuid
       ]::uuid[]
     OR COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.document_chunks), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY[
         'd2000000-0000-4000-8000-000000000001'::uuid,
         'd2000000-0000-4000-8000-000000000002'::uuid
       ]::uuid[]
     OR COALESCE((SELECT array_agg(id ORDER BY id) FROM projed_core.document_embeddings), ARRAY[]::uuid[])
       IS DISTINCT FROM ARRAY['d3000000-0000-4000-8000-000000000001'::uuid]
     THEN
    RAISE EXCEPTION 'viewer read an unauthorized board, private document, disabled mirror, or child row';
  END IF;
END $$;

RESET ROLE;
UPDATE projed_core.board_role_permissions
   SET capabilities = ARRAY[]::text[]
 WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   AND role = 'viewer';
SET LOCAL ROLE projed_runtime_disposable;
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.documents) <> 0
     OR (SELECT count(*) FROM projed_core.document_versions) <> 0
     OR (SELECT count(*) FROM projed_core.document_chunks) <> 0
     OR (SELECT count(*) FROM projed_core.document_embeddings) <> 0 THEN
    RAISE EXCEPTION 'withdrawing read_board did not immediately hide document and child rows';
  END IF;
END $$;

RESET ROLE;
DELETE FROM projed_core.projects
 WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN
  IF (SELECT count(*) FROM projed_core.documents) <> 1
     OR NOT EXISTS (SELECT 1 FROM projed_core.documents
       WHERE id = 'd0000000-0000-4000-8000-000000000002'
         AND project_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
     OR (SELECT count(*) FROM projed_core.document_versions) <> 1
     OR NOT EXISTS (SELECT 1 FROM projed_core.document_versions
       WHERE id = 'd1000000-0000-4000-8000-000000000003')
     OR (SELECT count(*) FROM projed_core.document_chunks) <> 1
     OR NOT EXISTS (SELECT 1 FROM projed_core.document_chunks
       WHERE id = 'd2000000-0000-4000-8000-000000000003')
     OR (SELECT count(*) FROM projed_core.document_embeddings) <> 1
     OR NOT EXISTS (SELECT 1 FROM projed_core.document_embeddings
       WHERE id = 'd3000000-0000-4000-8000-000000000002')
     OR (SELECT count(*) FROM projed_core.rag_sync_jobs) <> 2
     OR NOT EXISTS (SELECT 1 FROM projed_core.rag_sync_jobs
       WHERE id = 'd4000000-0000-4000-8000-000000000003')
     OR NOT EXISTS (SELECT 1 FROM projed_core.rag_sync_jobs
       WHERE id = 'd4000000-0000-4000-8000-000000000005'
         AND source_document_id IS NULL)
     OR (SELECT count(*) FROM projed_core.external_rag_objects) <> 1
     OR NOT EXISTS (SELECT 1 FROM projed_core.external_rag_objects
       WHERE id = 'd5000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'project cascade lost unrelated board data or left linked document rows';
  END IF;
  IF EXISTS (SELECT 1 FROM projed_core.document_versions version
       JOIN projed_core.documents document ON document.id = version.document_id
      WHERE version.tenant_id <> document.tenant_id)
     OR EXISTS (SELECT 1 FROM projed_core.document_chunks chunk
       JOIN projed_core.documents document ON document.id = chunk.document_id
      WHERE chunk.tenant_id <> document.tenant_id)
     OR EXISTS (SELECT 1 FROM projed_core.document_embeddings embedding
       JOIN projed_core.document_chunks chunk ON chunk.id = embedding.chunk_id
      WHERE embedding.tenant_id <> chunk.tenant_id)
     OR EXISTS (SELECT 1 FROM projed_core.rag_sync_jobs job
       JOIN projed_core.documents document ON document.id = job.source_document_id
      WHERE job.tenant_id <> document.tenant_id)
     OR EXISTS (SELECT 1 FROM projed_core.external_rag_objects object
       JOIN projed_core.documents document ON document.id = object.document_id
      WHERE object.tenant_id <> document.tenant_id) THEN
    RAISE EXCEPTION 'document retention cascade left a cross-tenant orphan';
  END IF;
END $$;

DELETE FROM projed_core.tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projed_core.documents
       WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
     OR EXISTS (SELECT 1 FROM projed_core.document_versions
       WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
     OR EXISTS (SELECT 1 FROM projed_core.document_chunks
       WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
     OR EXISTS (SELECT 1 FROM projed_core.document_embeddings
       WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
     OR EXISTS (SELECT 1 FROM projed_core.rag_sync_jobs
       WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
     OR EXISTS (SELECT 1 FROM projed_core.external_rag_objects
       WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN
    RAISE EXCEPTION 'workspace delete retained document, indexing, or provider rows';
  END IF;
END $$;

ROLLBACK;
