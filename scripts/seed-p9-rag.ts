import { createClient } from '@supabase/supabase-js';
import { buildRagIndexPlan, validateRagIndexPlan } from '../src/services/rag/indexingPlan';
import { buildWbsRagDocuments } from '../src/services/rag/wbsRagAdapter';
import { chunkText } from '../src/services/rag/chunking';
import { createGeminiEmbeddingProvider } from '../src/services/rag/geminiEmbeddingProvider';
import { runTrustedEmbeddingWorker } from '../src/services/rag/trustedEmbeddingWorker';
import type { RagDocumentDraft } from '../src/services/rag/ragContract';
import type { Database, Json } from '../src/services/supabase/database.types';
import type { TaskDetailNote, TaskNode } from '../src/types';

const tenantId = process.env.P9_RAG_TENANT_ID || 'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1';
const projectId = process.env.P9_RAG_PROJECT_ID || 'b2b2b2b2-c2c2-d2d2-e2e2-f2f2f2f2f2f2';
const userId = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required.`);
  return value;
};

const supabaseUrl = requiredEnv('SUPABASE_URL');
const anonKey = requiredEnv('SUPABASE_ANON_KEY');
const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const geminiApiKey = requiredEnv('GEMINI_API_KEY');
const testEmail = process.env.VITE_SUPABASE_TEST_EMAIL || 'test@example.com';
const testPassword = process.env.VITE_SUPABASE_TEST_PASSWORD || 'password123';
const smokeMode = process.env.P9_RAG_SMOKE_MODE || 'auth';
const embeddingDelayMs = Number(process.env.P9_RAG_EMBEDDING_DELAY_MS ?? 0);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const authClient = createClient<Database>(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fallbackNodes: TaskNode[] = [
  {
    id: 'f1000000-0000-4000-8000-000000000001',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: null,
    title: 'P9 RAG fixed test project',
    description:
      'This fixed local test project verifies that the AI assistant can retrieve project knowledge from Supabase RAG indexes.',
    status: 'in_progress',
    nodeType: 'group',
    order: 1,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    detailNotes: [
      {
        id: 'note-p9-goal',
        title: 'P9 objective',
        content:
          'P9 must support project knowledge retrieval, answer generation, and citations that point back to WBS items.',
      },
    ],
  },
  {
    id: 'f1000000-0000-4000-8000-000000000002',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: 'f1000000-0000-4000-8000-000000000001',
    title: 'Build ingestion runner',
    description:
      'Create a repeatable runner that writes documents, chunks, and Gemini embeddings into Supabase for local P9 testing.',
    status: 'completed',
    nodeType: 'task',
    order: 2,
    startDate: '2026-05-05',
    endDate: '2026-05-12',
    detailNotes: [
      {
        id: 'note-ingestion',
        title: 'Acceptance criteria',
        content:
          'The runner must be idempotent and must produce at least one retrievable citation for AI assistant smoke tests.',
      },
    ],
  },
  {
    id: 'f1000000-0000-4000-8000-000000000003',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: 'f1000000-0000-4000-8000-000000000001',
    title: 'Validate AI assistant retrieval',
    description:
      'Ask the AI assistant what P9 needs and confirm that it retrieves WBS context with citations from the local database.',
    status: 'in_progress',
    nodeType: 'task',
    order: 3,
    startDate: '2026-05-13',
    endDate: '2026-05-20',
    detailNotes: [
      {
        id: 'note-retrieval',
        title: 'Expected result',
        content:
          'The assistant should mention ingestion, embeddings, retrieval, answer generation, and citation verification.',
      },
    ],
  },
];

const assertNoError = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const vectorLiteral = (values: number[]) => `[${values.join(',')}]`;

const stableHash = (content: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const isDetailNote = (value: unknown): value is TaskDetailNote => {
  if (!value || typeof value !== 'object') return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string';
};

const parseDetailNotes = (value: Json): TaskDetailNote[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isDetailNote);
};

const seedFallbackWbsItems = async () => {
  const rows = fallbackNodes.map(node => ({
    id: node.id,
    tenant_id: tenantId,
    project_id: projectId,
    parent_id: node.parentId,
    legacy_node_id: node.id,
    title: node.title,
    description: node.description ?? null,
    detail_notes: (node.detailNotes ?? []) as unknown as Json,
    status: node.status,
    start_date: node.startDate ?? null,
    end_date: node.endDate ?? null,
    is_duration_locked: node.isDurationLocked ?? false,
    item_type: node.nodeType ?? 'task',
    kanban_stage_id: node.kanbanStageId ?? null,
    sort_order: node.order,
    depth: node.parentId ? 1 : 0,
    path: node.parentId ? [node.parentId, node.id] : [node.id],
    is_archived: node.isArchived ?? false,
    metadata: { seededBy: 'seed:p9-rag' } as Json,
    created_by: userId,
    updated_by: userId,
  }));

  const { error } = await serviceClient
    .from('wbs_items')
    .upsert(rows, { onConflict: 'id' });
  assertNoError('wbs_items upsert', error);
};

const loadCurrentWbsNodes = async (): Promise<TaskNode[]> => {
  const { data, error } = await serviceClient
    .from('wbs_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  assertNoError('wbs_items select', error);

  return (data ?? []).map(item => ({
    id: item.id,
    workspaceId: item.tenant_id,
    boardId: item.project_id,
    parentId: item.parent_id,
    title: item.title,
    description: item.description ?? undefined,
    detailNotes: parseDetailNotes(item.detail_notes),
    status: item.status,
    assigneeId: item.assignee_id ?? undefined,
    collaboratorIds: item.collaborator_ids ?? [],
    startDate: item.start_date ?? undefined,
    endDate: item.end_date ?? undefined,
    isDurationLocked: item.is_duration_locked,
    nodeType: item.item_type,
    kanbanStageId: item.kanban_stage_id ?? undefined,
    order: item.sort_order,
    createdAt: item.created_at ? Date.parse(item.created_at) : undefined,
    updatedAt: item.updated_at ? Date.parse(item.updated_at) : undefined,
    isArchived: item.is_archived,
  }));
};

const disablePlaceholderDocuments = async () => {
  const { error } = await serviceClient
    .from('documents')
    .update({ rag_enabled: false })
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .is('source_table', null);
  assertNoError('placeholder documents disable', error);
};

const buildProjectSummaryRagInput = (nodes: TaskNode[]) => {
  const activeNodes = nodes.filter(node => !node.isArchived);
  const countsByStatus = activeNodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.status] = (acc[node.status] ?? 0) + 1;
    return acc;
  }, {});

  const lines = [
    'Project summary for P9 RAG indexing.',
    `Total active WBS items: ${activeNodes.length}`,
    `Total active tasks including groups and milestones: ${activeNodes.length}`,
    `Status counts: ${Object.entries(countsByStatus).map(([status, count]) => `${status}=${count}`).join(', ') || 'none'}`,
    'WBS item list:',
    ...activeNodes.map((node, index) => `${index + 1}. ${node.title} | type=${node.nodeType ?? 'task'} | status=${node.status}`),
  ];
  const content = lines.join('\n');
  const contentHash = stableHash(content);
  const sourceId = projectId;

  const summaryDocument: RagDocumentDraft = {
    tenantId,
    projectId,
    sourceType: 'project_note',
    sourceTable: 'projects',
    sourceId,
    title: 'P9 WBS Current Summary',
    content,
    contentHash,
    visibility: 'project',
    metadata: {
      seededBy: 'seed:p9-rag',
      summaryType: 'wbs_current_summary',
      activeWbsItemCount: activeNodes.length,
      countsByStatus,
    },
  };

  const citation = {
    documentId: null,
    chunkId: null,
    sourceTable: 'projects' as const,
    sourceId,
    sourceType: 'project_note' as const,
    title: summaryDocument.title,
  };

  return {
    documents: [summaryDocument],
    chunks: chunkText({
      tenantId,
      sourceDocumentId: sourceId,
      content,
      citation,
      sourceContentHash: contentHash,
    }),
  };
};

const runRetrievalSmoke = async (query: string) => {
  const provider = createGeminiEmbeddingProvider({ apiKey: geminiApiKey });
  const queryEmbedding = await provider.embed({
    sourceDocumentKey: 'p9-smoke-query',
    chunkIndex: 0,
    provider: provider.provider,
    model: provider.model,
    dimensions: provider.dimensions,
    content: query,
    contentHash: 'p9-smoke-query',
    citation: {
      documentId: null,
      chunkId: null,
      sourceTable: 'documents',
      sourceId: '00000000-0000-4000-8000-000000000000',
      sourceType: 'project_note',
      title: 'P9 smoke query',
    },
  });

  const rpcClient = smokeMode === 'service' ? serviceClient : authClient;

  if (smokeMode !== 'service') {
    const { data: login, error: loginError } = await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    assertNoError('auth signInWithPassword', loginError);
    if (!login.session?.access_token) throw new Error('auth signInWithPassword returned no access token.');
  }

  const { data, error } = await rpcClient.rpc('match_project_knowledge', {
    target_tenant_id: tenantId,
    target_project_id: projectId,
    query_embedding: vectorLiteral(queryEmbedding),
    match_threshold: 0.35,
    match_count: 5,
  });
  assertNoError('match_project_knowledge smoke', error);

  if (!data?.length) {
    throw new Error('RAG retrieval smoke returned no matches.');
  }

  return {
    query,
    matches: data.length,
    topTitle: data[0]?.title,
    topSimilarity: data[0]?.similarity,
  };
};

let nodes = await loadCurrentWbsNodes();
if (nodes.length === 0) {
  await seedFallbackWbsItems();
  nodes = await loadCurrentWbsNodes();
}

await disablePlaceholderDocuments();

const wbsInput = buildWbsRagDocuments({ tenantId, projectId, nodes });
const summaryInput = buildProjectSummaryRagInput(nodes);
const plan = buildRagIndexPlan({
  documents: [...summaryInput.documents, ...wbsInput.documents],
  chunks: [...summaryInput.chunks, ...wbsInput.chunks],
});
const validation = validateRagIndexPlan(plan);
if (!validation.ok) {
  throw new Error(`Invalid RAG index plan: ${JSON.stringify(validation.issues, null, 2)}`);
}

const baseProvider = createGeminiEmbeddingProvider({ apiKey: geminiApiKey });
const provider = {
  ...baseProvider,
  embed: async (input: Parameters<typeof baseProvider.embed>[0]) => {
    if (embeddingDelayMs > 0) await sleep(embeddingDelayMs);
    return baseProvider.embed(input);
  },
};
const result = await runTrustedEmbeddingWorker(serviceClient, provider, plan, { dryRun: false });
const smoke = await runRetrievalSmoke('How many WBS tasks are indexed and what does P9 need for AI assistant retrieval?');

console.log(JSON.stringify({
  ok: true,
  tenantId,
  projectId,
  wbsItems: nodes.length,
  indexed: result,
  smoke,
}, null, 2));
