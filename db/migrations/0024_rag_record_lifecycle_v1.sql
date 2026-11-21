-- Keep source-mirror writes limited to eligible knowledge records. Worker jobs
-- and vectors below may index any current document already readable by its actor.
ALTER TABLE projed_core.knowledge_records
  DROP CONSTRAINT knowledge_records_rag_enabled_check;
ALTER TABLE projed_core.knowledge_records
  ADD CONSTRAINT knowledge_records_rag_lifecycle_v1 CHECK (
    NOT rag_enabled OR (
      status = 'published' AND visibility <> 'private'
    )
  );

ALTER TABLE projed_core.rag_sync_jobs
  ADD COLUMN document_version_id uuid NULL,
  ADD COLUMN content_hash text NULL,
  ADD COLUMN lease_token text NULL CHECK (lease_token IS NULL OR lease_token ~ '^[a-f0-9]{64}$'),
  ADD COLUMN lease_expires_at timestamptz NULL,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  DROP CONSTRAINT rag_sync_jobs_status_check,
  ADD CONSTRAINT rag_sync_jobs_status_v2_check
    CHECK (status IN ('pending', 'running', 'synced', 'failed', 'deleted', 'superseded')),
  ADD CONSTRAINT rag_sync_jobs_lease_pair_v1
    CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  ADD CONSTRAINT rag_sync_jobs_content_hash_v1
    CHECK (content_hash IS NULL OR (content_hash <> '' AND length(content_hash) <= 512)),
  ADD CONSTRAINT rag_sync_jobs_version_requires_document_v1
    CHECK (document_version_id IS NULL OR source_document_id IS NOT NULL),
  ADD CONSTRAINT rag_sync_jobs_document_version_v1
    FOREIGN KEY (tenant_id, source_document_id, document_version_id)
    REFERENCES projed_core.document_versions(tenant_id, document_id, id)
    ON UPDATE CASCADE ON DELETE SET NULL (document_version_id);

CREATE INDEX rag_sync_jobs_claim_v1
  ON projed_core.rag_sync_jobs(tenant_id, status, lease_expires_at, created_at, id)
  WHERE status IN ('pending', 'running', 'failed');
CREATE INDEX rag_sync_jobs_version_v1
  ON projed_core.rag_sync_jobs(tenant_id, source_document_id, document_version_id)
  WHERE document_version_id IS NOT NULL;

