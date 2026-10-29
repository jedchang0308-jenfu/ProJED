import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import path from 'node:path';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type Scope = {
  accountId: string | null;
  authContextId: string | null;
  tenantId: string | null;
  projectId: string | null;
  recordId: string | null;
  captureId: string | null;
};

type Props = {
  tenantId: string | null;
  projectId: string | null;
  initialCaptureId?: string | null;
  scope: Scope;
  readCurrentScope: () => Scope;
  onEnsureSaved: () => Promise<string | null>;
  onCaptureStarted?: (captureId: string) => void;
};

type MediaTrack = { stopped: boolean; stop: () => void; addEventListener: (...args: unknown[]) => void };
type MediaStreamFixture = { label: string; track: MediaTrack; getTracks: () => MediaTrack[] };
type PointerObserverOptions = {
  captureId: string;
  initialSequence?: number;
  getCaptureOffsetMs: () => number;
  getClockEpoch: () => number;
  isRecording: () => boolean;
  onFlush?: (intervals: Array<Record<string, unknown>>) => void;
};
type AudioRow = { scope: unknown; manifest: Record<string, unknown>; blob: Blob };
type OutboxFixture = {
  audioRows: AudioRow[];
  pointerRows: Array<{ scope: unknown; batchKey: string; digest: string; intervals: unknown[] }>;
  audioPuts: AudioRow[];
  audioDeletes: Array<{ scope: unknown; segmentId: string }>;
  pointerPuts: unknown[];
  pointerDeletes: unknown[];
};
type ReactFixture = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
  useState: <T>(initial: T | (() => T)) => [T, (value: T | ((current: T) => T)) => void];
  useRef: <T>(initial: T) => { current: T };
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => void;
  useLayoutEffect: (effect: () => void | (() => void), deps: unknown[]) => void;
  useMemo: <T>(factory: () => T, deps: unknown[]) => T;
  useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps: unknown[]) => T;
};

type ServiceFixture = Record<string, (...args: any[]) => unknown>;

type Fixture = {
  react: ReactFixture | null;
  service: ServiceFixture;
  serviceCalls: Array<{ name: string; args: unknown[] }>;
  outbox: OutboxFixture;
  pointerObservers: Array<{ captureId: string; initialSequence: number }>;
  pointerIntervalFactory: (options: PointerObserverOptions) => Array<Record<string, unknown>>;
  attachMeetingPointerObserver: (options: PointerObserverOptions) => { flush: (reason?: string) => Array<Record<string, unknown>>; dispose: () => void };
  createScopedMeetingRecordingService: (isCurrent: () => boolean, signal?: AbortSignal) => ServiceFixture;
  getUserMedia: () => Promise<MediaStreamFixture>;
  mediaRecorderInstances: FakeMediaRecorder[];
  setStateAfterUnmount: number;
  mounted: boolean;
};

const fixture: Fixture = {
  react: null,
  service: {},
  serviceCalls: [],
  outbox: {
    audioRows: [], pointerRows: [], audioPuts: [], audioDeletes: [], pointerPuts: [], pointerDeletes: [],
  },
  pointerObservers: [],
  pointerIntervalFactory: () => [],
  attachMeetingPointerObserver: () => ({ flush: () => [], dispose: () => undefined }),
  createScopedMeetingRecordingService: () => ({}),
  getUserMedia: async () => { throw new Error('getUserMedia fixture was not configured'); },
  mediaRecorderInstances: [],
  setStateAfterUnmount: 0,
  mounted: false,
};

(globalThis as unknown as Record<string, unknown>).__DEV139_MEETING_RECORDING_FIXTURE__ = fixture;

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  constructor(readonly stream: MediaStreamFixture) { FakeMediaRecorder.instances.push(this); }
  start() { this.startCalls += 1; this.state = 'recording'; }
  stop() { this.stopCalls += 1; this.state = 'inactive'; }
  emitData(bytes: number[]) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) }); }
  emitStop() { this.state = 'inactive'; this.onstop?.(); }
}

