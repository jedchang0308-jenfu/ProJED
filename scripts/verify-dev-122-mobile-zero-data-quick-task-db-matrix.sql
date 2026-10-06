\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create temp table dev122_results (
  id text primary key,
  passed boolean not null,
  detail text not null default ''
);
grant select, insert, update on dev122_results to authenticated;

create or replace function pg_temp.record_result(p_id text, p_passed boolean, p_detail text default '')
returns void
language sql
as $$
  insert into dev122_results(id, passed, detail) values (p_id, p_passed, coalesce(p_detail, ''))
  on conflict (id) do update set passed = excluded.passed, detail = excluded.detail;
$$;

create or replace function pg_temp.expect_error(p_command text, p_expected text)
returns boolean
language plpgsql
as $$
begin
  execute p_command;
  return false;
exception when others then
  return sqlerrm = p_expected;
end;
$$;

-- P01: privilege, RLS and security-invoker contract.
select pg_temp.record_result(
  'P01',
  has_function_privilege('anon', 'public.create_quick_unplaced_task_v1(text,text,text)', 'EXECUTE') = false
    and has_function_privilege('authenticated', 'public.create_quick_unplaced_task_v1(text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.create_quick_unplaced_task_v1(text,text,text)', 'EXECUTE')
    and (select prosecdef = false and array_to_string(coalesce(proconfig, '{}'), ',') like 'search_path=%' from pg_proc where oid = 'public.create_quick_unplaced_task_v1(text,text,text)'::regprocedure)
    and (select relrowsecurity from pg_class where oid = 'private.quick_task_capture_receipts'::regclass)
    and has_table_privilege('authenticated', 'private.quick_task_capture_receipts', 'SELECT,INSERT')
    and has_table_privilege('authenticated', 'private.quick_task_capture_receipts', 'UPDATE') = false
    and has_table_privilege('authenticated', 'private.quick_task_capture_receipts', 'DELETE') = false,
  'privilege/RLS/security-invoker checks'
);

-- Fixtures are installed by the superuser, then every product call runs under
-- the authenticated role with a request.jwt.claim.sub value.
reset role;
truncate table private.quick_task_capture_receipts, public.task_workbench_unplaced_items, public.tenant_members, public.tenants, public.profiles cascade;
insert into public.profiles(id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test', 'A'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test', 'B'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.test', 'C');
insert into public.tenants(id, name, legacy_workspace_id, owner_id, updated_at) values
  ('00000000-0000-0000-0000-0000000000a2', 'A2', 'workspace-a2', '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'A3', 'workspace-a3', '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'B1', 'workspace-b1', '00000000-0000-0000-0000-0000000000b1', now());
insert into public.tenant_members(tenant_id, user_id, status, updated_at) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'active', now()),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'active', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'active', now());

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select pg_temp.record_result('P02-auth',
  pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1(null, 'x', null)$q$, 'QT_AUTH_REQUIRED'),
  'auth-required is checked by the invoker role');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select pg_temp.record_result('P02-input',
  pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('bad', 'x', null)$q$, 'QT_INVALID_CAPTURE_ID')
  and pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000aa', '   ', null)$q$, 'QT_INVALID_TITLE')
  and pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000ab', repeat('x', 501), null)$q$, 'QT_INVALID_TITLE'),
  'auth/id/title stable errors'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare
  v_first jsonb;
  v_replay jsonb;
  v_id text := 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000aa';
  v_same_ms bigint;
  v_task jsonb;
