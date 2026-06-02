-- Backfill active workspace members into board membership when the workspace
-- only has one board. This repairs legacy/incomplete invite states where a user
-- can briefly enter a board but disappears after the workspace list reloads
-- because RLS uses project_members as the board visibility boundary.

with single_project_tenants as (
  select
    tenant_id,
    (array_agg(id order by created_at))[1] as project_id
  from public.projects
  group by tenant_id
  having count(*) = 1
)
insert into public.project_members (tenant_id, project_id, user_id, role, created_at, updated_at)
select
  tm.tenant_id,
  spt.project_id,
  tm.user_id,
  tm.role,
  now(),
  now()
from public.tenant_members tm
join single_project_tenants spt
  on spt.tenant_id = tm.tenant_id
left join public.project_members pm
  on pm.tenant_id = tm.tenant_id
 and pm.project_id = spt.project_id
 and pm.user_id = tm.user_id
where tm.status = 'active'
  and pm.user_id is null
on conflict (project_id, user_id) do nothing;
