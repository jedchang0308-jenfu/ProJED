-- Ordinary reads and machine Calendar scans have no transfer context. Avoid
-- evaluating the transfer guards (and their actor/RLS work) for every row.
-- A nonempty context keeps the existing exact source/target authorization.
ALTER POLICY project_member_transfer_read_v1 ON projed_core.project_members USING (
  CASE WHEN coalesce(current_setting('projed.authorized_board_transfer',true),'')=''
    THEN false
    ELSE projed_core.board_transfer_source_context_valid_v1(tenant_id,project_id)
      OR projed_core.board_transfer_target_context_valid_v1(tenant_id,project_id)
  END
);
