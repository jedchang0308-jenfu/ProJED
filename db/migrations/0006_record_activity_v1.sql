CREATE OR REPLACE FUNCTION projed_core.actor_has_workspace_capability_v1(
  target_tenant_id uuid,
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
        FROM projed_core.tenant_members member
       WHERE member.tenant_id = target_tenant_id
         AND member.user_id = projed_core.current_actor_user_id_v1()
         AND member.status = 'active'
         AND (
           member.role = 'owner'
           OR EXISTS (
             SELECT 1
               FROM projed_core.actor_scope_access access
              WHERE access.local_user_id = member.user_id
                AND access.tenant_id = member.tenant_id
                AND access.project_id IS NULL
                AND access.active
           )
         )
         AND CASE required_capability
           WHEN 'read_workspace' THEN member.role IN ('owner', 'admin', 'project_manager', 'member', 'viewer')
           WHEN 'manage_workspace_settings' THEN member.role IN ('owner', 'admin')
           WHEN 'manage_workspace_members' THEN member.role IN ('owner', 'admin')
           WHEN 'create_board' THEN member.role IN ('owner', 'admin', 'project_manager')
           WHEN 'delete_workspace' THEN member.role = 'owner'
           WHEN 'read_activity' THEN member.role IN ('owner', 'admin', 'project_manager', 'member', 'viewer')
           WHEN 'read_audit' THEN member.role IN ('owner', 'admin')
           WHEN 'write_audit' THEN member.role IN ('owner', 'admin')
           ELSE false
         END
    );
$$;

CREATE TABLE projed_core.knowledge_records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  legacy_record_id text NULL CHECK (legacy_record_id IS NULL OR (legacy_record_id <> '' AND length(legacy_record_id) <= 512)),
  record_type text NOT NULL CHECK (record_type IN ('meeting', 'work_log')),
  title text NOT NULL CHECK (length(title) <= 500),
  content text NOT NULL DEFAULT '',
  participants_text text NULL,
  occurred_at timestamptz NULL,
  started_at timestamptz NULL,
  ended_at timestamptz NULL,
  recorded_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  visibility text NOT NULL CHECK (visibility IN ('private', 'project', 'tenant')),
  rag_enabled boolean NOT NULL DEFAULT false CHECK (NOT rag_enabled),
  source_document_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE,
  CHECK (record_type <> 'meeting' OR occurred_at IS NOT NULL),
  CHECK (record_type <> 'work_log' OR (started_at IS NOT NULL AND ended_at IS NOT NULL AND started_at <= ended_at)),
  CHECK (visibility <> 'private' OR NOT rag_enabled)
);
CREATE INDEX knowledge_records_project_status_idx
  ON projed_core.knowledge_records(tenant_id, project_id, status, updated_at DESC, id);
CREATE UNIQUE INDEX knowledge_records_project_legacy_uq
  ON projed_core.knowledge_records(tenant_id, project_id, legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;
CREATE INDEX knowledge_records_recorded_by_idx
  ON projed_core.knowledge_records(tenant_id, recorded_by, updated_at DESC)
  WHERE recorded_by IS NOT NULL;

CREATE TABLE projed_core.record_task_links (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  record_id uuid NOT NULL,
  item_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('main', 'related', 'decision', 'blocker', 'follow_up')),
  created_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, item_id, role),
  FOREIGN KEY (tenant_id, project_id, record_id)
    REFERENCES projed_core.knowledge_records(tenant_id, project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, project_id, item_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id) ON DELETE CASCADE
);
CREATE INDEX record_task_links_item_idx
  ON projed_core.record_task_links(tenant_id, project_id, item_id, created_at DESC);
CREATE INDEX record_task_links_record_idx
  ON projed_core.record_task_links(record_id);

CREATE TABLE projed_core.activity_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  actor_id uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type <> '' AND length(event_type) <= 120),
  entity_table text NOT NULL CHECK (entity_table <> '' AND length(entity_table) <= 120),
  entity_id uuid NULL,
  entity_ref text NULL CHECK (entity_ref IS NULL OR (entity_ref <> '' AND length(entity_ref) <= 512)),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX activity_events_tenant_time_idx
  ON projed_core.activity_events(tenant_id, created_at, id);
CREATE INDEX activity_events_project_time_idx
  ON projed_core.activity_events(tenant_id, project_id, created_at, id)
  WHERE project_id IS NOT NULL;

CREATE TABLE projed_core.audit_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  actor_id uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action <> '' AND length(action) <= 120),
  entity_table text NOT NULL CHECK (entity_table <> '' AND length(entity_table) <= 120),
  entity_id uuid NULL,
  entity_ref text NULL CHECK (entity_ref IS NULL OR (entity_ref <> '' AND length(entity_ref) <= 512)),
  before_data jsonb NULL CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
  after_data jsonb NULL CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX audit_logs_tenant_time_idx
  ON projed_core.audit_logs(tenant_id, created_at DESC, id);

ALTER TABLE projed_core.knowledge_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.knowledge_records FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.record_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.record_task_links FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.activity_events FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.audit_logs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION projed_core.actor_can_read_record_v1(
  target_tenant_id uuid,
  target_project_id uuid,
  target_visibility text,
  target_created_by uuid,
  target_recorded_by uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND CASE
      WHEN target_visibility = 'private' THEN
        projed_core.current_actor_user_id_v1() = target_created_by
        OR projed_core.current_actor_user_id_v1() = target_recorded_by
      ELSE projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'read_board')
    END;
$$;

