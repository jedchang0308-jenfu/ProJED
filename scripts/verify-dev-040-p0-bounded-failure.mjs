import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  wbsStore: 'src/store/useWbsStore.ts',
  ragRetrievalService: 'src/services/rag/ragRetrievalService.ts',
  ragEdgeFunction: 'supabase/functions/match_project_knowledge/index.ts',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-040-production-environment-risk-hardening.md',
  qa: 'ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md',
  qc: 'ai-doc/qc/QC-DEV-040-production-environment-risk-validation.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'Import path normalizes and persists dependencies after node replacement',
  source.wbsStore.includes('normalizeImportedDependencies') &&
    source.wbsStore.includes('importedNodeIds = new Set(nodesArray.map(node => node.id))') &&
    source.wbsStore.includes('importedDependencies = normalizeImportedDependencies(parsed.dependencies, importedNodeIds)') &&
    source.wbsStore.includes('await dependencyService.set(currentWsId, currentBoardId, dependency);') &&
    source.wbsStore.includes('任務 ${importedNodeIds.size} 筆，依賴 ${importedDependencies.length} 筆'),
);

const importDataStart = source.wbsStore.indexOf('importData: async');
const importDataSource = source.wbsStore.slice(importDataStart);
assert(
  'Import path does not swallow replaceAllByProject errors as silent success',
  importDataSource.includes('await nodeService.replaceAllByProject(currentWsId, currentBoardId, nodesArray);') &&
    importDataSource.includes('await nodeService.replaceAllByProject(currentWsId, currentBoardId, newNodes);') &&
    !importDataSource.includes('replaceAllByProject(currentWsId, currentBoardId, nodesArray).catch(console.error)') &&
    !importDataSource.includes('replaceAllByProject(currentWsId, currentBoardId, newNodes).catch(console.error)'),
);

assert(
  'RAG client invoke has bounded timeout and 504 timeout error',
  source.ragRetrievalService.includes('RAG_RETRIEVAL_TIMEOUT_MS') &&
    source.ragRetrievalService.includes('timeout: RAG_RETRIEVAL_TIMEOUT_MS') &&
    source.ragRetrievalService.includes('RAG_TIMEOUT') &&
    source.ragRetrievalService.includes('504') &&
    source.ragRetrievalService.includes('isTimeoutLikeError'),
);

assert(
  'RAG Edge Function bounds Gemini, RPC, and live snapshot calls',
  source.ragEdgeFunction.includes('GEMINI_EMBED_TIMEOUT_MS') &&
    source.ragEdgeFunction.includes('GEMINI_GENERATE_TIMEOUT_MS') &&
    source.ragEdgeFunction.includes('RAG_RPC_TIMEOUT_MS') &&
    source.ragEdgeFunction.includes('LIVE_SNAPSHOT_TIMEOUT_MS') &&
    source.ragEdgeFunction.includes('class TimeoutError') &&
    source.ragEdgeFunction.includes('fetchWithTimeout(geminiEndpoint') &&
    source.ragEdgeFunction.includes('withTimeout(') &&
    source.ragEdgeFunction.includes('fetchWithTimeout(generateEndpoint') &&
    source.ragEdgeFunction.includes('createErrorResponse(err.message, err.code, 504, origin)'),
);

assert(
  'DEV-040 P0 package script is registered',
  source.packageJson.includes('"verify:dev-040-p0-bounded-failure"'),
);

assert(
  'DEV-040 docs capture P0 scope and latest evidence',
  source.spec.includes('Phase 1: P0 Bounded Failure') &&
    source.qa.includes('QA-P0-001') &&
    source.qc.includes('DEV-040 P0 addendum') &&
    source.devTask.includes('DEV-040 P0 addendum') &&
    source.documentationMap.includes('DEV-040'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
