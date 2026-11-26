import assert from 'node:assert/strict';
import test from 'node:test';
import { installForegroundSessionRenewal } from '../../../src/services/httpApi/foregroundSession.js';

class Visibility extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('foreground renewal coalesces transitions, skips hidden/polling, and resumes after foreground inactivity', async t => {
  const events = new EventTarget();
  const visibility = new Visibility();
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const requests: Array<{ signal: AbortSignal; resolve: () => void }> = [];
  const stop = installForegroundSessionRenewal(signal => new Promise<void>(resolve => {
    requests.push({ signal, resolve });
  }), events, visibility);
  t.after(stop);
  assert.equal(requests.length, 1);
  events.dispatchEvent(new Event('focus'));
  events.dispatchEvent(new Event('online'));
  assert.equal(requests.length, 1, 'in-flight transitions share the same renewal');
  requests[0]!.resolve();
  await settle();
  now = 30_000;
  events.dispatchEvent(new Event('focus'));
  assert.equal(requests.length, 1, 'short foreground bursts are throttled');
  now = 16 * 60 * 60_000;
  visibility.visibilityState = 'hidden';
  visibility.dispatchEvent(new Event('visibilitychange'));
  events.dispatchEvent(new Event('online'));
  assert.equal(requests.length, 1);
  visibility.visibilityState = 'visible';
  visibility.dispatchEvent(new Event('visibilitychange'));
  assert.equal(requests.length, 2, 'overnight foreground transition renews');
  stop();
  assert.equal(requests[1]!.signal.aborted, true);
  requests[1]!.resolve();
  await settle();
  now += 90 * 86_400_000;
  events.dispatchEvent(new Event('focus'));
  assert.equal(requests.length, 2, 'unsubscribed listeners cannot revive an old session');
});

test('transient failure permits foreground retry without a timer or unhandled rejection', async t => {
  const events = new EventTarget();
  const visibility = new Visibility();
  visibility.visibilityState = 'hidden';
  let calls = 0;
  const stop = installForegroundSessionRenewal(async () => {
    if (++calls === 1) throw new Error('offline');
  }, events, visibility);
  t.after(stop);
  assert.equal(calls, 0);
  visibility.visibilityState = 'visible';
  visibility.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(calls, 1);
  events.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(calls, 2);
});
