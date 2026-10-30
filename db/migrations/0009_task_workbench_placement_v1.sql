ALTER TABLE projed_core.unplaced_tasks
  DROP CONSTRAINT unplaced_tasks_sort_order_check;
ALTER TABLE projed_core.unplaced_tasks
  ALTER COLUMN sort_order TYPE double precision USING sort_order::double precision;
ALTER TABLE projed_core.unplaced_tasks
  ADD CONSTRAINT unplaced_tasks_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 9007199254740991);

CREATE TABLE projed_core.task_workbench_placement_operations (
  owner_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  operation_id text NOT NULL CHECK (operation_id <> '' AND length(operation_id) <= 255),
  command jsonb NOT NULL CHECK (jsonb_typeof(command) = 'object'),
  result jsonb NULL CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, operation_id)
);

CREATE FUNCTION projed_core.task_placement_context_valid_v1(
  target_tenant_id uuid,
  target_project_id uuid,
  required_direction text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND required_direction IN ('to_board', 'to_unplaced')
    AND current_setting('projed.authorized_task_placement', true)
      = target_tenant_id::text || '/' || target_project_id::text || '/' || required_direction
$$;

ALTER TABLE projed_core.task_workbench_placement_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_workbench_placement_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY task_placement_operation_owner_read_v1
  ON projed_core.task_workbench_placement_operations
  FOR SELECT USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY task_placement_operation_owner_insert_v1
  ON projed_core.task_workbench_placement_operations
  FOR INSERT WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY task_placement_operation_owner_update_v1
  ON projed_core.task_workbench_placement_operations
  FOR UPDATE USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  ) WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

CREATE POLICY wbs_item_placement_insert_v1 ON projed_core.wbs_items
  FOR INSERT WITH CHECK (
    projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_board')
  );
CREATE POLICY wbs_item_placement_read_v1 ON projed_core.wbs_items
  FOR SELECT USING (
    projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_board')
    OR projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_unplaced')
  );
CREATE POLICY wbs_item_placement_delete_v1 ON projed_core.wbs_items
  FOR DELETE USING (
    projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_unplaced')
  );
CREATE POLICY wbs_dependency_placement_read_v1 ON projed_core.wbs_dependencies
  FOR SELECT USING (
    projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_unplaced')
  );
CREATE POLICY wbs_item_tag_placement_insert_v1 ON projed_core.wbs_item_tags
  FOR INSERT WITH CHECK (
    projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_board')
  );
CREATE POLICY activity_event_task_placement_insert_v1 ON projed_core.activity_events
  FOR INSERT WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND project_id IS NOT NULL
    AND (
      projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_board')
      OR projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_unplaced')
    )
  );
CREATE POLICY record_task_link_placement_read_v1 ON projed_core.record_task_links
  FOR SELECT USING (
    projed_core.task_placement_context_valid_v1(tenant_id, project_id, 'to_unplaced')
  );

REVOKE ALL ON FUNCTION projed_core.task_placement_context_valid_v1(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.task_placement_context_valid_v1(uuid, uuid, text)
  TO projed_runtime_disposable;
REVOKE ALL ON projed_core.task_workbench_placement_operations FROM PUBLIC;
GRANT SELECT, INSERT ON projed_core.task_workbench_placement_operations TO projed_runtime_disposable;
GRANT UPDATE (result, updated_at) ON projed_core.task_workbench_placement_operations
  TO projed_runtime_disposable;
GRANT INSERT (created_at, updated_at) ON projed_core.wbs_items TO projed_runtime_disposable;