async function loadComponent() {
  const result = await build({
    entryPoints: [path.join(process.cwd(), 'src/components/Records/MeetingRecordingControls.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'transform',
    tsconfigRaw: { compilerOptions: { jsx: 'react' } },
    write: false,
    plugins: [{
      name: 'dev139-meeting-recording-fixtures',
      setup(buildApi) {
        buildApi.onResolve({ filter: /.*/ }, args => {
          const basename = args.path.split('/').pop() ?? args.path;
          const fixtureModule = args.path === 'react' || args.path === 'lucide-react'
            || basename === 'meetingAnalysisService' || basename === 'meetingRecordingService'
            || basename === 'meetingAudioOutbox' || basename === 'meetingPointerEvidence'
            || basename === 'meetingAnalysisContract';
          if (!fixtureModule) return null;
          const key = args.path === 'react' || args.path === 'lucide-react' ? args.path : basename;
          return { path: key, namespace: 'dev139-meeting-recording-fixture' };
        });
        buildApi.onLoad({ filter: /.*/, namespace: 'dev139-meeting-recording-fixture' }, args => {
          if (args.path === 'react') return {
            contents: `
              const f = globalThis.__DEV139_MEETING_RECORDING_FIXTURE__;
              const React = {
                createElement: (...args) => f.react.createElement(...args),
                useState: (...args) => f.react.useState(...args),
                useRef: (...args) => f.react.useRef(...args),
                useEffect: (...args) => f.react.useEffect(...args),
                useLayoutEffect: (...args) => f.react.useLayoutEffect(...args),
                useMemo: (...args) => f.react.useMemo(...args),
                useCallback: (...args) => f.react.useCallback(...args),
              };
              export default React;
            `,
            loader: 'js',
          };
          if (args.path === 'lucide-react') return {
            contents: "export const Loader2='Loader2', Mic='Mic', Pause='Pause', Play='Play', Square='Square';",
            loader: 'js',
          };
          if (args.path === 'meetingAnalysisContract') return {
            contents: `
              export const MEETING_AUDIO_SEGMENT_MS = 300000;
              export const createCaptureEpoch = (epoch, captureOffsetMs, startedAt) => ({ epoch, captureOffsetMs, startedAt, durationMs: 0, gapBeforeMs: 0 });
            `,
            loader: 'js',
          };
          if (args.path === 'meetingPointerEvidence') return {
            contents: `
              const f = globalThis.__DEV139_MEETING_RECORDING_FIXTURE__;
              export const attachMeetingPointerObserver = (...args) => f.attachMeetingPointerObserver(...args);
            `,
            loader: 'js',
          };
          if (args.path === 'meetingAudioOutbox') return {
            contents: `
              const f = globalThis.__DEV139_MEETING_RECORDING_FIXTURE__;
              export const putMeetingAudioSegment = (...args) => f.outbox.putMeetingAudioSegment(...args);
              export const listMeetingAudioSegments = (...args) => f.outbox.listMeetingAudioSegments(...args);
              export const deleteMeetingAudioSegment = (...args) => f.outbox.deleteMeetingAudioSegment(...args);
              export const putMeetingPointerBatch = (...args) => f.outbox.putMeetingPointerBatch(...args);
              export const listMeetingPointerBatches = (...args) => f.outbox.listMeetingPointerBatches(...args);
              export const deleteMeetingPointerBatch = (...args) => f.outbox.deleteMeetingPointerBatch(...args);
            `,
            loader: 'js',
          };
          return {
            contents: `
              const f = globalThis.__DEV139_MEETING_RECORDING_FIXTURE__;
              export const meetingAnalysisService = f.service;
              export const createScopedMeetingRecordingService = (...args) => f.createScopedMeetingRecordingService(...args);
            `,
            loader: 'js',
          };
        });
      },
    }],
  });
  const encoded = Buffer.from(result.outputFiles[0]!.text).toString('base64');
  return (await import(`data:text/javascript;base64,${encoded}`)).default as (props: Props) => unknown;
}

const componentPromise = loadComponent();

type Hook = { kind: 'state' | 'ref' | 'effect' | 'memo'; value?: unknown; deps?: unknown[]; cleanup?: () => void };

const sameDeps = (left: unknown[] | undefined, right: unknown[]) => Boolean(
  left && left.length === right.length && left.every((value, index) => Object.is(value, right[index])),
);

function createHookRunner(component: (props: Props) => unknown) {
  const hooks: Hook[] = [];
  let hookIndex = 0;
  let pendingEffects: Array<{ index: number; deps: unknown[]; effect: () => void | (() => void) }> = [];
  let dirty = false;
  let props: Props;
  let tree: unknown;
  fixture.mounted = true;
  fixture.setStateAfterUnmount = 0;

  function scheduleEffect(effect: () => void | (() => void), deps: unknown[]) {
    const index = hookIndex++;
    if (!hooks[index]) hooks[index] = { kind: 'effect' };
    const slot = hooks[index]!;
    assert.equal(slot.kind, 'effect');
    if (!sameDeps(slot.deps, deps)) pendingEffects.push({ index, deps: [...deps], effect });
  }

  const runtime: ReactFixture = {
    createElement: (type, elementProps, ...children) => ({ type, props: elementProps ?? {}, children }),
    useState: <T,>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] => {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { kind: 'state', value: typeof initial === 'function' ? (initial as () => T)() : initial };
      const slot = hooks[index]!;
      assert.equal(slot.kind, 'state');
      return [slot.value as T, value => {
        if (!fixture.mounted) fixture.setStateAfterUnmount += 1;
        const current = slot.value as T;
        const next = typeof value === 'function' ? (value as (current: T) => T)(current) : value;
        if (!Object.is(current, next)) { slot.value = next; dirty = true; }
      }];
    },
    useRef: <T,>(initial: T): { current: T } => {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { kind: 'ref', value: { current: initial } };
      const slot = hooks[index]!;
      assert.equal(slot.kind, 'ref');
      return slot.value as { current: T };
    },
    useEffect: (effect, deps) => scheduleEffect(effect, deps),
    useLayoutEffect: (effect, deps) => scheduleEffect(effect, deps),
    useMemo: <T,>(factory: () => T, deps: unknown[]): T => {
      const index = hookIndex++;
      const slot = hooks[index];
      if (!slot || !sameDeps(slot.deps, deps)) hooks[index] = { kind: 'memo', value: factory(), deps: [...deps] };
      return hooks[index]!.value as T;
    },
    useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps: unknown[]): T => runtime.useMemo(() => callback, deps),
  };

  function render(nextProps: Props) {
    props = nextProps;
    let passes = 0;
    do {
      dirty = false;
      hookIndex = 0;
      pendingEffects = [];
      tree = component(props);
      const effects = pendingEffects;
      pendingEffects = [];
      for (const item of effects) {
        const slot = hooks[item.index]!;
        slot.cleanup?.();
        slot.deps = item.deps;
        const cleanup = item.effect();
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
      passes += 1;
      if (passes > 12) throw new Error('Fixture React render did not settle');
    } while (dirty);
    return tree;
  }

  function unmount() {
    fixture.mounted = false;
    for (const hook of [...hooks].reverse()) hook.cleanup?.();
  }

  return { runtime, render, unmount, get tree() { return tree; } };
}

function installBrowserStubs() {
  const root = globalThis as unknown as Record<string, unknown>;
  const oldWindow = root.window;
  const oldMediaRecorder = root.MediaRecorder;
  const oldNavigator = Object.getOwnPropertyDescriptor(root, 'navigator');
  const oldCrypto = Object.getOwnPropertyDescriptor(root, 'crypto');
  let nextTimerId = 0;
  let nextUuid = 0;
  const timeouts = new Map<number, { callback: () => void; delay: number }>();
  const windowStub = {
    setInterval: () => ++nextTimerId,
    clearInterval: () => undefined,
    setTimeout: (callback: () => void, delay = 0) => {
      const id = ++nextTimerId;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id: number) => { timeouts.delete(id); },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  FakeMediaRecorder.instances = [];
  fixture.mediaRecorderInstances = FakeMediaRecorder.instances;
  Object.defineProperty(root, 'window', { configurable: true, value: windowStub });
  Object.defineProperty(root, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(root, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => fixture.getUserMedia() } },
  });
  Object.defineProperty(root, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => `00000000-0000-4000-8000-${String(++nextUuid).padStart(12, '0')}`,
      subtle: { digest: async () => new Uint8Array(32).buffer },
    },
  });
  return {
    runTimeout(delay?: number) {
      const item = [...timeouts.entries()].find(([, timer]) => delay === undefined || timer.delay === delay);
      if (!item) throw new Error(`No timeout found${delay === undefined ? '' : ` for delay ${delay}`}`);
      timeouts.delete(item[0]);
      item[1].callback();
    },
    pendingTimeouts: () => [...timeouts.values()].map(timer => timer.delay),
    restore: () => {
      if (oldWindow === undefined) delete root.window;
      else Object.defineProperty(root, 'window', { configurable: true, value: oldWindow });
      if (oldMediaRecorder === undefined) delete root.MediaRecorder;
      else Object.defineProperty(root, 'MediaRecorder', { configurable: true, value: oldMediaRecorder });
      if (oldNavigator) Object.defineProperty(root, 'navigator', oldNavigator);
      else delete root.navigator;
      if (oldCrypto) Object.defineProperty(root, 'crypto', oldCrypto);
      else delete root.crypto;
    },
  };
}

