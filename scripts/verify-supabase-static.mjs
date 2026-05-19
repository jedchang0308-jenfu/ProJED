import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('supabase/migrations/202605140001_initial_projed_schema.sql');
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

const requiredSnippets = [
  'create extension if not exists pgcrypto',
  'create extension if not exists vector',
  'create table public.profiles',
  'create table public.tenants',
  'create table public.tenant_members',
  'create table public.projects',
  'create table public.project_members',
  'create table public.wbs_items',
  'create table public.wbs_dependencies',
  'create table public.documents',
  'create table public.document_versions',
  'create table public.document_chunks',
  'create table public.document_embeddings',
  'create table public.rag_sync_jobs',
  'create table public.external_rag_objects',
  'create table public.llm_access_logs',
  'alter table public.tenants enable row level security',
  'alter table public.projects enable row level security',
  'alter table public.wbs_items enable row level security',
  'alter table public.documents enable row level security',
  'create or replace function public.current_user_is_tenant_member',
  'create or replace function public.current_user_has_tenant_role',
  'create or replace function public.match_project_knowledge',
  'using hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops)',
  'service role writes embeddings',
  'members read own llm logs',
];

const failures = requiredSnippets.filter(snippet => !sql.includes(snippet));

if (failures.length > 0) {
  console.error('Supabase static verification failed. Missing required migration snippets:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Supabase static verification passed: ${requiredSnippets.length} required migration snippets found.`);
