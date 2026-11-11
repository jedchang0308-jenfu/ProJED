CREATE TABLE projed_core.task_tracking_references (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  task_project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  target_project_id uuid NOT NULL,
  parent_placement_id text NULL CHECK (
    parent_placement_id IS NULL OR (parent_placement_id <> '' AND length(parent_placement_id) <= 512)
  ),
  sort_order double precision NOT NULL CHECK (
    sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  kanban_stage_id text NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9223372036854775807),
  created_by uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE RESTRICT,
  removed_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE RESTRICT,
  removed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, task_project_id, task_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, target_project_id)
    REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX task_tracking_references_target_idx
  ON projed_core.task_tracking_references(tenant_id, target_project_id, parent_placement_id, sort_order, id);
CREATE INDEX task_tracking_references_task_idx
  ON projed_core.task_tracking_references(tenant_id, task_id, removed_at);
CREATE UNIQUE INDEX task_tracking_references_active_scope_uq
  ON projed_core.task_tracking_references(
    tenant_id, task_id, target_project_id, COALESCE(parent_placement_id, '')
  ) WHERE removed_at IS NULL;

CREATE TABLE projed_core.task_tracking_reference_staging (
  tenant_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  reference_root_id uuid NOT NULL,
  source_project_id uuid NOT NULL,
  original_project_id uuid NOT NULL,
  original_parent_placement_id text NULL CHECK (
    original_parent_placement_id IS NULL
    OR (original_parent_placement_id <> '' AND length(original_parent_placement_id) <= 512)
  ),
  original_sort_order double precision NOT NULL CHECK (
    original_sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  subtree_ids uuid[] NOT NULL CHECK (cardinality(subtree_ids) BETWEEN 1 AND 200),
  sort_order double precision NOT NULL CHECK (
    sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  staged_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, reference_root_id),
  UNIQUE (reference_root_id),
  FOREIGN KEY (tenant_id, reference_root_id)
    REFERENCES projed_core.task_tracking_references(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_project_id)
    REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, original_project_id)
    REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX task_tracking_reference_staging_owner_idx
  ON projed_core.task_tracking_reference_staging(owner_id, tenant_id, sort_order, reference_root_id);

CREATE TABLE projed_core.task_tracking_reference_operations (
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  operation_id text NOT NULL CHECK (operation_id <> '' AND length(operation_id) <= 255),
  actor_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NULL CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation_id)
);

ALTER TABLE projed_core.task_tracking_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_tracking_references FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_tracking_reference_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_tracking_reference_staging FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_tracking_reference_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.task_tracking_reference_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY task_tracking_staging_owner_v1 ON projed_core.task_tracking_reference_staging
  USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  )
  WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY task_tracking_staging_transfer_read_v1 ON projed_core.task_tracking_reference_staging
  FOR SELECT USING (
    projed_core.board_transfer_source_context_valid_v1(tenant_id, original_project_id)
    OR projed_core.board_transfer_source_context_valid_v1(tenant_id, source_project_id)
  );

CREATE POLICY task_tracking_reference_read_v1 ON projed_core.task_tracking_references
  FOR SELECT USING (
    projed_core.actor_has_board_capability_v1(tenant_id, target_project_id, 'read_board')
    OR projed_core.actor_has_board_capability_v1(tenant_id, target_project_id, 'manage_task_reference')
    OR projed_core.board_transfer_source_context_valid_v1(tenant_id, task_project_id)
    OR projed_core.board_transfer_source_context_valid_v1(tenant_id, target_project_id)
    OR projed_core.task_placement_context_valid_v1(tenant_id, task_project_id, 'to_unplaced')
    OR EXISTS (
      SELECT 1
        FROM projed_core.task_tracking_reference_staging staging
       WHERE staging.tenant_id = task_tracking_references.tenant_id
         AND task_tracking_references.id = ANY(staging.subtree_ids)
    )
  );
CREATE POLICY task_tracking_reference_insert_v1 ON projed_core.task_tracking_references
  FOR INSERT WITH CHECK (
    created_by = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_has_board_capability_v1(tenant_id, target_project_id, 'manage_task_reference')
  );
CREATE POLICY task_tracking_reference_update_v1 ON projed_core.task_tracking_references
  FOR UPDATE USING (
    projed_core.actor_has_board_capability_v1(tenant_id, target_project_id, 'manage_task_reference')
    OR EXISTS (
      SELECT 1
        FROM projed_core.task_tracking_reference_staging staging
       WHERE staging.tenant_id = task_tracking_references.tenant_id
         AND task_tracking_references.id = ANY(staging.subtree_ids)
    )
  ) WITH CHECK (
    projed_core.actor_has_board_capability_v1(tenant_id, target_project_id, 'manage_task_reference')
    OR EXISTS (
      SELECT 1
        FROM projed_core.task_tracking_reference_staging staging
       WHERE staging.tenant_id = task_tracking_references.tenant_id
         AND task_tracking_references.id = ANY(staging.subtree_ids)
    )
  );
