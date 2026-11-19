-- Creating a task may exhaust the integer gap between existing siblings.
-- Permit the trusted transaction's rank-only maintenance for create-only roles;
-- ordinary task moves/edits retain their separate capabilities.
CREATE FUNCTION projed_core.task_order_reindex_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
BEGIN
  IF current_user = 'projed_runtime_disposable'
    AND nullif(current_setting('projed.task_order_reindex', true), '') IS NOT NULL THEN
    IF current_setting('projed.task_order_reindex', true)
         IS DISTINCT FROM OLD.tenant_id::text || '/' || OLD.project_id::text
      OR NOT projed_core.actor_has_board_capability_v1(OLD.tenant_id, OLD.project_id, 'create_task')
      OR OLD.archived
      OR (to_jsonb(NEW) - 'sort_order' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'sort_order' - 'updated_at')
    THEN RAISE EXCEPTION 'TASK_ORDER_REINDEX_INVALID' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER task_order_reindex_guard_v1
  BEFORE UPDATE ON projed_core.wbs_items
  FOR EACH ROW EXECUTE FUNCTION projed_core.task_order_reindex_guard_v1();

CREATE POLICY wbs_item_create_reindex_v1 ON projed_core.wbs_items
  FOR UPDATE TO projed_runtime_disposable
  USING (
    current_setting('projed.task_order_reindex', true) = tenant_id::text || '/' || project_id::text
    AND NOT archived
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_task')
  )
  WITH CHECK (
    current_setting('projed.task_order_reindex', true) = tenant_id::text || '/' || project_id::text
    AND NOT archived
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_task')
  );

REVOKE ALL ON FUNCTION projed_core.task_order_reindex_guard_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.task_order_reindex_guard_v1() TO projed_runtime_disposable;