CREATE FUNCTION projed_core.rag_record_write_scope_v1(
  target_record_id uuid,
  target_tenant_id uuid,
  target_project_id uuid,
  target_visibility text,
  target_created_by uuid,
  target_recorded_by uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN current_setting('projed.rag_record_id', true)
        ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      AND current_setting('projed.rag_record_id', true) = target_record_id::text
    THEN projed_core.actor_can_write_record_v1(
      target_tenant_id, target_project_id, target_visibility, target_created_by, target_recorded_by
    )
    ELSE false
  END
$$;

CREATE FUNCTION projed_core.rag_embedding_worker_row_scope_v1(
  target_tenant_id uuid,
  target_chunk_id uuid,
  target_provider text,
  target_model text,
  target_dimensions integer
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN current_setting('projed.rag_document_id', true)
        ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      AND current_setting('projed.rag_job_id', true)
        ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      AND current_setting('projed.rag_job_claim', true) ~ '^[a-f0-9]{64}$'
      AND target_provider = 'google'
      AND target_model = 'gemini-embedding-001'
      AND target_dimensions = 3072
    THEN EXISTS (
      SELECT 1
        FROM projed_core.document_chunks chunk
        JOIN projed_core.documents document
          ON document.id = chunk.document_id AND document.tenant_id = chunk.tenant_id
        JOIN projed_core.document_versions version
          ON version.id = chunk.document_version_id
         AND version.tenant_id = chunk.tenant_id
         AND version.document_id = chunk.document_id
        JOIN projed_core.rag_sync_jobs job
          ON job.tenant_id = chunk.tenant_id
         AND job.source_document_id = chunk.document_id
         AND job.document_version_id = version.id
       WHERE chunk.id = target_chunk_id
         AND chunk.tenant_id = target_tenant_id
         AND chunk.document_version_id IS NOT NULL
         AND document.id::text = current_setting('projed.rag_document_id', true)
         AND document.rag_enabled
         AND document.content_hash IS NOT NULL
         AND version.content_hash = document.content_hash
         AND version.id = (
           SELECT latest.id
             FROM projed_core.document_versions latest
            WHERE latest.tenant_id = document.tenant_id
              AND latest.document_id = document.id
            ORDER BY latest.version DESC
            LIMIT 1
         )
         AND job.id::text = current_setting('projed.rag_job_id', true)
         AND job.content_hash = document.content_hash
         AND job.provider = 'google'
         AND job.target_store_id IS NULL
         AND job.status = 'running'
         AND job.lease_token = current_setting('projed.rag_job_claim', true)
         AND job.lease_expires_at > statement_timestamp()
    )
    ELSE false
  END
$$;

CREATE FUNCTION projed_core.rag_embedding_worker_scope_v1(
  target_tenant_id uuid,
  target_chunk_id uuid,
  target_provider text,
  target_model text,
  target_dimensions integer,
  target_content_hash text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT target_content_hash IS NOT NULL
    AND projed_core.rag_embedding_worker_row_scope_v1(
      target_tenant_id, target_chunk_id, target_provider, target_model, target_dimensions
    )
    AND EXISTS (
      SELECT 1
        FROM projed_core.document_chunks chunk
        JOIN projed_core.rag_sync_jobs job
          ON job.tenant_id = chunk.tenant_id
         AND job.source_document_id = chunk.document_id
         AND job.document_version_id = chunk.document_version_id
       WHERE chunk.id = target_chunk_id
         AND chunk.tenant_id = target_tenant_id
         AND job.id::text = current_setting('projed.rag_job_id', true)
         AND job.content_hash = target_content_hash
    )
$$;

CREATE FUNCTION projed_core.rag_sync_job_update_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  vectors_exist boolean;
  vectors_complete boolean;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.target_store_id IS DISTINCT FROM OLD.target_store_id
     OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'RAG job provenance is immutable' USING ERRCODE = '42501';
  END IF;

  IF (OLD.document_version_id IS NOT NULL
        AND NEW.document_version_id IS DISTINCT FROM OLD.document_version_id)
     OR (OLD.content_hash IS NOT NULL AND NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'RAG job version and hash are immutable once bound' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'superseded' THEN
    IF OLD.status NOT IN ('pending', 'running')
       OR NEW.document_version_id IS DISTINCT FROM OLD.document_version_id
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
       OR NEW.error IS DISTINCT FROM OLD.error
       OR NEW.last_synced_at IS DISTINCT FROM OLD.last_synced_at
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only pending or running RAG jobs can be superseded' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'running' THEN
    IF current_setting('projed.rag_job_id', true)
          !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
       OR NEW.id::text IS DISTINCT FROM current_setting('projed.rag_job_id', true)
       OR current_setting('projed.rag_document_id', true)
          !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
       OR NEW.source_document_id::text IS DISTINCT FROM current_setting('projed.rag_document_id', true)
       OR current_setting('projed.rag_job_claim', true) !~ '^[a-f0-9]{64}$'
       OR NEW.lease_token IS DISTINCT FROM current_setting('projed.rag_job_claim', true)
       OR NEW.lease_expires_at IS NULL
       OR NEW.lease_expires_at <= clock_timestamp()
       OR NEW.document_version_id IS NULL OR NEW.content_hash IS NULL OR NEW.content_hash = '' THEN
      RAISE EXCEPTION 'RAG worker lease scope is invalid' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM projed_core.documents document
        JOIN projed_core.document_versions version
          ON version.id = NEW.document_version_id
         AND version.tenant_id = NEW.tenant_id
         AND version.document_id = NEW.source_document_id
       WHERE document.id = NEW.source_document_id
         AND document.tenant_id = NEW.tenant_id
         AND document.rag_enabled
         AND document.content_hash = NEW.content_hash
         AND version.content_hash = NEW.content_hash
         AND version.id = (
           SELECT latest.id
             FROM projed_core.document_versions latest
            WHERE latest.tenant_id = NEW.tenant_id
              AND latest.document_id = NEW.source_document_id
            ORDER BY latest.version DESC
            LIMIT 1
         )
    ) THEN
      RAISE EXCEPTION 'RAG job must bind the current readable document version' USING ERRCODE = '42501';
    END IF;
    IF OLD.status NOT IN ('pending', 'failed', 'running', 'synced') THEN
      RAISE EXCEPTION 'RAG job cannot enter running from its current state' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'running' THEN
      IF OLD.lease_expires_at > clock_timestamp() THEN
        IF OLD.lease_token IS DISTINCT FROM current_setting('projed.rag_job_claim', true)
           OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count THEN
          RAISE EXCEPTION 'Active RAG lease cannot be replaced' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.attempt_count <> OLD.attempt_count + 1
         OR NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token THEN
        RAISE EXCEPTION 'Expired RAG lease claim must advance attempt count' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.attempt_count <> OLD.attempt_count + 1 THEN
      RAISE EXCEPTION 'New RAG lease claim must advance attempt count' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'synced' THEN
      SELECT EXISTS (
        SELECT 1
          FROM projed_core.document_chunks chunk
         WHERE chunk.tenant_id = NEW.tenant_id
           AND chunk.document_id = NEW.source_document_id
           AND chunk.document_version_id = NEW.document_version_id
      ) INTO vectors_exist;
      IF NOT vectors_exist THEN
        RAISE EXCEPTION 'Synced RAG repair requires current version chunks' USING ERRCODE = '42501';
      END IF;
      SELECT EXISTS (
        SELECT 1
          FROM projed_core.document_chunks chunk
         WHERE chunk.tenant_id = NEW.tenant_id
           AND chunk.document_id = NEW.source_document_id
           AND chunk.document_version_id = NEW.document_version_id
      )
        AND NOT EXISTS (
          SELECT 1
            FROM projed_core.document_chunks chunk
           WHERE chunk.tenant_id = NEW.tenant_id
             AND chunk.document_id = NEW.source_document_id
             AND chunk.document_version_id = NEW.document_version_id
             AND NOT EXISTS (
               SELECT 1
                 FROM projed_core.document_embeddings embedding
                WHERE embedding.tenant_id = chunk.tenant_id
                  AND embedding.chunk_id = chunk.id
                  AND embedding.provider = 'google'
                  AND embedding.model = 'gemini-embedding-001'
                  AND embedding.dimensions = 3072
                  AND embedding.content_hash = NEW.content_hash
             )
        )
        INTO vectors_complete;
      IF vectors_complete THEN
        RAISE EXCEPTION 'Complete synced RAG jobs cannot be reopened' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'Non-running RAG jobs cannot retain a lease' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'running' THEN
    IF OLD.status <> 'running'
       OR NEW.status NOT IN ('pending', 'synced', 'failed')
       OR OLD.lease_token IS NULL OR OLD.lease_expires_at IS NULL
       OR OLD.lease_expires_at <= clock_timestamp()
       OR OLD.lease_token IS DISTINCT FROM current_setting('projed.rag_job_claim', true) THEN
      RAISE EXCEPTION 'RAG job completion requires the active worker claim' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'pending' THEN
      SELECT EXISTS (
        SELECT 1
          FROM projed_core.document_chunks chunk
         WHERE chunk.tenant_id = NEW.tenant_id
           AND chunk.document_id = NEW.source_document_id
           AND chunk.document_version_id = NEW.document_version_id
      )
        AND EXISTS (
          SELECT 1
            FROM projed_core.document_chunks chunk
           WHERE chunk.tenant_id = NEW.tenant_id
             AND chunk.document_id = NEW.source_document_id
             AND chunk.document_version_id = NEW.document_version_id
             AND EXISTS (
               SELECT 1
                 FROM projed_core.document_embeddings embedding
                WHERE embedding.tenant_id = chunk.tenant_id
                  AND embedding.chunk_id = chunk.id
                  AND embedding.provider = 'google'
                  AND embedding.model = 'gemini-embedding-001'
                  AND embedding.dimensions = 3072
                  AND embedding.content_hash = NEW.content_hash
             )
        )
        AND EXISTS (
          SELECT 1
            FROM projed_core.document_chunks chunk
           WHERE chunk.tenant_id = NEW.tenant_id
             AND chunk.document_id = NEW.source_document_id
             AND chunk.document_version_id = NEW.document_version_id
             AND NOT EXISTS (
               SELECT 1
                 FROM projed_core.document_embeddings embedding
                WHERE embedding.tenant_id = chunk.tenant_id
                  AND embedding.chunk_id = chunk.id
                  AND embedding.provider = 'google'
                  AND embedding.model = 'gemini-embedding-001'
                  AND embedding.dimensions = 3072
                  AND embedding.content_hash = NEW.content_hash
             )
        )
        INTO vectors_exist;
      IF NOT vectors_exist OR NEW.attempt_count <> 0 THEN
        RAISE EXCEPTION 'RAG job can return to pending only after partial vector progress' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.status = 'failed' THEN
      IF NEW.attempt_count = 0 AND OLD.attempt_count <> 0 THEN
        SELECT EXISTS (
          SELECT 1
            FROM projed_core.document_chunks chunk
            JOIN projed_core.document_embeddings embedding
              ON embedding.tenant_id = chunk.tenant_id
             AND embedding.chunk_id = chunk.id
           WHERE chunk.tenant_id = NEW.tenant_id
             AND chunk.document_id = NEW.source_document_id
             AND chunk.document_version_id = NEW.document_version_id
             AND embedding.provider = 'google'
             AND embedding.model = 'gemini-embedding-001'
             AND embedding.dimensions = 3072
             AND embedding.content_hash = NEW.content_hash
        )
          AND EXISTS (
            SELECT 1
              FROM projed_core.document_chunks chunk
             WHERE chunk.tenant_id = NEW.tenant_id
               AND chunk.document_id = NEW.source_document_id
               AND chunk.document_version_id = NEW.document_version_id
               AND NOT EXISTS (
                 SELECT 1
                   FROM projed_core.document_embeddings embedding
                  WHERE embedding.tenant_id = chunk.tenant_id
                    AND embedding.chunk_id = chunk.id
                    AND embedding.provider = 'google'
                    AND embedding.model = 'gemini-embedding-001'
                    AND embedding.dimensions = 3072
                    AND embedding.content_hash = NEW.content_hash
               )
          )
          INTO vectors_exist;
        IF NOT vectors_exist THEN
          RAISE EXCEPTION 'Failed RAG jobs can reset attempts only after partial vector progress' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.attempt_count IS DISTINCT FROM OLD.attempt_count THEN
        RAISE EXCEPTION 'RAG failure cannot change attempt count without partial vector progress' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.status = 'synced' THEN
      SELECT EXISTS (
        SELECT 1
          FROM projed_core.document_chunks chunk
         WHERE chunk.tenant_id = NEW.tenant_id
           AND chunk.document_id = NEW.source_document_id
           AND chunk.document_version_id = NEW.document_version_id
      )
        AND NOT EXISTS (
          SELECT 1
            FROM projed_core.document_chunks chunk
           WHERE chunk.tenant_id = NEW.tenant_id
             AND chunk.document_id = NEW.source_document_id
             AND chunk.document_version_id = NEW.document_version_id
             AND NOT EXISTS (
               SELECT 1
                 FROM projed_core.document_embeddings embedding
                WHERE embedding.tenant_id = chunk.tenant_id
                  AND embedding.chunk_id = chunk.id
                  AND embedding.provider = 'google'
                  AND embedding.model = 'gemini-embedding-001'
                  AND embedding.dimensions = 3072
                  AND embedding.content_hash = NEW.content_hash
             )
        )
        INTO vectors_complete;
      IF NOT vectors_complete THEN
        RAISE EXCEPTION 'RAG job cannot be synced without a complete current vector set' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF NEW.status = OLD.status AND NEW.status <> 'running' THEN
    RAISE EXCEPTION 'Non-running RAG jobs are immutable outside supersede' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION projed_core.rag_record_write_scope_v1(uuid, uuid, uuid, text, uuid, uuid),
  projed_core.rag_embedding_worker_row_scope_v1(uuid, uuid, text, text, integer),
  projed_core.rag_embedding_worker_scope_v1(uuid, uuid, text, text, integer, text),
  projed_core.rag_sync_job_update_guard_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.rag_record_write_scope_v1(uuid, uuid, uuid, text, uuid, uuid),
  projed_core.rag_embedding_worker_row_scope_v1(uuid, uuid, text, text, integer),
  projed_core.rag_embedding_worker_scope_v1(uuid, uuid, text, text, integer, text)
  TO projed_runtime_disposable;

CREATE POLICY knowledge_record_rag_write_scope_select_v1
  ON projed_core.knowledge_records
  FOR SELECT TO projed_runtime_disposable
  USING (projed_core.rag_record_write_scope_v1(
    id, tenant_id, project_id, visibility, created_by, recorded_by
  ));

-- Existing document_read_v1 remains the ordinary read authority. This extra
-- scope only lets an authorized record writer repair its own draft/private/
-- disabled mirror while projed.rag_record_id is set by the server.
CREATE POLICY document_rag_record_scope_select_v1
  ON projed_core.documents
  FOR SELECT TO projed_runtime_disposable
  USING (
    source_table = 'knowledge_records' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM projed_core.knowledge_records record
       WHERE record.id = documents.source_id
         AND record.tenant_id = documents.tenant_id
         AND record.project_id = documents.project_id
         AND projed_core.rag_record_write_scope_v1(
           record.id, record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by
         )
    )
  );

CREATE POLICY document_rag_record_insert_v1
  ON projed_core.documents
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    source_table = 'knowledge_records' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM projed_core.knowledge_records record
       WHERE record.id = documents.source_id
         AND record.tenant_id = documents.tenant_id
         AND record.project_id = documents.project_id
          AND documents.source_type = CASE record.record_type
            WHEN 'meeting' THEN 'meeting_note'
            WHEN 'work_log' THEN 'work_log'
            ELSE ''
          END
         AND projed_core.rag_record_write_scope_v1(
           record.id, record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by
         )
          AND (
            NOT documents.rag_enabled
            OR (
              record.status = 'published'
              AND record.visibility <> 'private'
              AND documents.visibility = record.visibility
            )
          )
    )
  );

