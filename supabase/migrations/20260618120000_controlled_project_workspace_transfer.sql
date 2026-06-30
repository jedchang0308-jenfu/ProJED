-- DEV-025: Controlled project transfer between workspaces.
-- Moves a project as one transaction while preserving project id and RLS boundaries.

alter table public.board_invites
  drop constraint if exists board_invites_project_tenant_fk;

alter table public.board_invites
  add constraint board_invites_project_tenant_fk
  foreign key (tenant_id, project_id)
  references public.projects(tenant_id, id)
  on update cascade
  on delete cascade;

alter table public.board_role_permissions
  drop constraint if exists board_role_permissions_tenant_id_project_id_fkey;

alter table public.board_role_permissions
  add constraint board_role_permissions_tenant_id_project_id_fkey
  foreign key (tenant_id, project_id)
  references public.projects(tenant_id, id)
  on update cascade
  on delete cascade;

create or replace function public.preview_project_workspace_transfer(
  source_tenant_id uuid,
  project_id uuid,
  target_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  source_workspace_id uuid := source_tenant_id;
  moving_project_id uuid := project_id;
  target_workspace_id uuid := target_tenant_id;
  project_record public.projects;
  source_workspace_name text;
  target_workspace_name text;
  is_locked boolean := false;
  blocked_reasons text[] := ARRAY[]::text[];
  target_active_member_count integer := 0;
  preserved_member_count integer := 0;
  removed_member_count integer := 0;
  task_count integer := 0;
  dependency_count integer := 0;
  tag_count integer := 0;
  document_count integer := 0;
  record_count integer := 0;
  pending_invite_count integer := 0;
  rag_document_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required to preview project transfer.';
  end if;

  select p.*
  into project_record
  from public.projects p
  where p.tenant_id = source_workspace_id
    and p.id = moving_project_id;

  if project_record.id is null then
    raise exception 'Project not found in source workspace.';
  end if;

  select t.name into source_workspace_name from public.tenants t where t.id = source_workspace_id;
  select t.name into target_workspace_name from public.tenants t where t.id = target_workspace_id;

  if target_workspace_name is null then
    raise exception 'Target workspace not found.';
  end if;

  if source_workspace_id = target_workspace_id then
    blocked_reasons := array_append(blocked_reasons, 'source_and_target_are_same');
  end if;

  if not private.current_user_can_manage_project(source_workspace_id, moving_project_id) then
    blocked_reasons := array_append(blocked_reasons, 'source_project_manager_required');
  end if;

  if not private.current_user_is_workspace_admin(target_workspace_id) then
    blocked_reasons := array_append(blocked_reasons, 'target_workspace_admin_required');
  end if;

  is_locked := coalesce(project_record.metadata ->> 'transferLocked', 'false') in ('true', '1', 'yes');
  if is_locked then
    blocked_reasons := array_append(blocked_reasons, 'project_transfer_locked');
  end if;

  select count(*) into target_active_member_count
  from public.tenant_members tm
  where tm.tenant_id = target_workspace_id
    and tm.status = 'active';

  select count(*) into preserved_member_count
  from public.project_members pm
  where pm.tenant_id = source_workspace_id
    and pm.project_id = moving_project_id
    and exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = target_workspace_id
        and tm.user_id = pm.user_id
        and tm.status = 'active'
    );

  select count(*) into removed_member_count
  from public.project_members pm
  where pm.tenant_id = source_workspace_id
    and pm.project_id = moving_project_id
    and not exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = target_workspace_id
        and tm.user_id = pm.user_id
        and tm.status = 'active'
    );

  select count(*) into task_count
  from public.wbs_items wi
  where wi.tenant_id = source_workspace_id
    and wi.project_id = moving_project_id;

  select count(*) into dependency_count
  from public.wbs_dependencies wd
  where wd.tenant_id = source_workspace_id
    and wd.project_id = moving_project_id;

  select count(distinct wit.tag_id) into tag_count
  from public.wbs_item_tags wit
  where wit.tenant_id = source_workspace_id
    and wit.project_id = moving_project_id;

  select count(*) into document_count
  from public.documents d
  where d.tenant_id = source_workspace_id
    and d.project_id = moving_project_id;

  select count(*) into record_count
  from public.knowledge_records kr
  where kr.tenant_id = source_workspace_id
    and kr.project_id = moving_project_id;

  select count(*) into pending_invite_count
  from public.board_invites bi
  where bi.tenant_id = source_workspace_id
    and bi.project_id = moving_project_id
    and bi.status = 'pending';

  select count(*) into rag_document_count
  from public.documents d
  where d.tenant_id = source_workspace_id
    and d.project_id = moving_project_id
    and d.rag_enabled = true;

  return jsonb_build_object(
    'blocked', coalesce(array_length(blocked_reasons, 1), 0) > 0,
    'reasons', coalesce(to_jsonb(blocked_reasons), '[]'::jsonb),
    'sourceWorkspaceId', source_workspace_id,
    'sourceWorkspaceTitle', source_workspace_name,
    'targetWorkspaceId', target_workspace_id,
    'targetWorkspaceTitle', target_workspace_name,
    'boardId', moving_project_id,
    'boardTitle', project_record.name,
    'transferLocked', is_locked,
    'counts', jsonb_build_object(
      'targetActiveMembers', target_active_member_count,
      'preservedMembers', preserved_member_count,
      'removedMembers', removed_member_count,
      'tasks', task_count,
      'dependencies', dependency_count,
      'tagsToMap', tag_count,
      'documents', document_count,
      'records', record_count,
      'pendingInvitesToRevoke', pending_invite_count,
      'ragDocumentsToResync', rag_document_count
    )
  );
