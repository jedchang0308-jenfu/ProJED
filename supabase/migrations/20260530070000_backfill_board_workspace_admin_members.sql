-- Ensure workspace owners/admins are represented in board-level membership.
-- Board permissions can be inherited from workspace roles, but member lists and
-- assignee pickers read project_members directly.

insert into public.project_members (tenant_id, project_id, user_id, role, created_at, updated_at)
select
  p.tenant_id,
  p.id,
  tm.user_id,
  tm.role,
  now(),
  now()
from public.projects p
join public.tenant_members tm
  on tm.tenant_id = p.tenant_id
where tm.status = 'active'
  and tm.role in ('owner', 'admin')
on conflict (project_id, user_id) do nothing;