CREATE POLICY document_rag_record_update_v1
  ON projed_core.documents
  FOR UPDATE TO projed_runtime_disposable
  USING (
    source_table = 'knowledge_records' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM projed_core.knowledge_records record
       WHERE record.id = documents.source_id
         AND record.tenant_id = documents.tenant_id
         AND record.project_id = documents.project_id
         AND projed_core.rag_record_write_scope_v1(
           record.id, record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by
         )
    )
  )
  WITH CHECK (
    source_table = 'knowledge_records' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM projed_core.knowledge_records record
       WHERE record.id = documents.source_id
         AND record.tenant_id = documents.tenant_id
         AND record.project_id = documents.project_id
          AND documents.source_type = CASE record.record_type
            WHEN 'meeting' THEN 'meeting_note'
            WHEN 'work_log' THEN 'work_log'
            ELSE ''
          END
         AND projed_core.rag_record_write_scope_v1(
           record.id, record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by
         )
          AND (
            NOT documents.rag_enabled
            OR (
              record.status = 'published'
              AND record.visibility <> 'private'
              AND documents.visibility = record.visibility
            )
          )
    )
  );

CREATE POLICY document_version_rag_append_v1
  ON projed_core.document_versions
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM projed_core.documents document
        JOIN projed_core.knowledge_records record
          ON record.id = document.source_id
         AND record.tenant_id = document.tenant_id
         AND record.project_id = document.project_id
       WHERE document.id = document_versions.document_id
         AND document.tenant_id = document_versions.tenant_id
         AND document.source_table = 'knowledge_records'
         AND document.source_id::text = current_setting('projed.rag_record_id', true)
         AND document.rag_enabled
         AND document.content_hash = document_versions.content_hash
         AND record.status = 'published'
         AND record.visibility <> 'private'
         AND record.rag_enabled
         AND record.source_document_id = document.id
         AND projed_core.rag_record_write_scope_v1(
           record.id, record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by
         )
    )
  );

