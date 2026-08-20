-- Enable the existing client-side Postgres Changes subscriptions used by the
-- collaborative board. RLS policies remain authoritative for which rows each
-- authenticated client can receive.
do $$
declare
  realtime_table text;
  realtime_tables constant text[] := array[
    'tenants',
    'projects',
    'tenant_members',
    'project_members',
    'board_role_permissions',
    'profiles',
    'wbs_items',
    'wbs_dependencies',
    'task_tags',
    'wbs_item_tags'
  ];
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  -- A FOR ALL TABLES publication already covers every relation and rejects
  -- explicit ADD TABLE statements, so no per-table work is needed in that case.
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
      and puballtables
  ) then
    return;
  end if;

  foreach realtime_table in array realtime_tables loop
    if to_regclass(format('public.%I', realtime_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        realtime_table
      );
    end if;
  end loop;
end
$$;
