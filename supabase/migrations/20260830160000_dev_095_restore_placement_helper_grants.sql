-- DEV-095 follow-up: restore the placement helpers required by the public RPC.
-- DEV-095 revoked private-schema function grants globally, including the
-- DEV-089 mover functions that the authenticated placement command invokes.

grant execute on function private.current_user_can_move_project_task(uuid, uuid)
  to service_role;

grant execute on function private.move_task_workbench_subtree_impl(
  text, text, text, text, text, text, text, jsonb
) to authenticated, service_role;

grant execute on function private.move_task_workbench_subtree_v2_impl(
  text, text, jsonb, text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;
