CREATE TABLE projed_core.backup_import_executions (
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NULL CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, execution_id)
);

ALTER TABLE projed_core.backup_import_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.backup_import_executions FORCE ROW LEVEL SECURITY;

CREATE POLICY backup_import_execution_owner_v1 ON projed_core.backup_import_executions
  USING (
    actor_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  )
  WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

CREATE POLICY record_task_link_backup_guard_read_v1 ON projed_core.record_task_links
  FOR SELECT USING (
    current_setting('projed.authorized_backup_guard', true)
      = tenant_id::text || '/' || project_id::text
    AND
    projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'delete_task')
  );

CREATE POLICY task_tracking_reference_backup_guard_read_v1 ON projed_core.task_tracking_references
  FOR SELECT USING (
    current_setting('projed.authorized_backup_guard', true)
      = tenant_id::text || '/' || task_project_id::text
    AND
    projed_core.actor_has_board_capability_v1(tenant_id, task_project_id, 'delete_task')
  );

REVOKE ALL ON projed_core.backup_import_executions FROM PUBLIC;
GRANT SELECT, INSERT ON projed_core.backup_import_executions TO projed_runtime_disposable;
GRANT UPDATE (result, updated_at)
  ON projed_core.backup_import_executions TO projed_runtime_disposable;
