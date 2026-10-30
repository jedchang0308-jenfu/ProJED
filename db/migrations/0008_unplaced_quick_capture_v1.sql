CREATE TABLE projed_core.unplaced_tasks (
  owner_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  legacy_task_id text NOT NULL CHECK (legacy_task_id <> '' AND length(legacy_task_id) <= 512),
  workspace_legacy_id text NOT NULL CHECK (workspace_legacy_id <> '' AND length(workspace_legacy_id) <= 512),
  task jsonb NOT NULL CHECK (jsonb_typeof(task) = 'object'),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 2147483647),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, legacy_task_id)
);

CREATE INDEX unplaced_tasks_owner_order_idx
  ON projed_core.unplaced_tasks(owner_id, sort_order, updated_at, legacy_task_id);

CREATE TABLE projed_core.quick_task_capture_receipts (
  owner_id uuid NOT NULL REFERENCES projed_core.profiles(id) ON DELETE CASCADE,
  capture_id text NOT NULL CHECK (capture_id <> '' AND length(capture_id) <= 512),
  title_hash text NOT NULL CHECK (title_hash ~ '^[a-f0-9]{64}$'),
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, capture_id)
);

ALTER TABLE projed_core.unplaced_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.unplaced_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.quick_task_capture_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.quick_task_capture_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY unplaced_task_owner_read_v1 ON projed_core.unplaced_tasks
  FOR SELECT USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY unplaced_task_owner_insert_v1 ON projed_core.unplaced_tasks
  FOR INSERT WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY unplaced_task_owner_update_v1 ON projed_core.unplaced_tasks
  FOR UPDATE USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  ) WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY unplaced_task_owner_delete_v1 ON projed_core.unplaced_tasks
  FOR DELETE USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY quick_capture_receipt_owner_read_v1 ON projed_core.quick_task_capture_receipts
  FOR SELECT USING (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY quick_capture_receipt_owner_insert_v1 ON projed_core.quick_task_capture_receipts
  FOR INSERT WITH CHECK (
    owner_id = projed_core.current_actor_user_id_v1()
    AND projed_core.actor_context_valid_v1()
  );

REVOKE ALL ON projed_core.unplaced_tasks, projed_core.quick_task_capture_receipts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projed_core.unplaced_tasks TO projed_runtime_disposable;
GRANT SELECT, INSERT ON projed_core.quick_task_capture_receipts TO projed_runtime_disposable;
