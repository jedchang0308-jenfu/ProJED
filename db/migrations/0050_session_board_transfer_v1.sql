-- Transfer commands need to see the members already moved by the FK cascade.
-- This authority ends with the exact kernel-authorized transfer transaction.
CREATE POLICY project_member_transfer_read_v1 ON projed_core.project_members
  FOR SELECT TO projed_runtime_disposable USING (
    projed_core.board_transfer_source_context_valid_v1(tenant_id, project_id)
    OR projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  );

-- Overlay replacements can relocate an existing Board. Derive visibility from
-- the effective grants, rather than retaining a Board-only former workspace.
CREATE OR REPLACE FUNCTION projed_core.session_effective_permissions_v1(base jsonb, created jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$
  WITH merged AS (
    SELECT (base->'workspaces') || (created->'workspaces') AS workspaces,
           (base->'boards') || (created->'boards') AS boards
  )
  SELECT jsonb_build_object('version',1,'workspaces',workspaces,'boards',boards,
    'visibleWorkspaces',COALESCE((
      SELECT jsonb_agg(workspace_id ORDER BY workspace_id) FROM (
        SELECT key AS workspace_id FROM jsonb_each(workspaces)
          WHERE (value->'capabilities') ? 'read_workspace'
        UNION
        SELECT value->>'workspaceId' FROM jsonb_each(boards)
          WHERE (value->'capabilities') ? 'read_board'
      ) visible
    ),'[]'::jsonb)) FROM merged;
$$;

CREATE FUNCTION projed_core.session_board_transfer_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  snapshot jsonb := nullif(current_setting('projed.session_permissions',true),'')::jsonb;
  grant_value jsonb;
  target_role text;
  direct_role text;
  inherited_role text;
  direct_unchanged boolean;
  inheritance_unchanged boolean;
  effective jsonb;
BEGIN
  IF current_user<>'projed_runtime_disposable' OR OLD.tenant_id=NEW.tenant_id THEN RETURN NEW; END IF;
  IF NOT projed_core.board_transfer_source_context_valid_v1(OLD.tenant_id,OLD.id)
    OR NOT projed_core.board_transfer_target_context_valid_v1(NEW.tenant_id,NEW.id) THEN
    RAISE EXCEPTION 'Board transfer context is unavailable' USING ERRCODE='42501';
  END IF;
  grant_value:=snapshot->'boards'->NEW.id::text;
  IF grant_value->>'workspaceId'=OLD.tenant_id::text
    AND (grant_value->'capabilities') ? 'read_board'
    AND (grant_value->'capabilities') ? 'move_board_between_workspaces'
    AND projed_core.actor_has_workspace_capability_v1(NEW.tenant_id,'manage_workspace_settings') THEN
    SELECT role INTO target_role FROM projed_core.tenant_members
      WHERE tenant_id=NEW.tenant_id AND user_id=projed_core.current_actor_user_id_v1() AND status='active';
    direct_role:=grant_value->>'role';
    inherited_role:=grant_value->>'inheritedRole';
    -- Retained explicit membership and the same Board matrix preserve its
    -- captured authority. Never manufacture a new direct role or approval.
    direct_unchanged:=CASE WHEN direct_role IS NULL THEN NOT EXISTS (
      SELECT 1 FROM projed_core.project_members WHERE tenant_id=NEW.tenant_id AND project_id=NEW.id
        AND user_id=projed_core.current_actor_user_id_v1()
    ) ELSE EXISTS (
      SELECT 1 FROM projed_core.project_members WHERE tenant_id=NEW.tenant_id AND project_id=NEW.id
        AND user_id=projed_core.current_actor_user_id_v1() AND role=direct_role
    ) END;
    -- A direct-only grant stays direct-only. Higher target inheritance is not
    -- added to this Session. Mixed inheritance requires the same role source;
    -- custom matrices make role rank an insufficient proof of equality.
    inheritance_unchanged:=inherited_role IS NULL OR (
      inherited_role IN ('owner','admin') AND target_role=inherited_role
      AND snapshot->'workspaces'->NEW.tenant_id::text->>'role'=inherited_role
    );
    IF target_role IN ('owner','admin') AND direct_unchanged AND inheritance_unchanged THEN
      grant_value:=jsonb_set(grant_value,'{workspaceId}',to_jsonb(NEW.tenant_id::text));
      UPDATE projed_core.app_sessions SET created_resource_permissions=jsonb_set(
        created_resource_permissions,ARRAY['boards',NEW.id::text],grant_value)
        WHERE token_hash=current_setting('projed.session_token_hash',true)
          AND context_id::text=current_setting('projed.actor_context_id',true)
          AND local_user_id=projed_core.current_actor_user_id_v1() AND revoked_at_ms IS NULL
          AND expires_at_ms>extract(epoch FROM clock_timestamp())*1000
        RETURNING projed_core.session_effective_permissions_v1(permission_snapshot,created_resource_permissions)
          INTO STRICT effective;
      PERFORM set_config('projed.session_permissions',effective::text,true);
    END IF;
  END IF;
  -- Only the initiating Session can be continued. Other old snapshots (and an
  -- initiating Session without equality proof) retain the revocation contract.
  PERFORM set_config('projed.permission_loss',jsonb_build_object('workspace',OLD.tenant_id,'board',OLD.id)::text,true);
  UPDATE projed_core.revocable_resource_sessions_v1
    SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  PERFORM set_config('projed.permission_loss','',true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.session_board_transfer_v1() FROM PUBLIC;

-- FK cascade triggers run first, so retained direct memberships are at target
-- before the continuation proof is checked. The command still owns COMMIT.
CREATE TRIGGER zz_session_board_transfer_v1 AFTER UPDATE OF tenant_id ON projed_core.projects
  FOR EACH ROW WHEN (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id)
  EXECUTE FUNCTION projed_core.session_board_transfer_v1();
