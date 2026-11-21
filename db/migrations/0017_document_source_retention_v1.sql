-- Preserve the existing document corpus and indexing state. Runtime read
-- policies follow the original record/private visibility, never just tenant ID.
CREATE TABLE projed_core.documents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  source_type text NOT NULL,
  source_table text NULL,
  source_id uuid NULL,
  title text NOT NULL,
  content_hash text NULL,
  visibility text NOT NULL CHECK (visibility IN ('tenant', 'project', 'private')),
  rag_enabled boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX documents_project_idx ON projed_core.documents(tenant_id, project_id);
CREATE INDEX documents_created_by_idx ON projed_core.documents(created_by);
CREATE INDEX documents_updated_by_idx ON projed_core.documents(updated_by);

CREATE TABLE projed_core.document_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version),
  UNIQUE (tenant_id, document_id, id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES projed_core.documents(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE projed_core.document_chunks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, document_version_id, chunk_index),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES projed_core.documents(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, document_id, document_version_id)
    REFERENCES projed_core.document_versions(tenant_id, document_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX document_chunks_version_idx ON projed_core.document_chunks(tenant_id, document_id, document_version_id);

-- pgvector stores float32 components. Native real[] retains those components
-- without installing an extension in the shared database. Model/dimension and
-- source hashes remain unchanged; this is not a replacement search index.
CREATE TABLE projed_core.document_embeddings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  embedding real[] NOT NULL CHECK (
    array_ndims(embedding) = 1 AND cardinality(embedding) = 3072
    AND array_position(embedding, NULL) IS NULL
    AND NOT (embedding && ARRAY['NaN'::real, 'Infinity'::real, '-Infinity'::real])
  ),
  content_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chunk_id, provider, model, dimensions),
  FOREIGN KEY (tenant_id, chunk_id) REFERENCES projed_core.document_chunks(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX document_embeddings_chunk_idx ON projed_core.document_embeddings(tenant_id, chunk_id);

CREATE TABLE projed_core.rag_sync_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  target_store_id text NULL,
  source_document_id uuid NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'synced', 'failed', 'deleted')),
  last_synced_at timestamptz NULL,
  error text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, source_document_id) REFERENCES projed_core.documents(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX rag_sync_jobs_document_idx ON projed_core.rag_sync_jobs(tenant_id, source_document_id);
CREATE TABLE projed_core.external_rag_objects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  document_id uuid NOT NULL,
  external_object_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_object_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES projed_core.documents(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX external_rag_objects_document_idx ON projed_core.external_rag_objects(tenant_id, document_id);

-- Match the source record lifecycle: deleting a mirror clears its reference,
-- preserving the record itself. Documents are imported before records.
ALTER TABLE projed_core.knowledge_records
  ADD CONSTRAINT knowledge_records_source_document_v1
  FOREIGN KEY (tenant_id, source_document_id) REFERENCES projed_core.documents(tenant_id, id)
    ON UPDATE CASCADE ON DELETE SET NULL (source_document_id);
CREATE INDEX knowledge_records_source_document_idx
  ON projed_core.knowledge_records(tenant_id, source_document_id) WHERE source_document_id IS NOT NULL;

ALTER TABLE projed_core.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.document_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.document_embeddings FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.rag_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.rag_sync_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.external_rag_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.external_rag_objects FORCE ROW LEVEL SECURITY;

CREATE POLICY document_read_v1 ON projed_core.documents
  FOR SELECT TO projed_runtime_disposable USING (
    projed_core.actor_context_valid_v1()
    AND CASE WHEN source_table = 'knowledge_records' THEN EXISTS (
      SELECT 1 FROM projed_core.knowledge_records record
       WHERE record.id = source_id AND record.tenant_id = documents.tenant_id
         AND record.project_id = documents.project_id
         AND record.status = 'published' AND record.rag_enabled
         AND record.source_document_id = documents.id
         -- A private mirror must never override the source record boundary.
         AND projed_core.actor_can_read_record_v1(record.tenant_id, record.project_id,
           record.visibility, record.created_by, record.recorded_by)
    ) ELSE CASE visibility
      WHEN 'private' THEN projed_core.current_actor_user_id_v1() IN (created_by, updated_by)
      WHEN 'project' THEN project_id IS NOT NULL AND
        projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
      WHEN 'tenant' THEN projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_workspace')
      ELSE false END
    END
  );
CREATE POLICY document_version_read_v1 ON projed_core.document_versions
  FOR SELECT TO projed_runtime_disposable USING (EXISTS (
    SELECT 1 FROM projed_core.documents document
     WHERE document.id = document_id AND document.tenant_id = document_versions.tenant_id
  ));
CREATE POLICY document_chunk_read_v1 ON projed_core.document_chunks
  FOR SELECT TO projed_runtime_disposable USING (EXISTS (
    SELECT 1 FROM projed_core.documents document
     WHERE document.id = document_id AND document.tenant_id = document_chunks.tenant_id
  ));
CREATE POLICY document_embedding_read_v1 ON projed_core.document_embeddings
  FOR SELECT TO projed_runtime_disposable USING (EXISTS (
    SELECT 1 FROM projed_core.document_chunks chunk
     WHERE chunk.id = chunk_id AND chunk.tenant_id = document_embeddings.tenant_id
  ));

CREATE POLICY snapshot_importer_v1 ON projed_core.documents
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.document_versions
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.document_chunks
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.document_embeddings
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.rag_sync_jobs
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);
CREATE POLICY snapshot_importer_v1 ON projed_core.external_rag_objects
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);

REVOKE ALL ON projed_core.documents, projed_core.document_versions,
  projed_core.document_chunks, projed_core.document_embeddings,
  projed_core.rag_sync_jobs, projed_core.external_rag_objects FROM PUBLIC;
GRANT SELECT ON projed_core.documents, projed_core.document_versions,
  projed_core.document_chunks, projed_core.document_embeddings TO projed_runtime_disposable;
GRANT SELECT, INSERT ON projed_core.documents, projed_core.document_versions,
  projed_core.document_chunks, projed_core.document_embeddings,
  projed_core.rag_sync_jobs, projed_core.external_rag_objects TO projed_importer_disposable;
