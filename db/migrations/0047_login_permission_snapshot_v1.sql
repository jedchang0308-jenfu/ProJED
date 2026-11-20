-- Invitations and additional role assignments become available on the next login.
ALTER TABLE projed_core.app_sessions ADD COLUMN permission_snapshot jsonb
  CHECK (permission_snapshot IS NULL OR (
    jsonb_typeof(permission_snapshot)='object' AND permission_snapshot->>'version'='1'
    AND jsonb_typeof(permission_snapshot->'workspaces')='object'
    AND jsonb_typeof(permission_snapshot->'boards')='object'
    AND jsonb_typeof(permission_snapshot->'visibleWorkspaces')='array'
  ) IS TRUE);
GRANT INSERT (permission_snapshot) ON projed_core.app_sessions TO projed_runtime_disposable;
CREATE POLICY external_recipient_receipt_read_v1 ON projed_core.board_invites FOR SELECT TO projed_runtime_disposable
  USING (external_recipient_user_id=projed_core.current_actor_user_id_v1()
    AND external_recipient_principal_id=current_setting('projed.actor_principal_id',true)
    AND status='accepted' AND projed_core.actor_context_valid_v1());

-- Accepting a valid invite changes the Board revision before the recipient
-- can read that Board. Limit this write to the accepted row's own trigger.
CREATE POLICY invite_revision_read_v1 ON projed_core.resource_revisions FOR SELECT TO projed_runtime_disposable
  USING (pg_trigger_depth()>0 AND current_setting('projed.accepting_board_revision',true)=tenant_id::text || '/' || project_id::text);
CREATE POLICY invite_revision_update_v1 ON projed_core.resource_revisions FOR UPDATE TO projed_runtime_disposable
  USING (pg_trigger_depth()>0 AND current_setting('projed.accepting_board_revision',true)=tenant_id::text || '/' || project_id::text)
  WITH CHECK (pg_trigger_depth()>0 AND current_setting('projed.accepting_board_revision',true)=tenant_id::text || '/' || project_id::text);
CREATE FUNCTION projed_core.accepted_invite_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM set_config('projed.accepting_board_revision',NEW.tenant_id::text || '/' || NEW.project_id::text,true);
  UPDATE projed_core.resource_revisions SET revision=revision+1,updated_at=now()
    WHERE tenant_id=NEW.tenant_id AND project_id=NEW.project_id AND revision<9223372036854775807;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing invitation resource revision' USING ERRCODE='55000'; END IF;
  PERFORM set_config('projed.accepting_board_revision','',true);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.accepted_invite_revision_v1() FROM PUBLIC;
CREATE TRIGGER accepted_invite_revision_v1 AFTER UPDATE OF status ON projed_core.board_invites
  FOR EACH ROW WHEN (OLD.status='pending' AND NEW.status='accepted')
  EXECUTE FUNCTION projed_core.accepted_invite_revision_v1();

-- The login decision stays immutable. Creator rights on new resources are
-- recorded in the creating Session only, inside the resource's transaction.
ALTER TABLE projed_core.app_sessions ADD COLUMN created_resource_permissions jsonb NOT NULL
  DEFAULT '{"workspaces":{},"boards":{},"visibleWorkspaces":[]}'::jsonb;
