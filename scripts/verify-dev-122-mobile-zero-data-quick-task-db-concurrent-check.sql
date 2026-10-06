\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
select 'DEV122_CONCURRENT=' || jsonb_build_object(
  'passed', coalesce((select count(*) = 20 and count(distinct sort_order) = 20 and min(sort_order) = 0 and max(sort_order) = 19
    from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'), false),
  'rows', (select count(*) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'distinctOrders', (select count(distinct sort_order) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'minOrder', (select min(sort_order) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'maxOrder', (select max(sort_order) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1')
)::text;