const makeScope = (suffix: string, captureId: string | null = null): Scope => ({
  accountId: `account-${suffix}`,
  authContextId: `context-${suffix}`,
  tenantId: `11111111-1111-4111-8111-11111111111${suffix === 'a' ? '1' : '2'}`,
  projectId: `22222222-2222-4222-8222-22222222222${suffix === 'a' ? '1' : '2'}`,
  recordId: `33333333-3333-4333-8333-33333333333${suffix === 'a' ? '1' : '2'}`,
  captureId,
});

const serviceDefaults = (): ServiceFixture => ({
  begin: async (payload: Record<string, unknown>) => ({
    captureId: `capture-${String(payload.recordId)}`,
    state: 'recording',
    sourceVersion: 1,
    startedAt: new Date(0).toISOString(),
  }),
  status: async () => ({ state: 'recording', sourceVersion: 1, pointerLoss: false }),
  progress: async () => ({}),
  pause: async () => ({}),
  resume: async () => ({}),
  stop: async () => ({}),
  appendPointer: async () => ({ ackSequence: 0 }),
  completeUpload: async () => ({ state: 'queued', runId: null, sourceVersion: 1, sourceComplete: true }),
  reserveSegment: async () => ({}),
  verifySegment: async () => ({}),
  uploadSegment: async (_captureId: string, segmentIndex: number, blob: Blob) => ({
    segmentId: `segment-${segmentIndex}`, sourceVersion: 1, segmentIndex,
    path: `storage-path-${segmentIndex}`, token: null, signedUrl: null, expiresAt: Date.now() + 1000,
    uploadState: 'verified', sha256: 'a'.repeat(64), bytes: blob.size,
  }),
});

