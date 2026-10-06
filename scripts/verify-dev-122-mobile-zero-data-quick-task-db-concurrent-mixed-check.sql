\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
select 'DEV122_MIXED=' || jsonb_build_object(
  'passed', coalesce((select count(*) = 40
      and count(distinct sort_order) = 40
      and min(sort_order) = 0
      and max(sort_order) = 39
      and count(*) filter (where task ->> 'title' like 'DEV122-MIXED-QUICK-%') = 20
      and count(*) filter (where task ->> 'title' like 'DEV122-MIXED-EXISTING-%') = 20
    from public.task_workbench_unplaced_items
   where owner_id = '00000000-0000-0000-0000-0000000000a1'), false),
  'rows', (select count(*) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'distinctOrders', (select count(distinct sort_order) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'minOrder', (select min(sort_order) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'maxOrder', (select max(sort_order) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'quickRows', (select count(*) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1' and task ->> 'title' like 'DEV122-MIXED-QUICK-%'),
  'existingWriterRows', (select count(*) from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1' and task ->> 'title' like 'DEV122-MIXED-EXISTING-%')
)::text;
