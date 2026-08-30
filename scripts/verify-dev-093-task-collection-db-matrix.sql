\set ON_ERROR_STOP on

-- Stable fixture IDs make the evidence reproducible and prevent accidental
-- writes outside this disposable database.
\set tenant_id '10000000-0000-4000-8000-000000000001'
\set project_id '20000000-0000-4000-8000-000000000002'
\set owner_id '30000000-0000-4000-8000-000000000003'
\set viewer_id '30000000-0000-4000-8000-000000000004'
\set root_id '40000000-0000-4000-8000-000000000010'
\set child_id '40000000-0000-4000-8000-000000000011'
\set external_id '40000000-0000-4000-8000-000000000012'
\set internal_dep_id '50000000-0000-4000-8000-000000000020'
\set boundary_dep_id '50000000-0000-4000-8000-000000000021'
\set root_event_id '60000000-0000-4000-8000-000000000030'
\set child_event_id '60000000-0000-4000-8000-000000000031'
\set meeting_id '70000000-0000-4000-8000-000000000040'
\set private_meeting_id '70000000-0000-4000-8000-000000000041'
\set draft_work_id '70000000-0000-4000-8000-000000000042'
\set operation_id '80000000-0000-4000-8000-000000000050'
\set changed_operation_id '80000000-0000-4000-8000-000000000051'
\set conflict_operation_id '80000000-0000-4000-8000-000000000052'

insert into public.tenant_members (tenant_id, user_id, role, status) values
  (:'tenant_id'::uuid, :'owner_id'::uuid, 'owner', 'active'),
  (:'tenant_id'::uuid, :'viewer_id'::uuid, 'viewer', 'active');
insert into public.projects (id, tenant_id, name) values (:'project_id'::uuid, :'tenant_id'::uuid, 'DEV-093 isolated board');
insert into public.project_members (project_id, tenant_id, user_id, role) values
  (:'project_id'::uuid, :'tenant_id'::uuid, :'owner_id'::uuid, 'owner'),
  (:'project_id'::uuid, :'tenant_id'::uuid, :'viewer_id'::uuid, 'viewer');
insert into public.board_role_permissions (tenant_id, project_id, role, capabilities) values
  (:'tenant_id'::uuid, :'project_id'::uuid, 'owner', array['delete_task']),
  (:'tenant_id'::uuid, :'project_id'::uuid, 'viewer', array['read_project'])
on conflict (tenant_id, project_id, role) do nothing;

