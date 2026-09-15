\set ON_ERROR_STOP on

-- Reset only the task-owned fixture before pgbench opens concurrent sessions.
reset role;
truncate table private.quick_task_capture_receipts, public.task_workbench_unplaced_items, public.tenant_members, public.tenants, public.profiles cascade;

-- Test-only existing-writer fixture.  Keep lock, max(order) and insert in one
-- invoker transaction so the mixed pgbench lane exercises the same database
-- boundary as an existing account-unplaced append implementation.
create or replace function public.dev122_mixed_existing_unplaced_append(
  p_capture_id text,
  p_title text,
  p_workspace_id text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid := auth.uid();
  v_order bigint;
  v_now timestamptz := clock_timestamp();
begin
  if v_owner is null then
    raise exception using message = 'DEV122_MIXED_AUTH_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('account:%s:unplaced:parent:root', v_owner::text), 0)
  );
  select coalesce(max(sort_order)::bigint, -1) + 1
    into v_order
    from public.task_workbench_unplaced_items
   where owner_id = v_owner;
  insert into public.task_workbench_unplaced_items(owner_id, id, workspace_id, task, sort_order, created_at, updated_at)
  values (
    v_owner,
    p_capture_id,
    p_workspace_id,
    jsonb_build_object(
      'id', p_capture_id,
      'workspaceId', p_workspace_id,
      'boardId', '__task_workbench_unplaced__',
      'parentId', null,
      'title', p_title,
      'status', 'todo',
      'nodeType', 'task',
      'order', v_order,
      'createdAt', floor(extract(epoch from v_now) * 1000)::bigint,
      'updatedAt', floor(extract(epoch from v_now) * 1000)::bigint,
      'detailNotes', jsonb_build_array(
        jsonb_build_object('id', 'note_default', 'title', '任務目的', 'content', ''),
        jsonb_build_object('id', 'note_default_secondary', 'title', '備註', 'content', '')
      )
    ),
    v_order,
    v_now,
    v_now
  );
end;
$$;
grant execute on function public.dev122_mixed_existing_unplaced_append(text, text, text) to authenticated;

insert into public.profiles(id, email, display_name)
values ('00000000-0000-0000-0000-0000000000a1', 'a@example.test', 'A');
insert into public.tenants(id, name, legacy_workspace_id, owner_id, updated_at)
values ('00000000-0000-0000-0000-0000000000a2', 'A2', 'workspace-a2', '00000000-0000-0000-0000-0000000000a1', now());
insert into public.tenant_members(tenant_id, user_id, status, updated_at)
values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'active', now());
