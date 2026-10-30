ALTER TABLE projed_core.tenants
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE projed_core.projects
  ADD COLUMN created_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE projed_core.resource_revisions (
  tenant_id uuid NOT NULL REFERENCES projed_core.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9223372036854775807),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, project_id),
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE projed_core.board_invites (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  legacy_workspace_id text NOT NULL CHECK (legacy_workspace_id <> '' AND length(legacy_workspace_id) <= 512),
  legacy_board_id text NOT NULL CHECK (legacy_board_id <> '' AND length(legacy_board_id) <= 512),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> '' AND length(email) <= 320),
  invited_by uuid NULL REFERENCES projed_core.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  default_role text NOT NULL DEFAULT 'member' CHECK (default_role IN ('admin', 'project_manager', 'member', 'viewer')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL)
    OR (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND accepted_at IS NULL AND revoked_at IS NOT NULL)
    OR (status = 'expired' AND accepted_at IS NULL AND revoked_at IS NULL)
  )
);
CREATE UNIQUE INDEX board_invites_pending_email_uq
  ON projed_core.board_invites(project_id, email)
  WHERE status = 'pending';
CREATE INDEX board_invites_project_status_idx
  ON projed_core.board_invites(tenant_id, project_id, status, created_at DESC);

CREATE FUNCTION projed_core.actor_has_workspace_capability_v1(
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
           ELSE false
         END
    );
$$;

CREATE FUNCTION projed_core.actor_can_configure_role_permissions_v1(
  target_tenant_id uuid,
  target_project_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND (
      projed_core.actor_has_workspace_capability_v1(target_tenant_id, 'manage_workspace_members')
      OR EXISTS (
        SELECT 1
          FROM projed_core.project_members member
          JOIN projed_core.tenant_members tenant_member
            ON tenant_member.tenant_id = member.tenant_id
           AND tenant_member.user_id = member.user_id
          JOIN projed_core.actor_scope_access access
            ON access.local_user_id = member.user_id
           AND access.tenant_id = member.tenant_id
           AND access.project_id = member.project_id
           AND access.active
         WHERE member.tenant_id = target_tenant_id
           AND member.project_id = target_project_id
           AND member.user_id = projed_core.current_actor_user_id_v1()
           AND member.role IN ('owner', 'admin')
           AND tenant_member.status = 'active'
      )
    );
$$;

CREATE FUNCTION projed_core.board_mutation_context_valid_v1(
  target_tenant_id uuid,
  target_project_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND current_setting('projed.authorized_board_mutation', true)
      = target_tenant_id::text || '/' || target_project_id::text
$$;

CREATE FUNCTION projed_core.workspace_bootstrap_context_valid_v1(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND current_setting('projed.authorized_workspace_bootstrap', true) = target_tenant_id::text
$$;

CREATE FUNCTION projed_core.actor_can_bump_revision_v1(
  target_tenant_id uuid,
  target_project_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, projed_core
AS $$
  SELECT CASE
    WHEN target_project_id IS NULL THEN
      projed_core.actor_can_write_tags_v1(target_tenant_id)
      OR projed_core.actor_has_workspace_capability_v1(target_tenant_id, 'manage_workspace_settings')
      OR projed_core.actor_has_workspace_capability_v1(target_tenant_id, 'create_board')
      OR (
        projed_core.actor_context_valid_v1()
        AND current_setting('projed.authorized_board_mutation', true)
          LIKE target_tenant_id::text || '/%'
      )
    ELSE
      projed_core.board_mutation_context_valid_v1(target_tenant_id, target_project_id)
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'read_board')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'edit_board_settings')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'manage_board_members')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'create_task')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'edit_task')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'move_task')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'delete_task')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'assign_task')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'create_dependency')
      OR projed_core.actor_has_board_capability_v1(target_tenant_id, target_project_id, 'delete_dependency')
      OR EXISTS (
        SELECT 1
          FROM projed_core.project_members member
          JOIN projed_core.tenant_members tenant_member
            ON tenant_member.tenant_id = member.tenant_id AND tenant_member.user_id = member.user_id
         WHERE member.tenant_id = target_tenant_id
           AND member.project_id = target_project_id
           AND member.user_id = projed_core.current_actor_user_id_v1()
           AND tenant_member.status = 'active'
      )
  END
$$;

CREATE OR REPLACE FUNCTION projed_core.actor_can_write_tags_v1(target_tenant_id uuid)
RETURNS boolean
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
         AND member.role <> 'viewer'
         AND (
           member.role IN ('owner', 'admin')
           OR EXISTS (
             SELECT 1
               FROM projed_core.actor_scope_access access
              WHERE access.local_user_id = member.user_id
                AND access.tenant_id = member.tenant_id
                AND access.project_id IS NULL
                AND access.active
           )
         )
    );