CREATE POLICY document_chunk_rag_insert_v1
  ON projed_core.document_chunks
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    document_version_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM projed_core.documents document
        JOIN projed_core.knowledge_records record
          ON record.id = document.source_id
         AND record.tenant_id = document.tenant_id
         AND record.project_id = document.project_id
        JOIN projed_core.document_versions version
          ON version.id = document_chunks.document_version_id
         AND version.tenant_id = document_chunks.tenant_id
         AND version.document_id = document_chunks.document_id
       WHERE document.id = document_chunks.document_id
         AND document.tenant_id = document_chunks.tenant_id
         AND document.source_table = 'knowledge_records'
         AND document.source_id::text = current_setting('projed.rag_record_id', true)
         AND document.rag_enabled
         AND document.content_hash = version.content_hash
         AND version.id = (
           SELECT latest.id
             FROM projed_core.document_versions latest
            WHERE latest.tenant_id = document.tenant_id
              AND latest.document_id = document.id
            ORDER BY latest.version DESC
            LIMIT 1
         )
         AND record.status = 'published'
         AND record.visibility <> 'private'
         AND record.rag_enabled
         AND record.source_document_id = document.id
         AND projed_core.rag_record_write_scope_v1(
           record.id, record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by
         )
    )
  );

CREATE POLICY document_chunk_rag_delete_v1
  ON projed_core.document_chunks
  FOR DELETE TO projed_runtime_disposable
  USING (
    EXISTS (
      SELECT 1 FROM projed_core.documents document
       WHERE document.id = document_chunks.document_id
         AND document.tenant_id = document_chunks.tenant_id
         AND document.source_table = 'knowledge_records'
         AND document.source_id::text = current_setting('projed.rag_record_id', true)
         AND EXISTS (
           SELECT 1 FROM projed_core.knowledge_records record
            WHERE record.id = document.source_id
              AND record.tenant_id = document.tenant_id
              AND record.project_id = document.project_id
              AND projed_core.rag_record_write_scope_v1(
                record.id, record.tenant_id, record.project_id,
                record.visibility, record.created_by, record.recorded_by
              )
         )
    )
  );

