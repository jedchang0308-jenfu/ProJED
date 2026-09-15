set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);

-- Even clients use the DEV-122 quick RPC. Odd clients call a test-only
-- invoker fixture that keeps the existing account-unplaced writer's scope lock
-- + max(order) + insert contract in one database transaction.
\if :client_id % 2 = 0
select public.create_quick_unplaced_task_v1(
  format('task_workbench_unplaced_00000000-0000-0000-0000-%s', lpad(to_hex(600 + :client_id), 12, '0')),
  format('DEV122-MIXED-QUICK-%s', :client_id),
  'workspace-a2'
);
\else
select public.dev122_mixed_existing_unplaced_append(
  format('task_workbench_unplaced_00000000-0000-0000-0000-%s', lpad(to_hex(700 + :client_id), 12, '0')),
  format('DEV122-MIXED-EXISTING-%s', :client_id),
  'workspace-a2'
);
\endif