CREATE POLICY task_tracking_reference_delete_v1 ON projed_core.task_tracking_references
  FOR DELETE USING (
    projed_core.actor_has_board_capability_v1(tenant_id, target_project_id, 'manage_task_reference')
    OR projed_core.board_transfer_source_context_valid_v1(tenant_id, task_project_id)
    OR projed_core.board_transfer_source_context_valid_v1(tenant_id, target_project_id)
  );

CREATE POLICY task_tracking_operation_owner_v1 ON projed_core.task_tracking_reference_operations
  USING (
    actor_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  )
  WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

CREATE POLICY wbs_item_tracking_derived_read_v1 ON projed_core.wbs_items
  FOR SELECT USING (
    current_setting('projed.authorized_tracking_derived_read', true) = tenant_id::text
    AND projed_core.actor_context_valid_v1()
    AND
    EXISTS (
      SELECT 1
        FROM projed_core.task_tracking_references reference
       WHERE reference.tenant_id = wbs_items.tenant_id
         AND reference.task_project_id = wbs_items.project_id
         AND (
           reference.removed_at IS NULL
           OR EXISTS (
             SELECT 1
               FROM projed_core.task_tracking_reference_staging staging
              WHERE staging.tenant_id = reference.tenant_id
                AND reference.id = ANY(staging.subtree_ids)
           )
         )
    )
  );

CREATE POLICY wbs_item_tag_tracking_derived_read_v1 ON projed_core.wbs_item_tags
  FOR SELECT USING (
    current_setting('projed.authorized_tracking_derived_read', true) = tenant_id::text
    AND projed_core.actor_context_valid_v1()
    AND EXISTS (
      SELECT 1
        FROM projed_core.task_tracking_references reference
       WHERE reference.tenant_id = wbs_item_tags.tenant_id
         AND reference.task_project_id = wbs_item_tags.project_id
         AND (
           reference.removed_at IS NULL
           OR EXISTS (
             SELECT 1
               FROM projed_core.task_tracking_reference_staging staging
              WHERE staging.tenant_id = reference.tenant_id
                AND reference.id = ANY(staging.subtree_ids)
           )
         )
    )
  );

CREATE POLICY wbs_item_tracking_manage_read_v1 ON projed_core.wbs_items
  FOR SELECT USING (
    projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'manage_task_reference')
  );

CREATE POLICY project_tracking_derived_read_v1 ON projed_core.projects
  FOR SELECT USING (
    current_setting('projed.authorized_tracking_derived_read', true) = tenant_id::text
    AND projed_core.actor_context_valid_v1()
    AND (
      EXISTS (
        SELECT 1 FROM projed_core.task_tracking_references reference
         WHERE reference.tenant_id = projects.tenant_id
           AND reference.task_project_id = projects.id
           AND (
             reference.removed_at IS NULL
             OR EXISTS (
               SELECT 1 FROM projed_core.task_tracking_reference_staging staging
                WHERE staging.tenant_id = reference.tenant_id
                  AND reference.id = ANY(staging.subtree_ids)
             )
           )
      )
      OR EXISTS (
        SELECT 1 FROM projed_core.task_tracking_reference_staging staging
         WHERE staging.tenant_id = projects.tenant_id
           AND staging.original_project_id = projects.id
      )
    )
  );

CREATE POLICY project_tracking_manage_read_v1 ON projed_core.projects
  FOR SELECT USING (
    projed_core.actor_has_board_capability_v1(tenant_id, id, 'manage_task_reference')
  );

REVOKE ALL ON projed_core.task_tracking_references,
  projed_core.task_tracking_reference_staging,
  projed_core.task_tracking_reference_operations FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON projed_core.task_tracking_references TO projed_runtime_disposable;
GRANT UPDATE (
  target_project_id, parent_placement_id, sort_order, kanban_stage_id,
  revision, removed_by, removed_at, updated_at
) ON projed_core.task_tracking_references TO projed_runtime_disposable;
GRANT SELECT, INSERT, DELETE ON projed_core.task_tracking_reference_staging TO projed_runtime_disposable;
GRANT UPDATE (sort_order, updated_at)
  ON projed_core.task_tracking_reference_staging TO projed_runtime_disposable;
GRANT SELECT, INSERT ON projed_core.task_tracking_reference_operations TO projed_runtime_disposable;
GRANT UPDATE (result, updated_at)
  ON projed_core.task_tracking_reference_operations TO projed_runtime_disposable;
