-- P9-3 Migration: Upgrade match_project_knowledge RPC to include citation source fields

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
    and public.current_user_is_tenant_member(target_tenant_id)
    and 1 - (de.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by de.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 50);
$$;

revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from public;
revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from anon;
grant execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) to authenticated;