CREATE POLICY document_embedding_worker_insert_v1
  ON projed_core.document_embeddings
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (projed_core.rag_embedding_worker_scope_v1(
    tenant_id, chunk_id, provider, model, dimensions, content_hash
  ));
CREATE POLICY document_embedding_worker_update_v1
  ON projed_core.document_embeddings
  FOR UPDATE TO projed_runtime_disposable
  USING (projed_core.rag_embedding_worker_row_scope_v1(
    tenant_id, chunk_id, provider, model, dimensions
  ))
  WITH CHECK (projed_core.rag_embedding_worker_scope_v1(
    tenant_id, chunk_id, provider, model, dimensions, content_hash
  ));

CREATE POLICY rag_sync_job_read_document_v1
  ON projed_core.rag_sync_jobs
  FOR SELECT TO projed_runtime_disposable
  USING (
    source_document_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM projed_core.documents document
       WHERE document.id = rag_sync_jobs.source_document_id
         AND document.tenant_id = rag_sync_jobs.tenant_id
    )
  );

CREATE POLICY rag_sync_job_insert_v1
  ON projed_core.rag_sync_jobs
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    current_setting('projed.rag_job_id', true)
      ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND current_setting('projed.rag_document_id', true)
      ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND id::text = current_setting('projed.rag_job_id', true)
    AND source_document_id::text = current_setting('projed.rag_document_id', true)
    AND provider = 'google' AND target_store_id IS NULL
    AND status = 'pending' AND document_version_id IS NOT NULL AND content_hash IS NOT NULL
    AND lease_token IS NULL AND lease_expires_at IS NULL
    AND attempt_count = 0 AND last_synced_at IS NULL AND error IS NULL
    AND EXISTS (
      SELECT 1
        FROM projed_core.documents document
        JOIN projed_core.document_versions version
          ON version.id = rag_sync_jobs.document_version_id
         AND version.tenant_id = rag_sync_jobs.tenant_id
         AND version.document_id = rag_sync_jobs.source_document_id
       WHERE document.id = rag_sync_jobs.source_document_id
         AND document.tenant_id = rag_sync_jobs.tenant_id
         AND document.rag_enabled
         AND document.content_hash = rag_sync_jobs.content_hash
         AND version.content_hash = rag_sync_jobs.content_hash
          AND version.id = (
            SELECT latest.id
              FROM projed_core.document_versions latest
             WHERE latest.tenant_id = document.tenant_id
               AND latest.document_id = document.id
             ORDER BY latest.version DESC
             LIMIT 1
          )
          AND EXISTS (
            SELECT 1 FROM projed_core.document_chunks chunk
             WHERE chunk.tenant_id = document.tenant_id
               AND chunk.document_id = document.id
               AND chunk.document_version_id = version.id
          )
    )
    AND (
      (
        current_setting('projed.rag_job_claim', true) ~ '^[a-f0-9]{64}$'
        AND metadata = '{}'::jsonb
      )
      OR EXISTS (
        SELECT 1
          FROM projed_core.documents document
          JOIN projed_core.knowledge_records record
            ON record.id = document.source_id
           AND record.tenant_id = document.tenant_id
           AND record.project_id = document.project_id
         WHERE document.id = rag_sync_jobs.source_document_id
           AND document.tenant_id = rag_sync_jobs.tenant_id
           AND document.source_table = 'knowledge_records'
           AND document.source_type = CASE record.record_type
             WHEN 'meeting' THEN 'meeting_note'
             WHEN 'work_log' THEN 'work_log'
             ELSE ''
           END
           AND document.source_id::text = current_setting('projed.rag_record_id', true)
           AND document.visibility = record.visibility
           AND document.rag_enabled
           AND record.status = 'published'
           AND record.visibility <> 'private'
           AND record.rag_enabled
           AND record.source_document_id = document.id
           AND projed_core.rag_record_write_scope_v1(
             record.id, record.tenant_id, record.project_id,
             record.visibility, record.created_by, record.recorded_by
           )
      )
    )
  );