$$;

ALTER TABLE projed_core.resource_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.resource_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.board_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.board_invites FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_owner_bootstrap_read_v1 ON projed_core.tenants
  FOR SELECT USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY tenant_create_v1 ON projed_core.tenants
  FOR INSERT WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY tenant_update_v1 ON projed_core.tenants
  FOR UPDATE USING (projed_core.actor_has_workspace_capability_v1(id, 'manage_workspace_settings'))
  WITH CHECK (projed_core.actor_has_workspace_capability_v1(id, 'manage_workspace_settings'));
CREATE POLICY tenant_delete_v1 ON projed_core.tenants
  FOR DELETE USING (projed_core.actor_has_workspace_capability_v1(id, 'delete_workspace'));

CREATE POLICY project_create_v1 ON projed_core.projects
  FOR INSERT WITH CHECK (projed_core.actor_has_workspace_capability_v1(tenant_id, 'create_board'));
CREATE POLICY project_update_v1 ON projed_core.projects
  FOR UPDATE USING (projed_core.actor_has_board_capability_v1(tenant_id, id, 'edit_board_settings'))
  WITH CHECK (projed_core.actor_has_board_capability_v1(tenant_id, id, 'edit_board_settings'));
CREATE POLICY project_delete_v1 ON projed_core.projects
  FOR DELETE USING (projed_core.actor_has_board_capability_v1(tenant_id, id, 'edit_board_settings'));

CREATE POLICY tenant_member_bootstrap_insert_v1 ON projed_core.tenant_members
  FOR INSERT WITH CHECK (
    user_id = projed_core.current_actor_user_id_v1()
    AND role = 'owner' AND status = 'active'
    AND projed_core.workspace_bootstrap_context_valid_v1(tenant_id)
  );
CREATE POLICY tenant_member_self_read_v1 ON projed_core.tenant_members
  FOR SELECT USING (
    user_id = projed_core.current_actor_user_id_v1()
    AND status = 'active'
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY tenant_member_board_manager_lookup_v1 ON projed_core.tenant_members
  FOR SELECT USING (
    projed_core.actor_context_valid_v1()
    AND current_setting('projed.authorized_board_mutation', true)
      LIKE tenant_id::text || '/%'
  );
CREATE POLICY tenant_member_invite_insert_v1 ON projed_core.tenant_members
  FOR INSERT WITH CHECK (
    user_id = projed_core.current_actor_user_id_v1()
    AND role = 'member' AND status = 'active'
    AND EXISTS (
      SELECT 1
        FROM projed_core.board_invites invite
        JOIN projed_core.profiles profile ON profile.id = tenant_members.user_id
       WHERE invite.tenant_id = tenant_members.tenant_id
         AND invite.email = lower(btrim(profile.email))
         AND invite.status = 'pending' AND invite.expires_at > now()
    )
  );
CREATE POLICY project_member_insert_v1 ON projed_core.project_members
  FOR INSERT WITH CHECK (
    projed_core.board_mutation_context_valid_v1(tenant_id, project_id)
    OR (
      user_id = projed_core.current_actor_user_id_v1()
      AND EXISTS (
        SELECT 1
          FROM projed_core.board_invites invite
          JOIN projed_core.profiles profile ON profile.id = project_members.user_id
         WHERE invite.tenant_id = project_members.tenant_id
           AND invite.project_id = project_members.project_id
           AND invite.email = lower(btrim(profile.email))
           AND invite.default_role = project_members.role
           AND invite.status = 'pending' AND invite.expires_at > now()
      )
    )
  );
CREATE POLICY project_member_update_v1 ON projed_core.project_members
  FOR UPDATE USING (
    role <> 'owner'
    AND projed_core.board_mutation_context_valid_v1(tenant_id, project_id)
  ) WITH CHECK (projed_core.board_mutation_context_valid_v1(tenant_id, project_id));
CREATE POLICY project_member_delete_v1 ON projed_core.project_members
  FOR DELETE USING (
    role <> 'owner'
    AND user_id <> projed_core.current_actor_user_id_v1()
    AND projed_core.board_mutation_context_valid_v1(tenant_id, project_id)
  );

CREATE POLICY board_permission_insert_v1 ON projed_core.board_role_permissions
  FOR INSERT WITH CHECK (projed_core.board_mutation_context_valid_v1(tenant_id, project_id));
CREATE POLICY board_permission_update_v1 ON projed_core.board_role_permissions
  FOR UPDATE USING (projed_core.board_mutation_context_valid_v1(tenant_id, project_id))
  WITH CHECK (projed_core.board_mutation_context_valid_v1(tenant_id, project_id));

CREATE POLICY actor_scope_board_manager_read_v1 ON projed_core.actor_scope_access
  FOR SELECT USING (
    project_id IS NOT NULL
    AND projed_core.board_mutation_context_valid_v1(tenant_id, project_id)
  );
CREATE POLICY actor_scope_project_insert_v1 ON projed_core.actor_scope_access
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND active
    AND projed_core.actor_context_valid_v1()
    AND (projed_core.board_mutation_context_valid_v1(tenant_id, project_id) OR (
      local_user_id = projed_core.current_actor_user_id_v1()
      AND EXISTS (
        SELECT 1
          FROM projed_core.board_invites invite
          JOIN projed_core.profiles profile ON profile.id = actor_scope_access.local_user_id
         WHERE invite.tenant_id = actor_scope_access.tenant_id
           AND invite.project_id = actor_scope_access.project_id
           AND invite.email = lower(btrim(profile.email))
           AND invite.status = 'pending' AND invite.expires_at > now()
      )
    ))
  );
