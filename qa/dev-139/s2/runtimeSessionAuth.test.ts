import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { CURRENT_PRODUCTION_IDENTITY_PINS } from '../../../server/identityConsumer.js';
import { createRuntimeSessionAuth } from '../../../server/runtimeSessionAuth.js';
import { startOwnerSessionHttpConsumer } from './ownerSessionHttpConsumer.js';

const publishedEnvironment = {
  PROJED_SSO_BROKER_ORIGIN: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app',
  PROJED_MAIN_PUBLIC_ORIGIN: 'https://projed-cc78d.web.app',
  PROJED_QUICK_PUBLIC_ORIGIN: 'https://projed-cc78d.firebaseapp.com',
};

test('published managed Session composes without opening a database or provider connection', () => {
  let calls = 0;
  const database = { checkout: async () => { calls++; throw new Error('must not connect'); } } as unknown as RuntimeDatabase;
  assert.ok(CURRENT_PRODUCTION_IDENTITY_PINS.length>0);
  const result = createRuntimeSessionAuth({env:'managed'} as RuntimeConfig,database,publishedEnvironment);
  assert.equal(typeof result.dispatchAuth,'function');
  assert.equal(typeof result.resolveActor,'function');
  assert.equal(typeof result.resolveMeetingRunActor,'function');
  assert.equal(calls,0);
});

test('environment flags cannot substitute an unpublished broker for the pinned owner', () => {
  let calls = 0;
  const database = { checkout: async () => { calls++; throw new Error('must not connect'); } } as unknown as RuntimeDatabase;
  const config = { env: 'managed' } as RuntimeConfig;
  assert.throws(()=>createRuntimeSessionAuth(config,database,{
    ...publishedEnvironment,
    PROJED_SSO_ENABLED:'true',PROJED_SSO_BROKER_ORIGIN:'https://unpublished.invalid',
  }),{code:'CONFIG_INVALID'});
  assert.equal(calls,0);
});

test('disposable kernels retain local test auth after production pins are published', () => {
  let calls = 0;
  const database = { checkout: async () => { calls++; throw new Error('must not connect'); } } as unknown as RuntimeDatabase;
  assert.deepEqual(createRuntimeSessionAuth({env:'disposable'} as RuntimeConfig,database,publishedEnvironment),{});
  assert.equal(calls,0);
});

test('owner simulation rejects remote destinations before opening a database', async () => {
  const base = {root:'.',databaseName:`dev014_${'a'.repeat(20)}`,databasePort:54321,
    brokerOrigin:'http://127.0.0.1:54322',manifestSha256:'c'.repeat(64),
    tokenProvider:async()=>{throw new Error('must not request a token');}};
  for(const options of [
    {...base,brokerOrigin:publishedEnvironment.PROJED_SSO_BROKER_ORIGIN},
    {...base,externalOwnerOrigin:'https://orgmaster.example.invalid'},
  ]) await assert.rejects(startOwnerSessionHttpConsumer(options),/LOCAL_SIMULATION_CONSUMER_BINDING_REJECTED/);
});
