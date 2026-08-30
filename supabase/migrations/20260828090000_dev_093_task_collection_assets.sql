-- DEV-093: immutable task collection assets.
-- The command is intentionally exposed through RPCs so validation, snapshot
-- materialisation, archive and activity logging share one transaction.

create extension if not exists pg_trgm with schema extensions;

alter table public.knowledge_records
  drop constraint if exists knowledge_records_record_type_check;
alter table public.knowledge_records
  add constraint knowledge_records_record_type_check check (record_type in ('meeting', 'work_log', 'task_collection'));

alter table public.knowledge_records
  add column if not exists collection_operation_id uuid,
  add column if not exists collection_version integer,
  add column if not exists collection_schema_version integer,
  add column if not exists collection_snapshot_hash text,
  add column if not exists source_root_item_id uuid;

alter table public.knowledge_records
  drop constraint if exists knowledge_records_task_collection_shape;
alter table public.knowledge_records
  add constraint knowledge_records_task_collection_shape check (
    (record_type = 'task_collection' and collection_operation_id is not null
      and collection_version is not null and collection_version > 0
      and collection_schema_version = 1
      and collection_snapshot_hash is not null and length(collection_snapshot_hash) = 64
      and source_root_item_id is not null
      and status = 'published' and visibility = 'project' and occurred_at is not null
      and legacy_record_id is null and started_at is null and ended_at is null
      and participants_text is null and source_document_id is null and rag_enabled = false
      and metadata #>> '{taskCollection,schema}' = 'task-collection-v1')
    or (record_type <> 'task_collection'
      and collection_operation_id is null and collection_version is null
      and collection_schema_version is null and collection_snapshot_hash is null
      and source_root_item_id is null)
  );
alter table public.knowledge_records
  drop constraint if exists knowledge_records_task_collection_bytes;
alter table public.knowledge_records
  add constraint knowledge_records_task_collection_bytes check (
    record_type <> 'task_collection'
    or (octet_length(convert_to(content, 'UTF8')) <= 524288
      and octet_length(convert_to(metadata::text, 'UTF8')) <= 2097152
      and coalesce(length(metadata #>> '{taskCollection,annotation}'), 0) <= 500
      and collection_snapshot_hash ~ '^[0-9a-f]{64}$')
  );

create unique index if not exists knowledge_records_collection_operation_uidx
  on public.knowledge_records (tenant_id, project_id, collection_operation_id)
  where record_type = 'task_collection' and collection_operation_id is not null;
create unique index if not exists knowledge_records_collection_version_uidx
  on public.knowledge_records (tenant_id, project_id, source_root_item_id, collection_version)
  where record_type = 'task_collection' and source_root_item_id is not null;
create index if not exists knowledge_records_collection_summary_idx
  on public.knowledge_records (tenant_id, project_id, occurred_at desc, id desc)
  where record_type = 'task_collection' and status = 'published';
create index if not exists knowledge_records_collection_search_idx
  on public.knowledge_records using gin (lower(title || E'\n' || content) extensions.gin_trgm_ops)
  where record_type = 'task_collection' and status = 'published';
create index if not exists knowledge_records_collection_activity_idx
  on public.knowledge_records (tenant_id, project_id, source_root_item_id, occurred_at desc)
  where record_type = 'task_collection';
create index if not exists activity_events_task_collection_lookup_idx
  on public.activity_events (tenant_id, project_id, entity_table, entity_id, created_at, id);

-- Existing custom matrices that already allow delete_task receive collection
-- permission. Viewer rows remain denied.
update public.board_role_permissions
set capabilities = array_append(capabilities, 'collect_task')
where 'delete_task' = any(capabilities)
  and not ('collect_task' = any(capabilities));

-- Provider-neutral canonical JSON used for cross-provider hash parity.  The
-- function accepts only JSON values that the TypeScript serializer can emit:
-- objects are ordered by UTF-8 key bytes, arrays preserve ordinal order, and
-- numbers are restricted to safe integers.
create or replace function private.canonical_json_v1(value jsonb)
returns text
language plpgsql immutable strict security definer
set search_path = ''
as $$
declare
  kind text := pg_catalog.jsonb_typeof(value);
  numeric_value numeric;
  output text;
begin
  if kind = 'null' then return 'null'; end if;
  if kind = 'string' then return pg_catalog.to_jsonb(value #>> '{}')::text; end if;
  if kind = 'boolean' then return value::text; end if;
  if kind = 'number' then
    numeric_value := (value #>> '{}')::numeric;
    if numeric_value <> pg_catalog.trunc(numeric_value)
      or numeric_value > 9007199254740991
      or numeric_value < -9007199254740991 then
      raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:SNAPSHOT_INVALID';
    end if;
    return numeric_value::bigint::text;
  end if;
  if kind = 'array' then
    select coalesce('[' || pg_catalog.string_agg(private.canonical_json_v1(item.value), ',' order by item.ordinality) || ']', '[]')
      into output
    from pg_catalog.jsonb_array_elements(value) with ordinality item(value, ordinality);
    return output;
  end if;
  if kind = 'object' then
    select coalesce('{' || pg_catalog.string_agg(pg_catalog.to_jsonb(item.key)::text || ':' || private.canonical_json_v1(item.value), ',' order by pg_catalog.convert_to(item.key, 'UTF8')) || '}', '{}')
      into output
    from pg_catalog.jsonb_each(value) item(key, value);
    return output;
  end if;
  raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:SNAPSHOT_INVALID';
end;
$$;

create or replace function private.current_user_can_collect_task(target_tenant_id uuid, target_project_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.current_user_is_workspace_admin(target_tenant_id)
    or exists (
      select 1
      from public.project_members pm
      join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id
      where pm.tenant_id = target_tenant_id
        and pm.project_id = target_project_id
        and pm.user_id = (select auth.uid())
        and tm.status = 'active'
        and pm.role <> 'viewer'
        and coalesce((
          select 'collect_task' = any(brp.capabilities)
          from public.board_role_permissions brp
          where brp.tenant_id = pm.tenant_id and brp.project_id = pm.project_id and brp.role = pm.role
        ), true)
    );
$$;

create or replace function private.task_collection_snapshot(
  p_tenant_id uuid,
  p_project_id uuid,
  p_root_item_id uuid,
  p_collected_at timestamptz
)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with recursive subtree as (
    select wi.id, wi.tenant_id, wi.project_id, wi.parent_id, wi.legacy_node_id,
      wi.title, wi.description, wi.detail_notes, wi.status, wi.assignee_id,
      wi.assignee_ids, wi.collaborator_ids, wi.start_date, wi.end_date,
      wi.is_duration_locked, wi.item_type, wi.kanban_stage_id, wi.sort_order,
      0 as depth, wi.is_archived, wi.created_at, wi.updated_at,
      array[wi.id]::uuid[] as traversal_path
    from public.wbs_items wi
    where wi.tenant_id = p_tenant_id and wi.project_id = p_project_id and wi.id = p_root_item_id
    union all
    select child.id, child.tenant_id, child.project_id, child.parent_id, child.legacy_node_id,
      child.title, child.description, child.detail_notes, child.status, child.assignee_id,
      child.assignee_ids, child.collaborator_ids, child.start_date, child.end_date,
      child.is_duration_locked, child.item_type, child.kanban_stage_id, child.sort_order,
      parent.depth + 1 as depth, child.is_archived, child.created_at, child.updated_at,
      parent.traversal_path || child.id
    from public.wbs_items child
    join subtree parent on parent.id = child.parent_id
    where child.tenant_id = p_tenant_id and child.project_id = p_project_id
      and not child.id = any(parent.traversal_path)
  ), ids as (
    select id from subtree
  ), ordered_nodes as (
    select jsonb_agg(jsonb_build_object(
      'id', coalesce(wi.legacy_node_id, wi.id::text),
      'storageId', wi.id,
      'parentId', case when wi.id = p_root_item_id then null else coalesce(parent.legacy_node_id, wi.parent_id::text) end,
      'parentStorageId', case when wi.id = p_root_item_id then null else wi.parent_id end,
      'title', wi.title,
      'description', wi.description,
      'detailNotes', coalesce(wi.detail_notes, '[]'::jsonb),
      'status', wi.status,
      'assigneeIds', coalesce(to_jsonb(wi.assignee_ids), '[]'::jsonb),
      'assignees', coalesce((select jsonb_agg(jsonb_build_object('userId', assignee_id, 'displayName', null) order by assignee_id) from unnest(coalesce(wi.assignee_ids, '{}'::uuid[])) assignee_id), '[]'::jsonb),
      'collaboratorIds', coalesce(to_jsonb(wi.collaborator_ids), '[]'::jsonb),
      'collaborators', coalesce((select jsonb_agg(jsonb_build_object('userId', collaborator_id, 'displayName', null) order by collaborator_id) from unnest(coalesce(wi.collaborator_ids, '{}'::uuid[])) collaborator_id), '[]'::jsonb),
      'tagIds', coalesce((select jsonb_agg(wit.tag_id order by wit.tag_id) from public.wbs_item_tags wit where wit.item_id = wi.id), '[]'::jsonb),
      'startDate', wi.start_date,
      'endDate', wi.end_date,
      'isDurationLocked', wi.is_duration_locked,
      'nodeType', wi.item_type,
      'kanbanStageId', wi.kanban_stage_id,
      'order', wi.sort_order,
      'createdAt', floor(extract(epoch from wi.created_at) * 1000)::bigint,
      'updatedAt', floor(extract(epoch from wi.updated_at) * 1000)::bigint,
      'isArchived', wi.is_archived
    ) order by wi.depth, wi.sort_order, wi.id) as value
    from subtree wi
    left join public.wbs_items parent on parent.id = wi.parent_id
  ), deps as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'fromId', d.from_item_id, 'fromSide', d.from_side,
      'toId', d.to_item_id, 'toSide', d.to_side, 'offsetDays', coalesce(d.offset_days, 0),
      'kind', case when d.from_item_id in (select id from ids) and d.to_item_id in (select id from ids) then 'internal' else 'boundary' end,
      'fromStorageId', case when d.from_item_id in (select id from ids) then d.from_item_id else null end,
      'toStorageId', case when d.to_item_id in (select id from ids) then d.to_item_id else null end,
      'boundaryItemId', case when d.from_item_id in (select id from ids) then d.to_item_id else d.from_item_id end,
      'boundaryItemTitle', case when d.from_item_id in (select id from ids) then (select title from public.wbs_items where id = d.to_item_id) else (select title from public.wbs_items where id = d.from_item_id) end
    ) order by d.id), '[]'::jsonb) as value
    from public.wbs_dependencies d
    where d.tenant_id = p_tenant_id and d.project_id = p_project_id
      and (d.from_item_id in (select id from ids) or d.to_item_id in (select id from ids))
  ), activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ae.id, 'eventType', ae.event_type, 'entityTable', ae.entity_table,
      'entityId', ae.entity_id, 'actorId', ae.actor_id,
      'payload', jsonb_strip_nulls(jsonb_build_object(
        'taskId', ae.payload->'taskId', 'taskTitle', ae.payload->'taskTitle',
        'dependencyId', ae.payload->'dependencyId', 'fromId', ae.payload->'fromId',
        'fromSide', ae.payload->'fromSide', 'toId', ae.payload->'toId',
        'toSide', ae.payload->'toSide', 'offset', ae.payload->'offset',
        'source', ae.payload->'source', 'sourceTaskId', ae.payload->'sourceTaskId',
        'operationId', ae.payload->'operationId',
        'before', jsonb_strip_nulls(jsonb_build_object(
          'status', ae.payload #> '{before,status}', 'parentId', ae.payload #> '{before,parentId}',
          'order', ae.payload #> '{before,order}', 'kanbanStageId', ae.payload #> '{before,kanbanStageId}',
          'startDate', ae.payload #> '{before,startDate}', 'endDate', ae.payload #> '{before,endDate}',
          'isDurationLocked', ae.payload #> '{before,isDurationLocked}', 'isArchived', ae.payload #> '{before,isArchived}',
          'assigneeIds', ae.payload #> '{before,assigneeIds}', 'assigneeId', ae.payload #> '{before,assigneeId}',
          'assigneeNames', ae.payload #> '{before,assigneeNames}', 'collaboratorIds', ae.payload #> '{before,collaboratorIds}',
          'collaboratorNames', ae.payload #> '{before,collaboratorNames}', 'tagIds', ae.payload #> '{before,tagIds}',
          'tagNames', ae.payload #> '{before,tagNames}', 'offset', ae.payload #> '{before,offset}'
        )),
        'after', jsonb_strip_nulls(jsonb_build_object(
          'status', ae.payload #> '{after,status}', 'parentId', ae.payload #> '{after,parentId}',
          'order', ae.payload #> '{after,order}', 'kanbanStageId', ae.payload #> '{after,kanbanStageId}',
          'startDate', ae.payload #> '{after,startDate}', 'endDate', ae.payload #> '{after,endDate}',
          'isDurationLocked', ae.payload #> '{after,isDurationLocked}', 'isArchived', ae.payload #> '{after,isArchived}',
          'assigneeIds', ae.payload #> '{after,assigneeIds}', 'assigneeId', ae.payload #> '{after,assigneeId}',
          'assigneeNames', ae.payload #> '{after,assigneeNames}', 'collaboratorIds', ae.payload #> '{after,collaboratorIds}',
          'collaboratorNames', ae.payload #> '{after,collaboratorNames}', 'tagIds', ae.payload #> '{after,tagIds}',
          'tagNames', ae.payload #> '{after,tagNames}', 'offset', ae.payload #> '{after,offset}'
        ))
      )),
      'createdAt', floor(extract(epoch from ae.created_at) * 1000)::bigint
    ) order by ae.created_at, ae.id), '[]'::jsonb) as value
    from public.activity_events ae
    where ae.tenant_id = p_tenant_id and ae.project_id = p_project_id
      and ((ae.entity_table = 'wbs_items' and ae.entity_id in (select id from ids))
        or (ae.entity_table = 'wbs_dependencies' and ae.entity_id in (select d.id from public.wbs_dependencies d where d.tenant_id = p_tenant_id and d.project_id = p_project_id and (d.from_item_id in (select id from ids) or d.to_item_id in (select id from ids)))))
  ), linked as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', kr.id, 'type', kr.record_type, 'title', kr.title, 'content', kr.content,
      'status', kr.status, 'visibility', kr.visibility,
      'occurredAt', floor(extract(epoch from kr.occurred_at) * 1000)::bigint,
      'startedAt', floor(extract(epoch from kr.started_at) * 1000)::bigint,
      'endedAt', floor(extract(epoch from kr.ended_at) * 1000)::bigint,
      'recordedBy', kr.recorded_by,
      'taskLinks', coalesce((select jsonb_agg(jsonb_build_object('nodeId', rtl.item_id, 'role', rtl.role) order by rtl.item_id, rtl.role) from public.record_task_links rtl where rtl.record_id = kr.id), '[]'::jsonb)
    ) order by kr.id), '[]'::jsonb) as value
    from public.knowledge_records kr
    where kr.tenant_id = p_tenant_id and kr.project_id = p_project_id
      and kr.record_type in ('meeting', 'work_log') and kr.status = 'published'
      and kr.visibility <> 'private'
      and exists (select 1 from public.record_task_links rtl where rtl.record_id = kr.id and rtl.item_id in (select id from ids))
  ), board_info as (
    select p.name as board_title from public.projects p where p.id = p_project_id and p.tenant_id = p_tenant_id
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'rootItemId', coalesce((select legacy_node_id from public.wbs_items where id = p_root_item_id), p_root_item_id::text),
    'rootStorageId', p_root_item_id,
    'sourceWorkspaceId', p_tenant_id,
    'sourceBoardId', p_project_id,
    'sourceBoardTitle', (select board_title from board_info),
    'collectedAt', floor(extract(epoch from p_collected_at) * 1000)::bigint,
    'sourceRootUpdatedAt', floor(extract(epoch from (select updated_at from subtree where id = p_root_item_id)) * 1000)::bigint,
    'nodes', (select value from ordered_nodes),
    'dependencies', (select value from deps),
    'activityEvents', (select value from activity),
    'linkedRecords', (select value from linked),
    'historyCoverage', jsonb_build_object(
      'activityEvents', jsonb_array_length((select value from activity)),
      'linkedRecords', jsonb_array_length((select value from linked)),
      'oldestActivityAt', null,
      'newestActivityAt', null
    ),
    'schema', 'task-collection-v1',
    'collectedBy', jsonb_build_object('userId', auth.uid(), 'displayName', null),
    'annotation', null,
    'source', jsonb_build_object(
      'workspaceId', p_tenant_id, 'workspaceTitle', p_tenant_id::text,
      'boardId', p_project_id, 'boardTitle', coalesce((select board_title from board_info), p_project_id::text),
      'rootTaskId', coalesce((select legacy_node_id from public.wbs_items where id = p_root_item_id), p_root_item_id::text), 'rootStorageId', p_root_item_id
    ),
    'history', jsonb_build_object(
      'coverage', jsonb_build_object(
        'activityEvents', jsonb_array_length((select value from activity)),
        'linkedRecords', jsonb_array_length((select value from linked)),
        'oldestActivityAt', null, 'newestActivityAt', null
      ),
      'events', (select value from activity)
    ),
    'relatedRecords', jsonb_build_object('coverage', 'project_visible_only', 'records', (select value from linked)),
    'counts', jsonb_build_object(
      'tasks', jsonb_array_length((select value from ordered_nodes)),
      'archivedDescendants', (select count(*) from subtree where id <> p_root_item_id and is_archived),
      'dependencies', jsonb_array_length((select value from deps)),
      'activities', jsonb_array_length((select value from activity)),
      'relatedRecords', jsonb_array_length((select value from linked))
    )
  );
