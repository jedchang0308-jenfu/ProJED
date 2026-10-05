import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { repairMeetingSynthesisStructure } from '../supabase/functions/_shared/meetingSynthesisStructure';
import { getMeetingSynthesisFailureMessage, readMeetingSynthesisFailureDetails } from '../src/utils/meetingSynthesisErrors';

const cases: string[] = [];
const tag = (id: string) => `@[${id.startsWith('child') ? '同名任務' : id}](task:${id})`;
const root = { id: 'root', title: 'root' };
const tasks = ['child-a', 'child-b'].map(id => ({ id, title: '同名任務', path: [root, { id, title: '同名任務' }] }));
const direct = new Set(['child-a', 'child-b']);
const body = 'RD 已確認資料流。\n\n下一步：\n- PM 明天確認驗收文字。';
const content = (heading: string) => `1. 本次會議總結\n- 已確認資料流。\n\n2. 任務討論與結論\n2.1 ${heading}\n${body}`;
const check = (label: string, run: () => void) => { run(); cases.push(label); };
const repair = (heading: string) => repairMeetingSynthesisStructure(content(heading), tasks, direct);

check('missing parent repaired; body unchanged; links derived', () => {
  const result = repair(tag('child-a'));
  assert.equal(result.content, content(`${tag('root')}／${tag('child-a')}`));
  assert.deepEqual(result.linkedTaskIds, ['root', 'child-a']);
  assert.deepEqual(result.repairedTaskIds, ['child-a']);
  assert.deepEqual(result.violations, []);
});
check('reversed path repaired', () => assert.equal(repair(`${tag('child-a')}／${tag('root')}`).content, content(`${tag('root')}／${tag('child-a')}`)));
check('same title uses explicit ID', () => assert.deepEqual(repair(tag('child-b')).linkedTaskIds, ['root', 'child-b']));
check('canonical result is idempotent', () => {
  const first = repair(tag('child-a'));
  const second = repairMeetingSynthesisStructure(first.content, tasks, direct);
  assert.equal(second.content, first.content);
  assert.deepEqual(second.repairedTaskIds, []);
});
check('CRLF and body bytes preserved', () => {
  const original = content(tag('child-a')).replaceAll('\n', '\r\n');
  const result = repairMeetingSynthesisStructure(original, tasks, direct);
  assert.equal(result.content.split('同名任務](task:child-a)')[1], original.split('同名任務](task:child-a)')[1]);
});
check('two sibling IDs are rejected without guessed heading', () => {
  const heading = `${tag('child-a')}／${tag('child-b')}`;
  assert.equal(repair(heading).content, content(heading));
  assert.ok(repair(heading).violations.includes('AMBIGUOUS_TASK_HEADING'));
});
check('foreign parent and unknown inline ID rejected', () => {
  assert.ok(repair(`${tag('foreign')}／${tag('child-a')}`).violations.includes('UNKNOWN_TASK_ID'));
  assert.ok(repairMeetingSynthesisStructure(`${content(tag('child-a'))}\n${tag('foreign')}`, tasks, direct).violations.includes('UNKNOWN_TASK_ID'));
});
check('title alone is not an identity', () => assert.ok(repair('同名任務').violations.includes('TASK_HEADING_WITHOUT_TASK_TAG')));
check('structural-only parent is not promoted to evidence', () => {
  const result = repairMeetingSynthesisStructure(content(tag('root')), [root, ...tasks], direct);
  assert.ok(result.violations.includes('AMBIGUOUS_TASK_HEADING'));
});
check('directly discussed ancestor and child are unambiguous', () => {
  const result = repairMeetingSynthesisStructure(content(`${tag('root')}／${tag('child-a')}`), [root, ...tasks], new Set(['root', 'child-a']));
  assert.deepEqual(result.violations, []);
});
check('source cycle and duplicate source IDs rejected', () => {
  const cycle = [{ ...tasks[0], path: [root, tasks[0], root] }];
  assert.ok(repairMeetingSynthesisStructure(content(tag('child-a')), cycle, direct).violations.includes('INVALID_SOURCE_TASK_PATH'));
  assert.ok(repairMeetingSynthesisStructure(content(tag('child-a')), [tasks[0], tasks[0]], direct).violations.includes('INVALID_SOURCE_TASK_PATH'));
});

const details = readMeetingSynthesisFailureDetails({ runId: 'run-137', functionVersion: 'v4', violations: ['INCOMPLETE_TASK_PATH', 1], affectedTaskIds: ['child-a', 'child-a'] });
check('error trace parsed and deduplicated; legacy quality error localized', () => {
  assert.deepEqual(details?.affectedTaskIds, ['child-a']);
  assert.ok(getMeetingSynthesisFailureMessage('QUALITY_GATE_FAILED', 'English', details).includes('階層標籤不完整'));
  assert.ok(getMeetingSynthesisFailureMessage('QUALITY_GATE_FAILED', 'English').includes('內容品質檢查'));
  assert.equal(readMeetingSynthesisFailureDetails(null), undefined);
});

