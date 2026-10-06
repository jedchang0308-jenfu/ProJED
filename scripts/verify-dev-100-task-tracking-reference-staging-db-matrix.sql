\set ON_ERROR_STOP on
\set tenant_id '10000000-0000-4000-8000-000000000001'
\set source_project_id '20000000-0000-4000-8000-000000000002'
\set target_project_id '20000000-0000-4000-8000-000000000003'
\set owner_id '30000000-0000-4000-8000-000000000003'
\set viewer_id '30000000-0000-4000-8000-000000000004'
\set root_id '40000000-0000-4000-8000-000000000010'

select public.dev095_assert(to_regclass('public.task_tracking_reference_staging') is not null, 'staging table exists');
select public.dev095_assert(has_function_privilege('authenticated', 'public.stage_task_tracking_reference_v1(text,text,uuid[],bigint,text,uuid)', 'execute'), 'stage RPC grant');
select public.dev095_assert(has_function_privilege('authenticated', 'public.place_staged_task_tracking_reference_v1(text,text,bigint,uuid,text,text,text,text,uuid)', 'execute'), 'place RPC grant');
select public.dev095_assert(not has_table_privilege('authenticated', 'public.task_tracking_reference_staging', 'select'), 'staging table has no direct authenticated read');

set request.jwt.claim.sub = :'owner_id';
set role authenticated;
select public.create_task_tracking_reference_v1(
  'dev100-create',
  'primary:' || :'root_id',
  1,
  'isolated',
  :'tenant_id'::uuid
) as create_result \gset
select (:'create_result'::jsonb -> 'reference' ->> 'id') as reference_id \gset
select set_config('dev100.reference_id', :'reference_id', false);

select public.stage_task_tracking_reference_v1(
  'dev100-stage',
  :'reference_id',
  array[:'reference_id'::uuid],
  1,
  'isolated',
  :'tenant_id'::uuid
) as stage_result \gset
select public.dev095_assert((:'stage_result'::jsonb -> 'reference' ->> 'id') = :'reference_id', 'stage preserves placement id');
select public.dev095_assert(jsonb_array_length(public.list_task_tracking_references_v1(:'tenant_id'::uuid)) = 0, 'staged reference leaves active projection');
select public.dev095_assert(jsonb_array_length(public.list_task_tracking_reference_staging_v1(:'tenant_id'::uuid)) = 1, 'owner lists staged reference');

set role postgres;
delete from public.project_members
where tenant_id = :'tenant_id'::uuid and project_id = :'source_project_id'::uuid and user_id = :'owner_id'::uuid;
set role authenticated;
select public.dev095_assert((select count(*) from public.wbs_items where id = :'root_id'::uuid) = 1, 'staging owner retains canonical derived read');

select public.place_staged_task_tracking_reference_v1(
  'dev100-place',
  :'reference_id',
  2,
  :'target_project_id'::uuid,
  null,
  null,
  'append',
  'isolated',
  :'tenant_id'::uuid
) as place_result \gset
select public.dev095_assert((:'place_result'::jsonb -> 'reference' ->> 'id') = :'reference_id', 'place reactivates same placement id');
select public.dev095_assert((:'place_result'::jsonb -> 'reference' ->> 'project_id') = :'target_project_id', 'place moves reference to target Board');
select public.dev095_assert(jsonb_array_length(public.list_task_tracking_reference_staging_v1(:'tenant_id'::uuid)) = 0, 'place consumes staging record');
select public.dev095_assert(jsonb_array_length(public.list_task_tracking_references_v1(:'tenant_id'::uuid)) = 1, 'place restores active projection');
select public.dev095_assert((select project_id from public.wbs_items where id = :'root_id'::uuid) = :'source_project_id'::uuid, 'canonical ownership remains on source Board');

select public.stage_task_tracking_reference_v1(
  'dev100-stage-again',
  :'reference_id',
  array[:'reference_id'::uuid],
  3,
  'isolated',
  :'tenant_id'::uuid
);
set request.jwt.claim.sub = :'viewer_id';
select public.dev095_assert(jsonb_array_length(public.list_task_tracking_reference_staging_v1(:'tenant_id'::uuid)) = 0, 'another account cannot list owner staging');
do $$
begin
  perform public.place_staged_task_tracking_reference_v1(
    'dev100-viewer-place',
    current_setting('dev100.reference_id', true),
    4,
    '20000000-0000-4000-8000-000000000003'::uuid,
    null,
    null,
    'append',
    'isolated',
    '10000000-0000-4000-8000-000000000001'::uuid
  );
  raise exception 'expected staged owner isolation';
exception when others then
  if sqlerrm <> 'STAGED_REFERENCE_NOT_FOUND' then raise; end if;
end $$;

set role postgres;
insert into public.project_members (project_id, tenant_id, user_id, role)
values (:'source_project_id'::uuid, :'tenant_id'::uuid, :'owner_id'::uuid, 'owner');
select set_config('request.jwt.claim.sub', :'owner_id', false);
set role authenticated;
select public.place_staged_task_tracking_reference_v1(
  'dev100-place-back',
  :'reference_id',
  4,
  :'source_project_id'::uuid,
  null,
  null,
  'append',
  'isolated',
  :'tenant_id'::uuid
);

select 'DEV100_RESULT=' || jsonb_build_object(
  'passed', true,
  'checks', jsonb_build_object(
    'migration', true,
    'samePlacementIdentity', true,
    'canonicalOwnership', true,
    'ownerIsolation', true,
    'derivedReadWhileStaged', true,
    'crossBoardPlace', true
  )
)::text;