$$;

create or replace function private.task_collection_has_cycle(
  p_tenant_id uuid,
  p_project_id uuid,
  p_root_item_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with recursive walk as (
    select wi.id, wi.parent_id, array[wi.id]::uuid[] as traversal_path, false as cycle
    from public.wbs_items wi
    where wi.tenant_id = p_tenant_id and wi.project_id = p_project_id and wi.id = p_root_item_id
    union all
    select child.id, child.parent_id, parent.traversal_path || child.id, child.id = any(parent.traversal_path)
    from public.wbs_items child
    join walk parent on parent.id = child.parent_id
    where child.tenant_id = p_tenant_id and child.project_id = p_project_id and not parent.cycle
  )
  select exists(select 1 from walk where cycle);
$$;

create or replace function public.preview_task_collection_subtree(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_root_item_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  snapshot_hash text;
  next_version integer;
  expected_preview_token text;
begin
  if not private.current_user_can_collect_task(p_tenant_id, p_project_id) then
    raise exception using errcode = '42501', message = 'collect_task permission required';
  end if;
  if not exists (select 1 from public.wbs_items where tenant_id = p_tenant_id and project_id = p_project_id and id = p_root_item_id) then
    raise exception using errcode = 'P0002', message = 'task collection root not found';
  end if;
  if exists (select 1 from public.wbs_items where tenant_id = p_tenant_id and project_id = p_project_id and id = p_root_item_id and is_archived) then
    raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:SOURCE_ARCHIVED';
  end if;
  if private.task_collection_has_cycle(p_tenant_id, p_project_id, p_root_item_id) then
    raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:SOURCE_INVALID_TREE';
  end if;
  snapshot := private.task_collection_snapshot(p_tenant_id, p_project_id, p_root_item_id, clock_timestamp());
  if jsonb_array_length(coalesce(snapshot->'nodes', '[]'::jsonb)) > 500
    or jsonb_array_length(coalesce(snapshot->'dependencies', '[]'::jsonb)) > 1000
    or jsonb_array_length(coalesce(snapshot->'activityEvents', '[]'::jsonb)) > 5000
    or jsonb_array_length(coalesce(snapshot->'linkedRecords', '[]'::jsonb)) > 200
    or octet_length(convert_to(snapshot::text, 'UTF8')) > 2097152
    or octet_length(convert_to(coalesce(snapshot->>'sourceBoardTitle', '') || E'\n' || snapshot::text, 'UTF8')) > 524288 then
    raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:LIMIT_EXCEEDED';
  end if;
  snapshot_hash := encode(extensions.digest(convert_to(private.canonical_json_v1(snapshot - 'collectedAt' - 'collectedBy' - 'annotation'), 'UTF8'), 'sha256'), 'hex');
  expected_preview_token := 'v1:' || encode(extensions.digest(convert_to(private.canonical_json_v1(jsonb_build_array('task-collection-preview-v1', p_operation_id, auth.uid(), p_tenant_id, p_project_id, p_root_item_id, snapshot_hash)), 'UTF8'), 'sha256'), 'hex');
  select coalesce(max(kr.collection_version), 0) + 1 into next_version
  from public.knowledge_records kr
  where kr.tenant_id = p_tenant_id and kr.project_id = p_project_id
    and kr.record_type = 'task_collection' and kr.source_root_item_id = p_root_item_id;
  return jsonb_build_object(
    'operation_id', p_operation_id, 'root_task_id', p_root_item_id, 'source_board_id', p_project_id,
    'task_count', jsonb_array_length(snapshot->'nodes'),
    'dependency_count', jsonb_array_length(snapshot->'dependencies'),
    'activity_count', jsonb_array_length(snapshot->'activityEvents'),
    'related_record_count', jsonb_array_length(snapshot->'linkedRecords'),
    'collection_version', next_version, 'snapshot_hash', snapshot_hash,
    'preview_token', expected_preview_token, 'snapshot', snapshot
  );
end;
$$;

create or replace function public.collect_task_subtree(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_root_item_id uuid,
  p_preview_token text,
  p_annotation text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  snapshot_hash text;
  next_version integer;
  record_id uuid;
  root_title text;
  root_archived boolean;
  actor_id uuid := (select auth.uid());
  existing_root_item_id uuid;
  expected_preview_token text;
begin
  set local lock_timeout = '3s';
  set local statement_timeout = '15s';
  if not private.current_user_can_collect_task(p_tenant_id, p_project_id) then
    raise exception using errcode = '42501', message = 'collect_task permission required';
  end if;
  select wi.title, wi.is_archived into root_title, root_archived from public.wbs_items wi where wi.tenant_id = p_tenant_id and wi.project_id = p_project_id and wi.id = p_root_item_id for update;
  if root_title is null then raise exception using errcode = 'P0002', message = 'task collection root not found'; end if;
  -- Stable UUID ordering prevents concurrent collection deadlocks.
  perform wi.id from public.wbs_items wi where wi.tenant_id = p_tenant_id and wi.project_id = p_project_id and wi.id in (
    with recursive subtree as (select id, parent_id, array[id]::uuid[] as traversal_path from public.wbs_items where tenant_id = p_tenant_id and project_id = p_project_id and id = p_root_item_id union all select child.id, child.parent_id, parent.traversal_path || child.id from public.wbs_items child join subtree parent on parent.id = child.parent_id where child.tenant_id = p_tenant_id and child.project_id = p_project_id and not child.id = any(parent.traversal_path)) select id from subtree
  ) order by wi.id for update;
  select kr.id, kr.source_root_item_id into record_id, existing_root_item_id from public.knowledge_records kr where kr.tenant_id = p_tenant_id and kr.project_id = p_project_id and kr.collection_operation_id = p_operation_id and kr.record_type = 'task_collection' for update;
  if record_id is not null then
    if existing_root_item_id is distinct from p_root_item_id then
      raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:OPERATION_CONFLICT';
    end if;
  return jsonb_build_object('record_id', record_id, 'operation_id', p_operation_id, 'idempotent', true);
  end if;
  if root_archived then raise exception using errcode = 'P0001', message = 'task collection root is already archived'; end if;
  if private.task_collection_has_cycle(p_tenant_id, p_project_id, p_root_item_id) then
    raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:SOURCE_INVALID_TREE';
  end if;
  if coalesce(trim(p_preview_token), '') = '' then raise exception using errcode = '22023', message = 'preview token required'; end if;
  snapshot := private.task_collection_snapshot(p_tenant_id, p_project_id, p_root_item_id, clock_timestamp());
  if jsonb_array_length(coalesce(snapshot->'nodes', '[]'::jsonb)) > 500
    or jsonb_array_length(coalesce(snapshot->'dependencies', '[]'::jsonb)) > 1000
    or jsonb_array_length(coalesce(snapshot->'activityEvents', '[]'::jsonb)) > 5000
    or jsonb_array_length(coalesce(snapshot->'linkedRecords', '[]'::jsonb)) > 200
    or octet_length(convert_to(snapshot::text, 'UTF8')) > 2097152
    or octet_length(convert_to(coalesce(snapshot->>'sourceBoardTitle', '') || E'\n' || snapshot::text, 'UTF8')) > 524288 then
    raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:LIMIT_EXCEEDED';
  end if;
  snapshot_hash := encode(extensions.digest(convert_to(private.canonical_json_v1(snapshot - 'collectedAt' - 'collectedBy' - 'annotation'), 'UTF8'), 'sha256'), 'hex');
  expected_preview_token := 'v1:' || encode(extensions.digest(convert_to(private.canonical_json_v1(jsonb_build_array('task-collection-preview-v1', p_operation_id, actor_id, p_tenant_id, p_project_id, p_root_item_id, snapshot_hash)), 'UTF8'), 'sha256'), 'hex');
  if p_preview_token <> expected_preview_token then raise exception using errcode = 'P0001', message = 'TASK_COLLECTION:SOURCE_CHANGED'; end if;
  select coalesce(max(kr.collection_version), 0) + 1 into next_version from public.knowledge_records kr where kr.tenant_id = p_tenant_id and kr.project_id = p_project_id and kr.record_type = 'task_collection' and kr.source_root_item_id = p_root_item_id;
  insert into public.knowledge_records (
    tenant_id, project_id, record_type, title, content, occurred_at, status, visibility, rag_enabled,
    metadata, recorded_by, created_by, updated_by, collection_operation_id, collection_version,
    collection_schema_version, collection_snapshot_hash, source_root_item_id
  ) values (
    p_tenant_id, p_project_id, 'task_collection', root_title,
    coalesce(snapshot->>'sourceBoardTitle', '') || E'\n' || snapshot::text,
    clock_timestamp(), 'published', 'project', false,
    jsonb_build_object('taskCollection', jsonb_set(snapshot, '{annotation}', to_jsonb(p_annotation), true), 'collectionOperationId', p_operation_id, 'collectionVersion', next_version, 'collectionSchemaVersion', 1, 'collectionSnapshotHash', snapshot_hash, 'sourceRootItemId', p_root_item_id, 'sourceRootStorageId', p_root_item_id, 'annotation', p_annotation),
    actor_id, actor_id, actor_id, p_operation_id, next_version, 1, snapshot_hash, p_root_item_id
  ) returning id into record_id;
  insert into public.record_task_links (tenant_id, project_id, record_id, item_id, role, created_by)
  select p_tenant_id, p_project_id, record_id, (node->>'storageId')::uuid, case when (node->>'storageId')::uuid = p_root_item_id then 'main' else 'related' end, actor_id from jsonb_array_elements(snapshot->'nodes') node;
  update public.wbs_items set is_archived = true, updated_at = now() where tenant_id = p_tenant_id and project_id = p_project_id and id = p_root_item_id;
  perform public.log_activity_event(p_tenant_id, p_project_id, 'task_collected', 'wbs_items', p_root_item_id, jsonb_build_object('operationId', p_operation_id, 'recordId', record_id, 'collectionVersion', next_version));
  return jsonb_build_object('record_id', record_id, 'operation_id', p_operation_id, 'source_root_item_id', p_root_item_id, 'collection_version', next_version, 'snapshot_hash', snapshot_hash, 'idempotent', false);
end;
$$;

create or replace function public.list_task_collection_summaries(
  p_tenant_id uuid,
  p_project_id uuid,
  p_search text default null,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns table(record_id uuid, title text, collection_version integer, occurred_at timestamptz, source_board_title text, task_count integer, history_coverage text)
language sql stable security invoker
set search_path = ''
as $$
  select kr.id, kr.title, kr.collection_version, kr.occurred_at,
    kr.metadata #>> '{taskCollection,sourceBoardTitle}',
    jsonb_array_length(coalesce(kr.metadata #> '{taskCollection,nodes}', '[]'::jsonb)),
    coalesce(kr.metadata #> '{taskCollection,historyCoverage}', '{}'::jsonb)::text
  from public.knowledge_records kr
  where kr.tenant_id = p_tenant_id and kr.project_id = p_project_id and kr.record_type = 'task_collection' and kr.status = 'published'
    and (p_search is null or lower(kr.title || E'\n' || kr.content) like '%' || replace(replace(replace(lower(p_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\')
    and (p_cursor_occurred_at is null or (kr.occurred_at, kr.id) < (p_cursor_occurred_at, p_cursor_id))
  order by kr.occurred_at desc, kr.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
$$;

drop policy if exists "board writers create records" on public.knowledge_records;
create policy "board writers create records" on public.knowledge_records for insert to authenticated
with check (record_type <> 'task_collection' and private.current_user_can_write_project(tenant_id, project_id));
drop policy if exists "record owners and board writers update records" on public.knowledge_records;
create policy "record owners and board writers update records" on public.knowledge_records for update to authenticated
using (record_type <> 'task_collection' and private.current_user_can_write_project(tenant_id, project_id))
with check (record_type <> 'task_collection' and private.current_user_can_write_project(tenant_id, project_id));
drop policy if exists "record owners and board managers delete records" on public.knowledge_records;
create policy "record owners and board managers delete records" on public.knowledge_records for delete to authenticated
using (record_type <> 'task_collection' and private.current_user_can_manage_project(tenant_id, project_id));

drop policy if exists "authorized users create record task links" on public.record_task_links;
create policy "authorized users create record task links" on public.record_task_links for insert to authenticated
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, item_id)
  and exists (select 1 from public.knowledge_records kr
    where kr.id = record_task_links.record_id and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id and kr.record_type <> 'task_collection')
);
drop policy if exists "authorized users update record task links" on public.record_task_links;
create policy "authorized users update record task links" on public.record_task_links for update to authenticated
using (exists (select 1 from public.knowledge_records kr
  where kr.id = record_task_links.record_id and kr.tenant_id = record_task_links.tenant_id
    and kr.project_id = record_task_links.project_id and kr.record_type <> 'task_collection'))
with check (private.wbs_item_belongs_to_project(tenant_id, project_id, item_id));
drop policy if exists "authorized users delete record task links" on public.record_task_links;
create policy "authorized users delete record task links" on public.record_task_links for delete to authenticated
using (exists (select 1 from public.knowledge_records kr
  where kr.id = record_task_links.record_id and kr.tenant_id = record_task_links.tenant_id
    and kr.project_id = record_task_links.project_id and kr.record_type <> 'task_collection'));

revoke all on function private.current_user_can_collect_task(uuid, uuid) from public, anon, authenticated;
revoke all on function private.canonical_json_v1(jsonb) from public, anon, authenticated;
revoke all on function private.task_collection_snapshot(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.task_collection_has_cycle(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.preview_task_collection_subtree(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.collect_task_subtree(uuid, uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.list_task_collection_summaries(uuid, uuid, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.preview_task_collection_subtree(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.collect_task_subtree(uuid, uuid, uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.list_task_collection_summaries(uuid, uuid, text, timestamptz, uuid, integer) to authenticated, service_role;
