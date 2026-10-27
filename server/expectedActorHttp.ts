import type { IncomingMessage } from 'node:http';

import type { ServerActorV1 } from './actorTransaction.js';
import { KernelError } from './errors.js';

export function assertExpectedActor(request: IncomingMessage, actor: ServerActorV1): void {
  const expectedAccountId = request.headers['x-projed-expected-account-id'];
  const expectedContextId = request.headers['x-projed-expected-context-id'];
  if (typeof expectedAccountId !== 'string' || typeof expectedContextId !== 'string'
      || expectedAccountId !== actor.localUserId || expectedContextId !== actor.contextId) {
    throw new KernelError('ACTOR_CHANGED', 'Session actor changed before request dispatch', 409);
  }
}