function resetFixture(service: ServiceFixture = serviceDefaults()) {
  fixture.react = null;
  fixture.service = service;
  fixture.serviceCalls = [];
  fixture.pointerObservers = [];
  fixture.pointerIntervalFactory = () => [];
  fixture.attachMeetingPointerObserver = options => {
    const initialSequence = options.initialSequence ?? 0;
    fixture.pointerObservers.push({ captureId: options.captureId, initialSequence });
    let flushed = false;
    const flush = (reason = 'flush') => {
      if (flushed || !options.isRecording()) return [];
      flushed = true;
      const intervals = fixture.pointerIntervalFactory(options).map(interval => ({ ...interval, terminationReason: reason }));
      if (intervals.length) options.onFlush?.(intervals);
      return intervals;
    };
    return { flush, dispose: () => { flush('dispose'); } };
  };
  fixture.outbox = { audioRows: [], pointerRows: [], audioPuts: [], audioDeletes: [], pointerPuts: [], pointerDeletes: [] };
  fixture.getUserMedia = async () => makeStream('default');
  fixture.setStateAfterUnmount = 0;
  fixture.createScopedMeetingRecordingService = (isCurrent, signal) => {
    const assertCurrent = () => {
      if (signal?.aborted || !isCurrent()) throw Object.assign(new Error('scope changed'), { code: 'MEETING_RECORDING_SCOPE_CHANGED' });
    };
    return Object.fromEntries(Object.keys(service).map(name => [name, async (...args: unknown[]) => {
      assertCurrent();
      fixture.serviceCalls.push({ name, args });
      try {
        const result = await service[name]!(...args);
        assertCurrent();
        return result;
      } catch (error) {
        assertCurrent();
        throw error;
      }
    }])) as ServiceFixture;
  };
  fixture.outbox.audioRows = [];
  fixture.outbox.pointerRows = [];
  fixture.outbox.audioPuts = [];
  fixture.outbox.audioDeletes = [];
  fixture.outbox.pointerPuts = [];
  fixture.outbox.pointerDeletes = [];
  Object.assign(fixture.outbox, {
    putMeetingAudioSegment: async (scope: unknown, manifest: Record<string, unknown>, blob: Blob) => {
      const row = { scope: structuredClone(scope), manifest: { ...manifest }, blob };
      fixture.outbox.audioPuts.push(row);
      fixture.outbox.audioRows.push(row);
    },
    listMeetingAudioSegments: async (scope: unknown) => fixture.outbox.audioRows.filter(row => sameScope(row.scope, scope)),
    deleteMeetingAudioSegment: async (scope: unknown, segmentId: string) => {
      fixture.outbox.audioDeletes.push({ scope: structuredClone(scope), segmentId });
      fixture.outbox.audioRows = fixture.outbox.audioRows.filter(row => !(sameScope(row.scope, scope) && row.manifest.segmentId === segmentId));
      return true;
    },
    putMeetingPointerBatch: async (...args: unknown[]) => { fixture.outbox.pointerPuts.push(args); },
    listMeetingPointerBatches: async (scope: unknown) => fixture.outbox.pointerRows.filter(row => sameScope(row.scope, scope)),
    deleteMeetingPointerBatch: async (...args: unknown[]) => { fixture.outbox.pointerDeletes.push(args); return true; },
  });
  return fixture.outbox;
}

