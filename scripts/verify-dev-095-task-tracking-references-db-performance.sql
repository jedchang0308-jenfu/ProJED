-- DEV-095 disposable performance evidence.  The caller owns a fresh local
-- PostgreSQL runtime; this file never targets Supabase or another remote DB.
\set ON_ERROR_STOP on
\set perf_tenant '50000000-0000-4000-8000-000000000001'
\set perf_source_project '60000000-0000-4000-8000-000000000001'
\set perf_target_project_1 '60000000-0000-4000-8000-000000000002'
\set perf_target_project_2 '60000000-0000-4000-8000-000000000003'
\set perf_target_project_3 '60000000-0000-4000-8000-000000000004'
\set perf_owner '30000000-0000-4000-8000-000000000003'

set role postgres;
insert into public.tenants (id, name, legacy_workspace_id)
values (:'perf_tenant'::uuid, 'DEV-095 performance tenant', 'workspace-dev095-performance');
insert into public.tenant_members (tenant_id, user_id, role)
values (:'perf_tenant'::uuid, :'perf_owner'::uuid, 'owner');
insert into public.projects (id, tenant_id, name)
values
  (:'perf_source_project'::uuid, :'perf_tenant'::uuid, 'performance-source'),
  (:'perf_target_project_1'::uuid, :'perf_tenant'::uuid, 'performance-target-1'),
  (:'perf_target_project_2'::uuid, :'perf_tenant'::uuid, 'performance-target-2'),
  (:'perf_target_project_3'::uuid, :'perf_tenant'::uuid, 'performance-target-3');
insert into public.project_members (project_id, tenant_id, user_id, role)
select project_id, :'perf_tenant'::uuid, :'perf_owner'::uuid, 'owner'
from (values
  (:'perf_source_project'::uuid),
  (:'perf_target_project_1'::uuid),
  (:'perf_target_project_2'::uuid),
  (:'perf_target_project_3'::uuid)
) projects(project_id);

insert into public.wbs_items (
  id, tenant_id, project_id, parent_id, legacy_node_id, title, status,
  item_type, sort_order, created_by, is_archived
)
select
  extensions.gen_random_uuid(),
  :'perf_tenant'::uuid,
  :'perf_source_project'::uuid,
  null,
  'perf-task-' || n,
  'Performance task ' || n,
  'todo',
  'task',
  n,
  :'perf_owner'::uuid,
  false
from generate_series(1, 10000) as series(n);

-- 10k canonical tasks + 15k non-owning placements = 25k placement rows.
-- Each target project receives 5k references, exercising the active-project
-- and active-task partial indexes without changing canonical ownership.
insert into public.wbs_item_placements (
  tenant_id, task_id, project_id, placement_kind, sort_order, created_by
)
select
  :'perf_tenant'::uuid,
  tasks.id,
  targets.project_id,
  'tracking_reference',
  tasks.row_number,
  :'perf_owner'::uuid
from (
  select id, row_number() over (order by id)::bigint as row_number
  from public.wbs_items
  where tenant_id = :'perf_tenant'::uuid and project_id = :'perf_source_project'::uuid
) tasks
cross join (values
  (:'perf_target_project_1'::uuid),
  (:'perf_target_project_2'::uuid),
  (:'perf_target_project_3'::uuid)
) targets(project_id)
where tasks.row_number <= 5000;

select 'DEV095_PERF_FIXTURE=' || jsonb_build_object(
  'tasks', (select count(*) from public.wbs_items where tenant_id = :'perf_tenant'::uuid),
  'placements', (select count(*) from public.wbs_item_placements where tenant_id = :'perf_tenant'::uuid),
  'activeReferences', (select count(*) from public.wbs_item_placements where tenant_id = :'perf_tenant'::uuid and placement_kind = 'tracking_reference' and removed_at is null),
  'indexes', jsonb_build_array('wbs_item_placements_active_project_order', 'wbs_item_placements_active_task', 'wbs_items_active_project_task')
)::text;

-- Run plans as an authenticated owner so the RLS predicates and security
-- definer helpers are included in the measured path.
set request.jwt.claim.sub = :'perf_owner';
set role authenticated;
set statement_timeout = '60s';

\echo DEV095_PERF_PLAN=projection
explain (analyze, buffers)
select p.id, p.task_id, p.parent_placement_id, p.sort_order
from public.wbs_item_placements p
where p.tenant_id = :'perf_tenant'::uuid
  and p.project_id = :'perf_target_project_1'::uuid
  and p.placement_kind = 'tracking_reference'
  and p.removed_at is null
order by p.parent_placement_id, p.sort_order, p.id
limit 100;

\echo DEV095_PERF_PLAN=rpc-projection
explain (analyze, buffers)
select jsonb_array_length(public.get_board_task_projection_v1(
  :'perf_tenant'::uuid,
  :'perf_target_project_1'::uuid
));

\echo DEV095_PERF_PLAN=visibility
explain (analyze, buffers)
select wi.id, wi.title, wi.status
from public.wbs_items wi
  where wi.tenant_id = :'perf_tenant'::uuid
    and wi.project_id = :'perf_source_project'::uuid
  and not wi.is_archived
limit 100;

\echo DEV095_PERF_PLAN=last-reference-revoke
explain (analyze, buffers)
select exists (
  select 1
  from public.wbs_item_placements p
  where p.tenant_id = :'perf_tenant'::uuid
    and p.task_id = (
      select wi.id from public.wbs_items wi
      where wi.tenant_id = :'perf_tenant'::uuid
        and wi.project_id = :'perf_source_project'::uuid
      order by wi.id
      limit 1
    )
    and p.placement_kind = 'tracking_reference'
    and p.removed_at is null
);

select 'DEV095_PERF_RESULT=' || jsonb_build_object(
  'status', 'passed',
  'tasks', (select count(*) from public.wbs_items where tenant_id = :'perf_tenant'::uuid),
  'placements', (select count(*) from public.wbs_item_placements where tenant_id = :'perf_tenant'::uuid),
  'plans', jsonb_build_array('projection', 'rpc-projection', 'visibility', 'last-reference-revoke'),
  'indexes', jsonb_build_array('wbs_item_placements_active_project_order', 'wbs_item_placements_active_task', 'wbs_items_active_project_task')
)::text;
