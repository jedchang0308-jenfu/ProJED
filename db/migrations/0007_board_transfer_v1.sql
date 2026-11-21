CREATE FUNCTION projed_core.board_transfer_source_context_valid_v1(
  source_tenant_id uuid,
  target_project_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND split_part(current_setting('projed.authorized_board_transfer', true), '/', 1) = source_tenant_id::text
    AND split_part(current_setting('projed.authorized_board_transfer', true), '/', 2) = target_project_id::text
    AND split_part(current_setting('projed.authorized_board_transfer', true), '/', 3) <> ''
$$;

CREATE FUNCTION projed_core.board_transfer_target_context_valid_v1(
  target_tenant_id uuid,
  target_project_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND split_part(current_setting('projed.authorized_board_transfer', true), '/', 2) = target_project_id::text
    AND split_part(current_setting('projed.authorized_board_transfer', true), '/', 3) = target_tenant_id::text
    AND split_part(current_setting('projed.authorized_board_transfer', true), '/', 1) <> ''
$$;

ALTER TABLE projed_core.actor_scope_access
  DROP CONSTRAINT actor_scope_access_tenant_id_project_id_fkey,
  ADD CONSTRAINT actor_scope_access_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.project_members
  DROP CONSTRAINT project_members_tenant_id_project_id_fkey,
  ADD CONSTRAINT project_members_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.board_role_permissions
  DROP CONSTRAINT board_role_permissions_tenant_id_project_id_fkey,
  ADD CONSTRAINT board_role_permissions_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.wbs_items
  DROP CONSTRAINT wbs_items_tenant_id_project_id_fkey,
  ADD CONSTRAINT wbs_items_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  DROP CONSTRAINT wbs_items_parent_same_project_v1,
  ADD CONSTRAINT wbs_items_parent_same_project_v2
    FOREIGN KEY (tenant_id, project_id, parent_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE SET NULL (parent_id);
ALTER TABLE projed_core.wbs_dependencies
  DROP CONSTRAINT wbs_dependencies_tenant_id_project_id_fkey,
  ADD CONSTRAINT wbs_dependencies_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  DROP CONSTRAINT wbs_dependencies_tenant_id_project_id_from_id_fkey,
  ADD CONSTRAINT wbs_dependencies_from_item_v2
    FOREIGN KEY (tenant_id, project_id, from_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  DROP CONSTRAINT wbs_dependencies_tenant_id_project_id_to_id_fkey,
  ADD CONSTRAINT wbs_dependencies_to_item_v2
    FOREIGN KEY (tenant_id, project_id, to_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.wbs_item_tags
  DROP CONSTRAINT wbs_item_tags_tenant_id_project_id_item_id_fkey,
  ADD CONSTRAINT wbs_item_tags_item_v2
    FOREIGN KEY (tenant_id, project_id, item_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.resource_revisions
  DROP CONSTRAINT resource_revisions_tenant_id_project_id_fkey,
  ADD CONSTRAINT resource_revisions_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.board_invites
  DROP CONSTRAINT board_invites_tenant_id_project_id_fkey,
  ADD CONSTRAINT board_invites_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.knowledge_records
  DROP CONSTRAINT knowledge_records_tenant_id_project_id_fkey,
  ADD CONSTRAINT knowledge_records_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.record_task_links
  DROP CONSTRAINT record_task_links_tenant_id_project_id_record_id_fkey,
  ADD CONSTRAINT record_task_links_record_v2
    FOREIGN KEY (tenant_id, project_id, record_id)
    REFERENCES projed_core.knowledge_records(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  DROP CONSTRAINT record_task_links_tenant_id_project_id_item_id_fkey,
  ADD CONSTRAINT record_task_links_item_v2
    FOREIGN KEY (tenant_id, project_id, item_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.activity_events
  DROP CONSTRAINT activity_events_tenant_id_project_id_fkey,
  ADD CONSTRAINT activity_events_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE projed_core.audit_logs
  DROP CONSTRAINT audit_logs_tenant_id_project_id_fkey,
  ADD CONSTRAINT audit_logs_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;

CREATE POLICY project_transfer_update_v1 ON projed_core.projects
  FOR UPDATE
  USING (projed_core.board_transfer_source_context_valid_v1(tenant_id, id))
  WITH CHECK (projed_core.board_transfer_target_context_valid_v1(tenant_id, id));
CREATE POLICY project_transfer_read_v1 ON projed_core.projects
  FOR SELECT USING (
    projed_core.board_transfer_source_context_valid_v1(tenant_id, id)
    OR projed_core.board_transfer_target_context_valid_v1(tenant_id, id)
  );
CREATE POLICY project_member_transfer_delete_v1 ON projed_core.project_members
  FOR DELETE USING (projed_core.board_transfer_source_context_valid_v1(tenant_id, project_id));
CREATE POLICY project_member_transfer_insert_v1 ON projed_core.project_members
  FOR INSERT WITH CHECK (projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id));
CREATE POLICY project_member_transfer_update_v1 ON projed_core.project_members
  FOR UPDATE USING (projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id))
  WITH CHECK (projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id));
CREATE POLICY actor_scope_transfer_delete_v1 ON projed_core.actor_scope_access
  FOR DELETE USING (
    project_id IS NOT NULL
    AND projed_core.board_transfer_source_context_valid_v1(tenant_id, project_id)
  );
CREATE POLICY actor_scope_transfer_insert_v1 ON projed_core.actor_scope_access
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND active
    AND projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  );
CREATE POLICY actor_scope_workspace_bootstrap_insert_v1 ON projed_core.actor_scope_access
  FOR INSERT WITH CHECK (
    project_id IS NULL AND active
    AND local_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.workspace_bootstrap_context_valid_v1(tenant_id)
  );
CREATE POLICY item_tag_transfer_delete_v1 ON projed_core.wbs_item_tags
  FOR DELETE USING (projed_core.board_transfer_source_context_valid_v1(tenant_id, project_id));
CREATE POLICY item_tag_transfer_insert_v1 ON projed_core.wbs_item_tags
  FOR INSERT WITH CHECK (projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id));
CREATE POLICY board_invite_transfer_update_v1 ON projed_core.board_invites
  FOR UPDATE USING (
    projed_core.board_transfer_source_context_valid_v1(tenant_id, project_id)
    OR projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  ) WITH CHECK (
    projed_core.board_transfer_source_context_valid_v1(tenant_id, project_id)
    OR projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  );
CREATE POLICY activity_event_transfer_insert_v1 ON projed_core.activity_events
  FOR INSERT WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND project_id IS NOT NULL
    AND projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  );
CREATE POLICY audit_log_transfer_insert_v1 ON projed_core.audit_logs
  FOR INSERT WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND (
      (project_id IS NOT NULL AND projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id))
      OR (project_id IS NULL AND entity_id IS NOT NULL
        AND projed_core.board_transfer_source_context_valid_v1(tenant_id, entity_id))
    )
  );

REVOKE ALL ON FUNCTION projed_core.board_transfer_source_context_valid_v1(uuid, uuid),
  projed_core.board_transfer_target_context_valid_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.board_transfer_source_context_valid_v1(uuid, uuid),
  projed_core.board_transfer_target_context_valid_v1(uuid, uuid) TO projed_runtime_disposable;
GRANT UPDATE (tenant_id, sort_order, updated_at) ON projed_core.projects TO projed_runtime_disposable;
GRANT DELETE ON projed_core.actor_scope_access TO projed_runtime_disposable;
GRANT UPDATE (legacy_workspace_id, status, revoked_at, updated_at)
  ON projed_core.board_invites TO projed_runtime_disposable;