function sameScope(left: unknown, right: unknown): boolean {
  return Boolean(left && right && typeof left === 'object' && typeof right === 'object'
    && Object.keys(right).every(key => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]));
}

function makeStream(label: string): MediaStreamFixture {
  const track: MediaTrack = { stopped: false, stop() { this.stopped = true; }, addEventListener: () => undefined };
  return { label, track, getTracks: () => [track] };
}

function createHarness(component: (props: Props) => unknown) {
  const runner = createHookRunner(component);
  fixture.react = runner.runtime;
  return runner;
}

function findElements(tree: unknown, predicate: (element: { type: unknown; props: Record<string, unknown> }) => boolean) {
  const found: Array<{ type: unknown; props: Record<string, unknown>; children: unknown[] }> = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    const element = node as { type: unknown; props: Record<string, unknown>; children?: unknown[] };
    if (predicate(element)) found.push(element as { type: unknown; props: Record<string, unknown>; children: unknown[] });
    element.children?.forEach(visit);
  };
  visit(tree);
  return found;
}

function click(element: { props: Record<string, unknown> } | undefined) {
  const handler = element?.props.onClick;
  if (typeof handler === 'function') handler({});
}

function startButton(tree: unknown) {
  return findElements(tree, item => item.type === 'button' && item.props['data-meeting-recording-toggle'] === true)[0];
}

const propsFor = (scope: Scope, readCurrentScope: () => Scope, overrides: Partial<Props> = {}): Props => ({
  tenantId: scope.tenantId,
  projectId: scope.projectId,
  initialCaptureId: scope.captureId,
  scope,
  readCurrentScope,
  onEnsureSaved: async () => scope.recordId,
  ...overrides,
});

async function settle(runner: ReturnType<typeof createHookRunner>, props: Props, rounds = 8) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
  for (let index = 0; index < 4; index += 1) await new Promise<void>(resolve => setImmediate(resolve));
  runner.render(props);
  for (let index = 0; index < 3; index += 1) await Promise.resolve();
  runner.render(props);
}

test('late microphone permission after account, auth context, and record switch stops its stream without begin', async () => {
  const component = await componentPromise;
  resetFixture();
  const browser = installBrowserStubs();
  try {
    const scopeA = makeScope('a');
    let currentScope = scopeA;
    const permission = deferred<MediaStreamFixture>();
    const stream = makeStream('stale-a');
    let permissionCalls = 0;
    fixture.getUserMedia = () => { permissionCalls += 1; return permission.promise; };
    const beginCalls: unknown[] = [];
    fixture.service.begin = async payload => { beginCalls.push(payload); return { captureId: 'capture-a', sourceVersion: 1, state: 'recording', startedAt: '' }; };
    const runner = createHarness(component);
    const initial = propsFor(scopeA, () => currentScope);
    runner.render(initial);
    click(startButton(runner.tree));
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    assert.equal(permissionCalls, 1);

    const scopeB = makeScope('b');
    currentScope = scopeB;
    const next = propsFor(scopeB, () => currentScope);
    runner.render(next);
    permission.resolve(stream);
    await settle(runner, next);

    assert.equal(beginCalls.length, 0);
    assert.equal(stream.track.stopped, true);
    assert.equal(fixture.mediaRecorderInstances.length, 0);
    runner.unmount();
  } finally { browser.restore(); }
});

