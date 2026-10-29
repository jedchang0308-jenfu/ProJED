import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import path from 'node:path';
import type {
  CurrentMeetingReviewBinding,
  MeetingReviewCallbackBinding,
} from '../../../src/components/Records/meetingReviewRequestGate.js';
import { matchesMeetingReviewCallbackBinding } from '../../../src/components/Records/meetingReviewRequestGate.js';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type Props = {
  captureId: string | null;
  recordId: string | null;
  accountId: string | null;
  authContextId: string | null;
  workspaceId: string | null;
  boardId: string | null;
  scopeGeneration: number;
  draftSignature: string;
  taskOptions?: Array<{ id: string; title: string; nodeType?: string }>;
  onReviewApplied?: (
    reviewRevision: number,
    acceptedTaskIds: string[],
    manuallyResolvedTaskIds: string[],
    binding: MeetingReviewCallbackBinding,
  ) => void;
};

type ReviewResult = {
  captureId: string;
  state: string;
  reviewRevision: number;
  segments: Array<Record<string, any>>;
};

type ServiceFixture = {
  review: (captureId: string) => Promise<ReviewResult>;
  decideMatch: (payload: unknown) => Promise<unknown>;
  playbackUrl: (recordId: string, segmentId: string) => Promise<{ segmentId: string; url: string; expiresAt: number }>;
};

type ReactFixture = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
  useState: <T>(initial: T | (() => T)) => [T, (value: T | ((current: T) => T)) => void];
  useRef: <T>(initial: T) => { current: T };
  useLayoutEffect: (effect: () => void | (() => void), deps: unknown[]) => void;
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => void;
};

const fixture: { react: ReactFixture | null; service: ServiceFixture | null } = { react: null, service: null };
(globalThis as unknown as Record<string, unknown>).__DEV139_MEETING_REVIEW_FIXTURE__ = fixture;

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

