-- DEV-122: one capture, one canonical task and one immutable receipt.
-- This migration is additive. The existing unplaced lane and placement RPC stay
-- responsible for subsequent edits, moves and deletes.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists private.quick_task_capture_receipts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  capture_id text not null,
  title_hash bytea not null,
  committed_at timestamptz not null default now(),
  primary key (owner_id, capture_id),
  constraint quick_task_capture_receipts_hash_size check (octet_length(title_hash) = 32)
);

revoke all on private.quick_task_capture_receipts from public, anon, authenticated, service_role;
grant select, insert on private.quick_task_capture_receipts to authenticated, service_role;
alter table private.quick_task_capture_receipts enable row level security;
drop policy if exists "owners read quick task receipts" on private.quick_task_capture_receipts;
create policy "owners read quick task receipts"
  on private.quick_task_capture_receipts for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists "owners insert quick task receipts" on private.quick_task_capture_receipts;
create policy "owners insert quick task receipts"
  on private.quick_task_capture_receipts for insert to authenticated
  with check (owner_id = (select auth.uid()));

create or replace function public.create_quick_unplaced_task_v1(
  p_capture_id text,
  p_title text,
  p_workspace_hint text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_title text;
  v_title_hash bytea;
  v_tenant_id uuid;
  v_workspace_id text;
  v_order bigint;
  v_now timestamptz := clock_timestamp();
  v_existing private.quick_task_capture_receipts%rowtype;
  v_task jsonb;
begin
  if v_owner is null then
    raise exception using message = 'QT_AUTH_REQUIRED';
  end if;

  if p_capture_id is null or p_capture_id !~ '^task_workbench_unplaced_[0-9a-fA-F-]{36}$' then
    raise exception using message = 'QT_INVALID_CAPTURE_ID';
  end if;

  v_title := btrim(coalesce(p_title, ''), E' \t\n\r\f\v' || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197)
    || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232)
    || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
  if v_title = '' or char_length(v_title) > 500 then
    raise exception using message = 'QT_INVALID_TITLE';
  end if;
  v_title_hash := extensions.digest(convert_to(v_title, 'UTF8'), 'sha256');

  -- Share the canonical account-unplaced root scope lock with the existing
  -- placement RPC.  Quick capture and board↔unplaced placement must serialize
  -- their max(order)+1 / sibling-order mutations under the same key; a
  -- quick-only lock would leave a mixed writer race at the ownership boundary.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('account:%s:unplaced:parent:root', v_owner::text), 0)
  );

  select * into v_existing
    from private.quick_task_capture_receipts
    where owner_id = v_owner and capture_id = p_capture_id;
  if found then
    if v_existing.title_hash <> v_title_hash then
      raise exception using message = 'QT_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'status', 'committed', 'captureId', p_capture_id, 'ownerId', v_owner,
      'titleHash', encode(v_existing.title_hash, 'hex'), 'created', false,
      'committedAt', floor(extract(epoch from v_existing.committed_at) * 1000)::bigint
    );
  end if;

  -- A row with the same capture id but no immutable receipt is not a replay.
  -- Fail closed with a stable contract code instead of leaking a generic
  -- primary-key violation from the insert below.
  if exists (
    select 1
      from public.task_workbench_unplaced_items
     where owner_id = v_owner and id = p_capture_id
  ) then
    raise exception using message = 'QT_EXISTING_ROW_INVALID';
  end if;

  select tm.tenant_id, coalesce(t.legacy_workspace_id, t.id::text)
    into v_tenant_id, v_workspace_id
    from public.tenant_members tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = v_owner and tm.status = 'active'
      and (p_workspace_hint is null or p_workspace_hint = t.id::text or p_workspace_hint = t.legacy_workspace_id)
    order by tm.updated_at desc, tm.tenant_id
    limit 1;

  if v_tenant_id is null then
    select tm.tenant_id, coalesce(t.legacy_workspace_id, t.id::text)
      into v_tenant_id, v_workspace_id
      from public.tenant_members tm
      join public.tenants t on t.id = tm.tenant_id
      where tm.user_id = v_owner and tm.status = 'active'
      order by tm.updated_at desc, tm.tenant_id
      limit 1;
  end if;
  if v_tenant_id is null then
    raise exception using message = 'QT_NO_AVAILABLE_WORKSPACE';
  end if;

  select coalesce(max(sort_order)::bigint, -1) + 1 into v_order
    from public.task_workbench_unplaced_items
    where owner_id = v_owner;
  if v_order > 2147483647 then
    raise exception using message = 'QT_ORDER_EXHAUSTED';
  end if;

  v_task := jsonb_build_object(
    'id', p_capture_id,
    'workspaceId', v_workspace_id,
    'boardId', '__task_workbench_unplaced__',
    'parentId', null,
    'title', v_title,
    'status', 'todo',
    'nodeType', 'task',
    'order', v_order,
    'createdAt', floor(extract(epoch from v_now) * 1000)::bigint,
    'updatedAt', floor(extract(epoch from v_now) * 1000)::bigint,
    'detailNotes', jsonb_build_array(
      jsonb_build_object('id', 'note_default', 'title', '任務目的', 'content', ''),
      jsonb_build_object('id', 'note_default_secondary', 'title', '備註', 'content', '')
    )
  );

  insert into public.task_workbench_unplaced_items(owner_id, id, workspace_id, task, sort_order, created_at, updated_at)
    values (v_owner, p_capture_id, v_workspace_id, v_task, v_order, v_now, v_now);
  insert into private.quick_task_capture_receipts(owner_id, capture_id, title_hash, committed_at)
    values (v_owner, p_capture_id, v_title_hash, v_now);

  return jsonb_build_object(
    'status', 'committed', 'captureId', p_capture_id, 'ownerId', v_owner,
    'titleHash', encode(v_title_hash, 'hex'), 'created', true,
    'committedAt', floor(extract(epoch from v_now) * 1000)::bigint
  );
end;
$$;

revoke all on function public.create_quick_unplaced_task_v1(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_quick_unplaced_task_v1(text, text, text) to authenticated, service_role;