CREATE FUNCTION projed_core.actor_can_write_record_v1(
  target_tenant_id uuid,
  target_project_id uuid,
  target_visibility text,
  target_created_by uuid,
  target_recorded_by uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND CASE
      WHEN target_visibility = 'private' THEN
        projed_core.current_actor_user_id_v1() = target_created_by
        OR projed_core.current_actor_user_id_v1() = target_recorded_by
      ELSE
        projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'create_task')
        OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'edit_task')
    END;
$$;

CREATE POLICY knowledge_record_read_v1 ON projed_core.knowledge_records
  FOR SELECT USING (projed_core.actor_can_read_record_v1(
    tenant_id, project_id, visibility, created_by, recorded_by
  ));
CREATE POLICY knowledge_record_insert_v1 ON projed_core.knowledge_records
  FOR INSERT WITH CHECK (
    created_by = projed_core.current_actor_user_id_v1()
    AND updated_by = projed_core.current_actor_user_id_v1()
    AND (
      projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'create_task')
      OR projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'edit_task')
    )
    AND projed_core.actor_can_write_record_v1(tenant_id, project_id, visibility, created_by, recorded_by)
  );
CREATE POLICY knowledge_record_update_v1 ON projed_core.knowledge_records
  FOR UPDATE USING (projed_core.actor_can_write_record_v1(
    tenant_id, project_id, visibility, created_by, recorded_by
  )) WITH CHECK (
    updated_by = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_can_write_record_v1(tenant_id, project_id, visibility, created_by, recorded_by)
  );

CREATE POLICY record_task_link_read_v1 ON projed_core.record_task_links
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.knowledge_records record
     WHERE record.id = record_task_links.record_id
       AND record.tenant_id = record_task_links.tenant_id
       AND record.project_id = record_task_links.project_id
       AND projed_core.actor_can_read_record_v1(
         record.tenant_id, record.project_id, record.visibility, record.created_by, record.recorded_by
       )
  ));
CREATE POLICY record_task_link_insert_v1 ON projed_core.record_task_links
  FOR INSERT WITH CHECK (
    created_by = projed_core.current_actor_user_id_v1()
    AND EXISTS (
      SELECT 1 FROM projed_core.knowledge_records record
       WHERE record.id = record_task_links.record_id
         AND record.tenant_id = record_task_links.tenant_id
         AND record.project_id = record_task_links.project_id
         AND projed_core.actor_can_write_record_v1(
           record.tenant_id, record.project_id, record.visibility, record.created_by, record.recorded_by
         )
    )
  );
CREATE POLICY record_task_link_delete_v1 ON projed_core.record_task_links
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM projed_core.knowledge_records record
     WHERE record.id = record_task_links.record_id
       AND record.tenant_id = record_task_links.tenant_id
       AND record.project_id = record_task_links.project_id
       AND projed_core.actor_can_write_record_v1(
         record.tenant_id, record.project_id, record.visibility, record.created_by, record.recorded_by
       )
  ));

CREATE POLICY activity_event_read_v1 ON projed_core.activity_events
  FOR SELECT USING (
    (project_id IS NOT NULL AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_activity'))
    OR (project_id IS NULL AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_activity'))
  );
CREATE POLICY activity_event_insert_v1 ON projed_core.activity_events
  FOR INSERT WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND (
      (project_id IS NOT NULL AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'write_activity'))
      OR (project_id IS NULL AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_activity'))
    )
  );

CREATE POLICY audit_log_read_v1 ON projed_core.audit_logs
  FOR SELECT USING (
    (project_id IS NOT NULL AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_audit'))
    OR (project_id IS NULL AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_audit'))
  );
CREATE POLICY audit_log_insert_v1 ON projed_core.audit_logs
  FOR INSERT WITH CHECK (
    actor_id = projed_core.current_actor_user_id_v1()
    AND (
      (project_id IS NOT NULL AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'write_audit'))
      OR (project_id IS NULL AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'write_audit'))
    )
  );

REVOKE ALL ON FUNCTION projed_core.actor_can_read_record_v1(uuid, uuid, text, uuid, uuid),
  projed_core.actor_can_write_record_v1(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.actor_can_read_record_v1(uuid, uuid, text, uuid, uuid),
  projed_core.actor_can_write_record_v1(uuid, uuid, text, uuid, uuid) TO projed_runtime_disposable;

REVOKE ALL ON projed_core.knowledge_records, projed_core.record_task_links,
  projed_core.activity_events, projed_core.audit_logs FROM PUBLIC;
GRANT SELECT ON projed_core.knowledge_records, projed_core.record_task_links,
  projed_core.activity_events, projed_core.audit_logs TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, legacy_record_id, record_type, title, content, participants_text,
  occurred_at, started_at, ended_at, recorded_by, status, visibility, rag_enabled,
  source_document_id, metadata, created_by, updated_by
) ON projed_core.knowledge_records TO projed_runtime_disposable;
GRANT UPDATE (
  record_type, title, content, participants_text, occurred_at, started_at, ended_at,
  status, visibility, rag_enabled, source_document_id, metadata, updated_by, updated_at
) ON projed_core.knowledge_records TO projed_runtime_disposable;
GRANT SELECT, DELETE ON projed_core.record_task_links TO projed_runtime_disposable;
GRANT INSERT (id, tenant_id, project_id, record_id, item_id, role, created_by)
  ON projed_core.record_task_links TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, actor_id, event_type, entity_table, entity_id, entity_ref, payload
) ON projed_core.activity_events TO projed_runtime_disposable;
GRANT INSERT (
  id, tenant_id, project_id, actor_id, action, entity_table, entity_id, entity_ref, before_data, after_data
) ON projed_core.audit_logs TO projed_runtime_disposable;