test('late begin after scope switch cannot start recorder or invoke capture callback; old finally cannot clear new start', async () => {
  const component = await componentPromise;
  resetFixture();
  const browser = installBrowserStubs();
  try {
    const scopeA = makeScope('a');
    const scopeB = makeScope('b');
    let currentScope = scopeA;
    const streamA = makeStream('stream-a');
    const streamB = makeStream('stream-b');
    const beginA = deferred<Record<string, unknown>>();
    const beginB = deferred<Record<string, unknown>>();
    let mediaCount = 0;
    let beginCount = 0;
    fixture.getUserMedia = async () => (++mediaCount === 1 ? streamA : streamB);
    fixture.service.begin = async () => (++beginCount === 1 ? beginA.promise : beginB.promise) as never;
    const captureCallbacks: string[] = [];
    const runner = createHarness(component);
    const propsA = propsFor(scopeA, () => currentScope, { onCaptureStarted: id => captureCallbacks.push(id) });
    runner.render(propsA);
    click(startButton(runner.tree));
    await settle(runner, propsA);

    currentScope = scopeB;
    const propsB = propsFor(scopeB, () => currentScope, { onCaptureStarted: id => {
      captureCallbacks.push(id);
      currentScope = { ...scopeB, captureId: id };
    } });
    runner.render(propsB);
    click(startButton(runner.tree));
    await settle(runner, propsB);

    beginA.resolve({ captureId: 'capture-a', state: 'recording', sourceVersion: 1, startedAt: '' });
    await settle(runner, propsB);
    assert.equal(streamA.track.stopped, true);
    assert.deepEqual(captureCallbacks, []);
    assert.equal(startButton(runner.tree)?.props.disabled, true, 'stale A finally must not clear B working state');
    assert.equal(fixture.mediaRecorderInstances.length, 0);

    beginB.resolve({ captureId: 'capture-b', state: 'recording', sourceVersion: 1, startedAt: '' });
    await settle(runner, propsB);
    assert.deepEqual(captureCallbacks, ['capture-b']);
    assert.equal(fixture.mediaRecorderInstances.length, 1);
    assert.equal(streamB.track.stopped, false);
    runner.unmount();
  } finally { browser.restore(); }
});

test('late recorder onstop after unmount persists only its original owner row and never uploads, deletes, or sets UI', async () => {
  const component = await componentPromise;
  resetFixture();
  const browser = installBrowserStubs();
  try {
    const scope = makeScope('a');
    let currentScope = scope;
    const stream = makeStream('stream-a');
    fixture.getUserMedia = async () => stream;
    fixture.service.begin = async () => ({ captureId: 'capture-a', state: 'recording', sourceVersion: 1, startedAt: '' });
    const runner = createHarness(component);
    runner.render(propsFor(scope, () => currentScope, {
      onCaptureStarted: captureId => { currentScope = { ...scope, captureId }; },
    }));
    click(startButton(runner.tree));
    await settle(runner, propsFor(scope, () => currentScope));
    const recorder = fixture.mediaRecorderInstances[0]!;
    recorder.emitData([1, 2, 3, 4]);
    runner.unmount();

    currentScope = { ...scope, recordId: '44444444-4444-4444-8444-444444444441', captureId: null };
    recorder.emitStop();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(fixture.outbox.audioPuts.length, 1);
    assert.equal((fixture.outbox.audioPuts[0]!.scope as Scope).accountId, scope.accountId);
    assert.equal((fixture.outbox.audioPuts[0]!.scope as Scope).recordId, scope.recordId);
    assert.equal((fixture.outbox.audioPuts[0]!.scope as { captureId: string }).captureId, 'capture-a');
    assert.equal((fixture.outbox.audioPuts[0]!.scope as { sourceVersion: number }).sourceVersion, 1);
    assert.equal(fixture.outbox.audioPuts[0]!.blob.size, 4);
    assert.equal(fixture.serviceCalls.filter(call => call.name === 'uploadSegment').length, 0);
    assert.equal(fixture.outbox.audioDeletes.length, 0);
    assert.equal(fixture.setStateAfterUnmount, 0);
  } finally { browser.restore(); }
});

test('late stop from a rotated recorder keeps its own chunks and reserved segment index', async () => {
  const component = await componentPromise;
  resetFixture();
  const browser = installBrowserStubs();
  try {
    const scope = makeScope('a');
    let currentScope = scope;
    const stream = makeStream('stream-a');
    fixture.getUserMedia = async () => stream;
    const runner = createHarness(component);
    const props = propsFor(scope, () => currentScope, {
      onCaptureStarted: captureId => { currentScope = { ...scope, captureId }; },
    });
    runner.render(props);
    click(startButton(runner.tree));
    await settle(runner, props);
    const first = fixture.mediaRecorderInstances[0]!;
    first.emitData([1, 2]);
    const rotateDelay = browser.pendingTimeouts().find(delay => delay > 1000);
    assert.ok(rotateDelay !== undefined);
    browser.runTimeout(rotateDelay);
    browser.runTimeout(0);
    const second = fixture.mediaRecorderInstances[1]!;
    second.emitData([3, 4, 5, 6, 7]);

    first.emitStop();
    await settle(runner, props);
    assert.equal(fixture.outbox.audioPuts.length, 1);
    assert.equal(fixture.outbox.audioPuts[0]!.manifest.segmentIndex, 0);
    assert.equal(fixture.outbox.audioPuts[0]!.blob.size, 2);

    second.emitStop();
    await settle(runner, props);
    assert.equal(fixture.outbox.audioPuts.length, 2);
    assert.equal(fixture.outbox.audioPuts[1]!.manifest.segmentIndex, 1);
    assert.equal(fixture.outbox.audioPuts[1]!.blob.size, 5);
    runner.unmount();
  } finally { browser.restore(); }
});

