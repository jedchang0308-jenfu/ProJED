-- DEV-110 corrective migration.
-- Archived records remain hidden from the normal project list, but an
-- authorized owner/board reader must be able to read them when the detail
-- history explicitly requests includeArchived=true.  PostgreSQL also needs
-- the row to be visible to evaluate an UPDATE policy during archive.
drop policy if exists "record owners and board readers read records"
  on public.knowledge_records;

create policy "record owners and board readers read records"
on public.knowledge_records for select to authenticated
using (
  (
    visibility = 'private'
    and (created_by = (select auth.uid()) or recorded_by = (select auth.uid()))
  )
  or (
    visibility <> 'private'
    and private.current_user_can_read_project(tenant_id, project_id)
  )
);

drop policy if exists "authorized users read record task links"
  on public.record_task_links;

create policy "authorized users read record task links"
on public.record_task_links for select to authenticated
using (
  exists (
    select 1
    from public.knowledge_records kr
    where kr.id = record_task_links.record_id
      and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id
      and (
        (kr.visibility = 'private' and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid())))
        or (kr.visibility <> 'private' and private.current_user_can_read_project(kr.tenant_id, kr.project_id))
      )
  )
);