CREATE FUNCTION projed_core.session_effective_permissions_v1(base jsonb, created jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('version',1,'workspaces',(base->'workspaces') || (created->'workspaces'),
    'boards',(base->'boards') || (created->'boards'),
    'visibleWorkspaces',(base->'visibleWorkspaces') || (created->'visibleWorkspaces'));
$$;
GRANT UPDATE(created_resource_permissions) ON projed_core.app_sessions TO projed_runtime_disposable;
CREATE POLICY session_created_resource_update_v1 ON projed_core.app_sessions FOR UPDATE TO projed_runtime_disposable
  USING (pg_trigger_depth()>0 AND token_hash=current_setting('projed.session_token_hash',true)
    AND context_id::text=current_setting('projed.actor_context_id',true) AND revoked_at_ms IS NULL)
  WITH CHECK (pg_trigger_depth()>0 AND token_hash=current_setting('projed.session_token_hash',true)
    AND context_id::text=current_setting('projed.actor_context_id',true) AND revoked_at_ms IS NULL);
CREATE OR REPLACE FUNCTION projed_core.app_session_revoke_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.revoked_at_ms IS NULL AND NEW.revoked_at_ms IS NOT NULL
    AND to_jsonb(OLD)-'revoked_at_ms'=to_jsonb(NEW)-'revoked_at_ms' THEN RETURN NEW; END IF;
  IF pg_trigger_depth()>1 AND OLD.revoked_at_ms IS NULL
    AND NEW.created_resource_permissions IS DISTINCT FROM OLD.created_resource_permissions
    AND to_jsonb(OLD)-'created_resource_permissions'=to_jsonb(NEW)-'created_resource_permissions'
    AND OLD.token_hash=current_setting('projed.session_token_hash',true)
    AND OLD.context_id::text=current_setting('projed.actor_context_id',true) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Session update is invalid' USING ERRCODE='23514';
END;
$$;
CREATE FUNCTION projed_core.session_created_resource_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  snapshot jsonb := nullif(current_setting('projed.session_permissions',true),'')::jsonb;
  resource_path text[];
  grant_value jsonb;
  tenant_key text;
  parent_role text;
  effective jsonb;
BEGIN
  IF snapshot IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='projects' THEN
    IF NEW.created_by=projed_core.current_actor_user_id_v1() THEN
      PERFORM set_config('projed.new_session_board',NEW.tenant_id::text || '/' || NEW.id::text,true);
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME='tenants' THEN
    IF NEW.owner_id IS DISTINCT FROM projed_core.current_actor_user_id_v1() THEN RETURN NEW; END IF;
    tenant_key:=NEW.id::text;
    resource_path:=ARRAY['workspaces',tenant_key];
    grant_value:=jsonb_build_object('role','owner','capabilities',ARRAY['read_workspace','manage_workspace_settings',
      'manage_workspace_members','create_board','delete_workspace','read_activity','read_audit','write_audit','write_tags']);
  ELSE
    tenant_key:=NEW.tenant_id::text;
    parent_role:=snapshot->'workspaces'->tenant_key->>'role';
    IF current_setting('projed.new_session_board',true) IS DISTINCT FROM tenant_key || '/' || NEW.project_id::text
      OR NEW.role IS DISTINCT FROM parent_role THEN RETURN NEW; END IF;
    resource_path:=ARRAY['boards',NEW.project_id::text];
    grant_value:=jsonb_build_object('workspaceId',tenant_key,'role',parent_role,
      'inheritedRole',CASE WHEN parent_role IN ('owner','admin') THEN parent_role END,
      'capabilities',NEW.capabilities || CASE WHEN parent_role IN ('owner','admin')
        THEN ARRAY['configure_permissions'] ELSE ARRAY[]::text[] END);
  END IF;
  UPDATE projed_core.app_sessions SET created_resource_permissions=
    jsonb_set(jsonb_set(created_resource_permissions,resource_path,grant_value),'{visibleWorkspaces}',
      CASE WHEN created_resource_permissions->'visibleWorkspaces' ? tenant_key THEN created_resource_permissions->'visibleWorkspaces'
           ELSE (created_resource_permissions->'visibleWorkspaces') || to_jsonb(tenant_key) END)
    WHERE token_hash=current_setting('projed.session_token_hash',true)
      AND context_id::text=current_setting('projed.actor_context_id',true) AND revoked_at_ms IS NULL
    RETURNING projed_core.session_effective_permissions_v1(permission_snapshot,created_resource_permissions) INTO STRICT effective;
  PERFORM set_config('projed.session_permissions',effective::text,true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenant_session_creation_v1 AFTER INSERT ON projed_core.tenants
  FOR EACH ROW EXECUTE FUNCTION projed_core.session_created_resource_v1();
CREATE TRIGGER project_session_creation_v1 AFTER INSERT ON projed_core.projects
  FOR EACH ROW EXECUTE FUNCTION projed_core.session_created_resource_v1();
CREATE TRIGGER board_permission_session_creation_v1 AFTER INSERT ON projed_core.board_role_permissions
  FOR EACH ROW EXECUTE FUNCTION projed_core.session_created_resource_v1();
REVOKE ALL ON FUNCTION projed_core.session_created_resource_v1(),
  projed_core.session_effective_permissions_v1(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.session_effective_permissions_v1(jsonb,jsonb)
  TO projed_runtime_disposable;

CREATE OR REPLACE FUNCTION projed_core.actor_has_board_capability_v1(
  target_tenant_id uuid,
  target_project_id uuid,
  required_capability text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE snapshot jsonb := nullif(current_setting('projed.session_permissions',true),'')::jsonb;
BEGIN
  IF snapshot IS NOT NULL THEN
    RETURN projed_core.actor_context_valid_v1() AND COALESCE((snapshot->'boards'->target_project_id::text->>'workspaceId') = target_tenant_id::text AND (snapshot->'boards'->target_project_id::text->'capabilities') ? required_capability,false);
  END IF;
  -- Login computes this decision once. Disposable actors use the same source rules.
  RETURN projed_core.actor_context_valid_v1()
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
END;
$$;

CREATE OR REPLACE FUNCTION projed_core.actor_has_workspace_capability_v1(
  target_tenant_id uuid,
  required_capability text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE snapshot jsonb := nullif(current_setting('projed.session_permissions',true),'')::jsonb;
BEGIN
  IF snapshot IS NOT NULL THEN
    RETURN projed_core.actor_context_valid_v1() AND COALESCE((snapshot->'workspaces'->target_tenant_id::text->'capabilities') ? required_capability,false);
  END IF;
  -- Login computes this decision once. Disposable actors use the same source rules.
  RETURN projed_core.actor_context_valid_v1()
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
END;
$$;

CREATE OR REPLACE FUNCTION projed_core.actor_can_configure_role_permissions_v1(
  target_tenant_id uuid,
  target_project_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE snapshot jsonb := nullif(current_setting('projed.session_permissions',true),'')::jsonb;
BEGIN
  IF snapshot IS NOT NULL THEN
    RETURN projed_core.actor_context_valid_v1() AND COALESCE((snapshot->'boards'->target_project_id::text->>'workspaceId') = target_tenant_id::text AND (snapshot->'boards'->target_project_id::text->'capabilities') ? 'configure_permissions',false);
  END IF;
  -- Login computes this decision once. Disposable actors use the same source rules.
  RETURN projed_core.actor_context_valid_v1()
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
END;
$$;

CREATE OR REPLACE FUNCTION projed_core.actor_can_write_tags_v1(target_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE snapshot jsonb := nullif(current_setting('projed.session_permissions',true),'')::jsonb;
BEGIN
  IF snapshot IS NOT NULL THEN
    RETURN projed_core.actor_context_valid_v1() AND COALESCE((snapshot->'workspaces'->target_tenant_id::text->'capabilities') ? 'write_tags',false);
  END IF;
  -- Login computes this decision once. Disposable actors use the same source rules.
  RETURN projed_core.actor_context_valid_v1()
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
END;
$$;

ALTER POLICY tenant_scope_read_v2 ON projed_core.tenants USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL
    THEN projed_core.actor_context_valid_v1() AND
      (current_setting('projed.session_permissions')::jsonb->'visibleWorkspaces') ? id::text
    ELSE EXISTS (
      SELECT 1 FROM projed_core.actor_scope_access access JOIN projed_core.tenant_members member
        ON member.tenant_id=access.tenant_id AND member.user_id=access.local_user_id
       WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.tenant_id=tenants.id
         AND access.active AND member.status='active'
    ) END);
ALTER POLICY tenant_owner_bootstrap_read_v1 ON projed_core.tenants USING (
  owner_id=projed_core.current_actor_user_id_v1() AND projed_core.actor_context_valid_v1()
  AND (nullif(current_setting('projed.session_permissions',true),'') IS NULL
    OR (nullif(current_setting('projed.session_permissions',true),'')::jsonb->'visibleWorkspaces') ? id::text));

ALTER POLICY project_member_read_v1 ON projed_core.project_members USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL
    THEN projed_core.actor_has_board_capability_v1(tenant_id,project_id,'read_board')
    ELSE EXISTS (SELECT 1 FROM projed_core.actor_scope_access access
      WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.active
        AND access.tenant_id=project_members.tenant_id AND (access.project_id IS NULL OR access.project_id=project_members.project_id))
  END);
ALTER POLICY board_permission_read_v1 ON projed_core.board_role_permissions USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL
    THEN projed_core.actor_has_board_capability_v1(tenant_id,project_id,'read_board')
      OR projed_core.board_mutation_context_valid_v1(tenant_id,project_id)
    ELSE EXISTS (SELECT 1 FROM projed_core.actor_scope_access access
      WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.active
        AND access.tenant_id=board_role_permissions.tenant_id AND (access.project_id IS NULL OR access.project_id=board_role_permissions.project_id))
  END);

-- The mutation trigger exposes only an updatable revocation timestamp.
-- The runtime cannot enumerate other users' Session identities or private scopes.
CREATE FUNCTION projed_core.session_permission_loss_v1(subject uuid, base jsonb, created jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  event jsonb := nullif(current_setting('projed.permission_loss',true),'')::jsonb;
  permissions jsonb;
  board jsonb;
BEGIN
  IF pg_trigger_depth()=0 OR event IS NULL OR base IS NULL THEN RETURN false; END IF;
  IF event ? 'user' AND event->>'user'<>subject::text THEN RETURN false; END IF;
  permissions:=projed_core.session_effective_permissions_v1(base,created);
  IF NOT (event ? 'board') THEN RETURN (permissions->'visibleWorkspaces') ? (event->>'workspace'); END IF;
  board:=permissions->'boards'->(event->>'board');
  IF board IS NULL OR board->>'workspaceId'<>event->>'workspace' THEN RETURN false; END IF;
  IF event ? 'role' AND event->>'role' IS DISTINCT FROM board->>'role'
    AND event->>'role' IS DISTINCT FROM board->>'inheritedRole'
    AND event->>'role' IS DISTINCT FROM board->>'approvedRole' THEN RETURN false; END IF;
  RETURN NOT (event ? 'lost') OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(event->'lost') cap WHERE (board->'capabilities') ? cap
  );
END;
$$;
CREATE POLICY permission_loss_owner_read_v1 ON projed_core.app_sessions FOR SELECT TO projed_owner_disposable
  USING (projed_core.session_permission_loss_v1(local_user_id,permission_snapshot,created_resource_permissions));
CREATE POLICY permission_loss_owner_update_v1 ON projed_core.app_sessions FOR UPDATE TO projed_owner_disposable
  USING (projed_core.session_permission_loss_v1(local_user_id,permission_snapshot,created_resource_permissions))
  WITH CHECK (revoked_at_ms IS NOT NULL AND
    projed_core.session_permission_loss_v1(local_user_id,permission_snapshot,created_resource_permissions));
CREATE VIEW projed_core.revocable_resource_sessions_v1 WITH (security_barrier=true) AS
  SELECT revoked_at_ms FROM projed_core.app_sessions WHERE revoked_at_ms IS NULL;
REVOKE ALL ON projed_core.revocable_resource_sessions_v1 FROM PUBLIC;
GRANT UPDATE(revoked_at_ms) ON projed_core.revocable_resource_sessions_v1 TO projed_runtime_disposable;
CREATE FUNCTION projed_core.revoke_reduced_permissions_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE event jsonb; lost text[];
BEGIN
  -- Import and schema maintenance cannot create human Session permissions.
  IF current_user<>'projed_runtime_disposable' THEN RETURN NULL; END IF;
  event:=jsonb_build_object('workspace',OLD.tenant_id);
  IF TG_TABLE_NAME='tenant_members' THEN
    IF OLD.status<>'active' THEN RETURN NULL; END IF;
    IF TG_OP='UPDATE' AND NEW.status='active' AND
      array_position(ARRAY['viewer','member','project_manager','admin','owner'],NEW.role::text) >=
      array_position(ARRAY['viewer','member','project_manager','admin','owner'],OLD.role::text)
    THEN RETURN NULL; END IF;
    event:=event || jsonb_build_object('user',OLD.user_id);
  ELSE
    event:=event || jsonb_build_object('board',OLD.project_id);
    IF TG_TABLE_NAME='board_role_permissions' THEN
      SELECT ARRAY(SELECT unnest(OLD.capabilities) EXCEPT SELECT unnest(NEW.capabilities)) INTO lost;
      IF cardinality(lost)=0 THEN RETURN NULL; END IF;
      event:=event || jsonb_build_object('role',OLD.role,'lost',lost);
    ELSE
      event:=event || jsonb_build_object('user',OLD.user_id);
      IF TG_OP='UPDATE' THEN
        IF OLD.role=NEW.role THEN RETURN NULL; END IF;
        SELECT ARRAY(
          SELECT unnest(p.capabilities) FROM projed_core.board_role_permissions p
           WHERE p.project_id=OLD.project_id AND p.role=OLD.role
          EXCEPT SELECT unnest(p.capabilities) FROM projed_core.board_role_permissions p
           WHERE p.project_id=OLD.project_id AND p.role=NEW.role) INTO lost;
        IF OLD.role IN ('owner','admin') AND NEW.role NOT IN ('owner','admin') THEN
          lost:=array_append(lost,'configure_permissions');
        END IF;
        IF cardinality(lost)=0 THEN RETURN NULL; END IF;
        event:=event || jsonb_build_object('lost',lost);
      END IF;
    END IF;
  END IF;
  PERFORM set_config('projed.permission_loss',event::text,true);
  UPDATE projed_core.revocable_resource_sessions_v1
    SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  PERFORM set_config('projed.permission_loss','',true);
  RETURN NULL;
END;
$$;
CREATE TRIGGER project_member_permission_loss_v1 AFTER DELETE OR UPDATE OF role ON projed_core.project_members
  FOR EACH ROW EXECUTE FUNCTION projed_core.revoke_reduced_permissions_v1();
CREATE TRIGGER tenant_member_permission_loss_v1 AFTER DELETE OR UPDATE OF status,role ON projed_core.tenant_members
  FOR EACH ROW EXECUTE FUNCTION projed_core.revoke_reduced_permissions_v1();
CREATE TRIGGER board_role_permission_loss_v1 AFTER UPDATE OF capabilities ON projed_core.board_role_permissions
  FOR EACH ROW EXECUTE FUNCTION projed_core.revoke_reduced_permissions_v1();
REVOKE ALL ON FUNCTION projed_core.revoke_reduced_permissions_v1(),
  projed_core.session_permission_loss_v1(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.session_permission_loss_v1(uuid,jsonb,jsonb) TO projed_runtime_disposable;