CREATE POLICY actor_scope_project_update_v1 ON projed_core.actor_scope_access
  FOR UPDATE USING (
    project_id IS NOT NULL
    AND projed_core.actor_context_valid_v1()
    AND (projed_core.board_mutation_context_valid_v1(tenant_id, project_id) OR (
      local_user_id = projed_core.current_actor_user_id_v1()
      AND EXISTS (
        SELECT 1
          FROM projed_core.board_invites invite
          JOIN projed_core.profiles profile ON profile.id = actor_scope_access.local_user_id
         WHERE invite.tenant_id = actor_scope_access.tenant_id
           AND invite.project_id = actor_scope_access.project_id
           AND invite.email = lower(btrim(profile.email))
           AND invite.status = 'pending' AND invite.expires_at > now()
      )
    ))
  ) WITH CHECK (
    project_id IS NOT NULL
    AND projed_core.actor_context_valid_v1()
    AND (projed_core.board_mutation_context_valid_v1(tenant_id, project_id) OR (
      local_user_id = projed_core.current_actor_user_id_v1()
      AND EXISTS (
        SELECT 1
          FROM projed_core.board_invites invite
          JOIN projed_core.profiles profile ON profile.id = actor_scope_access.local_user_id
         WHERE invite.tenant_id = actor_scope_access.tenant_id
           AND invite.project_id = actor_scope_access.project_id
           AND invite.email = lower(btrim(profile.email))
           AND invite.status = 'pending' AND invite.expires_at > now()
      )
    ))
  );

CREATE POLICY resource_revision_read_v1 ON projed_core.resource_revisions
  FOR SELECT USING (
    (project_id IS NULL AND (
      projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_workspace')
      OR EXISTS (
        SELECT 1 FROM projed_core.actor_scope_access access
         WHERE access.local_user_id = projed_core.current_actor_user_id_v1()
           AND access.tenant_id = resource_revisions.tenant_id AND access.active
      )
    ))
    OR (project_id IS NOT NULL AND (
      projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
      OR EXISTS (
        SELECT 1
          FROM projed_core.project_members member
          JOIN projed_core.tenant_members tenant_member
            ON tenant_member.tenant_id = member.tenant_id AND tenant_member.user_id = member.user_id
         WHERE member.tenant_id = resource_revisions.tenant_id
           AND member.project_id = resource_revisions.project_id
           AND member.user_id = projed_core.current_actor_user_id_v1()
           AND tenant_member.status = 'active'
      )
    ))
  );
CREATE POLICY resource_revision_insert_v1 ON projed_core.resource_revisions
  FOR INSERT WITH CHECK (
    (project_id IS NULL AND projed_core.actor_has_workspace_capability_v1(tenant_id, 'read_workspace'))
    OR (project_id IS NOT NULL AND projed_core.board_mutation_context_valid_v1(tenant_id, project_id))
  );
CREATE POLICY resource_revision_update_v1 ON projed_core.resource_revisions
  FOR UPDATE USING (projed_core.actor_can_bump_revision_v1(tenant_id, project_id))
  WITH CHECK (projed_core.actor_can_bump_revision_v1(tenant_id, project_id));

CREATE POLICY board_invite_manager_read_v1 ON projed_core.board_invites
  FOR SELECT USING (projed_core.board_mutation_context_valid_v1(tenant_id, project_id));
