-- Supabase projects may have direct default EXECUTE grants for anon and
-- service_role.  Revoking PUBLIC alone does not remove those direct grants.
-- Keep the tracking SECURITY DEFINER RPC surface authenticated-only.
revoke all on function public.get_task_tracking_reference_capability_v1() from public, anon, authenticated, service_role;
revoke all on function public.list_task_tracking_references_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_board_task_projection_v1(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_task_tracking_reference_v1(text, text, bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.move_task_tracking_reference_v1(text, text, uuid[], bigint, uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_task_tracking_reference_v1(text, text, uuid[], bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.restore_task_tracking_reference_v1(text, text, bigint, text, uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_task_tracking_reference_capability_v1() to authenticated;
grant execute on function public.list_task_tracking_references_v1(uuid) to authenticated;
grant execute on function public.get_board_task_projection_v1(uuid, uuid) to authenticated;
grant execute on function public.create_task_tracking_reference_v1(text, text, bigint, text, uuid) to authenticated;
grant execute on function public.move_task_tracking_reference_v1(text, text, uuid[], bigint, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.remove_task_tracking_reference_v1(text, text, uuid[], bigint, text, uuid) to authenticated;
grant execute on function public.restore_task_tracking_reference_v1(text, text, bigint, text, uuid) to authenticated;
