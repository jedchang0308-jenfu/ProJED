CREATE TABLE projed_core.account_board_task_filter_preferences (
  account_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  preference_version smallint NOT NULL DEFAULT 6 CHECK (preference_version > 0),
  filters jsonb NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, project_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projed_core.projects(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX account_board_task_filter_preferences_project_idx
  ON projed_core.account_board_task_filter_preferences(tenant_id, project_id);

ALTER TABLE projed_core.account_board_task_filter_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.account_board_task_filter_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY account_board_task_filter_preferences_select_v1
  ON projed_core.account_board_task_filter_preferences
  FOR SELECT TO projed_runtime_disposable
  USING (
    account_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  );

CREATE POLICY account_board_task_filter_preferences_insert_v1
  ON projed_core.account_board_task_filter_preferences
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    account_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  );

CREATE POLICY account_board_task_filter_preferences_update_v1
  ON projed_core.account_board_task_filter_preferences
  FOR UPDATE TO projed_runtime_disposable
  USING (
    account_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  )
  WITH CHECK (
    account_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  );

CREATE POLICY account_board_task_filter_preferences_delete_v1
  ON projed_core.account_board_task_filter_preferences
  FOR DELETE TO projed_runtime_disposable
  USING (
    account_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
    AND projed_core.actor_has_board_capability_v1(tenant_id, project_id, 'read_board')
  );

REVOKE ALL ON projed_core.account_board_task_filter_preferences FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON projed_core.account_board_task_filter_preferences TO projed_runtime_disposable;
GRANT UPDATE (preference_version, filters, updated_at)
  ON projed_core.account_board_task_filter_preferences TO projed_runtime_disposable;
