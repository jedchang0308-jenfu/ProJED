import fs from 'fs';
import path from 'path';

const readRequiredFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    console.error(`verify:p9-edge-function failed: missing file ${filePath}`);
    process.exit(1);
  }

  return fs.readFileSync(filePath, 'utf-8');
};

const assertIncludes = (content, requiredParts, label) => {
  for (const part of requiredParts) {
    if (!content.includes(part)) {
      console.error(`verify:p9-edge-function failed: ${label} missing required part: ${part}`);
      process.exit(1);
    }
  }
};

const checkEdgeFunction = () => {
  const funcPath = path.resolve(process.cwd(), 'supabase', 'functions', 'match_project_knowledge', 'index.ts');
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase',
    'migrations',
    '20260528102131_p9_match_project_knowledge_v2.sql'
  );

  const functionContent = readRequiredFile(funcPath);
  const migrationContent = readRequiredFile(migrationPath);

  assertIncludes(
    functionContent,
    [
      'serve(',
      'match_project_knowledge',
      'GEMINI_API_KEY',
      'gemini-embedding-001',
      'gemini-3.1-flash-lite',
      'generateContent',
      'x-goog-api-key',
      'llm_access_logs',
      'sourceTable: row.source_table',
      'sourceId: row.source_id',
      'sourceType: row.source_type',
      '目前找不到足夠相關的專案資料。',
    ],
    'Edge Function'
  );

  if (functionContent.includes(':generateContent?key=')) {
    console.error('verify:p9-edge-function failed: Gemini generation API key must not be placed in the URL');
    process.exit(1);
  }

  assertIncludes(
    migrationContent,
    [
      'source_table text',
      'source_id uuid',
      'source_type public.document_source_type',
      'd.rag_enabled = true',
      'public.current_user_is_tenant_member(target_tenant_id)',
      'limit least(match_count, 50)',
      'revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from public',
      'revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from anon',
      'grant execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) to authenticated',
    ],
    'RPC migration'
  );

  console.log('verify:p9-edge-function passed');
};

checkEdgeFunction();