begin
  v_first := public.create_quick_unplaced_task_v1(v_id, E'  現場\n確認 🚧  ', 'workspace-a2');
  v_same_ms := (v_first->>'committedAt')::bigint;
  select task into v_task from public.task_workbench_unplaced_items where owner_id = auth.uid() and id = v_id;
  perform pg_temp.record_result('P03',
    coalesce(v_first->>'created' = 'true' and (v_first->>'ownerId')::uuid = auth.uid(), false),
    'hinted active membership and owner are server selected: ' || coalesce(v_first::text, 'null'));
  perform pg_temp.record_result('P04',
    coalesce((select owner_id = auth.uid() and workspace_id = 'workspace-a2' from public.task_workbench_unplaced_items where id = v_id), false),
    'owner and workspace fields are canonical server output');
  perform pg_temp.record_result('P09',
    coalesce((v_task ? 'description') = false
      and jsonb_array_length(v_task->'detailNotes') = 2
      and (v_task->>'createdAt')::bigint = (v_task->>'updatedAt')::bigint
      and v_task->>'title' = E'現場\n確認 🚧', false),
    'blank task payload parity');
  v_replay := public.create_quick_unplaced_task_v1(v_id, E'現場\n確認 🚧', 'workspace-a3');
  perform pg_temp.record_result('P05',
    v_replay->>'created' = 'false' and (v_replay->>'committedAt')::bigint = v_same_ms,
    'same id/title is an immutable replay');
  perform pg_temp.record_result('P05-hash-conflict',
    pg_temp.expect_error(format($q$select public.create_quick_unplaced_task_v1(%L, %L, null)$q$, v_id, 'different'), 'QT_IDEMPOTENCY_CONFLICT'),
    'different title hash cannot replay');
end;
$$;

