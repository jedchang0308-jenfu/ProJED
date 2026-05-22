-- Smoke tests for P9-3 match_project_knowledge v2 RPC

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select has_function('public', 'match_project_knowledge', ARRAY['uuid', 'uuid', 'vector', 'double precision', 'integer'], 'v2 RAG match RPC exists');

select function_returns(
  'public',
  'match_project_knowledge',
  ARRAY['uuid', 'uuid', 'vector', 'double precision', 'integer'],
  'record',
  'v2 RPC returns a table/record type'
);

-- We could insert dummy data to verify the new columns (source_table, source_id, source_type), 
-- but we just want a quick smoke test to make sure it exists and returns a table.

select finish();

rollback;
