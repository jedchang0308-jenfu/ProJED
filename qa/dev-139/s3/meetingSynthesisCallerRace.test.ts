import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {
  isProjectChangePreviewForCurrentSource,
  ProjectChangePreviewRequestGate,
  projectChangePreviewSourceKey,
  type ProjectChangePreviewSource,
} from '../../../src/components/Records/projectChangePreviewRequest.js';
import { getMeetingRecordActionState } from '../../../src/utils/meetingRecordWorkflow.js';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createFixtureStore = <T extends Record<string, unknown>>(initial: T) => {
  let state = initial;
  return {
    getState: () => state,
    setState: (patch: Partial<T> | ((current: T) => Partial<T>), replace = false) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = replace ? next as T : { ...state, ...next };
    },
  };
};

type CallerFixture = {
  authStore: ReturnType<typeof createFixtureStore<{ user: Record<string, unknown> | null }>>;
  boardStore: ReturnType<typeof createFixtureStore<{ activeWorkspaceId: string | null; activeBoardId: string | null }>>;
  undoStore: ReturnType<typeof createFixtureStore<Record<string, unknown>>>;
  memberStore: ReturnType<typeof createFixtureStore<Record<string, unknown>>>;
  tagStore: ReturnType<typeof createFixtureStore<Record<string, unknown>>>;
  recordService: { listByProject: (...args: unknown[]) => Promise<unknown[]> };
  eventLogService: { listActivity: (...args: unknown[]) => Promise<unknown[]> };
  synthesize: (...args: unknown[]) => Promise<Record<string, unknown>>;
};

const fixture: CallerFixture = {
  authStore: createFixtureStore<{ user: Record<string, unknown> | null }>({ user: { uid: 'actor-a', authContextId: 'context-a' } }),
  boardStore: createFixtureStore<{ activeWorkspaceId: string | null; activeBoardId: string | null }>({ activeWorkspaceId: 'workspace-a', activeBoardId: 'board-a' }),
  undoStore: createFixtureStore({}),
  memberStore: createFixtureStore({}),
  tagStore: createFixtureStore({}),
  recordService: { listByProject: async () => [] },
  eventLogService: { listActivity: async () => [] },
  synthesize: async () => ({}),
};

(globalThis as unknown as Record<string, unknown>).__DEV139_MEETING_CALLER_FIXTURE__ = fixture;

async function loadRecordStore() {
  const root = process.cwd();
  const virtualModules = new Map<string, string>([
    ['zustand', `
      export function create(initializer) {
        if (typeof initializer !== 'function') return nextInitializer => create(nextInitializer);
        let state;
        const listeners = new Set();
        const getState = () => state;
        const setState = (patch, replace = false) => {
          const next = typeof patch === 'function' ? patch(state) : patch;
          state = replace ? next : Object.assign({}, state, next);
          for (const listener of listeners) listener(state);
        };
        const api = (selector = value => value) => selector(state);
        Object.assign(api, { getState, setState, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } });
        state = initializer(setState, getState, api);
        return api;
      }
    `],
    ['dataBackend', `
      const f = globalThis.__DEV139_MEETING_CALLER_FIXTURE__;
      export const eventLogService = f.eventLogService;
      export const isSupabaseBackend = false;
      export const recordService = f.recordService;
    `],
    ['meetingSynthesisService', `
      export const synthesizeMeetingRecord = (...args) => globalThis.__DEV139_MEETING_CALLER_FIXTURE__.synthesize(...args);
    `],
    ['useAuthStore', `export default globalThis.__DEV139_MEETING_CALLER_FIXTURE__.authStore;`],
    ['useBoardStore', `export default globalThis.__DEV139_MEETING_CALLER_FIXTURE__.boardStore;`],
    ['useUndoStore', `export default globalThis.__DEV139_MEETING_CALLER_FIXTURE__.undoStore;`],
    ['useMemberStore', `export const useMemberStore = globalThis.__DEV139_MEETING_CALLER_FIXTURE__.memberStore;`],
    ['useTagStore', `export const useTagStore = globalThis.__DEV139_MEETING_CALLER_FIXTURE__.tagStore;`],
    ['meetingAnalysisService', `export const meetingAnalysisService = {};`],
    ['meetingRecordAvailability', `export const isMeetingRecordUnavailable = () => false;`],
  ]);
  const result = await build({
    entryPoints: [path.join(root, 'src/store/useRecordStore.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [{
      name: 'dev139-meeting-caller-stubs',
      setup(buildApi) {
        buildApi.onResolve({ filter: /.*/ }, args => {
          const basename = args.path.split('/').pop() ?? args.path;
          const key = args.path === 'zustand' ? 'zustand'
            : basename === 'dataBackend' ? 'dataBackend'
              : basename === 'meetingSynthesisService' ? 'meetingSynthesisService'
                : basename === 'useAuthStore' ? 'useAuthStore'
                  : basename === 'useBoardStore' ? 'useBoardStore'
                    : basename === 'useUndoStore' ? 'useUndoStore'
                      : basename === 'useMemberStore' ? 'useMemberStore'
                        : basename === 'useTagStore' ? 'useTagStore'
                          : basename === 'meetingAnalysisService' ? 'meetingAnalysisService'
                            : basename === 'meetingRecordAvailability' ? 'meetingRecordAvailability'
                              : null;
          return key ? { path: key, namespace: 'dev139-fixture' } : null;
        });
        buildApi.onLoad({ filter: /.*/, namespace: 'dev139-fixture' }, args => ({
          contents: virtualModules.get(args.path),
          loader: 'js',
        }));
      },
    }],
  });
  const encoded = Buffer.from(result.outputFiles[0]!.text).toString('base64');
  return (await import(`data:text/javascript;base64,${encoded}`)).default as {
    getState: () => {
      draft: unknown;
      saving: boolean;
      meetingSynthesisStatus: string;
      meetingProjectImportStatus: string;
      meetingProjectImportRequestId: number;
      synthesizeMeetingDraft: () => Promise<boolean>;
      importMeetingProjectChanges: () => Promise<boolean>;
      updateDraft: (updates: { content: string }) => void;
    };
    setState: (patch: Record<string, unknown>) => void;
  };
}

