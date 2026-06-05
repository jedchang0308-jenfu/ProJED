-- Allow record editors to enqueue embedding sync for record-backed RAG documents.
-- The embedding worker remains trusted; browser clients can only create pending jobs
-- for published, non-private knowledge records they can write in the project.

create or replace function private.current_user_can_index_record_document(
  target_tenant_id uuid,
  target_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    join public.knowledge_records kr
      on kr.id = d.source_id
     and kr.tenant_id = d.tenant_id
     and kr.project_id = d.project_id
    where d.id = target_document_id
      and d.tenant_id = target_tenant_id
      and d.source_table = 'knowledge_records'
      and d.rag_enabled = true
      and d.visibility <> 'private'
      and d.source_id is not null
      and kr.status = 'published'
      and kr.visibility <> 'private'
      and kr.rag_enabled = true
      and kr.source_document_id = d.id
      and private.current_user_can_write_project(kr.tenant_id, kr.project_id)
  );
$$;

revoke all on function private.current_user_can_index_record_document(uuid, uuid) from public;
grant execute on function private.current_user_can_index_record_document(uuid, uuid) to authenticated, service_role;

drop policy if exists "record writers create pending rag sync jobs" on public.rag_sync_jobs;

create policy "record writers create pending rag sync jobs"
on public.rag_sync_jobs for insert to authenticated
with check (
  provider = 'google'
  and source_document_id is not null
  and status = 'pending'
  and last_synced_at is null
  and error is null
  and private.current_user_can_index_record_document(tenant_id, source_document_id)
);
