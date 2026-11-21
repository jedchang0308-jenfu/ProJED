-- Retain historical LLM access evidence without granting other members access
-- to an actor's prompts, metadata, or retrieved-chunk references.
CREATE TABLE projed_core.llm_access_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  actor_id uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NULL,
  prompt_hash text NULL,
  retrieved_chunk_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX llm_access_logs_tenant_actor_time_idx
  ON projed_core.llm_access_logs(tenant_id, actor_id, created_at DESC, id);
CREATE INDEX llm_access_logs_project_idx
  ON projed_core.llm_access_logs(tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX llm_access_logs_actor_idx
  ON projed_core.llm_access_logs(actor_id) WHERE actor_id IS NOT NULL;

ALTER TABLE projed_core.llm_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.llm_access_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY llm_access_log_actor_read_v1 ON projed_core.llm_access_logs
  FOR SELECT TO projed_runtime_disposable USING (
    actor_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_workspace')
  );
CREATE POLICY llm_access_log_actor_insert_v1 ON projed_core.llm_access_logs
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_workspace')
  );
CREATE POLICY snapshot_importer_v1 ON projed_core.llm_access_logs
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);

REVOKE ALL ON projed_core.llm_access_logs FROM PUBLIC;
GRANT SELECT ON projed_core.llm_access_logs TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, actor_id, provider, model, prompt_hash,
  retrieved_chunk_ids, response_metadata
) ON projed_core.llm_access_logs TO projed_runtime_disposable;
GRANT SELECT, INSERT ON projed_core.llm_access_logs TO projed_importer_disposable;