test('pause, resume, and stop preserve source version, continue pointer sequence, and surface partial completion', async () => {
  const component = await componentPromise;
  resetFixture();
  const browser = installBrowserStubs();
  try {
    const scope = makeScope('a');
    let currentScope = scope;
    const streamBeforePause = makeStream('stream-before-pause');
    const streamAfterResume = makeStream('stream-after-resume');
    const streams = [streamBeforePause, streamAfterResume];
    fixture.getUserMedia = async () => streams.shift()!;
    fixture.service.begin = async () => ({ captureId: 'capture-a', state: 'recording', sourceVersion: 7, startedAt: '' });
    fixture.service.status = async () => ({ state: 'recording', sourceVersion: 7, pointerLoss: false });
    fixture.service.completeUpload = async () => ({ state: 'queued', runId: 'run-a', sourceVersion: 7, sourceComplete: false });
    fixture.pointerIntervalFactory = options => [{
      captureId: options.captureId,
      clockEpoch: options.getClockEpoch(),
      sequence: options.initialSequence ?? 0,
      canonicalTaskId: 'task-a',
      surfaceKind: 'task',
      startedOffsetMs: 0,
      endedOffsetMs: 10,
      visible: true,
    }];

    const runner = createHarness(component);
    const props = propsFor(scope, () => currentScope, {
      onCaptureStarted: captureId => { currentScope = { ...scope, captureId }; },
    });
    runner.render(props);
    click(startButton(runner.tree));
    await settle(runner, props);
    assert.equal(fixture.mediaRecorderInstances.length, 1);
    assert.equal(fixture.pointerObservers[0]?.initialSequence, 0);
    const firstRecorder = fixture.mediaRecorderInstances[0]!;
    firstRecorder.emitData([1, 2, 3]);

    click(startButton(runner.tree));
    assert.equal(firstRecorder.stopCalls, 1);
    firstRecorder.emitStop(); // Dispatch the real onstop callback installed by the component.
    await settle(runner, props);
    assert.match(textContent(runner.tree), /已暫停/u);
    assert.equal(streamBeforePause.track.stopped, true);
    assert.equal(fixture.serviceCalls.some(call => call.name === 'pause'), true);

    click(startButton(runner.tree));
    await settle(runner, props);
    assert.equal(streamAfterResume.track.stopped, false);
    assert.equal(fixture.pointerObservers.length, 2);
    assert.deepEqual(fixture.pointerObservers.map(observer => observer.initialSequence), [0, 1]);
    const secondRecorder = fixture.mediaRecorderInstances[1]!;
    secondRecorder.emitData([4, 5, 6, 7]);

    const stopButton = findElements(runner.tree, item => item.type === 'button' && item.props['data-meeting-recording-stop'] === true)[0];
    click(stopButton);
    assert.equal(secondRecorder.stopCalls, 1);
    secondRecorder.emitStop(); // Stop finalization also waits for the component's installed onstop callback.
    await settle(runner, props);

    const pointerWrites = fixture.serviceCalls.filter(call => call.name === 'appendPointer');
    assert.deepEqual(pointerWrites.map(call => (call.args[1] as { intervals: Array<{ sequence: number }> }).intervals[0]?.sequence), [0, 1]);
    const stopCall = fixture.serviceCalls.find(call => call.name === 'stop');
    const completeCall = fixture.serviceCalls.find(call => call.name === 'completeUpload');
    assert.equal((stopCall?.args[1] as { expectedSourceVersion: number } | undefined)?.expectedSourceVersion, 7);
    assert.equal((completeCall?.args[1] as { expectedSourceVersion: number } | undefined)?.expectedSourceVersion, 7, JSON.stringify(completeCall));
    assert.match(textContent(runner.tree), /來源不完整，未排入付費分析/u);
    assert.equal(streamAfterResume.track.stopped, true);
    assert.equal(fixture.outbox.audioRows.length, 0, 'verified segments were acknowledged only after upload');
    assert.equal(fixture.serviceCalls.filter(call => call.name === 'uploadSegment').length, 2);
    runner.unmount();
  } finally { browser.restore(); }
});

