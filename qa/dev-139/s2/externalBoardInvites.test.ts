import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalInvitationPublisher, EXTERNAL_QUALIFICATION_VERSION } from '../../../server/externalBoardInvites.js';
import { KernelError } from '../../../server/errors.js';

test('external notification binds the workload token to the OrgMaster origin and only posts the owner command', async () => {
  const origin = 'https://orgmaster-prod-9536592944.asia-east1.run.app';
  const command = { action: 'withdraw' as const, requestId: '9c9460dc-e715-412e-885f-a3824e659064' };
  let sent = 0;
  const publish = createExternalInvitationPublisher(async audience => {
    assert.equal(audience, origin);
    return 'fixture-service-identity';
  }, async (url, init) => {
    sent++;
    assert.equal(String(url), origin + '/api/internal/projed-external-requests/v1');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture-service-identity');
    assert.deepEqual(JSON.parse(String(init?.body)), { contractVersion: EXTERNAL_QUALIFICATION_VERSION, ...command });
    return new Response(null, { status: 204 });
  });
  await publish(command);
  assert.equal(sent, 1);
});

test('an owner rejection cannot be reported as delivered or leak its response', async () => {
  const publish = createExternalInvitationPublisher(async () => 'fixture-token',
    async () => new Response('private fixture response', { status: 403 }));
  await assert.rejects(publish({ action: 'withdraw', requestId: '9c9460dc-e715-412e-885f-a3824e659064' }),
    error => error instanceof KernelError && error.code === 'IDENTITY_STATE_UNAVAILABLE'
      && !error.message.includes('private fixture response'));
});