const recordStorePromise = loadRecordStore();

const validSynthesisResponse = (content = [
  '1. 本次會議總結',
  '- 已確認交付與驗收安排。',
  '',
  '2. 任務討論與結論',
  '',
  '3. 其他',
  '- 保留會議備註。',
].join('\n')) => ({
  content,
  warnings: [],
  linkedTaskIds: [],
  provider: 'fixture-provider',
  contractVersion: 'meeting-synthesis-v2',
  functionVersion: 'fixture-v1',
  runId: 'fixture-run',
  generatedAt: new Date().toISOString(),
  normalization: { receivedActivityCount: 0, acceptedActivityCount: 0, droppedActivityCount: 0 },
  quality: { passed: true, checks: [], violations: [] },
});

function setMeetingFixtureState(store: Awaited<typeof recordStorePromise>, content = '會議速記：下週由團隊完成驗收。') {
  fixture.authStore.setState({ user: { uid: 'actor-a', authContextId: 'context-a' } });
  fixture.boardStore.setState({ activeWorkspaceId: 'workspace-a', activeBoardId: 'board-a' });
  fixture.recordService.listByProject = async () => [];
  fixture.eventLogService.listActivity = async () => [];
  fixture.synthesize = async () => validSynthesisResponse();
  store.setState({
    saving: false,
    isMeetingMode: true,
    draft: {
      id: 'meeting-a',
      type: 'meeting',
      title: '週會',
      content,
      status: 'draft',
      visibility: 'private',
      participantsText: '',
      occurredAt: Date.now(),
      recordedBy: 'actor-a',
      metadata: {},
      taskLinks: [],
    },
    meetingActivities: [],
    meetingSynthesisStatus: 'idle',
    meetingSynthesisError: null,
    meetingSynthesisWarnings: [],
    meetingSynthesisProvider: null,
    meetingProjectImportStatus: 'idle',
    meetingProjectImportMessage: null,
    meetingProjectImportRequestId: 0,
  });
}

test('meeting synthesis applies a valid deferred response and status alone keeps save and publish busy', async () => {
  const store = await recordStorePromise;
  setMeetingFixtureState(store);
  const response = deferred<Record<string, unknown>>();
  fixture.synthesize = () => response.promise;

  const pending = store.getState().synthesizeMeetingDraft();
  assert.equal(store.getState().meetingSynthesisStatus, 'synthesizing');
  assert.equal(store.getState().saving, false);
  const state = getMeetingRecordActionState({
    draft: store.getState().draft as never,
    activeWorkspaceId: 'workspace-a',
    activeBoardId: 'board-a',
    saving: false,
    meetingSynthesisStatus: 'synthesizing',
    meetingActivityCount: 0,
    draftBaselineSignature: null,
    lastSaveFeedback: null,
  });
  assert.equal(state.isSynthesizing, true);
  assert.equal(state.canRunAi, false);
  assert.equal(state.canSaveDraft, false);
  assert.equal(state.canPublish, false);

  response.resolve(validSynthesisResponse());
  assert.equal(await pending, true);
  assert.equal(store.getState().meetingSynthesisStatus, 'ready');
  assert.match(String((store.getState().draft as { content: string }).content), /下週由團隊完成驗收/u);
});