CREATE POLICY rag_sync_job_update_v1
  ON projed_core.rag_sync_jobs
  FOR UPDATE TO projed_runtime_disposable
  USING (
    provider = 'google' AND target_store_id IS NULL
    AND source_document_id IS NOT NULL
    AND (
      (
        current_setting('projed.rag_job_id', true)
          ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        AND current_setting('projed.rag_document_id', true)
          ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        AND id::text = current_setting('projed.rag_job_id', true)
        AND source_document_id::text = current_setting('projed.rag_document_id', true)
        AND EXISTS (
          SELECT 1 FROM projed_core.documents document
           WHERE document.id = rag_sync_jobs.source_document_id
             AND document.tenant_id = rag_sync_jobs.tenant_id
        )
      )
      OR EXISTS (
        SELECT 1
          FROM projed_core.documents document
          JOIN projed_core.knowledge_records record
            ON record.id = document.source_id
           AND record.tenant_id = document.tenant_id
           AND record.project_id = document.project_id
         WHERE document.id = rag_sync_jobs.source_document_id
           AND document.tenant_id = rag_sync_jobs.tenant_id
           AND document.source_table = 'knowledge_records'
           AND document.source_id::text = current_setting('projed.rag_record_id', true)
           AND projed_core.rag_record_write_scope_v1(
             record.id, record.tenant_id, record.project_id,
             record.visibility, record.created_by, record.recorded_by
           )
      )
    )
  )
  WITH CHECK (
    provider = 'google' AND target_store_id IS NULL
    AND source_document_id IS NOT NULL
    AND (
      (
        status = 'superseded'
        AND EXISTS (
          SELECT 1
            FROM projed_core.documents document
            JOIN projed_core.knowledge_records record
              ON record.id = document.source_id
             AND record.tenant_id = document.tenant_id
             AND record.project_id = document.project_id
           WHERE document.id = rag_sync_jobs.source_document_id
             AND document.tenant_id = rag_sync_jobs.tenant_id
             AND document.source_table = 'knowledge_records'
              AND document.source_id::text = current_setting('projed.rag_record_id', true)
             AND projed_core.rag_record_write_scope_v1(
               record.id, record.tenant_id, record.project_id,
               record.visibility, record.created_by, record.recorded_by
             )
        )
      )
      OR (
        status <> 'superseded'
        AND
        current_setting('projed.rag_job_id', true)
          ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        AND current_setting('projed.rag_document_id', true)
          ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        AND id::text = current_setting('projed.rag_job_id', true)
        AND source_document_id::text = current_setting('projed.rag_document_id', true)
        AND EXISTS (
          SELECT 1 FROM projed_core.documents document
           WHERE document.id = rag_sync_jobs.source_document_id
             AND document.tenant_id = rag_sync_jobs.tenant_id
        )
      )
    )
  );

