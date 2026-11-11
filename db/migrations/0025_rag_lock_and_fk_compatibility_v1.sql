-- A worker first passes the existing document SELECT policy. This exact-row
-- lock policy lets it protect that row while it claims a job; the false check
-- never authorizes a document UPDATE.
CREATE POLICY document_rag_worker_lock_v1
  ON projed_core.documents
  FOR UPDATE TO projed_runtime_disposable
  USING (
    id::text = current_setting('projed.rag_document_id', true)
    AND rag_enabled
    AND projed_core.actor_context_valid_v1()
  )
  WITH CHECK (false);

-- Referencing-key maintenance is performed by nested FK action triggers. Skip
-- the update guard only for the exact owner-owned cascade shapes below; all
-- application-issued updates still execute the original guard.
DROP TRIGGER rag_sync_job_update_guard_v1 ON projed_core.rag_sync_jobs;
CREATE TRIGGER rag_sync_job_update_guard_v1
  BEFORE UPDATE ON projed_core.rag_sync_jobs
  FOR EACH ROW
  WHEN (
    NOT (
      current_user = 'projed_owner_disposable'
      -- WHEN runs before this trigger function; a nested FK caller is depth >= 1.
      AND pg_catalog.pg_trigger_depth() > 0
      AND (
        (
          NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          AND (pg_catalog.to_jsonb(NEW) - 'tenant_id') = (pg_catalog.to_jsonb(OLD) - 'tenant_id')
        )
        OR (
          OLD.document_version_id IS NOT NULL
          AND NEW.document_version_id IS NULL
          AND (pg_catalog.to_jsonb(NEW) - 'document_version_id')
              = (pg_catalog.to_jsonb(OLD) - 'document_version_id')
        )
      )
    )
  )
  EXECUTE FUNCTION projed_core.rag_sync_job_update_guard_v1();
