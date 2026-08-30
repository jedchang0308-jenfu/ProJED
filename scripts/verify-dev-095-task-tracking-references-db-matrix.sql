\set ON_ERROR_STOP on
\set tenant_id '10000000-0000-4000-8000-000000000001'
\set source_project_id '20000000-0000-4000-8000-000000000002'
\set target_project_id '20000000-0000-4000-8000-000000000003'
\set owner_id '30000000-0000-4000-8000-000000000003'
\set viewer_id '30000000-0000-4000-8000-000000000004'
\set member_id '30000000-0000-4000-8000-000000000005'
\set future_viewer_id '30000000-0000-4000-8000-000000000006'
\set foreign_user_id '30000000-0000-4000-8000-000000000007'
\set foreign_tenant_id '10000000-0000-4000-8000-000000000008'
\set root_id '40000000-0000-4000-8000-000000000010'
\set child_id '40000000-0000-4000-8000-000000000011'
\set target_root_id '40000000-0000-4000-8000-000000000012'
\set create_op '80000000-0000-4000-8000-000000000050'
\set move_op '80000000-0000-4000-8000-000000000051'
\set remove_op '80000000-0000-4000-8000-000000000052'
\set restore_op '80000000-0000-4000-8000-000000000053'
\set duplicate_op '80000000-0000-4000-8000-000000000054'
\set create_null_revision_op '80000000-0000-4000-8000-000000000059'
\set remove_null_revision_op '80000000-0000-4000-8000-000000000060'

insert into auth.users (id) values (:'future_viewer_id'::uuid), (:'foreign_user_id'::uuid);
insert into public.profiles (id) values (:'future_viewer_id'::uuid), (:'foreign_user_id'::uuid);
insert into public.tenants (id, name, legacy_workspace_id)
values (:'foreign_tenant_id'::uuid, 'DEV-095 foreign tenant', 'workspace-dev095-foreign');
insert into public.tenant_members (tenant_id, user_id, role)
values (:'tenant_id'::uuid, :'future_viewer_id'::uuid, 'viewer'),
       (:'foreign_tenant_id'::uuid, :'foreign_user_id'::uuid, 'member');
insert into public.project_members (project_id, tenant_id, user_id, role)
values (:'target_project_id'::uuid, :'tenant_id'::uuid, :'future_viewer_id'::uuid, 'viewer');

