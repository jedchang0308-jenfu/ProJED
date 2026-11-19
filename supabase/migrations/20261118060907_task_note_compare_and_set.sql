-- Keep the note snapshots in the RPC request body and apply the comparison
-- in the same UPDATE. Existing wbs_items policies authorize the caller.
create function public.compare_and_set_task_notes(
  p_tenant_id uuid,
  p_project_id uuid,
  p_item_id uuid,
  p_expected_detail_notes jsonb,
  p_expected_description text,
  p_next_detail_notes jsonb,
  p_next_description text
)
returns table (detail_notes jsonb, description text, updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  update public.wbs_items as item
  set detail_notes = p_next_detail_notes,
      description = p_next_description
  where item.tenant_id = p_tenant_id
    and item.project_id = p_project_id
    and item.id = p_item_id
    and item.detail_notes = p_expected_detail_notes
    and item.description is not distinct from p_expected_description
  returning item.detail_notes, item.description, item.updated_at;
$$;

revoke all on function public.compare_and_set_task_notes(uuid, uuid, uuid, jsonb, text, jsonb, text) from public, anon, service_role;
grant execute on function public.compare_and_set_task_notes(uuid, uuid, uuid, jsonb, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