test('manual edit of the same draft cancels deferred synthesis and keeps the edited text', async () => {
  const store = await recordStorePromise;
  setMeetingFixtureState(store);
  const response = deferred<Record<string, unknown>>();
  fixture.synthesize = () => response.promise;

  const pending = store.getState().synthesizeMeetingDraft();
  store.getState().updateDraft({ content: '手動新內容：決定延後驗收。' });
  assert.equal(store.getState().meetingSynthesisStatus, 'idle');
  response.resolve(validSynthesisResponse());

  assert.equal(await pending, false);
  assert.equal((store.getState().draft as { content: string }).content, '手動新內容：決定延後驗收。');
  assert.equal(store.getState().meetingSynthesisStatus, 'idle');
});

test('account, auth-context, and board changes invalidate deferred synthesis and clear only its busy state', async () => {
  const store = await recordStorePromise;
  setMeetingFixtureState(store);
  const response = deferred<Record<string, unknown>>();
  fixture.synthesize = () => response.promise;

  const pending = store.getState().synthesizeMeetingDraft();
  fixture.authStore.setState({ user: { uid: 'actor-b', authContextId: 'context-b' } });
  fixture.boardStore.setState({ activeWorkspaceId: 'workspace-b', activeBoardId: 'board-b' });
  response.resolve(validSynthesisResponse());

  assert.equal(await pending, false);
  assert.equal(store.getState().meetingSynthesisStatus, 'idle');
  assert.equal((store.getState().draft as { content: string }).content, '會議速記：下週由團隊完成驗收。');
});

test('a stale synthesis rejection cannot clear a newer request and the newer response still applies', async () => {
  const store = await recordStorePromise;
  setMeetingFixtureState(store);
  const oldResponse = deferred<Record<string, unknown>>();
  const newResponse = deferred<Record<string, unknown>>();
  let call = 0;
  fixture.synthesize = () => (++call === 1 ? oldResponse.promise : newResponse.promise);

  const oldRequest = store.getState().synthesizeMeetingDraft();
  store.getState().updateDraft({ content: '修訂後內容：週五完成安全驗收。' });
  const newRequest = store.getState().synthesizeMeetingDraft();
  assert.equal(store.getState().meetingSynthesisStatus, 'synthesizing');

  oldResponse.reject(new Error('stale provider failure'));
  assert.equal(await oldRequest, false);
  assert.equal(store.getState().meetingSynthesisStatus, 'synthesizing');
  assert.equal((store.getState().draft as { content: string }).content, '修訂後內容：週五完成安全驗收。');

  newResponse.resolve(validSynthesisResponse());
  assert.equal(await newRequest, true);
  assert.equal(store.getState().meetingSynthesisStatus, 'ready');
  assert.match(String((store.getState().draft as { content: string }).content), /週五完成安全驗收/u);
});

test('a stale import rejection leaves a newer project-import request loading', async () => {
  const store = await recordStorePromise;
  setMeetingFixtureState(store);
  const oldRows = deferred<unknown[]>();
  const newRows = deferred<unknown[]>();
  let call = 0;
  fixture.recordService.listByProject = () => (++call === 1 ? oldRows.promise : newRows.promise);

  const oldRequest = store.getState().importMeetingProjectChanges();
  const oldRequestId = store.getState().meetingProjectImportRequestId;
  store.getState().updateDraft({ content: '同一草稿手動修改。' });
  assert.equal(store.getState().meetingProjectImportStatus, 'idle');
  const newRequest = store.getState().importMeetingProjectChanges();
  const newRequestId = store.getState().meetingProjectImportRequestId;
  assert.ok(newRequestId > oldRequestId);

  oldRows.reject(new Error('stale list failure'));
  assert.equal(await oldRequest, false);
  assert.equal(store.getState().meetingProjectImportStatus, 'loading');
  assert.equal(store.getState().meetingProjectImportRequestId, newRequestId);

  newRows.resolve([]);
  assert.equal(await newRequest, false);
  assert.equal(store.getState().meetingProjectImportStatus, 'empty');
});

