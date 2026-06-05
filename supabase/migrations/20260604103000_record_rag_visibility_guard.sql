-- Guard RAG retrieval and direct document reads for record-backed documents.
-- This keeps private records out of RAG even if a document mirror is created by mistake.

create or replace function private.current_user_can_read_document(
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
    where d.id = target_document_id
      and d.tenant_id = target_tenant_id
      and (
        (
          d.source_table = 'knowledge_records'
          and d.source_id is not null
          and exists (
            select 1
            from public.knowledge_records kr
            where kr.id = d.source_id
              and kr.tenant_id = d.tenant_id
              and kr.project_id = d.project_id
              and kr.status = 'published'
              and kr.rag_enabled = true
              and kr.source_document_id = d.id
              and (
                (
                  kr.visibility = 'private'
                  and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid()))
                )
                or (
                  kr.visibility = 'project'
                  and private.current_user_can_read_project(kr.tenant_id, kr.project_id)
                )
                or (
                  kr.visibility = 'tenant'
                  and public.current_user_is_tenant_member(kr.tenant_id)
                )
              )
          )
        )
        or (
          coalesce(d.source_table, '') <> 'knowledge_records'
          and (
            (
              d.visibility = 'private'
              and (d.created_by = (select auth.uid()) or d.updated_by = (select auth.uid()))
            )
            or (
              d.visibility = 'project'
              and d.project_id is not null
              and private.current_user_can_read_project(d.tenant_id, d.project_id)
            )
            or (
              d.visibility = 'tenant'
              and public.current_user_is_tenant_member(d.tenant_id)
            )
          )
        )
      )
  );
$$;

revoke all on function private.current_user_can_read_document(uuid, uuid) from public;
grant execute on function private.current_user_can_read_document(uuid, uuid) to authenticated, service_role;

drop policy if exists "members read documents" on public.documents;
drop policy if exists "members read document versions" on public.document_versions;
drop policy if exists "members read document chunks" on public.document_chunks;
drop policy if exists "members read embeddings" on public.document_embeddings;

create policy "authorized users read documents"
on public.documents for select to authenticated
using (private.current_user_can_read_document(tenant_id, id));

create policy "authorized users read document versions"
on public.document_versions for select to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_versions.document_id
      and d.tenant_id = document_versions.tenant_id
      and private.current_user_can_read_document(d.tenant_id, d.id)
  )
);

create policy "authorized users read document chunks"
on public.document_chunks for select to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_chunks.document_id
      and d.tenant_id = document_chunks.tenant_id
      and private.current_user_can_read_document(d.tenant_id, d.id)
  )
);

create policy "authorized users read embeddings"
on public.document_embeddings for select to authenticated
using (
  exists (
    select 1
    from public.document_chunks dc
    join public.documents d
      on d.id = dc.document_id
     and d.tenant_id = dc.tenant_id
    where dc.id = document_embeddings.chunk_id
      and dc.tenant_id = document_embeddings.tenant_id
      and private.current_user_can_read_document(d.tenant_id, d.id)
  )
);

drop function if exists public.match_project_knowledge(uuid, uuid, extensions.vector, float, int);

create or replace function public.match_project_knowledge(
  target_tenant_id uuid,
  target_project_id uuid,
  query_embedding extensions.vector(3072),
  match_threshold float default 0.78,
  match_count int default 12
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_table text,
  source_id uuid,
  source_type public.document_source_type,
  title text,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dc.id as chunk_id,
    d.id as document_id,
    d.source_table as source_table,
    d.source_id as source_id,
    d.source_type as source_type,
    d.title,
    dc.content,
    1 - (de.embedding operator(extensions.<=>) query_embedding) as similarity,
    dc.metadata || jsonb_build_object('document_metadata', d.metadata) as metadata
  from public.document_embeddings de
  join public.document_chunks dc on dc.id = de.chunk_id
  join public.documents d on d.id = dc.document_id
  where d.tenant_id = target_tenant_id
    and (target_project_id is null or d.project_id = target_project_id)
    and d.rag_enabled = true
    and private.current_user_can_read_document(d.tenant_id, d.id)
    and 1 - (de.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by de.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 50);
$$;

revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from public;
revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from anon;
grant execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) to authenticated;
