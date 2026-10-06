\set ON_ERROR_STOP on

select public.dev090_assert(
  to_regclass('public.account_board_task_filter_preferences') is not null,
  'preference table exists'
);
select public.dev090_assert(
  (select relrowsecurity from pg_class where oid = 'public.account_board_task_filter_preferences'::regclass),
  'RLS enabled'
);
select public.dev090_assert(
  (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'account_board_task_filter_preferences'),
  'four operation-specific policies exist'
);
select public.dev090_assert(
  has_table_privilege('authenticated', 'public.account_board_task_filter_preferences', 'select,insert,update,delete'),
  'authenticated CRUD grants exist'
);
select public.dev090_assert(
  not has_table_privilege('anon', 'public.account_board_task_filter_preferences', 'select')
  and not has_table_privilege('anon', 'public.account_board_task_filter_preferences', 'insert')
  and not has_table_privilege('anon', 'public.account_board_task_filter_preferences', 'update')
  and not has_table_privilege('anon', 'public.account_board_task_filter_preferences', 'delete'),
  'anon has no table privilege'
);
select public.dev090_assert(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'account_board_task_filter_preferences'
      and indexname = 'account_board_task_filter_preferences_project_id_idx'
  ),
  'project cleanup index exists'
);
select public.dev090_assert(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.account_board_task_filter_preferences'::regclass
      and tgname = 'account_board_task_filter_preferences_touch_updated_at'
      and not tgisinternal
  ),
  'updated_at trigger exists'
);

insert into public.profiles(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

insert into public.projects(id, tenant_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '99999999-9999-4999-8999-999999999999');

insert into private.readable_projects(account_id, project_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set role authenticated;

insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  4,
  '{"statusFilters":{"todo":true,"completed":true},"keyword":"owner"}'::jsonb
);
select public.dev090_assert(
  (select count(*) = 1 from public.account_board_task_filter_preferences),
  'owner can select own readable preference'
);
select pg_sleep(0.02);
update public.account_board_task_filter_preferences
set filters = '{"statusFilters":{"todo":true,"completed":true},"keyword":"updated"}'::jsonb
where account_id = auth.uid()
  and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select public.dev090_assert(
  (
    select updated_at > created_at
    from public.account_board_task_filter_preferences
    where account_id = auth.uid()
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'updated_at trigger advances timestamp'
);
delete from public.account_board_task_filter_preferences
where account_id = auth.uid()
  and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select public.dev090_assert(
  (select count(*) = 0 from public.account_board_task_filter_preferences),
  'reset deletes own row'
);

reset role;
insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 4, '{"keyword":"private-a"}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 4, '{"keyword":"inaccessible"}'::jsonb);

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set role authenticated;
select public.dev090_assert(
  (select count(*) = 0 from public.account_board_task_filter_preferences),
  'other account cannot select owner row'
);
with changed as (
  update public.account_board_task_filter_preferences
  set filters = '{"keyword":"forbidden"}'::jsonb
  where account_id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select public.dev090_assert((select count(*) = 0 from changed), 'other account update affects zero rows');
with removed as (
  delete from public.account_board_task_filter_preferences
  where account_id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select public.dev090_assert((select count(*) = 0 from removed), 'other account delete affects zero rows');
do $$
begin
  begin
    insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 4, '{}'::jsonb);
    raise exception 'other-account insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 4, '{"keyword":"viewer"}'::jsonb);
update public.account_board_task_filter_preferences
set filters = '{"keyword":"viewer-updated"}'::jsonb
where account_id = auth.uid()
  and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select public.dev090_assert(
  (
    select filters ->> 'keyword' = 'viewer-updated'
    from public.account_board_task_filter_preferences
    where account_id = auth.uid()
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'viewer can CRUD own readable preference'
);
do $$
begin
  begin
    insert into public.wbs_items(id, project_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
    raise exception 'task mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
delete from public.account_board_task_filter_preferences
where account_id = auth.uid()
  and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.dev090_assert(
  (
    select count(*) = 1
    from public.account_board_task_filter_preferences
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'owner sees own row but not inaccessible row'
);
do $$
begin
  begin
    insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 4, '{}'::jsonb);
    raise exception 'inaccessible-project insert unexpectedly succeeded';
  exception when unique_violation or insufficient_privilege then
    null;
  end;
end;
$$;
with changed as (
  update public.account_board_task_filter_preferences
  set filters = '{"keyword":"forbidden"}'::jsonb
  where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
  returning 1
)
select public.dev090_assert((select count(*) = 0 from changed), 'inaccessible-project update affects zero rows');

do $$
begin
  begin
    insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 0, '{}'::jsonb);
    raise exception 'version zero unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 4, '[]'::jsonb);
    raise exception 'non-object filters unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;
select public.dev090_assert(
  (
    select filters ->> 'keyword' = 'private-a'
    from public.account_board_task_filter_preferences
    where account_id = auth.uid()
      and project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'constraint failures preserve legal row'
);

reset role;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
set role anon;
do $$
begin
  begin
    perform * from public.account_board_task_filter_preferences;
    raise exception 'anon select unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
insert into public.account_board_task_filter_preferences(account_id, project_id, preference_version, filters)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 4, '{"keyword":"project-cascade"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 4, '{"keyword":"profile-cascade"}'::jsonb);
delete from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
select public.dev090_assert(
  not exists (
    select 1 from public.account_board_task_filter_preferences
    where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  ),
  'project delete cascades preference rows'
);
delete from public.profiles where id = '22222222-2222-4222-8222-222222222222';
select public.dev090_assert(
  not exists (
    select 1 from public.account_board_task_filter_preferences
    where account_id = '22222222-2222-4222-8222-222222222222'
  ),
  'profile delete cascades preference rows'
);

select 'DEV-090 isolated PostgreSQL schema/RLS matrix: passed' as result;