insert into public.wbs_items (id, tenant_id, project_id, parent_id, legacy_node_id, title, description, status, item_type, sort_order, created_at, updated_at, is_archived) values
  (:'root_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, null, 'root-legacy', '根任務', 'root description', 'in_progress', 'task', 0, now() - interval '2 hours', now() - interval '1 hour', false),
  (:'child_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid, 'child-legacy', '已封存子任務', 'child description', 'completed', 'task', 0, now() - interval '2 hours', now() - interval '90 minutes', true),
  (:'external_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, null, 'external-legacy', '邊界任務', 'boundary description', 'todo', 'task', 1, now() - interval '2 hours', now() - interval '1 hour', false);

insert into public.wbs_item_tags (tenant_id, project_id, item_id, tag_id) values
  (:'tenant_id'::uuid, :'project_id'::uuid, :'child_id'::uuid, '90000000-0000-4000-8000-000000000001');
insert into public.wbs_dependencies (id, tenant_id, project_id, from_item_id, from_side, to_item_id, to_side, offset_days) values
  (:'internal_dep_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid, 'end', :'child_id'::uuid, 'start', 2),
  (:'boundary_dep_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid, 'end', :'external_id'::uuid, 'start', 0);
insert into public.activity_events (id, tenant_id, project_id, actor_id, event_type, entity_table, entity_id, payload, created_at) values
  (:'root_event_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'owner_id'::uuid, 'task_updated', 'wbs_items', :'root_id'::uuid, '{"taskId":"root-legacy","before":{"status":"todo"},"after":{"status":"in_progress"}}', now() - interval '30 minutes'),
  (:'child_event_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'owner_id'::uuid, 'task_updated', 'wbs_items', :'child_id'::uuid, '{"taskId":"child-legacy","source":"fixture"}', now() - interval '20 minutes');

insert into public.knowledge_records (id, tenant_id, project_id, record_type, title, content, occurred_at, status, visibility, rag_enabled, metadata, recorded_by, created_by) values
  (:'meeting_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, 'meeting', '可見會議', '公開會議內容', now() - interval '15 minutes', 'published', 'project', false, '{}', :'owner_id'::uuid, :'owner_id'::uuid),
  (:'private_meeting_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, 'meeting', '私密會議不可外洩', 'private content', now() - interval '10 minutes', 'published', 'private', false, '{}', :'owner_id'::uuid, :'owner_id'::uuid),
  (:'draft_work_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, 'work_log', '草稿工作紀錄', 'draft content', null, 'draft', 'project', false, '{}', :'owner_id'::uuid, :'owner_id'::uuid);
insert into public.record_task_links (tenant_id, project_id, record_id, item_id, role, created_by) values
  (:'tenant_id'::uuid, :'project_id'::uuid, :'meeting_id'::uuid, :'child_id'::uuid, 'related', :'owner_id'::uuid),
  (:'tenant_id'::uuid, :'project_id'::uuid, :'private_meeting_id'::uuid, :'child_id'::uuid, 'related', :'owner_id'::uuid);

select role, capabilities from public.board_role_permissions order by role;
select public.dev093_assert((select capabilities @> array['collect_task'] from public.board_role_permissions where role = 'owner'), 'delete_task capability backfills collect_task');
select public.dev093_assert(to_regclass('public.knowledge_records_collection_operation_uidx') is not null, 'operation unique index exists');
select public.dev093_assert(to_regclass('public.knowledge_records_collection_version_uidx') is not null, 'version unique index exists');
select public.dev093_assert(to_regclass('public.knowledge_records_collection_search_idx') is not null, 'GIN search index exists');
select public.dev093_assert((select relrowsecurity from pg_class where oid = 'public.knowledge_records'::regclass), 'knowledge records RLS enabled');
select public.dev093_assert(has_function_privilege('authenticated', 'public.preview_task_collection_subtree(uuid,uuid,uuid,uuid)', 'execute'), 'authenticated preview grant');
select public.dev093_assert(has_function_privilege('authenticated', 'public.collect_task_subtree(uuid,uuid,uuid,uuid,text,text)', 'execute'), 'authenticated collect grant');
select public.dev093_assert(not has_function_privilege('anon', 'public.collect_task_subtree(uuid,uuid,uuid,uuid,text,text)', 'execute'), 'anon collect revoked');
select public.dev093_assert(
  private.canonical_json_v1($json${"b":1,"a":"x","nested":[null,true,"中文","😀","a\\b","line\n"]}$json$::jsonb)
    = $json${"a":"x","b":1,"nested":[null,true,"中文","😀","a\\b","line\n"]}$json$,
  'canonical JSON golden vector matches TypeScript ordering/escaping'
);
select private.canonical_json_v1($json${"b":1,"a":"x","nested":[null,true,"中文","😀","a\\b","line\n"]}$json$::jsonb) as canonical_sql,
  encode(extensions.digest(convert_to(private.canonical_json_v1($json${"b":1,"a":"x","nested":[null,true,"中文","😀","a\\b","line\n"]}$json$::jsonb), 'UTF8'), 'sha256'), 'hex') as canonical_sha256 \gset

set request.jwt.claim.sub = :'owner_id';
set role authenticated;

select public.preview_task_collection_subtree(:'operation_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as preview_json \gset
select (:'preview_json'::jsonb ->> 'preview_token') as preview_token \gset
select public.dev093_assert((:'preview_json'::jsonb ->> 'task_count')::integer = 2, 'preview includes root and archived descendant');
select public.dev093_assert((:'preview_json'::jsonb ->> 'dependency_count')::integer = 2, 'preview includes boundary dependency');
select public.dev093_assert((:'preview_json'::jsonb ->> 'related_record_count')::integer = 1, 'preview excludes private linked record');
select public.dev093_assert((:'preview_json'::jsonb -> 'snapshot' ->> 'sourceBoardTitle') = 'DEV-093 isolated board', 'snapshot includes board title');

select public.collect_task_subtree(:'operation_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid, :'preview_token', 'isolated verifier') as collect_json \gset
select (:'collect_json'::jsonb ->> 'record_id') as record_id \gset
select public.dev093_assert((:'collect_json'::jsonb ->> 'idempotent')::boolean = false, 'first collect commits');
select public.dev093_assert((select is_archived from public.wbs_items where id = :'root_id'::uuid), 'source root archives after commit');
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 1, 'one durable collection row');
select public.dev093_assert((select count(*) from public.record_task_links where record_id = :'record_id'::uuid) = 2, 'collection links all subtree nodes');
select public.dev093_assert(position('私密會議不可外洩' in (select content from public.knowledge_records where id = :'record_id'::uuid)) = 0, 'private linked record does not leak');
select public.dev093_assert((select count(*) from public.activity_events where event_type = 'task_collected' and entity_id = :'root_id'::uuid) = 1, 'task_collected audit event');

select public.collect_task_subtree(:'operation_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid, 'intentionally-wrong-token', null) as replay_json \gset
select public.dev093_assert((:'replay_json'::jsonb ->> 'idempotent')::boolean = true and (:'replay_json'::jsonb ->> 'record_id')::uuid = :'record_id'::uuid, 'same operation replays same durable row');
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 1, 'replay does not duplicate collection');
select public.dev093_assert((:'preview_json'::jsonb ? 'task_count') and not (:'preview_json'::jsonb ? 'taskCount'), 'preview uses snake_case wire keys');
select public.dev093_assert((:'collect_json'::jsonb ? 'record_id') and not (:'collect_json'::jsonb ? 'recordId'), 'collect uses snake_case wire keys');

-- A rejected operation must not mutate the source or create a partial asset.
select public.preview_task_collection_subtree('80000000-0000-0000-0000-000000000053'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'external_id'::uuid) as rejected_preview \gset
do $$
begin
  perform public.collect_task_subtree('80000000-0000-0000-0000-000000000053'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000012'::uuid, 'wrong-token');
  raise exception 'expected source changed';
exception when others then
  if sqlerrm <> 'TASK_COLLECTION:SOURCE_CHANGED' then raise; end if;
end
$$;
select public.dev093_assert(not (select is_archived from public.wbs_items where id = :'external_id'::uuid), 'rejected operation leaves source active');
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 1, 'rejected operation leaves asset count unchanged');

-- A different operation cannot collect the same already archived root.
do $$
begin
  perform public.collect_task_subtree('80000000-0000-0000-0000-000000000054'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000010'::uuid, 'wrong-token');
  raise exception 'expected archived root rejection';
exception when others then
  if sqlerrm <> 'task collection root is already archived' then raise; end if;
end
$$;
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 1, 'different operation does not create duplicate version');

-- Direct generic collection mutations are denied while editable records keep
-- their existing policy path.  UPDATE/DELETE are checked by unchanged title
-- and row count because RLS can legitimately return zero affected rows.
do $$
declare
  did_insert boolean := false;
begin
  begin
    insert into public.knowledge_records (
      tenant_id, project_id, record_type, title, content, occurred_at, status, visibility,
      rag_enabled, metadata, recorded_by, created_by, updated_by, collection_operation_id,
      collection_version, collection_schema_version, collection_snapshot_hash, source_root_item_id
    ) values (
      '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid,
      'task_collection', 'direct mutation', 'forbidden', now(), 'published', 'project', false,
      '{"taskCollection":{"schema":"task-collection-v1"}}'::jsonb,
      '30000000-0000-4000-8000-000000000003'::uuid, '30000000-0000-4000-8000-000000000003'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid, '90000000-0000-4000-8000-000000000001'::uuid,
      99, 1, repeat('b', 64), '40000000-0000-4000-8000-000000000010'::uuid
    );
    did_insert := true;
  exception when others then null;
  end;
  if did_insert then raise exception 'expected direct collection insert denial'; end if;
end
$$;
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 1, 'generic direct insert denied');
update public.knowledge_records set title = 'tampered' where id = :'record_id'::uuid;
delete from public.knowledge_records where id = :'record_id'::uuid;
select public.dev093_assert((select title from public.knowledge_records where id = :'record_id'::uuid) <> 'tampered', 'generic update/delete cannot mutate collection');
select public.dev093_assert((select count(*) from public.knowledge_records where id = :'record_id'::uuid) = 1, 'generic delete cannot remove collection');

-- Restore the source, then a new user-confirmed operation creates immutable v2.
select collection_snapshot_hash as v1_hash from public.knowledge_records where id = :'record_id'::uuid \gset
update public.wbs_items set is_archived = false where id = :'root_id'::uuid;
select public.preview_task_collection_subtree('80000000-0000-0000-0000-000000000055'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as v2_preview \gset
select (:'v2_preview'::jsonb ->> 'preview_token') as v2_token \gset
select public.collect_task_subtree('80000000-0000-0000-0000-000000000055'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid, :'v2_token', 'version two') as v2_collect \gset
select (:'v2_collect'::jsonb ->> 'record_id') as v2_record_id \gset
select public.dev093_assert((:'v2_collect'::jsonb ->> 'collection_version')::integer = 2, 'restore then collect creates version two');
select public.dev093_assert((select collection_snapshot_hash from public.knowledge_records where id = :'record_id'::uuid) = :'v1_hash', 'version one hash remains immutable');
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 2, 'version two creates one additional asset');

-- DB07: inject a failure at each durable phase using disposable triggers.
-- The product RPC has no test-only fault switch; trigger failures exercise the
-- real transaction boundary without adding production behavior.
reset role;
create or replace function public.dev093_fault_guard()
returns trigger language plpgsql
as $$
begin
  if current_setting('dev093.fault_phase', true) = tg_argv[0] then
    raise exception 'DEV093_INJECTED_%', tg_argv[0];
  end if;
  return new;
end;
$$;
create trigger dev093_fault_asset before insert on public.knowledge_records
  for each row execute function public.dev093_fault_guard('asset');
create trigger dev093_fault_link before insert on public.record_task_links
  for each row execute function public.dev093_fault_guard('link');
create trigger dev093_fault_archive before update on public.wbs_items
  for each row execute function public.dev093_fault_guard('archive');
create trigger dev093_fault_event before insert on public.activity_events
  for each row execute function public.dev093_fault_guard('event');
update public.wbs_items set is_archived = false where id = :'root_id'::uuid;
set request.jwt.claim.sub = :'owner_id';
set role authenticated;

select public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000056'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as fault_asset_preview \gset
select (:'fault_asset_preview'::jsonb ->> 'preview_token') as fault_asset_token \gset
select set_config('dev093.fault_token', :'fault_asset_token', false);
select set_config('dev093.fault_phase', 'asset', false);
do $$ begin
  perform public.collect_task_subtree('80000000-0000-4000-8000-000000000056'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000010'::uuid, current_setting('dev093.fault_token'));
  raise exception 'expected asset fault';
exception when others then
  if sqlerrm <> 'DEV093_INJECTED_asset' then raise; end if;
end $$;
select set_config('dev093.fault_phase', '', false);

select public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000057'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as fault_link_preview \gset
select (:'fault_link_preview'::jsonb ->> 'preview_token') as fault_link_token \gset
select set_config('dev093.fault_token', :'fault_link_token', false);
select set_config('dev093.fault_phase', 'link', false);
do $$ begin
  perform public.collect_task_subtree('80000000-0000-4000-8000-000000000057'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000010'::uuid, current_setting('dev093.fault_token'));
  raise exception 'expected link fault';
exception when others then
  if sqlerrm <> 'DEV093_INJECTED_link' then raise; end if;
end $$;
select set_config('dev093.fault_phase', '', false);

select public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000058'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as fault_archive_preview \gset
select (:'fault_archive_preview'::jsonb ->> 'preview_token') as fault_archive_token \gset
select set_config('dev093.fault_token', :'fault_archive_token', false);
select set_config('dev093.fault_phase', 'archive', false);
do $$ begin
  perform public.collect_task_subtree('80000000-0000-4000-8000-000000000058'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000010'::uuid, current_setting('dev093.fault_token'));
  raise exception 'expected archive fault';
exception when others then
  if sqlerrm <> 'DEV093_INJECTED_archive' then raise; end if;
end $$;
select set_config('dev093.fault_phase', '', false);

select public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000059'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as fault_event_preview \gset
select (:'fault_event_preview'::jsonb ->> 'preview_token') as fault_event_token \gset
select set_config('dev093.fault_token', :'fault_event_token', false);
select set_config('dev093.fault_phase', 'event', false);
do $$ begin
  perform public.collect_task_subtree('80000000-0000-4000-8000-000000000059'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000010'::uuid, current_setting('dev093.fault_token'));
  raise exception 'expected event fault';
exception when others then
  if sqlerrm <> 'DEV093_INJECTED_event' then raise; end if;
end $$;
select set_config('dev093.fault_phase', '', false);

select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 2, 'fault injections roll back asset rows');
select public.dev093_assert(not (select is_archived from public.wbs_items where id = :'root_id'::uuid), 'fault injections leave source active');
select public.dev093_assert((select count(*) from public.activity_events where event_type = 'task_collected' and entity_id = :'root_id'::uuid) = 2, 'fault injections roll back audit events');
reset role;
drop trigger dev093_fault_asset on public.knowledge_records;
drop trigger dev093_fault_link on public.record_task_links;
drop trigger dev093_fault_archive on public.wbs_items;
drop trigger dev093_fault_event on public.activity_events;
drop function public.dev093_fault_guard();
set request.jwt.claim.sub = :'owner_id';
set role authenticated;

-- DB08: two independent sessions submit the same operation concurrently. The
-- stable root lock lets one commit and makes the loser return that row.
select public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000060'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'root_id'::uuid) as concurrent_preview \gset
select (:'concurrent_preview'::jsonb ->> 'preview_token') as concurrent_token \gset
reset role;
create extension if not exists dblink with schema extensions;
\if :{?dev093_dblink_conninfo}
select extensions.dblink_connect_u('dev093_c1', :'dev093_dblink_conninfo');
select extensions.dblink_connect_u('dev093_c2', :'dev093_dblink_conninfo');
\else
select extensions.dblink_connect_u('dev093_c1', format('host=127.0.0.1 port=%s user=postgres dbname=%s', :'dev093_port', current_database()));
select extensions.dblink_connect_u('dev093_c2', format('host=127.0.0.1 port=%s user=postgres dbname=%s', :'dev093_port', current_database()));
\endif
select extensions.dblink_send_query('dev093_c1', format($sql$set role authenticated; select set_config('request.jwt.claim.sub', '%s', false); select public.collect_task_subtree('%s'::uuid, '%s'::uuid, '%s'::uuid, '%s'::uuid, '%s')$sql$, :'owner_id', '80000000-0000-4000-8000-000000000060', :'tenant_id', :'project_id', :'root_id', :'concurrent_token'));
select extensions.dblink_send_query('dev093_c2', format($sql$set role authenticated; select set_config('request.jwt.claim.sub', '%s', false); select public.collect_task_subtree('%s'::uuid, '%s'::uuid, '%s'::uuid, '%s'::uuid, '%s')$sql$, :'owner_id', '80000000-0000-4000-8000-000000000060', :'tenant_id', :'project_id', :'root_id', :'concurrent_token'));
select pg_sleep(0.05);
select * from extensions.dblink_get_result('dev093_c1') as result(value text) where value is not null;
select * from extensions.dblink_get_result('dev093_c2') as result(value text) where value is not null;
select extensions.dblink_disconnect('dev093_c1');
select extensions.dblink_disconnect('dev093_c2');
set request.jwt.claim.sub = :'owner_id';
set role authenticated;
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection' and collection_operation_id = '80000000-0000-4000-8000-000000000060'::uuid) = 1, 'same operation concurrency creates one collection');
select public.dev093_assert((select count(*) from public.activity_events where event_type = 'task_collected' and entity_id = :'root_id'::uuid) = 3, 'same operation concurrency creates one audit event');
select public.dev093_assert((select is_archived from public.wbs_items where id = :'root_id'::uuid), 'same operation concurrency archives source once');

-- Add deterministic rows as the database owner solely to exercise summary
-- cursor/search behaviour; mutation authorization was tested above.
reset role;
insert into public.knowledge_records (
  tenant_id, project_id, record_type, title, content, occurred_at, status, visibility,
  rag_enabled, metadata, recorded_by, created_by, updated_by, collection_operation_id,
  collection_version, collection_schema_version, collection_snapshot_hash, source_root_item_id
)
select
  :'tenant_id'::uuid, :'project_id'::uuid, 'task_collection',
  case when g = 1 then 'literal % _' else format('synthetic-%s', g) end,
  'synthetic content', clock_timestamp() - (g || ' seconds')::interval, 'published', 'project', false,
  jsonb_build_object('taskCollection', jsonb_build_object(
    'schema', 'task-collection-v1', 'sourceBoardTitle', 'DEV-093 isolated board',
    'nodes', jsonb_build_array(jsonb_build_object('id', format('synthetic-%s', g))),
    'historyCoverage', jsonb_build_object('activityEvents', 0, 'linkedRecords', 0,
      'oldestActivityAt', null, 'newestActivityAt', null))),
  :'owner_id'::uuid, :'owner_id'::uuid, :'owner_id'::uuid, extensions.gen_random_uuid(),
  100 + g, 1, repeat('a', 64), :'external_id'::uuid
from generate_series(1, 55) g;
set request.jwt.claim.sub = :'owner_id';
set role authenticated;
select public.dev093_assert((select count(*) from public.list_task_collection_summaries(:'tenant_id'::uuid, :'project_id'::uuid, null, null, null, 50)) = 50, 'summary limit returns first fifty');
select public.dev093_assert((select count(*) from public.list_task_collection_summaries(:'tenant_id'::uuid, :'project_id'::uuid, '% ', null, null, 50)) = 1, 'summary search treats wildcard as literal');
with first_page as (
  select * from public.list_task_collection_summaries(:'tenant_id'::uuid, :'project_id'::uuid, null, null, null, 50)
), cursor_row as (
  select occurred_at, record_id from first_page order by occurred_at desc, record_id desc offset 49 limit 1
), second_page as (
  select next_page.record_id
  from cursor_row
  cross join lateral public.list_task_collection_summaries(:'tenant_id'::uuid, :'project_id'::uuid, null, cursor_row.occurred_at, cursor_row.record_id, 50) next_page
)
select public.dev093_assert((select count(*) from first_page) + (select count(*) from second_page) = (select count(*) from public.knowledge_records where record_type = 'task_collection'), 'summary cursor covers all rows')
  , public.dev093_assert((select count(*) from first_page f join second_page s using (record_id)) = 0, 'summary cursor has no duplicate rows');
select public.dev093_assert(not exists (select 1 from public.knowledge_records where record_type = 'task_collection' and rag_enabled), 'collection assets remain RAG isolated');

select public.dev093_assert((select count(*) from public.list_task_collection_summaries(:'tenant_id'::uuid, :'project_id'::uuid, '根任務', null, null, 50)) >= 1, 'summary search returns collection');
select count(*) as stable_collection_count from public.knowledge_records where record_type = 'task_collection' \gset

-- Same operation on another root is rejected before token validation.
do $$
begin
  perform public.collect_task_subtree('80000000-0000-4000-8000-000000000050'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000012'::uuid, 'wrong');
  raise exception 'expected operation conflict';
exception when others then
  if sqlerrm <> 'TASK_COLLECTION:OPERATION_CONFLICT' then raise; end if;
end
$$;

-- Preview token becomes invalid when source content changes.
select public.preview_task_collection_subtree(:'changed_operation_id'::uuid, :'tenant_id'::uuid, :'project_id'::uuid, :'external_id'::uuid) as changed_preview \gset
select (:'changed_preview'::jsonb ->> 'preview_token') as changed_token \gset
select set_config('dev093.changed_token', :'changed_token', false);
update public.wbs_items set title = '邊界任務已變更', updated_at = now() where id = :'external_id'::uuid;
do $$
begin
  perform public.collect_task_subtree('80000000-0000-4000-8000-000000000051'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000012'::uuid, current_setting('dev093.changed_token'));
  raise exception 'expected source changed';
exception when others then
  if sqlerrm <> 'TASK_COLLECTION:SOURCE_CHANGED' then raise; end if;
end
$$;

-- A self-parent cycle fails closed and leaves source untouched.
update public.wbs_items set parent_id = id where id = :'external_id'::uuid;
do $$
begin
  perform public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000052'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000012'::uuid);
  raise exception 'expected invalid tree';
exception when others then
  if sqlerrm <> 'TASK_COLLECTION:SOURCE_INVALID_TREE' then raise; end if;
end
$$;
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = :'stable_collection_count'::integer, 'negative cases keep durable row count stable');

reset role;
set request.jwt.claim.sub = :'viewer_id';
set role authenticated;
do $$
begin
  perform public.preview_task_collection_subtree('80000000-0000-4000-8000-000000000052'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000012'::uuid);
  raise exception 'expected viewer permission denial';
exception when insufficient_privilege then null;
end
$$;
reset role;

-- Query-plan evidence is intentionally emitted in the isolated run log; the
-- migration must expose the published-only trigram index and escaped search.
explain (format json)
select * from public.list_task_collection_summaries(:'tenant_id'::uuid, :'project_id'::uuid, '根', null, null, 50);

-- Hard-delete the source subtree as the disposable database owner.  Source
-- links may cascade, but collection rows/content must remain independently
-- readable after the source projection disappears.
reset role;
delete from public.wbs_items where id in (:'root_id'::uuid, :'child_id'::uuid);
set request.jwt.claim.sub = :'owner_id';
set role authenticated;
select public.dev093_assert((select count(*) from public.record_task_links where record_id in (:'record_id'::uuid, :'v2_record_id'::uuid)) = 0, 'source hard delete cascades collection links');
select public.dev093_assert((select octet_length(content) from public.knowledge_records where id = :'record_id'::uuid) > 0, 'v1 content survives source delete');
select public.dev093_assert((select octet_length(content) from public.knowledge_records where id = :'v2_record_id'::uuid) > 0, 'v2 content survives source delete');

-- DB16: board delete impact is the exact scalar collection count, viewers
-- cannot delete the board, and an authorized board delete cascades collections.
select public.dev093_assert((select count(*) from public.knowledge_records where project_id = :'project_id'::uuid and record_type = 'task_collection') = 58, 'board delete impact count is exact');
reset role;
set request.jwt.claim.sub = :'viewer_id';
set role authenticated;
delete from public.projects where id = :'project_id'::uuid;
select public.dev093_assert(exists (select 1 from public.projects where id = :'project_id'::uuid), 'viewer cannot delete board');
reset role;
set request.jwt.claim.sub = :'owner_id';
set role authenticated;
delete from public.projects where id = :'project_id'::uuid;
select public.dev093_assert(not exists (select 1 from public.projects where id = :'project_id'::uuid), 'owner board delete succeeds');
select public.dev093_assert((select count(*) from public.knowledge_records where record_type = 'task_collection') = 0, 'board delete cascades collection assets');

select 'DEV093_RESULT=' || jsonb_build_object(
  'dev', 'DEV-093',
  'passed', true,
  'status', 'passed',
  'migration', '20260828090000_dev_093_task_collection_assets.sql',
  'checks', jsonb_build_object(
    'freshMigration', true,
    'constraintsAndIndexes', true,
    'rpcPreviewCollectReadback', true,
    'archivedDescendantAndBoundaryDependency', true,
    'privateRecordNonLeak', true,
    'sameOperationIdempotency', true,
    'operationConflict', true,
    'sourceChanged', true,
    'cycleGuard', true,
    'rlsAndGrants', true,
    'viewerDenied', true,
    'searchExplainExecuted', true,
    'wireSnakeCase', true,
    'rejectedOperationRollback', true,
    'transactionFaultRollback', true,
    'sameOperationConcurrency', true,
    'differentOperationArchivedRoot', true,
    'genericMutationDenied', true,
    'restoredVersionTwo', true,
    'cursorAndLiteralSearch', true,
    'ragIsolation', true,
    'sourceDeleteSurvival', true
    , 'canonicalGolden', true,
    'boardWorkspaceDeleteImpact', true
  ),
  'canonicalSql', :'canonical_sql',
  'canonicalSha256', :'canonical_sha256',
  'fixture', jsonb_build_object('tenantId', :'tenant_id', 'projectId', :'project_id', 'rootId', :'root_id'),
  'runtime', 'task-owned PostgreSQL 18 loopback; no remote Supabase touched'
)::text as dev093_result;