CREATE TRIGGER rag_sync_job_update_guard_v1
  BEFORE UPDATE ON projed_core.rag_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION projed_core.rag_sync_job_update_guard_v1();

-- Project-read actors can audit their own project-scoped LLM/RAG calls without
-- receiving workspace-wide audit access.
CREATE POLICY llm_access_log_project_actor_read_v1
  ON projed_core.llm_access_logs
  FOR SELECT TO projed_runtime_disposable
  USING (
    actor_id = projed_core.current_actor_user_id_v1()
    AND project_id IS NOT NULL
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  );
CREATE POLICY llm_access_log_project_actor_insert_v1
  ON projed_core.llm_access_logs
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND project_id IS NOT NULL
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  );

REVOKE ALL ON projed_core.rag_sync_jobs FROM projed_runtime_disposable;
GRANT SELECT ON projed_core.rag_sync_jobs TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, provider, target_store_id, source_document_id,
  document_version_id, content_hash, status, metadata
) ON projed_core.rag_sync_jobs TO projed_runtime_disposable;
GRANT UPDATE (
  status, document_version_id, content_hash, lease_token, lease_expires_at,
  attempt_count, error, last_synced_at, updated_at, metadata
) ON projed_core.rag_sync_jobs TO projed_runtime_disposable;

REVOKE INSERT, UPDATE, DELETE ON projed_core.documents,
  projed_core.document_versions, projed_core.document_chunks,
  projed_core.document_embeddings, projed_core.external_rag_objects
  FROM projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, source_type, source_table, source_id, title,
  content_hash, visibility, rag_enabled, metadata, created_by, updated_by
) ON projed_core.documents TO projed_runtime_disposable;
GRANT UPDATE (title, content_hash, visibility, rag_enabled, metadata, updated_by, updated_at)
  ON projed_core.documents TO projed_runtime_disposable;
GRANT INSERT (id, tenant_id, document_id, version, content, content_hash, metadata)
  ON projed_core.document_versions TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, document_id, document_version_id, chunk_index,
  content, token_count, metadata
) ON projed_core.document_chunks TO projed_runtime_disposable;
GRANT DELETE ON projed_core.document_chunks TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, chunk_id, provider, model, dimensions, embedding, content_hash
) ON projed_core.document_embeddings TO projed_runtime_disposable;
GRANT UPDATE (embedding, content_hash)
  ON projed_core.document_embeddings TO projed_runtime_disposable;