CREATE POLICY board_invite_recipient_read_v1 ON projed_core.board_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projed_core.profiles profile
       WHERE profile.id = projed_core.current_actor_user_id_v1()
         AND board_invites.email = lower(btrim(profile.email))
    )
  );
CREATE POLICY board_invite_insert_v1 ON projed_core.board_invites
  FOR INSERT WITH CHECK (
    projed_core.board_mutation_context_valid_v1(tenant_id, project_id)
    AND invited_by = projed_core.current_actor_user_id_v1()
    AND status = 'pending' AND expires_at > now()
  );
CREATE POLICY board_invite_manager_update_v1 ON projed_core.board_invites
  FOR UPDATE USING (projed_core.board_mutation_context_valid_v1(tenant_id, project_id))
  WITH CHECK (projed_core.board_mutation_context_valid_v1(tenant_id, project_id));
CREATE POLICY board_invite_recipient_update_v1 ON projed_core.board_invites
  FOR UPDATE USING (
    status = 'pending' AND expires_at > now()
    AND EXISTS (
      SELECT 1 FROM projed_core.profiles profile
       WHERE profile.id = projed_core.current_actor_user_id_v1()
         AND board_invites.email = lower(btrim(profile.email))
    )
  ) WITH CHECK (
    status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL
  );

REVOKE ALL ON projed_core.resource_revisions, projed_core.board_invites FROM PUBLIC;
REVOKE ALL ON FUNCTION projed_core.actor_has_workspace_capability_v1(uuid, text),
  projed_core.actor_can_configure_role_permissions_v1(uuid, uuid),
  projed_core.board_mutation_context_valid_v1(uuid, uuid),
  projed_core.workspace_bootstrap_context_valid_v1(uuid),
  projed_core.actor_can_bump_revision_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.actor_has_workspace_capability_v1(uuid, text),
  projed_core.actor_can_configure_role_permissions_v1(uuid, uuid),
  projed_core.board_mutation_context_valid_v1(uuid, uuid),
  projed_core.workspace_bootstrap_context_valid_v1(uuid),
  projed_core.actor_can_bump_revision_v1(uuid, uuid) TO projed_runtime_disposable;

GRANT INSERT (id, legacy_workspace_id, title, owner_id, sort_order)
  ON projed_core.tenants TO projed_runtime_disposable;
GRANT UPDATE (title, sort_order, updated_at) ON projed_core.tenants TO projed_runtime_disposable;
GRANT DELETE ON projed_core.tenants TO projed_runtime_disposable;
GRANT INSERT (id, tenant_id, legacy_board_id, title, sort_order, created_by)
  ON projed_core.projects TO projed_runtime_disposable;
GRANT UPDATE (title, sort_order, updated_at) ON projed_core.projects TO projed_runtime_disposable;
GRANT DELETE ON projed_core.projects TO projed_runtime_disposable;
GRANT INSERT (tenant_id, user_id, role, status, member_email, member_display_name)
  ON projed_core.tenant_members TO projed_runtime_disposable;
GRANT INSERT (tenant_id, project_id, user_id, role, member_email, member_display_name)
  ON projed_core.project_members TO projed_runtime_disposable;
GRANT UPDATE (role, member_email, member_display_name, updated_at)
  ON projed_core.project_members TO projed_runtime_disposable;
GRANT DELETE ON projed_core.project_members TO projed_runtime_disposable;
GRANT INSERT (tenant_id, project_id, role, capabilities)
  ON projed_core.board_role_permissions TO projed_runtime_disposable;
GRANT UPDATE (capabilities, updated_at) ON projed_core.board_role_permissions TO projed_runtime_disposable;
GRANT INSERT (local_user_id, tenant_id, project_id, active, scope_revision)
  ON projed_core.actor_scope_access TO projed_runtime_disposable;
GRANT UPDATE (active, scope_revision, updated_at)
  ON projed_core.actor_scope_access TO projed_runtime_disposable;
GRANT SELECT, INSERT ON projed_core.resource_revisions TO projed_runtime_disposable;
GRANT UPDATE (revision, updated_at) ON projed_core.resource_revisions TO projed_runtime_disposable;
GRANT SELECT ON projed_core.board_invites TO projed_runtime_disposable;
GRANT INSERT (id, tenant_id, project_id, legacy_workspace_id, legacy_board_id,
  email, invited_by, status, default_role, token_hash, expires_at)
  ON projed_core.board_invites TO projed_runtime_disposable;
GRANT UPDATE (status, accepted_at, revoked_at, updated_at)
  ON projed_core.board_invites TO projed_runtime_disposable;
