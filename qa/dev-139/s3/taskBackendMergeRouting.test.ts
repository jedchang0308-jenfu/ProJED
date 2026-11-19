import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Load the actual facade with provider doubles. Importing the whole module
// would initialize Firebase/Supabase and browser storage before routing runs.
function facade(backend: 'http' | 'local-test' | 'supabase' | 'firebase') {
  const source = ts.createSourceFile('dataBackend.ts', readFileSync(
    new URL('../../../src/services/dataBackend.ts', import.meta.url), 'utf8',
  ), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations]);
  const declaration = (name: string) => {
    const node = declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name);
    assert.ok(node, `Missing backend facade declaration ${name}`);
    return `const ${node.getText(source)};`;
  };
  const code = ts.transpileModule([
    declaration('rejectHttpUnsupported'), declaration('nodeService'), 'globalThis.facade = nodeService;',
  ].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const calls: Array<{ provider: string; method: string; args: unknown[] }> = [];
  const provider = (name: string) => new Proxy({}, {
    get: (_target, method) => (...args: unknown[]) => {
      calls.push({ provider: name, method: String(method), args });
      return Promise.resolve([]);
    },
  });
  const context = vm.createContext({
    isHttpBackend: backend === 'http',
    isLocalTestBackend: backend === 'local-test',
    isSupabaseBackend: backend === 'supabase',
    httpDomainReadService: provider('http'),
    localTestNodeService: provider('local-test'),
    supabaseNodeService: provider('supabase'),
    firestoreNodeService: provider('firebase'),
  });
  vm.runInContext(code, context, { timeout: 5_000 });
  return {
    calls,
    service: context.facade as {
      commitBoardOrder(command: unknown, canEdit: boolean): Promise<unknown>;
      compareAndSetNotes(...args: unknown[]): Promise<unknown>;
      listByProject(workspaceId: string, boardId: string, signal?: AbortSignal): Promise<unknown>;
    },
  };
}

test('HTTP facade rejects unported order/note writes and forwards read cancellation without calling legacy providers', async () => {
  const { calls, service } = facade('http');
  await assert.rejects(service.commitBoardOrder({ kind: 'move' }, true), /HTTP backend does not support atomic board task ordering/);
  await assert.rejects(service.compareAndSetNotes('workspace', 'board', 'task', {}, {}), /HTTP backend does not support task note compare-and-set/);
  assert.equal(calls.length, 0, 'unsupported HTTP writes must not fall through to Firebase/Supabase');

  const signal = new AbortController().signal;
  await service.listByProject('workspace', 'board', signal);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'http');
  assert.equal(calls[0].method, 'listTasks');
  assert.deepEqual(calls[0].args, ['workspace', 'board', signal]);
});

test('main order and note operations retain each supported legacy backend and its argument contract', async () => {
  for (const backend of ['local-test', 'supabase', 'firebase'] as const) {
    const { calls, service } = facade(backend);
    const command = { kind: 'move' };
    const expected = { detailNotes: [], description: null };
    const next = { detailNotes: [], description: 'draft' };
    await service.commitBoardOrder(command, true);
    await service.compareAndSetNotes('workspace', 'board', 'task', expected, next);
    assert.deepEqual(calls, [
      { provider: backend, method: 'commitBoardOrder', args: backend === 'supabase' ? [command] : [command, true] },
      { provider: backend, method: 'compareAndSetNotes', args: ['workspace', 'board', 'task', expected, next] },
    ]);
  }
});