test('unknown and failed segment uploads are not retried or removed from the scoped outbox', async () => {
  const component = await componentPromise;
  for (const failure of [new Error('upload outcome unknown'), Object.assign(new Error('confirmed upload failure'), { code: 'MEETING_STORAGE_REJECTED' })]) {
    resetFixture();
    const browser = installBrowserStubs();
    try {
      const scope = makeScope('a');
      let currentScope = scope;
      const stream = makeStream(`stream-${failure.message}`);
      fixture.getUserMedia = async () => stream;
      fixture.service.begin = async () => ({ captureId: 'capture-a', state: 'recording', sourceVersion: 3, startedAt: '' });
      fixture.service.status = async () => ({ state: 'recording', sourceVersion: 3, pointerLoss: false });
      fixture.service.uploadSegment = async () => { throw failure; };
      const runner = createHarness(component);
      const props = propsFor(scope, () => currentScope, {
        onCaptureStarted: captureId => { currentScope = { ...scope, captureId }; },
      });
      runner.render(props);
      click(startButton(runner.tree));
      await settle(runner, props);
      const recorder = fixture.mediaRecorderInstances[0]!;
      recorder.emitData([8, 9, 10]);
      const stopButton = findElements(runner.tree, item => item.type === 'button' && item.props['data-meeting-recording-stop'] === true)[0];
      click(stopButton);
      assert.equal(recorder.stopCalls, 1);
      recorder.emitStop();
      await settle(runner, props);

      assert.equal(fixture.outbox.audioRows.length, 1);
      assert.equal((fixture.outbox.audioRows[0]!.scope as { accountId: string }).accountId, scope.accountId);
      assert.equal((fixture.outbox.audioRows[0]!.scope as { captureId: string }).captureId, 'capture-a');
      assert.equal((fixture.outbox.audioRows[0]!.scope as { sourceVersion: number }).sourceVersion, 3);
      assert.equal(fixture.outbox.audioRows[0]!.blob.size, 3);
      assert.equal(fixture.outbox.audioDeletes.length, 0);
      assert.equal(fixture.serviceCalls.filter(call => call.name === 'uploadSegment').length, 1);
      assert.equal(fixture.serviceCalls.some(call => call.name === 'completeUpload'), false, JSON.stringify(fixture.serviceCalls.map(call => ({ name: call.name, args: call.args.map(arg => typeof arg === 'object' ? Object.keys(arg as object) : arg) }))));
      runner.unmount();
    } finally { browser.restore(); }
  }
});

test('recovery with a different source version retains the row without upload or delete', async () => {
  const component = await componentPromise;
  resetFixture();
  const browser = installBrowserStubs();
  try {
    const scope = makeScope('a', 'capture-a');
    let currentScope = scope;
    fixture.service.status = async () => ({ state: 'stopped', sourceVersion: 2, pointerLoss: false });
    const rowScope = { ...scope, sourceVersion: 1 };
    const row = { scope: rowScope, manifest: { segmentId: 'segment-a', segmentIndex: 0, sourceVersion: 1, epoch: 0,
      startOffsetMs: 0, endOffsetMs: 1000, overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', bytes: 3, uploadState: 'pending' },
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) };
    fixture.outbox.audioRows.push(row);
    const runner = createHarness(component);
    const props = propsFor(scope, () => currentScope, { initialCaptureId: 'capture-a' });
    runner.render(props);
    await settle(runner, props);
    assert.equal(fixture.outbox.audioPuts.length, 0);
    assert.equal(fixture.outbox.audioDeletes.length, 0);
    assert.equal(fixture.outbox.audioRows.length, 1);
    assert.equal(fixture.outbox.audioRows[0]!.manifest.segmentId, 'segment-a');
    assert.equal(fixture.serviceCalls.filter(call => call.name === 'uploadSegment').length, 0);
    assert.equal(findElements(runner.tree, item => item.type === 'button' && textContent(item).includes('續傳已封存音訊')).length, 0);
    runner.unmount();
  } finally { browser.restore(); }
});

function textContent(node: unknown): string {
  const visit = (node: unknown): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(visit).join('');
    if (!node || typeof node !== 'object') return '';
    return visit((node as { children?: unknown[] }).children ?? []);
  };
  return visit(node);
}

