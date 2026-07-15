-- DEV-048: Multi-person primary assignment with mutually exclusive collaborators.
-- assignee_id remains the first primary id for legacy consumers.

alter table public.wbs_items
  add column if not exists assignee_ids uuid[] not null default '{}'::uuid[];

update public.wbs_items
set assignee_ids = case
  when assignee_id is null then '{}'::uuid[]
  else array[assignee_id]
end
where cardinality(assignee_ids) = 0
  and assignee_id is not null;

create or replace function public.sync_wbs_item_assignment_roles()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  primary_ids uuid[];
begin
  if tg_op = 'INSERT' then
    primary_ids := case
      when coalesce(cardinality(new.assignee_ids), 0) > 0 then new.assignee_ids
      when new.assignee_id is not null then array[new.assignee_id]
      else '{}'::uuid[]
    end;
  elsif new.assignee_ids is distinct from old.assignee_ids then
    primary_ids := coalesce(new.assignee_ids, '{}'::uuid[]);
  elsif new.assignee_id is distinct from old.assignee_id then
    primary_ids := case
      when new.assignee_id is null then '{}'::uuid[]
      else array[new.assignee_id]
    end;
  else
    primary_ids := coalesce(new.assignee_ids, '{}'::uuid[]);
  end if;

  select coalesce(array_agg(id order by first_position), '{}'::uuid[])
    into primary_ids
  from (
    select id, min(position) as first_position
    from unnest(primary_ids) with ordinality as value_rows(id, position)
    where id is not null
    group by id
  ) deduped_primary_ids;

  new.assignee_ids := primary_ids;
  new.assignee_id := primary_ids[1];
  select coalesce(array_agg(id order by first_position), '{}'::uuid[])
    into new.collaborator_ids
  from (
    select id, min(position) as first_position
    from unnest(coalesce(new.collaborator_ids, '{}'::uuid[])) with ordinality as value_rows(id, position)
    where id is not null
      and not (id = any(primary_ids))
    group by id
  ) deduped_collaborator_ids;

  return new;
end;
$$;

drop trigger if exists sync_wbs_item_assignment_roles on public.wbs_items;
create trigger sync_wbs_item_assignment_roles
before insert or update of assignee_id, assignee_ids, collaborator_ids
on public.wbs_items
for each row execute function public.sync_wbs_item_assignment_roles();

update public.wbs_items
set collaborator_ids = collaborator_ids
where collaborator_ids && assignee_ids;

alter table public.wbs_items
  drop constraint if exists wbs_items_assignment_roles_disjoint;

alter table public.wbs_items
  add constraint wbs_items_assignment_roles_disjoint
  check (not (assignee_ids && collaborator_ids));

create index if not exists wbs_items_assignee_ids_gin_idx
  on public.wbs_items using gin (assignee_ids);

comment on column public.wbs_items.assignee_ids is
  'Canonical multi-person primary assignment; assignee_id mirrors the first value for compatibility.';
