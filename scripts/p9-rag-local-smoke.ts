import type { TaskNode } from '../src/types';
import { buildRagIndexPlan, validateRagIndexPlan } from '../src/services/rag/indexingPlan';
import { buildWbsRagDocuments } from '../src/services/rag/wbsRagAdapter';

const tenantId = '10000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000002';

const nodes: TaskNode[] = [
  {
    id: '10000000-0000-4000-8000-000000000101',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: null,
    title: 'P9 Index Parent',
    description: 'Parent package for P9 local indexing validation.',
    detailNotes: [{ id: 'note-1', title: 'Risk', content: 'Citation must keep source ids traceable.' }],
    status: 'in_progress',
    nodeType: 'group',
    order: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000102',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: '10000000-0000-4000-8000-000000000101',
    title: 'P9 Index Child',
    description: 'Child task should become a separate RAG document and chunk.',
    status: 'todo',
    nodeType: 'task',
    order: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000103',
    workspaceId: tenantId,
    boardId: projectId,
    parentId: null,
    title: 'Archived task',
    status: 'completed',
    nodeType: 'task',
    order: 3,
    isArchived: true,
  },
];

const fail = (message: string): never => {
  throw new Error(message);
};

const result = buildWbsRagDocuments({ tenantId, projectId, nodes });
const plan = buildRagIndexPlan(result);
const validation = validateRagIndexPlan(plan);

if (!validation.ok) {
  fail(`P9 RAG index plan validation failed: ${JSON.stringify(validation.issues)}`);
}

if (plan.documents.length !== 2) {
  fail(`Expected 2 active WBS documents, got ${plan.documents.length}.`);
}

if (plan.documentVersions.length !== plan.documents.length) {
  fail('Document version count must match document count.');
}

if (plan.chunks.length < plan.documents.length) {
  fail('Expected at least one chunk per active WBS document.');
}

if (plan.embeddingInputs.length !== plan.chunks.length) {
  fail('Embedding inputs must be generated one-to-one with chunks.');
}

if (plan.syncJobs.some(job => job.status !== 'pending')) {
  fail('New RAG sync jobs must start as pending.');
}

const missingCitation = plan.chunks.find(chunk => {
  const citation = chunk.metadata.citation;
  return citation.sourceTable !== 'wbs_items' || !citation.sourceId || citation.sourceType !== 'wbs_item';
});

if (missingCitation) {
  fail(`Chunk is missing WBS citation traceability: ${missingCitation.sourceDocumentKey}.`);
}

console.log(JSON.stringify({
  ok: true,
  documents: plan.documents.length,
  document_versions: plan.documentVersions.length,
  chunks: plan.chunks.length,
  embedding_inputs: plan.embeddingInputs.length,
  sync_jobs: plan.syncJobs.length,
}, null, 2));
