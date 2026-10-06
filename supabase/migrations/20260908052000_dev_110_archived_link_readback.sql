-- DEV-110: archived records retain authorized task-link history.
-- The link SELECT policy must match knowledge_records archived readback.
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
