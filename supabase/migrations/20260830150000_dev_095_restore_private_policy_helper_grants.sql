-- DEV-095 follow-up: restore the private helpers invoked directly by public RLS policies.
-- The DEV-095 privilege hardening reset private-schema function grants globally;
-- these helpers must remain executable by authenticated policy evaluation.

grant execute on function private.current_user_is_workspace_admin(uuid) to authenticated, service_role;
grant execute on function private.current_user_has_project_role(uuid, uuid, public.tenant_role[]) to authenticated, service_role;
grant execute on function private.current_user_can_manage_project(uuid, uuid) to authenticated, service_role;
grant execute on function private.task_tag_belongs_to_tenant(uuid, uuid) to authenticated, service_role;
grant execute on function private.current_user_can_read_document(uuid, uuid) to authenticated, service_role;
grant execute on function private.current_user_can_index_record_document(uuid, uuid) to authenticated, service_role;
