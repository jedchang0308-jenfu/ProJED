-- Preserve legacy unowned workspaces without inventing an owner or membership.
-- Runtime INSERT still requires owner_id = the trusted actor, so NULL does not
-- create a bootstrap/read path for a new workspace.
ALTER TABLE projed_core.tenants
  ALTER COLUMN owner_id DROP NOT NULL,
  DROP CONSTRAINT tenants_owner_id_fkey,
  ADD CONSTRAINT tenants_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES projed_core.profiles(id) ON DELETE SET NULL;

-- Account preferences retain the same account/project identity when a board
-- moves workspaces, matching the legacy source projection through projects.
ALTER TABLE projed_core.account_board_task_filter_preferences
  DROP CONSTRAINT account_board_task_filter_preferences_tenant_id_project_id_fkey,
  ADD CONSTRAINT account_board_task_filter_preferences_project_v2
    FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE;

-- The normal move command refreshes the moving actor's scope after the FK
-- cascade. The old board-mutation context still names the source workspace;
-- permit this exact target upsert only under the kernel's verified transfer.
CREATE POLICY actor_scope_transfer_update_v1 ON projed_core.actor_scope_access
  FOR UPDATE TO projed_runtime_disposable USING (
    local_user_id = projed_core.current_actor_user_id_v1()
    AND project_id IS NOT NULL
    AND projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  ) WITH CHECK (
    local_user_id = projed_core.current_actor_user_id_v1()
    AND project_id IS NOT NULL AND active
    AND projed_core.board_transfer_target_context_valid_v1(tenant_id, project_id)
  );
