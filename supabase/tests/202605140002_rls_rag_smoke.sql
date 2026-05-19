-- Runtime smoke tests for the ProJED Supabase migration.
-- Run after applying migrations to a disposable local/preview Supabase database.
-- These tests intentionally use rollback so they leave no seed data behind.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'wbs_items', 'wbs_items table exists');
select has_table('public', 'documents', 'documents table exists');
select has_table('public', 'document_embeddings', 'document_embeddings table exists');
select has_function('public', 'match_project_knowledge', ARRAY['uuid', 'uuid', 'vector', 'double precision', 'integer'], 'RAG match RPC exists');

select policies_are(
  'public',
  'wbs_items',
  ARRAY[
    'members read wbs items',
    'members write wbs items'
  ],
  'wbs_items has tenant member RLS policies'
);

select policies_are(
  'public',
  'document_embeddings',
  ARRAY[
    'members read embeddings',
    'service role writes embeddings'
  ],
  'document_embeddings separates member reads from service writes'
);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'tenant-a@example.test', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'tenant-b@example.test', now(), now(), now());

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'tenant-a@example.test', 'Tenant A User'),
  ('00000000-0000-0000-0000-0000000000b1', 'tenant-b@example.test', 'Tenant B User');

insert into public.tenants (id, name, owner_id)
values
  ('10000000-0000-0000-0000-000000000001', 'Tenant A', '00000000-0000-0000-0000-0000000000a1'),
  ('20000000-0000-0000-0000-000000000001', 'Tenant B', '00000000-0000-0000-0000-0000000000b1');

insert into public.tenant_members (tenant_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner', 'active'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');

insert into public.projects (id, tenant_id, name, sort_order, created_by)
values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Project A', 1, '00000000-0000-0000-0000-0000000000a1'),
  ('22000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Project B', 1, '00000000-0000-0000-0000-0000000000b1');

insert into public.wbs_items (id, tenant_id, project_id, title, status, item_type, sort_order)
values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Tenant A WBS', 'todo', 'task', 1),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Tenant B WBS', 'todo', 'task', 1);

insert into public.documents (id, tenant_id, project_id, source_type, source_table, source_id, title, rag_enabled)
values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'wbs_item', 'wbs_items', '11100000-0000-0000-0000-000000000001', 'Tenant A Document', true),
  ('22220000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'wbs_item', 'wbs_items', '22200000-0000-0000-0000-000000000001', 'Tenant B Document', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$ select count(*)::int from public.wbs_items $$,
  ARRAY[1],
  'Tenant A can only read its own WBS items'
);

select throws_ok(
  $$ insert into public.wbs_items (tenant_id, project_id, title, status, item_type, sort_order)
     values ('20000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Cross tenant write', 'todo', 'task', 2) $$,
  null,
  'Tenant A cannot insert WBS rows into Tenant B'
);

select results_eq(
  $$ select count(*)::int from public.documents $$,
  ARRAY[1],
  'Tenant A can only read its own RAG documents'
);

reset role;

update public.documents
set rag_enabled = false
where id = '11110000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.documents where rag_enabled = true),
  0,
  'Disabled RAG documents are excluded by the retrieval filter precondition'
);

select lives_ok(
  $$ insert into public.llm_access_logs (tenant_id, project_id, actor_id, provider, model, prompt_hash)
     values ('10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'google', 'gemini', 'hash-a') $$,
  'Tenant member can write own LLM access log'
);

select throws_ok(
  $$ insert into public.llm_access_logs (tenant_id, project_id, actor_id, provider, model, prompt_hash)
     values ('20000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'google', 'gemini', 'hash-b') $$,
  null,
  'Tenant member cannot write LLM access logs into another tenant'
);

select finish();

rollback;
