import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/services/supabase/database.types';
import { buildRagIndexPlan } from '../src/services/rag/indexingPlan';
import { buildWbsRagDocuments } from '../src/services/rag/wbsRagAdapter';
import { runTrustedEmbeddingWorker } from '../src/services/rag/trustedEmbeddingWorker';
import {
  RAG_EMBEDDING_DIMENSIONS,
  RAG_EMBEDDING_MODEL,
  RAG_EMBEDDING_PROVIDER,
} from '../src/services/rag/ragContract';
import type { EmbeddingProvider } from '../src/services/rag/geminiEmbeddingProvider';
import type { TaskNode } from '../src/types';

const tenantId = '20000000-0000-4000-8000-000000000001';
const projectId = '20000000-0000-4000-8000-000000000002';

const nodes: TaskNode[] = [
  {
    id: '20000000-0000-4000-8000-000000000101',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: null,
    title: 'Trusted worker dry run',
    description: 'Dry-run mode must not call Gemini or write Supabase.',
    status: 'todo',
    nodeType: 'task',
    order: 1,
  },
];

const provider: EmbeddingProvider = {
  provider: RAG_EMBEDDING_PROVIDER,
  model: RAG_EMBEDDING_MODEL,
  dimensions: RAG_EMBEDDING_DIMENSIONS,
  embed: async () => {
    throw new Error('Dry-run worker must not call the embedding provider.');
  },
};

const plan = buildRagIndexPlan(buildWbsRagDocuments({ tenantId, projectId, nodes }));
const result = await runTrustedEmbeddingWorker({} as SupabaseClient<Database>, provider, plan, { dryRun: true });

if (!result.ok || !result.dryRun) {
  throw new Error(`Expected successful dry-run result: ${JSON.stringify(result)}`);
}

if (result.documents !== 1 || result.documentVersions !== 1 || result.chunks !== 1 || result.embeddings !== 1 || result.syncJobs !== 1) {
  throw new Error(`Unexpected dry-run counts: ${JSON.stringify(result)}`);
}

console.log(JSON.stringify(result, null, 2));
