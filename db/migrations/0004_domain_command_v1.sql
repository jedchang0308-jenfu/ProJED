ALTER TABLE projed_core.wbs_items
  ADD CONSTRAINT wbs_items_date_order_v1
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);

ALTER TABLE projed_core.wbs_items
  DROP CONSTRAINT wbs_items_tenant_id_project_id_parent_id_fkey,
  ADD CONSTRAINT wbs_items_parent_same_project_v1
    FOREIGN KEY (tenant_id, project_id, parent_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON DELETE SET NULL (parent_id);

ALTER TABLE projed_core.project_members
  ADD CONSTRAINT project_members_tenant_member_v1
  FOREIGN KEY (tenant_id, user_id)
  REFERENCES projed_core.tenant_members(tenant_id, user_id)
  ON DELETE CASCADE;

ALTER TABLE projed_core.wbs_dependencies
  ADD CONSTRAINT wbs_dependencies_no_same_endpoint_v1
  CHECK (from_id <> to_id OR from_side <> to_side);

CREATE TABLE projed_core.task_tags (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  legacy_tag_id text NOT NULL CHECK (legacy_tag_id <> '' AND length(legacy_tag_id) <= 255),
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
  color text NOT NULL CHECK (color IN ('green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black', 'gray')),
  sort_order double precision NOT NULL CHECK (
    sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX task_tags_tenant_legacy_uq
  ON projed_core.task_tags(tenant_id, legacy_tag_id);
CREATE INDEX task_tags_tenant_order_idx
  ON projed_core.task_tags(tenant_id, sort_order, id);

CREATE TABLE projed_core.wbs_item_tags (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, tag_id),
  FOREIGN KEY (tenant_id, project_id, item_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, tag_id)
    REFERENCES projed_core.task_tags(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX wbs_item_tags_project_idx
  ON projed_core.wbs_item_tags(tenant_id, project_id, item_id);

CREATE FUNCTION projed_core.actor_has_board_capability_v1(
  target_tenant_id uuid,
  target_project_id uuid,
  required_capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND EXISTS (
      SELECT 1
        FROM projed_core.actor_scope_access access
       WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
         AND access.tenant_id = target_tenant_id
         AND access.active
         AND (access.project_id IS NULL OR access.project_id = target_project_id)
         AND (
           EXISTS (
             SELECT 1
               FROM projed_core.project_members member
               JOIN projed_core.tenant_members tenant_member
                 ON tenant_member.tenant_id = member.tenant_id
                AND tenant_member.user_id = member.user_id
               JOIN projed_core.board_role_permissions permission
                 ON permission.tenant_id = member.tenant_id
                AND permission.project_id = member.project_id
                AND permission.role = member.role
              WHERE member.tenant_id = target_tenant_id
                AND member.project_id = target_project_id
                AND member.user_id = projed_core.current_actor_user_id_v1()
                AND tenant_member.status = 'active'
                AND required_capability = ANY(permission.capabilities)
           )
           OR (
             access.project_id IS NULL
             AND EXISTS (
               SELECT 1
                 FROM projed_core.tenant_members member
                 JOIN projed_core.board_role_permissions permission
                   ON permission.tenant_id = target_tenant_id
                  AND permission.project_id = target_project_id
                  AND permission.role = member.role
                WHERE member.tenant_id = target_tenant_id
                  AND member.user_id = projed_core.current_actor_user_id_v1()
                  AND member.status = 'active'
                  AND member.role IN ('owner', 'admin')
                  AND required_capability = ANY(permission.capabilities)
             )
           )
         )
    );
$$;

CREATE FUNCTION projed_core.actor_can_write_tags_v1(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND EXISTS (
      SELECT 1
        FROM projed_core.actor_scope_access access
       WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
         AND access.tenant_id = target_tenant_id
         AND access.active
         AND access.project_id IS NULL
         AND EXISTS (
           SELECT 1
             FROM projed_core.tenant_members member
            WHERE member.tenant_id = target_tenant_id
              AND member.user_id = projed_core.current_actor_user_id_v1()
              AND member.status = 'active'
              AND member.role <> 'viewer'
         )
    );
$$;

ALTER TABLE projed_core.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.wbs_item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.wbs_item_tags FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_member_board_read_v2 ON projed_core.tenant_members
  FOR SELECT USING (EXISTS (
    SELECT 1
      FROM projed_core.actor_scope_access access
     WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
       AND access.tenant_id = tenant_members.tenant_id
       AND access.active
       AND (
         access.project_id IS NULL
         OR EXISTS (
           SELECT 1
             FROM projed_core.project_members member
            WHERE member.tenant_id = access.tenant_id
              AND member.project_id = access.project_id
              AND member.user_id = tenant_members.user_id
         )
       )
  ));

DROP POLICY tenant_scope_read_v1 ON projed_core.tenants;
CREATE POLICY tenant_scope_read_v2 ON projed_core.tenants
  FOR SELECT USING (EXISTS (
    SELECT 1
      FROM projed_core.actor_scope_access access
      JOIN projed_core.tenant_members member
        ON member.tenant_id = access.tenant_id
       AND member.user_id = access.local_user_id
     WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
       AND access.tenant_id = tenants.id
       AND access.active
       AND member.status = 'active'
  ));

DROP POLICY project_scope_read_v1 ON projed_core.projects;
CREATE POLICY project_scope_read_v2 ON projed_core.projects
  FOR SELECT USING (projed_core.actor_has_board_capability_v1(tenant_id, id, 'read_board'));

DROP POLICY wbs_item_read_v1 ON projed_core.wbs_items;
CREATE POLICY wbs_item_read_v2 ON projed_core.wbs_items
  FOR SELECT USING (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board'));

DROP POLICY wbs_dependency_read_v1 ON projed_core.wbs_dependencies;
CREATE POLICY wbs_dependency_read_v2 ON projed_core.wbs_dependencies
  FOR SELECT USING (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board'));

CREATE POLICY task_tag_read_v1 ON projed_core.task_tags
  FOR SELECT USING (EXISTS (
    SELECT 1
      FROM projed_core.actor_scope_access access
      JOIN projed_core.tenant_members member
        ON member.tenant_id = access.tenant_id
       AND member.user_id = access.local_user_id
     WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
       AND access.tenant_id = task_tags.tenant_id
       AND access.active
       AND member.status = 'active'
       AND (
         access.project_id IS NULL
         OR projed_core.actor_has_board_capability_v1(access.tenant_id, access.project_id, 'read_board')
       )
  ));
CREATE POLICY task_tag_insert_v1 ON projed_core.task_tags
  FOR INSERT WITH CHECK (projed_core.actor_can_write_tags_v1(tenant_id));
CREATE POLICY task_tag_update_v1 ON projed_core.task_tags
  FOR UPDATE USING (projed_core.actor_can_write_tags_v1(tenant_id))
  WITH CHECK (projed_core.actor_can_write_tags_v1(tenant_id));
CREATE POLICY task_tag_delete_v1 ON projed_core.task_tags
  FOR DELETE USING (projed_core.actor_can_write_tags_v1(tenant_id));

CREATE POLICY wbs_item_tag_read_v1 ON projed_core.wbs_item_tags
  FOR SELECT USING (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board'));
CREATE POLICY wbs_item_tag_insert_v1 ON projed_core.wbs_item_tags
  FOR INSERT WITH CHECK (
    projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_task')
    OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'edit_task')
  );
CREATE POLICY wbs_item_tag_delete_v1 ON projed_core.wbs_item_tags
  FOR DELETE USING (
    projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_task')
    OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'edit_task')
  );

CREATE POLICY wbs_item_insert_v1 ON projed_core.wbs_items
  FOR INSERT WITH CHECK (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_task'));
CREATE POLICY wbs_item_update_v1 ON projed_core.wbs_items
  FOR UPDATE USING (
    projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'edit_task')
    OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'move_task')
    OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'assign_task')
  ) WITH CHECK (
    projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'edit_task')
    OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'move_task')
    OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'assign_task')
  );
CREATE POLICY wbs_item_delete_v1 ON projed_core.wbs_items
  FOR DELETE USING (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'delete_task'));

CREATE POLICY wbs_dependency_insert_v1 ON projed_core.wbs_dependencies
  FOR INSERT WITH CHECK (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_dependency'));
CREATE POLICY wbs_dependency_update_v1 ON projed_core.wbs_dependencies
  FOR UPDATE USING (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_dependency'))
  WITH CHECK (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_dependency'));
CREATE POLICY wbs_dependency_delete_v1 ON projed_core.wbs_dependencies
  FOR DELETE USING (projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'delete_dependency'));

REVOKE ALL ON FUNCTION projed_core.actor_has_board_capability_v1(uuid, uuid, text),
  projed_core.actor_can_write_tags_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.actor_has_board_capability_v1(uuid, uuid, text),
  projed_core.actor_can_write_tags_v1(uuid) TO projed_runtime_disposable;
REVOKE ALL ON projed_core.task_tags, projed_core.wbs_item_tags FROM PUBLIC;
GRANT SELECT, DELETE ON projed_core.task_tags TO projed_runtime_disposable;
GRANT INSERT (id, tenant_id, legacy_tag_id, name, color, sort_order)
  ON projed_core.task_tags TO projed_runtime_disposable;
GRANT UPDATE (name, color, sort_order, updated_at)
  ON projed_core.task_tags TO projed_runtime_disposable;
GRANT SELECT, DELETE ON projed_core.wbs_item_tags TO projed_runtime_disposable;
GRANT INSERT (tenant_id, project_id, item_id, tag_id)
  ON projed_core.wbs_item_tags TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, legacy_task_id, parent_id, title, detail_notes, description,
  status, assignee_ids, collaborator_ids, tag_ids, start_date, end_date, duration_locked,
  node_type, kanban_stage_id, sort_order, archived
) ON projed_core.wbs_items TO projed_runtime_disposable;
GRANT UPDATE (
  parent_id, title, detail_notes, description, status, assignee_ids, collaborator_ids,
  start_date, end_date, duration_locked, node_type, kanban_stage_id, sort_order, archived, updated_at
) ON projed_core.wbs_items TO projed_runtime_disposable;
GRANT DELETE ON projed_core.wbs_items TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, legacy_dependency_id, from_id, from_side, to_id, to_side, offset_value
) ON projed_core.wbs_dependencies TO projed_runtime_disposable;
GRANT UPDATE (from_id, from_side, to_id, to_side, offset_value)
  ON projed_core.wbs_dependencies TO projed_runtime_disposable;
GRANT DELETE ON projed_core.wbs_dependencies TO projed_runtime_disposable;