end;
$$;

create or replace function public.move_project_to_workspace(
  source_tenant_id uuid,
  project_id uuid,
  target_tenant_id uuid,
  expected_project_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  source_workspace_id uuid := source_tenant_id;
  moving_project_id uuid := project_id;
  target_workspace_id uuid := target_tenant_id;
  project_record public.projects;
  source_workspace_name text;
  target_workspace_name text;
  source_tag record;
  replacement_tag_id uuid;
  preserved_member_count integer := 0;
  removed_member_count integer := 0;
  revoked_invite_count integer := 0;
  moved_task_count integer := 0;
  moved_dependency_count integer := 0;
  moved_document_count integer := 0;
  moved_record_count integer := 0;
  remapped_tag_count integer := 0;
  rag_job_count integer := 0;
  transfer_started_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required to move project.';
  end if;

  select p.*
  into project_record
  from public.projects p
  where p.tenant_id = source_workspace_id
    and p.id = moving_project_id
  for update;

  if project_record.id is null then
    raise exception 'Project not found in source workspace.';
  end if;

  if source_workspace_id = target_workspace_id then
    raise exception 'Source and target workspace must be different.';
  end if;

  if btrim(coalesce(expected_project_name, '')) <> project_record.name then
    raise exception 'Project name confirmation does not match.';
  end if;

  if coalesce(project_record.metadata ->> 'transferLocked', 'false') in ('true', '1', 'yes') then
    raise exception 'Project transfer is locked.';
  end if;

  if not private.current_user_can_manage_project(source_workspace_id, moving_project_id) then
    raise exception 'Source board manager permission is required to move this project.';
  end if;

  if not private.current_user_is_workspace_admin(target_workspace_id) then
    raise exception 'Target workspace admin permission is required to receive this project.';
  end if;

  select t.name into source_workspace_name from public.tenants t where t.id = source_workspace_id;
  select t.name into target_workspace_name from public.tenants t where t.id = target_workspace_id;

  if target_workspace_name is null then
    raise exception 'Target workspace not found.';
  end if;

  select count(*) into removed_member_count
  from public.project_members pm
  where pm.tenant_id = source_workspace_id
    and pm.project_id = moving_project_id
    and not exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = target_workspace_id
        and tm.user_id = pm.user_id
        and tm.status = 'active'
    );

  delete from public.project_members pm
  where pm.tenant_id = source_workspace_id
    and pm.project_id = moving_project_id
    and not exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = target_workspace_id
        and tm.user_id = pm.user_id
        and tm.status = 'active'
    );

  update public.project_members pm
  set tenant_id = target_workspace_id,
      updated_at = now()
  where pm.tenant_id = source_workspace_id
    and pm.project_id = moving_project_id;
  get diagnostics preserved_member_count = row_count;

  if not exists (
    select 1
    from public.project_members pm
    where pm.tenant_id = target_workspace_id
      and pm.project_id = moving_project_id
      and pm.role in ('owner', 'admin', 'project_manager')
  ) then
    insert into public.project_members (tenant_id, project_id, user_id, role)
    values (target_workspace_id, moving_project_id, (select auth.uid()), 'owner'::public.tenant_role)
    on conflict on constraint project_members_pkey do update
    set tenant_id = excluded.tenant_id,
        role = excluded.role,
        updated_at = now();
  end if;

  for source_tag in
    select distinct tt.*
    from public.task_tags tt
    join public.wbs_item_tags wit on wit.tag_id = tt.id
    where wit.tenant_id = source_workspace_id
      and wit.project_id = moving_project_id
  loop
    select tt.id
    into replacement_tag_id
    from public.task_tags tt
    where tt.tenant_id = target_workspace_id
      and lower(tt.name) = lower(source_tag.name)
      and tt.color = source_tag.color
    order by tt.created_at asc
    limit 1;

    if replacement_tag_id is null then
      insert into public.task_tags (
        tenant_id,
        legacy_tag_id,
        name,
        color,
        sort_order,
        metadata,
        created_by,
        updated_by
      )
      values (
        target_workspace_id,
        null,
        source_tag.name,
        source_tag.color,
        source_tag.sort_order,
        jsonb_strip_nulls(source_tag.metadata || jsonb_build_object(
          'movedFromTenantId', source_workspace_id,
          'movedFromTagId', source_tag.id
        )),
        (select auth.uid()),
        (select auth.uid())
      )
      returning id into replacement_tag_id;
    end if;

    update public.wbs_item_tags wit
    set tag_id = replacement_tag_id
    where wit.tenant_id = source_workspace_id
      and wit.project_id = moving_project_id
      and wit.tag_id = source_tag.id;

    remapped_tag_count := remapped_tag_count + 1;
    replacement_tag_id := null;
  end loop;

  update public.projects p
  set tenant_id = target_workspace_id,
      sort_order = floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      metadata = jsonb_strip_nulls(
        coalesce(p.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'movedFromTenantId', source_workspace_id,
          'movedToTenantId', target_workspace_id,
          'movedAt', transfer_started_at
        )
      ),
      updated_at = now()
  where p.tenant_id = source_workspace_id
    and p.id = moving_project_id;

  update public.wbs_items wi
  set tenant_id = target_workspace_id,
      updated_at = now()
  where wi.tenant_id = source_workspace_id
    and wi.project_id = moving_project_id;
  get diagnostics moved_task_count = row_count;

  update public.wbs_dependencies wd
  set tenant_id = target_workspace_id,
      updated_at = now()
  where wd.tenant_id = source_workspace_id
    and wd.project_id = moving_project_id;
  get diagnostics moved_dependency_count = row_count;

  update public.wbs_item_tags wit
  set tenant_id = target_workspace_id
  where wit.tenant_id = source_workspace_id
    and wit.project_id = moving_project_id;

  update public.documents d
  set tenant_id = target_workspace_id,
      metadata = jsonb_strip_nulls(
        coalesce(d.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'movedFromTenantId', source_workspace_id,
          'movedToTenantId', target_workspace_id,
          'movedAt', transfer_started_at
        )
      ),
      updated_at = now()
  where d.tenant_id = source_workspace_id
    and d.project_id = moving_project_id;
  get diagnostics moved_document_count = row_count;

  update public.document_versions dv
  set tenant_id = target_workspace_id
  where dv.tenant_id = source_workspace_id
    and exists (
      select 1
      from public.documents d
      where d.id = dv.document_id
        and d.project_id = moving_project_id
        and d.tenant_id = target_workspace_id
    );

  update public.document_chunks dc
  set tenant_id = target_workspace_id
  where dc.tenant_id = source_workspace_id
    and exists (
      select 1
      from public.documents d
      where d.id = dc.document_id
        and d.project_id = moving_project_id
        and d.tenant_id = target_workspace_id
    );

  update public.document_embeddings de
  set tenant_id = target_workspace_id
  where de.tenant_id = source_workspace_id
    and exists (
      select 1
      from public.document_chunks dc
      join public.documents d on d.id = dc.document_id
      where dc.id = de.chunk_id
        and d.project_id = moving_project_id
        and d.tenant_id = target_workspace_id
    );

  update public.external_rag_objects ero
  set tenant_id = target_workspace_id,
      updated_at = now()
  where ero.tenant_id = source_workspace_id
    and exists (
      select 1
      from public.documents d
      where d.id = ero.document_id
        and d.project_id = moving_project_id
        and d.tenant_id = target_workspace_id
    );

  update public.rag_sync_jobs rsj
  set tenant_id = target_workspace_id,
      status = case when rsj.status = 'running' then 'pending'::public.rag_sync_status else rsj.status end,
      metadata = jsonb_strip_nulls(
        coalesce(rsj.metadata, '{}'::jsonb)
        || jsonb_build_object('projectWorkspaceTransferAt', transfer_started_at)
      ),
      updated_at = now()
  where rsj.tenant_id = source_workspace_id
    and exists (
      select 1
      from public.documents d
      where d.id = rsj.source_document_id
        and d.project_id = moving_project_id
        and d.tenant_id = target_workspace_id
    );

  insert into public.rag_sync_jobs (tenant_id, provider, source_document_id, status, metadata)
  select
    target_workspace_id,
    'google',
    d.id,
    'pending'::public.rag_sync_status,
    jsonb_build_object(
      'reason', 'project_workspace_transfer',
      'movedFromTenantId', source_workspace_id,
      'movedToTenantId', target_workspace_id,
      'projectId', moving_project_id,
      'createdAt', transfer_started_at
    )
  from public.documents d
  where d.tenant_id = target_workspace_id
    and d.project_id = moving_project_id
    and d.rag_enabled = true;
  get diagnostics rag_job_count = row_count;

  update public.knowledge_records kr
  set tenant_id = target_workspace_id,
      metadata = jsonb_strip_nulls(
        coalesce(kr.metadata, '{}'::jsonb)
        || jsonb_build_object('projectWorkspaceTransferAt', transfer_started_at)
      ),
      updated_at = now()
  where kr.tenant_id = source_workspace_id
    and kr.project_id = moving_project_id;
  get diagnostics moved_record_count = row_count;

  update public.record_task_links rtl
  set tenant_id = target_workspace_id
  where rtl.tenant_id = source_workspace_id
    and rtl.project_id = moving_project_id;

  update public.llm_access_logs lal
  set tenant_id = target_workspace_id
  where lal.tenant_id = source_workspace_id
    and lal.project_id = moving_project_id;

  update public.activity_events ae
  set tenant_id = target_workspace_id
  where ae.tenant_id = source_workspace_id
    and ae.project_id = moving_project_id;

  update public.board_invites bi
  set status = 'revoked'::public.board_invite_status,
      revoked_at = coalesce(bi.revoked_at, now()),
      updated_at = now()
  where bi.tenant_id = target_workspace_id
    and bi.project_id = moving_project_id
    and bi.status = 'pending';
  get diagnostics revoked_invite_count = row_count;

  insert into public.activity_events (
    tenant_id,
    project_id,
    actor_id,
    event_type,
    entity_table,
    entity_id,
    payload
  )
  values (
    target_workspace_id,
    moving_project_id,
    (select auth.uid()),
    'project_workspace_transferred',
    'projects',
    moving_project_id,
    jsonb_build_object(
      'sourceWorkspaceId', source_workspace_id,
      'sourceWorkspaceTitle', source_workspace_name,
      'targetWorkspaceId', target_workspace_id,
      'targetWorkspaceTitle', target_workspace_name,
      'boardTitle', project_record.name,
      'preservedMembers', preserved_member_count,
      'removedMembers', removed_member_count,
      'revokedInvites', revoked_invite_count,
      'remappedTags', remapped_tag_count,
      'ragJobsCreated', rag_job_count
    )
  );

  insert into public.audit_logs (
    tenant_id,
    actor_id,
    action,
    entity_table,
    entity_id,
    before_data,
    after_data
  )
  values
    (
      source_workspace_id,
      (select auth.uid()),
      'board_workspace_transferred',
      'projects',
      moving_project_id,
      jsonb_build_object('tenantId', source_workspace_id, 'projectId', moving_project_id, 'name', project_record.name),
      jsonb_build_object('tenantId', target_workspace_id, 'projectId', moving_project_id, 'name', project_record.name)
    ),
    (
      target_workspace_id,
      (select auth.uid()),
      'board_workspace_transferred',
      'projects',
      moving_project_id,
      jsonb_build_object('tenantId', source_workspace_id, 'projectId', moving_project_id, 'name', project_record.name),
      jsonb_build_object('tenantId', target_workspace_id, 'projectId', moving_project_id, 'name', project_record.name)
    );

  return jsonb_build_object(
    'boardId', moving_project_id,
    'boardTitle', project_record.name,
    'sourceWorkspaceId', source_workspace_id,
    'sourceWorkspaceTitle', source_workspace_name,
    'targetWorkspaceId', target_workspace_id,
    'targetWorkspaceTitle', target_workspace_name,
    'counts', jsonb_build_object(
      'preservedMembers', preserved_member_count,
      'removedMembers', removed_member_count,
      'revokedInvites', revoked_invite_count,
      'tasks', moved_task_count,
      'dependencies', moved_dependency_count,
      'documents', moved_document_count,
      'records', moved_record_count,
      'remappedTags', remapped_tag_count,
      'ragJobsCreated', rag_job_count
    )
  );
end;
$$;

revoke all on function public.preview_project_workspace_transfer(uuid, uuid, uuid) from public;
revoke all on function public.preview_project_workspace_transfer(uuid, uuid, uuid) from anon;
revoke all on function public.move_project_to_workspace(uuid, uuid, uuid, text) from public;
revoke all on function public.move_project_to_workspace(uuid, uuid, uuid, text) from anon;

grant execute on function public.preview_project_workspace_transfer(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.move_project_to_workspace(uuid, uuid, uuid, text) to authenticated, service_role;

