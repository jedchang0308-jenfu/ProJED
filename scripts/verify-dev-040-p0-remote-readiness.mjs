import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  supabaseConfig: 'supabase/config.toml',
  ragEdgeFunction: 'supabase/functions/match_project_knowledge/index.ts',
  p9EdgeVerifier: 'scripts/verify-p9-edge-function.mjs',
  p0Verifier: 'scripts/verify-dev-040-p0-bounded-failure.mjs',
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

let packageJson = {};
try {
  packageJson = JSON.parse(source.packageJson ?? '{}');
} catch (error) {
  assert('package.json parses as JSON', false, error.message);
}

const readinessScript = packageJson.scripts?.['verify:dev-040-p0-remote-readiness'] ?? '';
const localGateScripts = [
  readinessScript,
  packageJson.scripts?.['verify:dev-040-p0-bounded-failure'] ?? '',
  packageJson.scripts?.['verify:p9-edge-function'] ?? '',
  packageJson.scripts?.['verify:supabase:static'] ?? '',
];

assert(
  'DEV-040 remote readiness package script is a local node verifier, not a deploy command',
  readinessScript === 'node scripts/verify-dev-040-p0-remote-readiness.mjs',
  readinessScript,
);

assert(
  'DEV-040 local gate scripts do not contain direct remote deploy/migration commands',
  localGateScripts.every(command => {
    const lower = command.toLowerCase();
    return !lower.includes('supabase functions deploy') &&
      !lower.includes('supabase db push') &&
      !lower.includes('supabase migration') &&
      !lower.includes('firebase deploy') &&
      !lower.includes('deploy --prod');
  }),
  localGateScripts,
);

assert(
  'Local match_project_knowledge source has bounded timeouts for external and database calls',
  source.ragEdgeFunction.includes('const GEMINI_EMBED_TIMEOUT_MS = 20000') &&
    source.ragEdgeFunction.includes('const GEMINI_GENERATE_TIMEOUT_MS = 30000') &&
    source.ragEdgeFunction.includes('const RAG_RPC_TIMEOUT_MS = 20000') &&
    source.ragEdgeFunction.includes('const LIVE_SNAPSHOT_TIMEOUT_MS = 20000') &&
    source.ragEdgeFunction.includes('class TimeoutError extends Error') &&
    source.ragEdgeFunction.includes('const withTimeout = <T>') &&
    source.ragEdgeFunction.includes('const fetchWithTimeout = (') &&
    source.ragEdgeFunction.includes('createTimeoutSignal(timeoutMs)'),
);

assert(
  'Embedding, database RPC, and live snapshot timeout paths return visible 504 errors',
  source.ragEdgeFunction.includes("GEMINI_EMBED_TIMEOUT_MS, 'Gemini embedding request timed out', 'EMBEDDING_TIMEOUT'") &&
    source.ragEdgeFunction.includes("RAG_RPC_TIMEOUT_MS,\n      'Knowledge database lookup timed out',\n      'RAG_RPC_TIMEOUT'") &&
    source.ragEdgeFunction.includes("LIVE_SNAPSHOT_TIMEOUT_MS,\n        'Live project snapshot timed out',\n        'LIVE_SNAPSHOT_TIMEOUT'") &&
    source.ragEdgeFunction.includes('return createErrorResponse(snapshotError.message, snapshotError.code, 504, origin)') &&
    source.ragEdgeFunction.includes('return createErrorResponse(err.message, err.code, 504, origin)'),
);

assert(
  'Generation timeout path uses bounded fetch and a visible fallback answer',
  source.ragEdgeFunction.includes("GEMINI_GENERATE_TIMEOUT_MS, 'Gemini generation request timed out', 'GENERATION_TIMEOUT'") &&
    source.ragEdgeFunction.includes("answer = '我有找到相關專案資料，但這次 AI 回答生成失敗。請稍後再試，或檢查 Gemini 生成設定。'") &&
    source.ragEdgeFunction.includes("answer = '我有找到相關專案資料，但這次沒有產生可用回答。請換一種問法再試。'"),
);

assert(
  'Edge Function keeps authenticated request context while config verify_jwt remains documented',
  source.supabaseConfig.includes('[functions.match_project_knowledge]') &&
    source.supabaseConfig.includes('verify_jwt = false') &&
    source.ragEdgeFunction.includes("const authHeader = req.headers.get('Authorization')") &&
    source.ragEdgeFunction.includes("return createErrorResponse('Missing Authorization header', 'UNAUTHORIZED', 401, origin)") &&
    source.ragEdgeFunction.includes("global: { headers: { Authorization: authHeader } }"),
);

assert(
  'P9 verifier still covers RPC grants and Edge source contract',
  source.p9EdgeVerifier.includes('match_project_knowledge') &&
    source.p9EdgeVerifier.includes('revoke execute on function public.match_project_knowledge') &&
    source.p9EdgeVerifier.includes('grant execute on function public.match_project_knowledge') &&
    source.p0Verifier.includes('RAG Edge Function bounds Gemini, RPC, and live snapshot calls') &&
    source.p0Verifier.includes('verify:dev-040-p0-bounded-failure'),
);

assert(
  'Governance docs preserve remote deploy stop condition and read-only preflight boundary',
  source.spec.includes('Edge deploy and production injection not authorized') &&
    source.spec.includes('Remote Edge parity 未通過') &&
    source.qa.includes('不允許 remote migration、Edge deploy、production timeout injection 或正式資料異動') &&
    source.qc.includes('未部署 `match_project_knowledge` Edge Function') &&
    source.devTask.includes('Edge Deploy Pending / Production Injection Not Executed') &&
    source.documentationMap.includes('remote Edge 仍未部署 timeout guard'),
);

assert(
  'Read-only discovery evidence confirms remote Edge work is still pending, not completed',
  source.qc.includes('Remote deployed source does not contain the local DEV-040 timeout guard constants / helpers') &&
    source.qc.includes('DEV-040 P0 RAG timeout is not live-complete') &&
    source.devTask.includes('Remote Edge Function `match_project_knowledge` ACTIVE version 4 still lacks local timeout guard constants/helpers') &&
    source.devTask.includes('Next condition: provide Level 3 production-like Edge smoke path or explicit risk acceptance before Edge deploy'),
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