-- P06: pre-existing id collision and integer order exhaustion fail closed.
reset role;
insert into public.task_workbench_unplaced_items(owner_id, id, workspace_id, task, sort_order)
values ('00000000-0000-0000-0000-0000000000a1', 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000ac', 'workspace-a2', '{}'::jsonb, 0);
set role authenticated;
select pg_temp.record_result('P06-collision',
  pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000ac', 'new', null)$q$, 'QT_EXISTING_ROW_INVALID'),
  'collision without receipt has stable error');
reset role;
delete from public.task_workbench_unplaced_items where id = 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000ac';
insert into public.task_workbench_unplaced_items(owner_id, id, workspace_id, task, sort_order)
values ('00000000-0000-0000-0000-0000000000a1', 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000ad', 'workspace-a2', '{}'::jsonb, 2147483647);
set role authenticated;
select pg_temp.record_result('P06-order',
  pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000ae', 'new', null)$q$, 'QT_ORDER_EXHAUSTED'),
  'near-int32 order has stable error');

-- P07: the owner advisory lock and append order are exercised with a 20-item
-- isolated fixture. Concurrent transport is covered by the lock contract and
-- remains a separate multi-session device gate.
reset role;
delete from private.quick_task_capture_receipts where owner_id = '00000000-0000-0000-0000-0000000000a1';
delete from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
do $$
declare
  i integer;
begin
  for i in 0..19 loop
    perform public.create_quick_unplaced_task_v1(
      format('task_workbench_unplaced_00000000-0000-0000-0000-%s', lpad(to_hex(200 + i), 12, '0')),
      format('DEV122-QA-%s', i), 'workspace-a2'
    );
  end loop;
  perform pg_temp.record_result('P07-order-core',
    coalesce((select count(*) = 20 and count(distinct sort_order) = 20 and min(sort_order) = 0 and max(sort_order) = 19
       from public.task_workbench_unplaced_items where owner_id = auth.uid()), false),
    '20 unique append orders under owner advisory lock');
end;
$$;

-- P08 and P13: RLS and private receipt grants are owner scoped.
select pg_temp.record_result('P08-A',
  (select count(*) = 0 from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000b1')
    and (select count(*) = 0 from private.quick_task_capture_receipts where owner_id = '00000000-0000-0000-0000-0000000000b1'),
  'A cannot read B rows');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select pg_temp.record_result('P08-B',
  (select count(*) = 0 from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1')
    and (select count(*) = 0 from private.quick_task_capture_receipts where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'B cannot read A rows');
select pg_temp.record_result('P13-grant-core',
  has_table_privilege('authenticated', 'private.quick_task_capture_receipts', 'SELECT,INSERT')
    and not has_table_privilege('authenticated', 'private.quick_task_capture_receipts', 'UPDATE')
    and not has_table_privilege('authenticated', 'private.quick_task_capture_receipts', 'DELETE'),
  'private receipt is append/read only');

-- P11: owner/order index exists; the full EXPLAIN/performance review remains
-- an explicit artifact in the final QA gate.
reset role;
select pg_temp.record_result('P11-index-core',
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'task_workbench_unplaced_items_owner_order_idx'),
  'owner/order index exists');
do $$
declare
  v_plan jsonb;
  v_plan_text text;
begin
  execute $q$explain (format json, costs off)
    select sort_order
      from public.task_workbench_unplaced_items
     where owner_id = '00000000-0000-0000-0000-0000000000a1'
     order by sort_order desc
     limit 1$q$ into v_plan;
  v_plan_text := v_plan::text;
  perform pg_temp.record_result('P11-plan',
    v_plan_text like '%Index%' and v_plan_text not like '%Sort%',
    'max-order EXPLAIN=' || v_plan_text);
end;
$$;

-- P12: task mutation/deletion never removes the immutable receipt replay fact.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare
  v_id text := 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000f1';
  v_replay jsonb;
begin
  v_replay := public.create_quick_unplaced_task_v1(v_id, 'replay-me', 'workspace-a2');
  update public.task_workbench_unplaced_items set task = jsonb_set(task, '{title}', '"renamed"') where owner_id = auth.uid() and id = v_id;
  v_replay := public.create_quick_unplaced_task_v1(v_id, 'replay-me', null);
  perform pg_temp.record_result('P12-rename', v_replay->>'created' = 'false', 'rename remains receipt replay');
  delete from public.task_workbench_unplaced_items where owner_id = auth.uid() and id = v_id;
  v_replay := public.create_quick_unplaced_task_v1(v_id, 'replay-me', null);
  perform pg_temp.record_result('P12-delete', v_replay->>'created' = 'false' and not exists (select 1 from public.task_workbench_unplaced_items where id = v_id), 'delete does not resurrect task');
end;
$$;
reset role;
delete from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select pg_temp.record_result('P12-membership',
  (public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000f1', 'replay-me', null)->>'created') = 'false',
  'receipt replay precedes membership lookup');

reset role;
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.record_result('P13-cascade',
  not exists (select 1 from private.quick_task_capture_receipts where owner_id = '00000000-0000-0000-0000-0000000000a1')
    and not exists (select 1 from public.task_workbench_unplaced_items where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  'profile deletion cascades private receipt and task rows');

-- P14: force each second write to fail and prove the first write rolled back.
reset role;
create or replace function public.dev122_test_fail_receipt()
returns trigger language plpgsql as $$ begin raise exception using message = 'QT_TEST_RECEIPT_FAILURE'; end; $$;
create trigger dev122_test_fail_receipt before insert on private.quick_task_capture_receipts
  for each row execute function public.dev122_test_fail_receipt();
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select pg_temp.record_result('P14-task-rollback',
  pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000f2', 'rollback', 'workspace-b1')$q$, 'QT_TEST_RECEIPT_FAILURE')
    and not exists (select 1 from public.task_workbench_unplaced_items where id = 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000f2'),
  'receipt failure rolls back task');
reset role;
drop trigger dev122_test_fail_receipt on private.quick_task_capture_receipts;
drop function public.dev122_test_fail_receipt();
create or replace function public.dev122_test_fail_task()
returns trigger language plpgsql as $$ begin raise exception using message = 'QT_TEST_TASK_FAILURE'; end; $$;
create trigger dev122_test_fail_task before insert on public.task_workbench_unplaced_items
  for each row execute function public.dev122_test_fail_task();
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select pg_temp.record_result('P14-receipt-rollback',
  pg_temp.expect_error($q$select public.create_quick_unplaced_task_v1('task_workbench_unplaced_00000000-0000-0000-0000-0000000000f3', 'rollback', 'workspace-b1')$q$, 'QT_TEST_TASK_FAILURE')
    and not exists (select 1 from private.quick_task_capture_receipts where capture_id = 'task_workbench_unplaced_00000000-0000-0000-0000-0000000000f3'),
  'task failure rolls back receipt');
reset role;
drop trigger dev122_test_fail_task on public.task_workbench_unplaced_items;
drop function public.dev122_test_fail_task();

select 'DEV122_RESULT=' || jsonb_build_object(
  'passed', bool_and(passed),
  'checks', jsonb_object_agg(id, jsonb_build_object('status', case when passed then 'PASS' else 'FAIL' end, 'detail', detail)),
  'summary', jsonb_build_object('PASS', count(*) filter (where passed), 'FAIL', count(*) filter (where not passed), 'NOT_RUN', 0, 'BLOCKED', 0)
)::text
from dev122_results;
