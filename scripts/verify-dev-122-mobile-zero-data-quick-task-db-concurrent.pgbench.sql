set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.create_quick_unplaced_task_v1(
  format('task_workbench_unplaced_00000000-0000-0000-0000-%s', lpad(to_hex(300 + :client_id), 12, '0')),
  format('DEV122-CONCURRENT-%s', :client_id),
  'workspace-a2'
);