// Execute the actual Edge handler with a deterministic provider response.
let handler: (req: Request) => Promise<Response>;
let providerContent = content(tag('child-a'));
let inputTasks = tasks;
const logs: unknown[] = [];
const source = readFileSync('supabase/functions/synthesize_meeting_record/index.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const sandbox = vm.createContext({
  serve: (callback: typeof handler) => { handler = callback; },
  repairMeetingSynthesisStructure,
  Deno: { env: { get: (key: string) => key === 'GEMINI_API_KEY' ? 'fixture-only' : 'fixture-model' } },
  crypto: webcrypto, Request, Response,
  fetch: async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ content: providerContent, linkedTaskIds: [] }) }] } }] }), { status: 200 }),
  console: { log: (value: unknown) => logs.push(value), warn: (value: unknown) => logs.push(value), error: (value: unknown) => logs.push(value) },
});
vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, sandbox);
const invoke = () => handler(new Request('https://fixture.local', { method: 'POST', headers: { Authorization: 'Bearer fixture-only', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'DEV-137', rawContent: `${tag('child-a')} RD 已確認資料流。`, taskLinks: [], tasks: inputTasks, activities: [], requiredContractVersion: 'meeting-synthesis-v2' }) }));

let response = await invoke();
assert.equal(response.status, 200);
let payload = await response.json();
assert.equal(payload.content, content(`${tag('root')}／${tag('child-a')}`));
assert.deepEqual(payload.linkedTaskIds, ['root', 'child-a']);
assert.equal(payload.quality.passed, true);
assert.equal(payload.functionVersion, 'synthesize_meeting_record-2026-10-06-v4');
cases.push('actual Edge handler repairs before quality gate');

inputTasks = [{ ...tasks[0], path: [...Array.from({ length: 10 }, (_, index) => ({ id: `level-${index}`, title: `level-${index}` })), { id: 'child-a', title: '同名任務' }] }];
response = await invoke();
assert.equal(response.status, 200);
payload = await response.json();
assert.equal(payload.linkedTaskIds.length, 11);
assert.ok(payload.content.includes('(task:level-9)'));
cases.push('input normalization preserves paths deeper than eight levels');
inputTasks = [{ ...tasks[0], path: Array.from({ length: 81 }, (_, index) => ({ id: `level-${index}`, title: `level-${index}` })) }];
response = await invoke();
assert.equal(response.status, 400);
cases.push('oversized source path rejected before generation instead of truncated');
inputTasks = tasks;

providerContent = content(`${tag('root')}／${tag('child-a')}`) + `\n2.2 ${tag('root')}／${tag('child-a')}\n重複任務段落。`;
response = await invoke();
assert.equal(response.status, 502);
payload = await response.json();
assert.ok(payload.error.details.violations.includes('DUPLICATE_TASK_HEADING'));
cases.push('existing duplicate-heading gate still rejects');

providerContent = content(tag('unknown'));
response = await invoke();
assert.equal(response.status, 502);
payload = await response.json();
assert.equal(payload.error.code, 'QUALITY_GATE_FAILED');
assert.ok(payload.error.message.includes('原草稿已保留'));
assert.ok(payload.error.details.runId);
assert.ok(payload.error.details.violations.includes('UNKNOWN_TASK_ID'));
assert.ok(payload.error.details.affectedTaskIds.includes('unknown'));
assert.equal(payload.content, undefined);
assert.ok(logs.every(line => !String(line).includes(body)));
cases.push('actual Edge failure returns minimal trace, no generated draft');

const clientSource = readFileSync('src/services/meetingSynthesisService.ts', 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
const functionError = Object.assign(new Error('FunctionsHttpError'), { context: new Response(JSON.stringify({ error: { code: 'QUALITY_GATE_FAILED', message: 'AI synthesis output did not pass the meeting record quality gate', details: payload.error.details } }), { status: 502 }) });
const clientExports: Record<string, unknown> = {};
const clientSandbox = vm.createContext({
  exports: clientExports, Error,
  MEETING_SYNTHESIS_CONTRACT_VERSION: 'meeting-synthesis-v2',
  isLocalTestBackend: false, isSupabaseBackend: true, isSupabaseConfigured: true,
  supabase: { functions: { invoke: async () => ({ data: null, error: functionError }) } },
  getMeetingSynthesisFailureMessage, readMeetingSynthesisFailureDetails,
});
vm.runInContext(ts.transpileModule(clientSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, clientSandbox);
await assert.rejects((clientExports.synthesizeMeetingRecord as (input: unknown) => Promise<unknown>)({}), error => {
  const failure = error as Error & { details: typeof details; code: string; status: number };
  assert.equal(failure.code, 'QUALITY_GATE_FAILED');
  assert.equal(failure.status, 502);
  assert.equal(failure.details?.runId, payload.error.details.runId);
  assert.ok(failure.details?.affectedTaskIds.includes('unknown'));
  assert.ok(failure.message.includes('無法確認對應任務'));
  return true;
});
cases.push('actual client service preserves HTTP failure trace and localizes legacy English');

console.log(JSON.stringify({ task: 'DEV-137', passed: cases.length, cases }, null, 2));