const source = (overrides: Partial<ProjectChangePreviewSource> = {}): ProjectChangePreviewSource => ({
  draftId: 'meeting-a',
  draftSignature: 'draft-a',
  accountId: 'actor-a',
  authContextId: 'context-a',
  workspaceId: 'workspace-a',
  boardId: 'board-a',
  ...overrides,
});

type PreviewState = {
  dismissedDraftId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  stepState: 'pending' | 'skipped' | 'inserted';
  previewContent: string;
  eventCount: number;
  message: string | null;
  sourceKey: string | null;
  scope: 'board';
  startedAt: string;
  endedAt: string;
};

const previewState = (overrides: Partial<PreviewState> = {}): PreviewState => ({
  dismissedDraftId: null,
  status: 'idle',
  stepState: 'pending',
  previewContent: '',
  eventCount: 0,
  message: null,
  sourceKey: null,
  scope: 'board',
  startedAt: '2026-10-01',
  endedAt: '2026-10-29',
  ...overrides,
});

test('deferred preview is cleared on same-draft edits and account/context or scope changes', async () => {
  for (const nextSource of [
    source({ draftSignature: 'draft-edited' }),
    source({ accountId: 'actor-b', authContextId: 'context-b' }),
    source({ workspaceId: 'workspace-b', boardId: 'board-b' }),
  ]) {
    const initialSource = source();
    const gate = new ProjectChangePreviewRequestGate(initialSource);
    const requestId = gate.begin(initialSource);
    const body = deferred<string>();
    let state = previewState({ status: 'loading', sourceKey: projectChangePreviewSourceKey(initialSource) });
    const result = body.promise.then(value => {
      if (gate.isCurrent(requestId, nextSource)) {
        state = { ...state, status: 'ready', previewContent: value };
      }
    });

    const transition = gate.reconcileSource(nextSource, state);
    assert.equal(transition.changed, true);
    state = transition.state;
    assert.equal(isProjectChangePreviewForCurrentSource(
      projectChangePreviewSourceKey(initialSource),
      nextSource,
    ), false);
    body.resolve('stale preview');
    await result;

    assert.equal(state.status, 'idle');
    assert.equal(state.previewContent, '');
    assert.equal(state.sourceKey, null);
  }
});

test('a current preview applies, insertion survives its own draft signature update, and later edits remove insertability', () => {
  const initialSource = source();
  const gate = new ProjectChangePreviewRequestGate(initialSource);
  const requestId = gate.begin(initialSource);
  let state = previewState({
    status: 'loading',
    sourceKey: projectChangePreviewSourceKey(initialSource),
  });
  if (gate.isCurrent(requestId, initialSource)) {
    state = { ...state, status: 'ready', previewContent: 'preview content', eventCount: 1 };
  }
  assert.equal(state.status, 'ready');
  assert.equal(state.previewContent, 'preview content');
  assert.equal(isProjectChangePreviewForCurrentSource(state.sourceKey, initialSource), true);

  gate.cancel();
  const insertedSource = source({ draftSignature: 'draft-with-inserted-content' });
  gate.markInserted(insertedSource);
  const insertedState = {
    ...state,
    status: 'ready' as const,
    stepState: 'inserted' as const,
    sourceKey: projectChangePreviewSourceKey(insertedSource),
  };
  const insertionTransition = gate.reconcileSource(insertedSource, insertedState);
  assert.equal(insertionTransition.state.stepState, 'inserted');
  assert.equal(insertionTransition.state.previewContent, 'preview content');
  assert.equal(insertionTransition.state.sourceKey, projectChangePreviewSourceKey(insertedSource));
  assert.equal(isProjectChangePreviewForCurrentSource(insertionTransition.state.sourceKey, insertedSource), true);

  const editedSource = source({ draftSignature: 'draft-edited-after-insert' });
  const editTransition = gate.reconcileSource(editedSource, insertionTransition.state);
  assert.equal(editTransition.state.stepState, 'pending');
  assert.equal(editTransition.state.previewContent, '');
  assert.equal(editTransition.state.sourceKey, null);
});

const HTTP_TIMEOUT_CODE = 'RAG_TIMEOUT';

