import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { CURRENT_PRODUCTION_IDENTITY_PINS } from '../../../server/identityConsumer.js';
import { createRuntimeSessionAuth } from '../../../server/runtimeSessionAuth.js';

test('environment flags cannot activate unpublished production identity contracts', () => {
  let calls = 0;
  const database = { checkout: async () => { calls++; throw new Error('must not connect'); } } as unknown as RuntimeDatabase;
  const config = { env: 'managed' } as RuntimeConfig;
  assert.deepEqual(CURRENT_PRODUCTION_IDENTITY_PINS, []);
  assert.deepEqual(createRuntimeSessionAuth(config,database,{
    PROJED_SSO_ENABLED:'true',PROJED_SSO_BROKER_ORIGIN:'https://unpublished.invalid',
  }),{});
  assert.equal(calls,0);
});