select public.dev095_assert(to_regclass('public.wbs_item_placements') is not null, 'placement table exists');
select public.dev095_assert((select count(*) from public.wbs_item_placements where placement_kind = 'primary') = 3, 'primary backfill count');
select public.dev095_assert((select count(*) from public.wbs_item_placements where placement_kind = 'primary' and task_id = :'child_id'::uuid and parent_placement_id is not null) = 1, 'primary parent mapping');
select public.dev095_assert((select count(*) from public.wbs_item_placements where placement_kind = 'tracking_reference') = 0, 'no reference before create');
select public.dev095_assert(has_function_privilege('authenticated', 'public.create_task_tracking_reference_v1(text,text,bigint,text,uuid)', 'execute'), 'create RPC grant');
select public.dev095_assert(has_function_privilege('authenticated', 'public.move_task_tracking_reference_v1(text,text,uuid[],bigint,uuid,text,text,text,text,uuid)', 'execute'), 'move RPC grant');
select public.dev095_assert((select capabilities @> array['manage_task_reference'] from public.board_role_permissions where project_id = :'source_project_id'::uuid and role = 'owner'), 'capability backfill');
select public.dev095_assert(not coalesce((select capabilities @> array['manage_task_reference'] from public.board_role_permissions where project_id = :'target_project_id'::uuid and role = 'member'), false), 'custom read-only role does not gain manage capability');
select public.dev095_assert(
  not has_function_privilege('authenticated', 'private.task_tracking_resolve_placement(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'private.current_user_has_project_capability(uuid,uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.task_tracking_request_hash(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.task_tracking_expected_subtree_matches(uuid,uuid,uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'private.prevent_tracked_task_unplaced()', 'execute'),
  'private helper execute boundary');

-- A future target-board viewer has no source access before the reference is
-- created; the derived read path becomes visible only after the placement.
set request.jwt.claim.sub = :'future_viewer_id';
set role authenticated;
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 0, 'future viewer cannot read source before reference');
set role postgres;

set request.jwt.claim.sub = :'owner_id';
set role authenticated;

select public.create_task_tracking_reference_v1(:'create_op', 'primary:' || :'root_id', 1, 'isolated', :'tenant_id'::uuid) as create_result \gset
-- Resolve the id from the placement table as the contract's authoritative row.
-- This avoids coupling the rest of the matrix to the JSON envelope shape.
select id::text as reference_id
from public.wbs_item_placements
where tenant_id = :'tenant_id'::uuid
  and task_id = :'root_id'::uuid
  and placement_kind = 'tracking_reference'
  and removed_at is null
order by created_at desc, id desc
limit 1 \gset
select set_config('dev095.reference_id', :'reference_id', false);
\echo DEV095_REFERENCE_ID=:'reference_id'
select public.dev095_assert((:'create_result'::jsonb -> 'reference' ->> 'placement_kind') = 'tracking_reference', 'create returns tracking reference');
select public.dev095_assert((select count(*) from public.wbs_item_placements where placement_kind = 'tracking_reference' and removed_at is null) = 1, 'one active reference after create');
select public.dev095_assert((select sort_order from public.wbs_item_placements where id = :'reference_id'::uuid) = 1, 'reference is inserted adjacent after primary');
select public.create_task_tracking_reference_v1(:'create_op', 'primary:' || :'root_id', 1, 'replay', :'tenant_id'::uuid) as replay_result \gset
select public.dev095_assert((:'replay_result'::jsonb -> 'reference' ->> 'id') = :'reference_id', 'same operation replays same reference');
do $$
begin
  perform public.create_task_tracking_reference_v1('80000000-0000-4000-8000-000000000050', 'primary:child-dev095', 1, 'conflict', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected operation id conflict';
exception when others then
  if sqlerrm <> 'OPERATION_ID_CONFLICT' then raise; end if;
end $$;

do $$
begin
  perform public.create_task_tracking_reference_v1('80000000-0000-4000-8000-000000000055', 'primary:root-dev095', 1, 'duplicate', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected duplicate reference failure';
exception when others then
  if sqlerrm <> 'DUPLICATE_REFERENCE' then raise; end if;
end $$;
select public.dev095_assert((select count(*) from public.wbs_item_placements where placement_kind = 'tracking_reference' and removed_at is null) = 1, 'duplicate does not create second reference');

-- The web action does not carry a primary-placement revision.  A null
-- expected revision must therefore lock/read the current primary row rather
-- than assuming the migration backfill revision is still 1.
update public.wbs_items set title = title || ' touched' where id = :'child_id'::uuid;
select public.create_task_tracking_reference_v1(:'create_null_revision_op', 'primary:' || :'child_id', null, 'isolated-null-revision', :'tenant_id'::uuid) as create_null_revision_result \gset
select id::text as null_revision_reference_id
from public.wbs_item_placements
where tenant_id = :'tenant_id'::uuid
  and task_id = :'child_id'::uuid
  and placement_kind = 'tracking_reference'
  and removed_at is null
limit 1 \gset
select public.dev095_assert((:'create_null_revision_result'::jsonb -> 'reference' ->> 'placement_kind') = 'tracking_reference', 'null expected revision creates reference after primary revision changed');
select public.dev095_assert((select count(*) from public.wbs_item_placements where placement_kind = 'tracking_reference' and removed_at is null) = 2, 'null expected revision keeps both references');

select public.move_task_tracking_reference_v1(:'move_op', :'reference_id', array[(:'reference_id')::uuid], 1, :'target_project_id'::uuid, 'primary:' || :'target_root_id', null, 'append-child', 'isolated', :'tenant_id'::uuid) as move_result \gset
select public.dev095_assert((:'move_result'::jsonb -> 'reference' ->> 'project_id') = :'target_project_id', 'move crosses boards within workspace');
select public.dev095_assert((select parent_placement_id = (select id from public.wbs_item_placements where task_id = :'target_root_id'::uuid and placement_kind = 'primary' and removed_at is null) from public.wbs_item_placements where id = :'reference_id'::uuid), 'move updates target parent');
select public.dev095_assert((select project_id from public.wbs_item_placements where id = :'reference_id'::uuid) = :'target_project_id'::uuid, 'move leaves canonical task source project unchanged');
select public.dev095_assert((select project_id from public.wbs_items where id = :'root_id'::uuid) = :'source_project_id'::uuid, 'canonical task ownership unchanged');
select public.dev095_assert(jsonb_array_length(public.get_board_task_projection_v1(:'tenant_id'::uuid, :'target_project_id'::uuid)) = 2, 'projection RPC returns target primary and reference');

-- A future target-board viewer gains derived read only after the reference is
-- present.  Every direct mutation path remains denied by RLS/RPC capability.
set request.jwt.claim.sub = :'future_viewer_id';
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 1, 'future viewer reads canonical task via reference');
select public.dev095_assert((select count(*) from public.wbs_item_placements where id = current_setting('dev095.reference_id')::uuid and removed_at is null) = 1, 'future viewer reads target placement');
do $$
begin
  update public.wbs_items set title = 'future viewer must not edit' where id = '40000000-0000-4000-8000-000000000010'::uuid;
  if found then raise exception 'expected future viewer canonical update denial'; end if;
exception when insufficient_privilege then null;
end $$;
do $$
begin
  delete from public.wbs_items where id = '40000000-0000-4000-8000-000000000010'::uuid;
  if found then raise exception 'expected future viewer canonical delete denial'; end if;
exception when insufficient_privilege then null;
end $$;
do $$
begin
  insert into public.wbs_item_placements (tenant_id, task_id, project_id, placement_kind, created_by)
  values ('10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000010'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, 'tracking_reference', '30000000-0000-4000-8000-000000000006'::uuid);
  raise exception 'expected future viewer placement insert denial';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  update public.wbs_item_placements set sort_order = sort_order + 1 where id = current_setting('dev095.reference_id')::uuid;
  if found then raise exception 'expected future viewer placement update denial'; end if;
exception when insufficient_privilege then null;
end $$;
do $$
begin
  delete from public.wbs_item_placements where id = current_setting('dev095.reference_id')::uuid;
  if found then raise exception 'expected future viewer placement delete denial'; end if;
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.remove_task_tracking_reference_v1('80000000-0000-0000-0000-000000000057', current_setting('dev095.reference_id'), array[current_setting('dev095.reference_id')::uuid], 2, 'future-viewer', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected future viewer RPC mutation denial';
exception when insufficient_privilege then null;
end $$;

-- Membership removal revokes the derived read immediately; re-joining the
-- target board restores it while the reference remains active.
delete from public.project_members where project_id = :'target_project_id'::uuid and user_id = :'future_viewer_id'::uuid;
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 0, 'future viewer loses read after target membership removal');
insert into public.project_members (project_id, tenant_id, user_id, role)
values (:'target_project_id'::uuid, :'tenant_id'::uuid, :'future_viewer_id'::uuid, 'viewer');
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 1, 'future viewer regains read after target membership restore');

-- A user in another tenant never sees or mutates the reference path.
set request.jwt.claim.sub = :'foreign_user_id';
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 0, 'foreign tenant cannot read canonical task');
select public.dev095_assert(jsonb_array_length(public.list_task_tracking_references_v1(:'tenant_id'::uuid)) = 0, 'foreign tenant cannot list references');
do $$
begin
  perform public.create_task_tracking_reference_v1('80000000-0000-4000-8000-000000000061', 'primary:' || 'root-dev095', 1, 'foreign-tenant', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected foreign tenant create denial';
exception when insufficient_privilege then null;
end $$;
set request.jwt.claim.sub = :'owner_id';

set request.jwt.claim.sub = :'member_id';
insert into public.board_role_permissions (tenant_id, project_id, role, capabilities)
values (:'tenant_id'::uuid, :'source_project_id'::uuid, 'member', array['read_board'])
on conflict (tenant_id, project_id, role) do update set capabilities = excluded.capabilities, updated_at = now();
do $$
begin
  update public.wbs_items set title = '不應改名' where id = '40000000-0000-4000-8000-000000000010'::uuid;
  if found then raise exception 'expected canonical edit denial'; end if;
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.move_task_tracking_reference_v1('80000000-0000-0000-0000-000000000058', current_setting('dev095.reference_id'), array[current_setting('dev095.reference_id')::uuid], 2, '20000000-0000-4000-8000-000000000003'::uuid, null, null, 'append-root', 'target-manage-denied', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected target capability denial';
exception when insufficient_privilege then null;
end $$;
delete from public.board_role_permissions
where tenant_id = :'tenant_id'::uuid and project_id = :'source_project_id'::uuid and role = 'member';
set request.jwt.claim.sub = :'owner_id';

do $$
begin
  perform public.move_task_tracking_reference_v1('80000000-0000-4000-8000-000000000056', current_setting('dev095.reference_id'), array[current_setting('dev095.reference_id')::uuid], 1, '20000000-0000-4000-8000-000000000002'::uuid, null, null, 'append-root', 'stale', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected stale revision failure';
exception when others then
  if position('revision' in lower(sqlerrm)) = 0 then raise; end if;
end $$;

-- Target-board member can read the projection, but a viewer cannot mutate it
-- and cannot update the canonical task through the derived path.
set request.jwt.claim.sub = :'viewer_id';
select public.dev095_assert((select count(*) from public.wbs_item_placements where project_id = :'target_project_id'::uuid and placement_kind = 'tracking_reference' and removed_at is null) = 1, 'target member can read active placement');
do $$
begin
  perform public.remove_task_tracking_reference_v1('80000000-0000-0000-0000-000000000057', current_setting('dev095.reference_id'), array[current_setting('dev095.reference_id')::uuid], 2, 'viewer', '10000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'expected derived-only remove denial';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  update public.wbs_items set title = '越權改名' where id = '40000000-0000-4000-8000-000000000010'::uuid;
  if found then raise exception 'expected derived-only canonical update denial'; end if;
exception when insufficient_privilege then null;
end $$;

set request.jwt.claim.sub = :'owner_id';
select public.remove_task_tracking_reference_v1(:'remove_op', :'reference_id', array[(:'reference_id')::uuid], 2, 'isolated', :'tenant_id'::uuid) as remove_result \gset
-- The active-placement RLS policy intentionally hides removed rows from the
-- authenticated projection. Inspect the tombstone as the disposable DB owner.
set role postgres;
select public.dev095_assert((select removed_at is not null from public.wbs_item_placements where id = :'reference_id'::uuid), 'remove soft-removes reference revision=' || coalesce((select revision::text from public.wbs_item_placements where id = :'reference_id'::uuid), 'missing') || ' removed=' || coalesce((select removed_at::text from public.wbs_item_placements where id = :'reference_id'::uuid), 'null'));
set role authenticated;
select public.dev095_assert((select count(*) from public.wbs_item_placements where project_id = :'target_project_id'::uuid and placement_kind = 'tracking_reference' and removed_at is null) = 0, 'last reference removal hides projection');
set request.jwt.claim.sub = :'future_viewer_id';
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 0, 'last reference removal revokes future viewer read');
set request.jwt.claim.sub = :'owner_id';
select public.restore_task_tracking_reference_v1(:'restore_op', :'reference_id', 3, 'isolated', :'tenant_id'::uuid) as restore_result \gset
select public.dev095_assert((select removed_at is null from public.wbs_item_placements where id = :'reference_id'::uuid), 'restore reactivates original placement');
select public.remove_task_tracking_reference_v1(:'remove_null_revision_op', :'null_revision_reference_id', array[(:'null_revision_reference_id')::uuid], 1, 'isolated', :'tenant_id'::uuid);
set role postgres;
select public.dev095_assert((select removed_at is not null from public.wbs_item_placements where id = :'null_revision_reference_id'::uuid), 'null revision reference cleanup');
set role authenticated;

-- Trigger rejects putting a tracked canonical task in the account-unplaced lane.
do $$
begin
  insert into public.task_workbench_unplaced_items (owner_id, id, workspace_id, task)
  values ('30000000-0000-4000-8000-000000000003'::uuid, '40000000-0000-4000-8000-000000000010', 'workspace-dev095', jsonb_build_object('id', '40000000-0000-4000-8000-000000000010'));
  raise exception 'expected tracked task unplaced rejection';
exception when others then
  if sqlerrm <> 'TRACKING_REFERENCE_BLOCKS_UNPLACED' then raise; end if;
end $$;
select public.dev095_assert((select count(*) from public.task_workbench_unplaced_items where id = :'root_id') = 0, 'unplaced rejection is atomic');

select 'DEV095_RESULT=' || (jsonb_build_object(
  'dev', 'DEV-095',
  'passed', true,
  'status', 'passed',
  'checks', jsonb_build_object(
    'freshMigration', true,
    'primaryBackfill', true,
    'createIdempotencyAndDuplicate', true,
    'crossBoardMoveAndCanonicalOwnership', true,
    'staleRevision', true,
    'derivedReadAndMutationBoundary', true,
    'futureViewerReadRevoke', true,
    'tenantIsolation', true,
    'privateHelperBoundary', true,
    'customCapabilityBoundary', true,
    'removeRestore', true,
    'trackedTaskUnplacedBlock', true
  ))::text);