function loadHttpMeetingSynthesisService(options: {
  readonly timeoutCallback?: (callback: () => void) => ReturnType<typeof setTimeout>;
} = {}) {
  const fixtureState: {
    synthesize: (input: unknown, scope: { signal?: AbortSignal }) => Promise<unknown>;
    HttpApiError: new (code: string, status: number, requestId?: string | null, retryable?: boolean, retryAfterMs?: number, details?: unknown) => Error & { code: string; status: number; details?: unknown };
  } = {
    synthesize: async () => validSynthesisResponse(),
    HttpApiError: class extends Error {
      constructor(
        public code: string,
        public status: number,
        public requestId: string | null = null,
        public retryable = false,
        public retryAfterMs?: number,
        public details?: unknown,
      ) { super(code); }
    },
  };
  const source = readFileSync('src/services/meetingSynthesisService.ts', 'utf8');
  const withoutImports = source.replace(/^import[\s\S]*?;\r?\n/gm, '');
  const compiled = ts.transpileModule(withoutImports, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const setTimeout = options.timeoutCallback ?? globalThis.setTimeout;
  const sandbox = vm.createContext({
    exports,
    module: { exports },
    Error,
    DOMException,
    AbortController,
    setTimeout,
    clearTimeout: globalThis.clearTimeout,
    isHttpBackend: true,
    isLocalTestBackend: false,
    isSupabaseBackend: false,
    isSupabaseConfigured: false,
    supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
    httpMeetingSynthesisService: {
      synthesize: (...args: Parameters<typeof fixtureState.synthesize>) => fixtureState.synthesize(...args),
    },
    HttpApiError: fixtureState.HttpApiError,
    getMeetingSynthesisFailureMessage: (_code: string, fallback: string) => fallback,
    readMeetingSynthesisFailureDetails: () => undefined,
    buildDeterministicMeetingSynthesis: () => validSynthesisResponse(),
    MEETING_SYNTHESIS_CONTRACT_VERSION: 'meeting-synthesis-v2',
    validateMeetingSynthesisOutput: () => ({ passed: true, checks: [], violations: [] }),
  });
  vm.runInContext(compiled, sandbox);
  return {
    synthesizeMeetingRecord: exports.synthesizeMeetingRecord as (input: unknown, context?: { workspaceId?: string; boardId?: string; signal?: AbortSignal }) => Promise<Record<string, unknown>>,
    fixtureState,
  };
}

test('HTTP meeting synthesis falls back only for its local timeout or explicit RAG_TIMEOUT', async () => {
  const service = loadHttpMeetingSynthesisService();
  service.fixtureState.synthesize = async () => {
    throw new service.fixtureState.HttpApiError(HTTP_TIMEOUT_CODE, 504);
  };
  const ragFallback = await service.synthesizeMeetingRecord({}, { workspaceId: 'workspace-a', boardId: 'board-a' });
  assert.equal(ragFallback.provider, 'deterministic-timeout-fallback');

  for (const [code, status] of [['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['DEPENDENCY_UNAVAILABLE', 503], ['PROVIDER_ERROR', 502]] as const) {
    const failingService = loadHttpMeetingSynthesisService();
    failingService.fixtureState.synthesize = async () => {
      throw new failingService.fixtureState.HttpApiError(code, status);
    };
    await assert.rejects(
      failingService.synthesizeMeetingRecord({}, { workspaceId: 'workspace-a', boardId: 'board-a' }),
      (error: unknown) => (error as { code?: string }).code === code,
    );
  }
});

test('caller cancellation is not converted to deterministic fallback and local 30 second timeout remains explicit', async () => {
  const cancelledService = loadHttpMeetingSynthesisService();
  cancelledService.fixtureState.synthesize = (_input, scope) => new Promise((_resolve, reject) => {
    scope.signal?.addEventListener('abort', () => reject(scope.signal?.reason), { once: true });
  });
  const controller = new AbortController();
  const cancelled = cancelledService.synthesizeMeetingRecord({}, {
    workspaceId: 'workspace-a', boardId: 'board-a', signal: controller.signal,
  });
  controller.abort(new DOMException('caller cancelled', 'AbortError'));
  await assert.rejects(cancelled, (error: unknown) => error instanceof Error && error.name === 'AbortError');

  const timedOutService = loadHttpMeetingSynthesisService({
    timeoutCallback: callback => {
      queueMicrotask(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
  });
  timedOutService.fixtureState.synthesize = (_input, scope) => new Promise((_resolve, reject) => {
    if (scope.signal?.aborted) reject(scope.signal.reason);
    else scope.signal?.addEventListener('abort', () => reject(scope.signal?.reason), { once: true });
  });
  const timedFallback = await timedOutService.synthesizeMeetingRecord({}, {
    workspaceId: 'workspace-a', boardId: 'board-a',
  });
  assert.equal(timedFallback.provider, 'deterministic-timeout-fallback');
});