async function loadReviewComponent() {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, 'src/components/Records/MeetingTaskMatchReview.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'transform',
    tsconfigRaw: { compilerOptions: { jsx: 'react' } },
    write: false,
    plugins: [{
      name: 'dev139-meeting-review-fixtures',
      setup(buildApi) {
        buildApi.onResolve({ filter: /.*/ }, args => {
          const basename = args.path.split('/').pop() ?? args.path;
          const fixtureModule = args.path === 'react' || args.path === 'lucide-react' || basename === 'meetingAnalysisService';
          return fixtureModule
            ? { path: args.path === 'react' || args.path === 'lucide-react' ? args.path : 'meetingAnalysisService', namespace: 'dev139-meeting-review-fixture' }
            : null;
        });
        buildApi.onLoad({ filter: /.*/, namespace: 'dev139-meeting-review-fixture' }, args => {
          if (args.path === 'react') {
            return {
              contents: `
                const f = globalThis.__DEV139_MEETING_REVIEW_FIXTURE__;
                const React = {
                  createElement: (...args) => f.react.createElement(...args),
                  useState: (...args) => f.react.useState(...args),
                  useRef: (...args) => f.react.useRef(...args),
                  useLayoutEffect: (...args) => f.react.useLayoutEffect(...args),
                  useEffect: (...args) => f.react.useEffect(...args),
                };
                export default React;
              `,
              loader: 'js',
            };
          }
          if (args.path === 'lucide-react') {
            return { contents: "export const Check='Check', ChevronDown='ChevronDown', Loader2='Loader2', Play='Play', RotateCcw='RotateCcw', X='X';", loader: 'js' };
          }
          return {
            contents: `
              const f = globalThis.__DEV139_MEETING_REVIEW_FIXTURE__;
              export const meetingAnalysisService = {
                review: (...args) => f.service.review(...args),
                decideMatch: (...args) => f.service.decideMatch(...args),
                playbackUrl: (...args) => f.service.playbackUrl(...args),
              };
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

const componentPromise = loadReviewComponent();

type Hook = {
  kind: 'state' | 'ref' | 'effect';
  value?: unknown;
  deps?: unknown[];
  cleanup?: () => void;
};

function sameDeps(left: unknown[] | undefined, right: unknown[]) {
  return Boolean(left && left.length === right.length && left.every((value, index) => Object.is(value, right[index])));
}

function createHookRunner(component: (props: Props) => unknown) {
  const hooks: Hook[] = [];
  let hookIndex = 0;
  let pendingEffects: Array<{ index: number; deps: unknown[]; effect: () => void | (() => void) }> = [];
  let dirty = false;
  let props: Props;
  let tree: unknown;

  const runtime: ReactFixture = {
    createElement: (type, elementProps, ...children) => ({ type, props: elementProps ?? {}, children }),
    useState: <T,>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] => {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { kind: 'state', value: typeof initial === 'function' ? (initial as () => T)() : initial };
      const slot = hooks[index]!;
      assert.equal(slot.kind, 'state');
      return [slot.value as T, value => {
        const current = slot.value as T;
        const next = typeof value === 'function' ? (value as (current: T) => T)(current) : value;
        if (!Object.is(current, next)) {
          slot.value = next;
          dirty = true;
        }
      }];
    },
    useRef: <T,>(initial: T): { current: T } => {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { kind: 'ref', value: { current: initial } };
      const slot = hooks[index]!;
      assert.equal(slot.kind, 'ref');
      return slot.value as { current: T };
    },
    useLayoutEffect: (effect, deps) => scheduleEffect(effect, deps),
    useEffect: (effect, deps) => scheduleEffect(effect, deps),
  };

  function scheduleEffect(effect: () => void | (() => void), deps: unknown[]) {
    const index = hookIndex++;
    const slot = hooks[index];
    if (!slot) hooks[index] = { kind: 'effect' };
    const current = hooks[index]!;
    assert.equal(current.kind, 'effect');
    if (!sameDeps(current.deps, deps)) pendingEffects.push({ index, deps: [...deps], effect });
  }

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
    for (const hook of [...hooks].reverse()) hook.cleanup?.();
  }

  return { runtime, render, unmount, get tree() { return tree; } };
}

function createHarness(component: (props: Props) => unknown, service: ServiceFixture) {
  fixture.service = service;
  const runner = createHookRunner(component);
  fixture.react = runner.runtime;
  return runner;
}

function findElements(tree: unknown, predicate: (element: { type: unknown; props: Record<string, unknown> }) => boolean) {
  const found: Array<{ type: unknown; props: Record<string, unknown>; children: unknown[] }> = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
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

function textContent(tree: unknown): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(textContent).join('');
  if (!tree || typeof tree !== 'object') return '';
  return textContent((tree as { children?: unknown[] }).children ?? []);
}

const props = (overrides: Partial<Props> = {}): Props => ({
  captureId: 'capture-a',
  recordId: 'record-a',
  accountId: 'actor-a',
  authContextId: 'context-a',
  workspaceId: 'workspace-a',
  boardId: 'board-a',
  scopeGeneration: 0,
  draftSignature: 'draft-a',
  taskOptions: [{ id: 'task-a', title: '任務 A', nodeType: 'task' }],
  ...overrides,
});

const reviewResult = (
  captureId: string,
  text: string,
  options: { audioSegmentId?: string | null; resolutionId?: string; taskId?: string } = {},
): ReviewResult => ({
  captureId,
  state: 'ready',
  reviewRevision: 4,
  segments: [{
    segmentId: `segment-${captureId}`,
    audioSegmentId: options.audioSegmentId ?? null,
    startOffsetMs: 0,
    endOffsetMs: 1200,
    text,
    wordOffsets: [],
    resolutionId: options.resolutionId ?? `resolution-${captureId}`,
    resolutionRevision: 2,
    decision: 'needs_review',
    humanReviewed: false,
    humanEmptyDecision: false,
    candidates: [{
      taskId: options.taskId ?? `task-${captureId}`,
      title: `任務 ${captureId}`,
      path: '專案/任務',
      decision: 'needs_review',
      source: 'lexical',
      quoteRange: { fromWord: 0, toWord: 1 },
      pointerFeature: 0,
    }],
  }],
});

async function settle(runner: ReturnType<typeof createHookRunner>, currentProps: Props) {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  runner.render(currentProps);
  for (let index = 0; index < 2; index += 1) await Promise.resolve();
  runner.render(currentProps);
}

function installBrowserStubs() {
  const root = globalThis as unknown as Record<string, unknown>;
  const oldWindow = root.window;
  const oldAudio = root.Audio;
  let nextTimerId = 0;
  root.window = {
    setInterval: () => ++nextTimerId,
    clearInterval: () => undefined,
  };
  class FakeAudio {
    static instances: FakeAudio[] = [];
    src: string;
    paused = true;
    pauseCalls = 0;
    playCalls = 0;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(src: string) {
      this.src = src;
      FakeAudio.instances.push(this);
    }
    pause() { this.pauseCalls += 1; this.paused = true; }
    play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); }
    removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    load() {}
  }
  root.Audio = FakeAudio;
  FakeAudio.instances = [];
  return {
    FakeAudio,
    restore: () => {
      if (oldWindow === undefined) delete root.window;
      else root.window = oldWindow;
      if (oldAudio === undefined) delete root.Audio;
      else root.Audio = oldAudio;
    },
  };
}

const bindingFromProps = (value: Props): CurrentMeetingReviewBinding => ({
  accountId: value.accountId,
  authContextId: value.authContextId,
  workspaceId: value.workspaceId,
  boardId: value.boardId,
  recordId: value.recordId,
  captureId: value.captureId,
  scopeGeneration: value.scopeGeneration,
  draftSignature: value.draftSignature,
});

test('scope change ignores an older review failure and only current review updates loading and callbacks', async () => {
  const component = await componentPromise;
  const browser = installBrowserStubs();
  try {
    const first = deferred<ReviewResult>();
    const second = deferred<ReviewResult>();
    const applied: MeetingReviewCallbackBinding[] = [];
    let currentDraftBinding: CurrentMeetingReviewBinding;
    const service: ServiceFixture = {
      review: captureId => captureId === 'capture-a' ? first.promise : second.promise,
      decideMatch: async () => ({}),
      playbackUrl: async (_recordId, segmentId) => ({ segmentId, url: 'https://audio.test/signed', expiresAt: Date.now() + 5000 }),
    };
    const runner = createHarness(component, service);
    const actorA = props();
    const actorB = props({
      captureId: 'capture-b',
      recordId: 'record-b',
      accountId: 'actor-b',
      authContextId: 'context-b',
      workspaceId: 'workspace-b',
      boardId: 'board-b',
      scopeGeneration: 1,
      draftSignature: 'draft-b',
    });
    const callback = (_revision: number, _accepted: string[], _manual: string[], binding: MeetingReviewCallbackBinding) => {
      if (matchesMeetingReviewCallbackBinding(binding, currentDraftBinding)) applied.push(binding);
    };
    currentDraftBinding = bindingFromProps(actorA);
    runner.render({ ...actorA, onReviewApplied: callback });
    assert.equal(findElements(runner.tree, item => item.type === 'button' && item.props['aria-label'] === '重新整理辨識任務')[0]?.props.disabled, true);

    currentDraftBinding = bindingFromProps(actorB);
    runner.render({ ...actorB, onReviewApplied: callback });
    first.reject(new Error('stale private review failure'));
    await settle(runner, { ...actorB, onReviewApplied: callback });
    assert.equal(findElements(runner.tree, item => item.props.role === 'alert').length, 0);
    assert.equal(findElements(runner.tree, item => item.type === 'button' && item.props['aria-label'] === '重新整理辨識任務')[0]?.props.disabled, true);
    assert.equal(applied.length, 0);

    second.resolve(reviewResult('capture-b', '目前 capture 的 review'));
    await settle(runner, { ...actorB, onReviewApplied: callback });
    assert.match(textContent(runner.tree), /目前 capture 的 review/);
    assert.equal(applied.length, 1);
    assert.equal(applied[0]?.accountId, 'actor-b');
    runner.unmount();
  } finally {
    browser.restore();
  }
});

test('review callback binding rejects same-draft manual edits before changing task links or metadata', async () => {
  const component = await componentPromise;
  const browser = installBrowserStubs();
  try {
    const pending = deferred<ReviewResult>();
    let currentDraftBinding: CurrentMeetingReviewBinding = bindingFromProps(props());
    const applied: MeetingReviewCallbackBinding[] = [];
    const service: ServiceFixture = {
      review: async () => pending.promise,
      decideMatch: async () => ({}),
      playbackUrl: async (_recordId, segmentId) => ({ segmentId, url: 'https://audio.test/signed', expiresAt: Date.now() + 5000 }),
    };
    const runner = createHarness(component, service);
    const initialProps = props({ onReviewApplied: (_revision, _accepted, _manual, binding) => {
      if (matchesMeetingReviewCallbackBinding(binding, currentDraftBinding)) applied.push(binding);
    } });
    runner.render(initialProps);
    currentDraftBinding = { ...currentDraftBinding, draftSignature: 'draft-a-after-manual-edit' };
    pending.resolve(reviewResult('capture-a', 'review arrived after edit'));
    await settle(runner, initialProps);
    assert.match(textContent(runner.tree), /review arrived after edit/);
    assert.equal(applied.length, 0);
    runner.unmount();
  } finally {
    browser.restore();
  }
});

test('stale decision catch and finally cannot clear the current decision busy state', async () => {
  const component = await componentPromise;
  const browser = installBrowserStubs();
  try {
    const oldDecision = deferred<unknown>();
    const currentDecision = deferred<unknown>();
    let decisionCalls = 0;
    const service: ServiceFixture = {
      review: async captureId => reviewResult(captureId, `review ${captureId}`, { resolutionId: 'resolution-same', taskId: 'task-same' }),
      decideMatch: () => (++decisionCalls === 1 ? oldDecision.promise : currentDecision.promise),
      playbackUrl: async (_recordId, segmentId) => ({ segmentId, url: 'https://audio.test/signed', expiresAt: Date.now() + 5000 }),
    };
    const runner = createHarness(component, service);
    const actorA = props();
    const actorB = props({
      captureId: 'capture-b', recordId: 'record-b', accountId: 'actor-b', authContextId: 'context-b',
      workspaceId: 'workspace-b', boardId: 'board-b', scopeGeneration: 1, draftSignature: 'draft-b',
    });
    runner.render(actorA);
    await settle(runner, actorA);
    click(findElements(runner.tree, item => item.type === 'button' && item.props['aria-label'] === '採用任務 任務 capture-a')[0]);
    runner.render(actorB);
    await settle(runner, actorB);
    click(findElements(runner.tree, item => item.type === 'button' && item.props['aria-label'] === '採用任務 任務 capture-b')[0]);
    assert.equal(decisionCalls, 2);

    oldDecision.reject(new Error('stale decision failure'));
    await settle(runner, actorB);
    assert.equal(findElements(runner.tree, item => item.props.role === 'alert').length, 0);
    const currentAccept = findElements(runner.tree, item => item.type === 'button' && item.props['aria-label'] === '採用任務 任務 capture-b')[0];
    assert.equal(currentAccept?.props.disabled, true);

    currentDecision.resolve({});
    await settle(runner, actorB);
    const refreshedAccept = findElements(runner.tree, item => item.type === 'button' && item.props['aria-label'] === '採用任務 任務 capture-b')[0];
    assert.equal(refreshedAccept?.props.disabled, false);
    runner.unmount();
  } finally {
    browser.restore();
  }
});

test('playback URLs from a former scope never start audio and active audio is stopped on scope change', async () => {
  const component = await componentPromise;
  const browser = installBrowserStubs();
  try {
    const oldPlayback = deferred<{ segmentId: string; url: string; expiresAt: number }>();
    let playbackCalls = 0;
    const service: ServiceFixture = {
      review: async captureId => reviewResult(captureId, `review ${captureId}`, { audioSegmentId: `audio-${captureId}` }),
      decideMatch: async () => ({}),
      playbackUrl: (_recordId, segmentId) => (++playbackCalls === 1
        ? oldPlayback.promise
        : Promise.resolve({ segmentId, url: `https://audio.test/${segmentId}`, expiresAt: Date.now() + 5000 })),
    };
    const runner = createHarness(component, service);
    const actorA = props();
    const actorB = props({
      captureId: 'capture-b', recordId: 'record-b', accountId: 'actor-b', authContextId: 'context-b',
      workspaceId: 'workspace-b', boardId: 'board-b', scopeGeneration: 1, draftSignature: 'draft-b',
    });
    const actorC = props({ ...actorB, boardId: 'board-c', scopeGeneration: 2, draftSignature: 'draft-c' });
    runner.render(actorA);
    await settle(runner, actorA);
    click(findElements(runner.tree, item => item.type === 'button' && String(item.props['aria-label']).startsWith('播放 '))[0]);
    runner.render(actorB);
    await settle(runner, actorB);
    oldPlayback.resolve({ segmentId: 'audio-capture-a', url: 'https://audio.test/stale', expiresAt: Date.now() + 5000 });
    await settle(runner, actorB);
    assert.equal(browser.FakeAudio.instances.length, 0);

    click(findElements(runner.tree, item => item.type === 'button' && String(item.props['aria-label']).startsWith('播放 '))[0]);
    await settle(runner, actorB);
    assert.equal(browser.FakeAudio.instances.length, 1);
    const activeAudio = browser.FakeAudio.instances[0]!;
    assert.equal(activeAudio.playCalls, 1);
    assert.equal(activeAudio.paused, false);

    runner.render(actorC);
    assert.equal(activeAudio.paused, true);
    assert.equal(activeAudio.src, '');
    runner.unmount();
  } finally {
    browser.restore();
  }
});

test('unmount invalidates a pending review before its callback can apply', async () => {
  const component = await componentPromise;
  const browser = installBrowserStubs();
  try {
    const pending = deferred<ReviewResult>();
    let callbacks = 0;
    const service: ServiceFixture = {
      review: async () => pending.promise,
      decideMatch: async () => ({}),
      playbackUrl: async (_recordId, segmentId) => ({ segmentId, url: 'https://audio.test/signed', expiresAt: Date.now() + 5000 }),
    };
    const runner = createHarness(component, service);
    const initialProps = props({ onReviewApplied: () => { callbacks += 1; } });
    runner.render(initialProps);
    runner.unmount();
    pending.resolve(reviewResult('capture-a', 'unmounted response'));
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    assert.equal(callbacks, 0);
  } finally {
    browser.restore();
  }
});
