\set ON_ERROR_STOP on
begin;
alter table public.wbs_items add column updated_by uuid references auth.users(id);
create type public.wbs_item_type as enum ('group','milestone','task');
alter table public.wbs_items alter column item_type drop default;
alter table public.wbs_items alter column item_type type public.wbs_item_type using item_type::public.wbs_item_type;
\ir ../supabase/migrations/20261111062404_board_task_order_transaction.sql
\ir ../supabase/migrations/20261111064913_isolate_board_task_order_rpc_implementation.sql

insert into public.wbs_items(id,tenant_id,project_id,legacy_node_id,title,item_type,sort_order)
values ('40000000-0000-4000-8000-000000000013', :'tenant_id', :'source_project_id', 'tail', 'Tail', 'task', 1);
insert into public.board_role_permissions(tenant_id,project_id,role,capabilities)
values (:'tenant_id', :'source_project_id', 'member', array['create_task']),
       (:'tenant_id', :'target_project_id', 'owner', array['edit_task','move_task']);
select set_config('order.test_tenant', :'tenant_id', true),
       set_config('order.test_project', :'source_project_id', true),
       set_config('order.test_target', :'target_project_id', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
do $$
declare t uuid := current_setting('order.test_tenant')::uuid;
        b uuid := current_setting('order.test_project')::uuid;
        result jsonb;
begin
  if public.get_board_task_write_capabilities_v1(t,b) <> array['create_task'] then
    raise exception 'create-only capability mismatch';
  end if;
  -- The guard is evaluated after the write plan. A failure must undo both the
  -- preceding rank changes and the INSERT in the same transaction.
  begin
    perform public.commit_board_task_order_v1(t,b,'create','blocked-insert',null,'root-dev095','after',null,'Blocked','task',false,array['tail']);
    raise exception 'overlapping recovery guard was ignored';
  exception when object_not_in_prerequisite_state then null;
  end;
  if exists(select 1 from public.wbs_items where legacy_node_id='blocked-insert')
    or (select sort_order from public.wbs_items where legacy_node_id='tail') <> 1 then
    raise exception 'failed insert left a row or shifted its sibling';
  end if;
  result := public.commit_board_task_order_v1(t,b,'create','dense-insert',null,'root-dev095','after',null,'Inserted','task',false,'{}');
  if (select array_agg(legacy_node_id order by sort_order) from public.wbs_items where project_id=b and parent_id is null)
    <> array['root-dev095','dense-insert','tail']
    or jsonb_array_length(result->'nodes') <> 2 then raise exception 'dense insertion order mismatch'; end if;
  begin
    perform public.commit_board_task_order_v1(t,b,'move','dense-insert',null,'tail','swap',null,null,null,false,'{}');
    raise exception 'create-only actor was allowed to move';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.commit_board_task_order_v1(t,b,'create','cross-anchor',null,'target-root-dev095','after',null,'Foreign','task',false,'{}');
    raise exception 'foreign anchor was accepted';
  exception when no_data_found then null;
  end;
end $$;

reset role;
update public.board_role_permissions set capabilities=array['move_task']
  where project_id=:'source_project_id' and role='member';
set local role authenticated;
do $$
declare t uuid := current_setting('order.test_tenant')::uuid;
        b uuid := current_setting('order.test_project')::uuid;
begin
  if public.get_board_task_write_capabilities_v1(t,b) <> array['move_task'] then raise exception 'move-only capability mismatch'; end if;
  perform public.commit_board_task_order_v1(t,b,'move','dense-insert',null,'tail','swap',null,null,null,false,'{}');
  if (select array_agg(legacy_node_id order by sort_order) from public.wbs_items where project_id=b and parent_id is null)
    <> array['root-dev095','tail','dense-insert'] then raise exception 'swap order mismatch'; end if;
  perform public.commit_board_task_order_v1(t,b,'move','dense-insert','root-dev095','child-dev095','after',null,null,null,false,'{}');
  if (select array_agg(child.legacy_node_id order by child.sort_order) from public.wbs_items child join public.wbs_items parent on child.parent_id=parent.id where parent.legacy_node_id='root-dev095')
    <> array['child-dev095','dense-insert'] then raise exception 'cross-level move mismatch'; end if;
  begin
    perform public.commit_board_task_order_v1(t,b,'move','root-dev095','dense-insert',null,'append',null,null,null,false,'{}');
    raise exception 'cycle accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.commit_board_task_order_v1(t,b,'move','dense-insert',null,null,'append',null,null,null,false,'{}');
    raise exception 'stale source parent accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.commit_board_task_order_v1(t,b,'create','move-only-insert',null,null,'append',null,'Forbidden','task',false,'{}');
    raise exception 'move-only actor was allowed to create';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', :'viewer_id', true);
do $$
declare t uuid := current_setting('order.test_tenant')::uuid;
        b uuid := current_setting('order.test_project')::uuid;
begin
  if cardinality(public.get_board_task_write_capabilities_v1(t,b)) <> 0 then raise exception 'viewer has write permission'; end if;
  begin
    perform public.commit_board_task_order_v1(t,b,'create','viewer-insert',null,null,'append',null,'Forbidden','task',false,'{}');
    raise exception 'viewer write succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
delete from public.project_members where project_id=:'target_project_id' and user_id=:'owner_id';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
do $$
declare t uuid := current_setting('order.test_tenant')::uuid;
        b uuid := current_setting('order.test_target')::uuid;
begin
  if cardinality(public.get_board_task_write_capabilities_v1(t,b)) <> 0 then raise exception 'missing board membership gained write permissions'; end if;
  if has_function_privilege('anon','public.commit_board_task_order_v1(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[])','execute') then
    raise exception 'anonymous execution granted';
  end if;
  if has_function_privilege('authenticated','private.board_task_write_capabilities_v1(uuid,uuid)','execute')
    or to_regprocedure('private.commit_board_task_order_v1_impl(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[])') is not null then
    raise exception 'privileged function remains callable through the legacy private schema';
  end if;
end $$;
reset role;
select 'BOARD_TASK_ORDER_DB=PASS';
rollback;
