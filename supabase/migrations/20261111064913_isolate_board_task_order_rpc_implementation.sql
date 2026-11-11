-- The hosted Data API exposes the legacy private schema. Keep the public
-- invoker contract while moving its privileged entrypoints out of that API.
create schema board_task_internal;
revoke all on schema board_task_internal from public, anon, authenticated;
grant usage on schema board_task_internal to authenticated;

alter function private.commit_board_task_order_v1_impl(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[])
  set schema board_task_internal;
revoke execute on function private.board_task_write_capabilities_v1(uuid,uuid) from authenticated;

create function board_task_internal.read_write_capabilities_v1(p_tenant_id uuid, p_project_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select private.board_task_write_capabilities_v1(p_tenant_id, p_project_id);
$$;
revoke all on function board_task_internal.read_write_capabilities_v1(uuid,uuid) from public, anon;
grant execute on function board_task_internal.read_write_capabilities_v1(uuid,uuid) to authenticated;

create or replace function public.get_board_task_write_capabilities_v1(p_tenant_id uuid, p_project_id uuid)
returns text[]
language sql stable security invoker set search_path = ''
as $$
  select board_task_internal.read_write_capabilities_v1(p_tenant_id, p_project_id);
$$;

create or replace function public.commit_board_task_order_v1(
  p_tenant_id uuid, p_project_id uuid, p_operation text, p_task_id text,
  p_parent_id text, p_anchor_id text, p_position text, p_source_parent_id text,
  p_title text, p_item_type text, p_reopen_parent boolean, p_protected_task_ids text[]
) returns jsonb
language sql security invoker set search_path = ''
as $$
  select board_task_internal.commit_board_task_order_v1_impl(
    p_tenant_id, p_project_id, p_operation, p_task_id, p_parent_id, p_anchor_id,
    p_position, p_source_parent_id, p_title, p_item_type, p_reopen_parent, p_protected_task_ids
  );
$$;
notify pgrst, 'reload schema';
