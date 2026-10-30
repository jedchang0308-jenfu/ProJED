CREATE TABLE projed_core.tenants (
  id uuid PRIMARY KEY,
  legacy_workspace_id text NOT NULL UNIQUE CHECK (legacy_workspace_id <> ''),
  title text NOT NULL CHECK (title <> ''),
  owner_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE RESTRICT,
  sort_order double precision NULL CHECK (
    sort_order IS NULL OR sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projed_core.projects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  legacy_board_id text NOT NULL CHECK (legacy_board_id <> ''),
  title text NOT NULL CHECK (title <> ''),
  sort_order double precision NULL CHECK (
    sort_order IS NULL OR sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX projects_tenant_legacy_uq
  ON projed_core.projects(tenant_id, legacy_board_id);

CREATE TABLE projed_core.actor_scope_access (
  local_user_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  active boolean NOT NULL DEFAULT true,
  scope_revision bigint NOT NULL DEFAULT 1 CHECK (scope_revision BETWEEN 1 AND 9223372036854775807),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (local_user_id, tenant_id, project_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX actor_scope_access_project_idx
  ON projed_core.actor_scope_access(local_user_id, tenant_id, project_id)
  WHERE active;

CREATE TABLE projed_core.tenant_members (
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  status text NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
  member_email text NULL,
  member_display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE projed_core.project_members (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  member_email text NULL,
  member_display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE projed_core.board_role_permissions (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  capabilities text[] NOT NULL DEFAULT '{}' CHECK (array_position(capabilities, NULL) IS NULL),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, role),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE,
  CHECK (capabilities <@ ARRAY[
    'read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
    'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
    'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit'
  ]::text[]),
  CHECK (role <> 'owner' OR capabilities @> ARRAY[
    'read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
    'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
    'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit'
  ]::text[])
);

CREATE TABLE projed_core.wbs_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  legacy_task_id text NOT NULL CHECK (legacy_task_id <> ''),
  parent_id uuid NULL,
  title text NOT NULL CHECK (title <> ''),
  detail_notes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(detail_notes) = 'array'),
  description text NULL,
  status text NOT NULL CHECK (status IN ('todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold')),
  assignee_ids uuid[] NOT NULL DEFAULT '{}' CHECK (array_position(assignee_ids, NULL) IS NULL),
  collaborator_ids uuid[] NOT NULL DEFAULT '{}' CHECK (array_position(collaborator_ids, NULL) IS NULL),
  tag_ids uuid[] NOT NULL DEFAULT '{}' CHECK (array_position(tag_ids, NULL) IS NULL),
  start_date date NULL,
  end_date date NULL,
  duration_locked boolean NULL,
  node_type text NULL CHECK (node_type IN ('group', 'milestone', 'task')),
  kanban_stage_id text NULL,
  sort_order double precision NOT NULL CHECK (
    sort_order NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, project_id, parent_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX wbs_items_project_legacy_uq
  ON projed_core.wbs_items(tenant_id, project_id, legacy_task_id);

CREATE TABLE projed_core.wbs_dependencies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  legacy_dependency_id text NOT NULL CHECK (legacy_dependency_id <> ''),
  from_id uuid NOT NULL,
  from_side text NOT NULL CHECK (from_side IN ('start', 'end')),
  to_id uuid NOT NULL,
  to_side text NOT NULL CHECK (to_side IN ('start', 'end')),
  offset_value double precision NULL CHECK (
    offset_value IS NULL OR offset_value NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  UNIQUE (tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, project_id, from_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, project_id, to_id)
    REFERENCES projed_core.wbs_items(tenant_id, project_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX wbs_dependencies_project_legacy_uq
  ON projed_core.wbs_dependencies(tenant_id, project_id, legacy_dependency_id);

ALTER TABLE projed_core.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.actor_scope_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.actor_scope_access FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.tenant_members FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.project_members FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.board_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.board_role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.wbs_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.wbs_items FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.wbs_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.wbs_dependencies FORCE ROW LEVEL SECURITY;

CREATE POLICY actor_scope_self_read_v1 ON projed_core.actor_scope_access
  FOR SELECT USING (
    local_user_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

CREATE POLICY tenant_scope_read_v1 ON projed_core.tenants
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = tenants.id AND access.active
  ));

CREATE POLICY project_scope_read_v1 ON projed_core.projects
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = projects.tenant_id AND access.active
      AND (access.project_id IS NULL OR access.project_id = projects.id)
  ));

CREATE POLICY tenant_member_read_v1 ON projed_core.tenant_members
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = tenant_members.tenant_id AND access.project_id IS NULL AND access.active
  ));

CREATE POLICY project_member_read_v1 ON projed_core.project_members
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = project_members.tenant_id AND access.active
      AND (access.project_id IS NULL OR access.project_id = project_members.project_id)
  ));

CREATE POLICY board_permission_read_v1 ON projed_core.board_role_permissions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = board_role_permissions.tenant_id AND access.active
      AND (access.project_id IS NULL OR access.project_id = board_role_permissions.project_id)
  ));

CREATE POLICY wbs_item_read_v1 ON projed_core.wbs_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = wbs_items.tenant_id AND access.active
      AND (access.project_id IS NULL OR access.project_id = wbs_items.project_id)
  ));

CREATE POLICY wbs_dependency_read_v1 ON projed_core.wbs_dependencies
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM projed_core.actor_scope_access access
    WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
      AND access.tenant_id = wbs_dependencies.tenant_id AND access.active
      AND (access.project_id IS NULL OR access.project_id = wbs_dependencies.project_id)
  ));

REVOKE ALL ON projed_core.tenants, projed_core.projects, projed_core.actor_scope_access,
  projed_core.tenant_members, projed_core.project_members, projed_core.board_role_permissions,
  projed_core.wbs_items, projed_core.wbs_dependencies FROM PUBLIC;
GRANT SELECT ON projed_core.tenants, projed_core.projects, projed_core.actor_scope_access,
  projed_core.tenant_members, projed_core.project_members, projed_core.board_role_permissions,
  projed_core.wbs_items, projed_core.wbs_dependencies TO projed_runtime_disposable;
