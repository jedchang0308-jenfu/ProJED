ALTER POLICY tenant_member_read_v1 ON projed_core.tenant_members USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL
    THEN projed_core.actor_has_workspace_capability_v1(tenant_id,'read_workspace')
    ELSE EXISTS (SELECT 1 FROM projed_core.actor_scope_access access
      WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.active
        AND access.tenant_id=tenant_members.tenant_id AND access.project_id IS NULL)
  END);
ALTER POLICY tenant_member_board_read_v2 ON projed_core.tenant_members USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL
    THEN EXISTS (SELECT 1 FROM projed_core.project_members member
      WHERE member.tenant_id=tenant_members.tenant_id AND member.user_id=tenant_members.user_id
        AND projed_core.actor_has_board_capability_v1(member.tenant_id,member.project_id,'read_board'))
    ELSE EXISTS (SELECT 1 FROM projed_core.actor_scope_access access
      WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.active AND access.tenant_id=tenant_members.tenant_id
        AND (access.project_id IS NULL OR EXISTS (SELECT 1 FROM projed_core.project_members member
          WHERE member.tenant_id=access.tenant_id AND member.project_id=access.project_id AND member.user_id=tenant_members.user_id)))
  END);

ALTER POLICY task_tag_read_v1 ON projed_core.task_tags USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL
    THEN projed_core.actor_context_valid_v1() AND
      (current_setting('projed.session_permissions')::jsonb->'visibleWorkspaces') ? tenant_id::text
    ELSE EXISTS (SELECT 1 FROM projed_core.actor_scope_access access JOIN projed_core.tenant_members member
      ON member.tenant_id=access.tenant_id AND member.user_id=access.local_user_id
      WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.tenant_id=task_tags.tenant_id
        AND access.active AND member.status='active' AND (access.project_id IS NULL
          OR projed_core.actor_has_board_capability_v1(access.tenant_id,access.project_id,'read_board')))
  END);

ALTER POLICY resource_revision_read_v1 ON projed_core.resource_revisions USING (
  CASE WHEN nullif(current_setting('projed.session_permissions',true),'') IS NOT NULL THEN
    CASE WHEN project_id IS NULL THEN projed_core.actor_context_valid_v1()
      AND (current_setting('projed.session_permissions')::jsonb->'visibleWorkspaces') ? tenant_id::text
    ELSE projed_core.actor_has_board_capability_v1(tenant_id,project_id,'read_board')
      OR projed_core.board_mutation_context_valid_v1(tenant_id,project_id)
      OR projed_core.board_transfer_target_context_valid_v1(tenant_id,project_id) END
  ELSE (project_id IS NULL AND (projed_core.actor_has_workspace_capability_v1(tenant_id,'read_workspace')
    OR EXISTS (SELECT 1 FROM projed_core.actor_scope_access access
      WHERE access.local_user_id=projed_core.current_actor_user_id_v1() AND access.tenant_id=resource_revisions.tenant_id AND access.active)))
    OR (project_id IS NOT NULL AND (projed_core.actor_has_board_capability_v1(tenant_id,project_id,'read_board')
      OR EXISTS (SELECT 1 FROM projed_core.project_members member JOIN projed_core.tenant_members anchor
        ON anchor.tenant_id=member.tenant_id AND anchor.user_id=member.user_id
        WHERE member.tenant_id=resource_revisions.tenant_id AND member.project_id=resource_revisions.project_id
          AND member.user_id=projed_core.current_actor_user_id_v1() AND anchor.status='active')))
  END);
