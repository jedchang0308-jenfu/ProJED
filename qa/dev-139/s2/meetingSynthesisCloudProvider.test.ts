import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import type { RagProvider } from '../../../server/geminiRagProvider.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { MEETING_LLM_PRICE_VERSION } from '../../../server/meetingLlmPricing.js';
import { createQualifiedMeetingSynthesisProvider } from '../../../server/meetingSynthesisCloudProvider.js';
import type { MeetingLlmRuntimeBinding } from '../../../server/meetingLlmRuntimeBinding.js';
import { MeetingCloudProviderError, type GoogleCloudMeetingProvider,
  type MeetingCloudGeneration } from '../../../server/googleCloudMeetingProvider.js';

const binding: MeetingLlmRuntimeBinding = {
  projectId: 'projed-cc78d',
  provider: 'google-cloud-meeting',
  embeddingModel: 'gemini-embedding-001',
  generationModel: 'gemini-3.5-flash',
  abuseMonitoring: 'exempt',
  cache: 'disabled',
  requestResponseLogging: 'disabled',
  priceVersion: MEETING_LLM_PRICE_VERSION,
  qualificationEvidenceRef: 'qualified-source-evidence',
};

const usage = { promptTokens: 100, candidateTokens: 20, thoughtTokens: 3, totalTokens: 123, cachedTokens: 0 };

function generated(overrides: Partial<MeetingCloudGeneration> = {}): MeetingCloudGeneration {
  return {
    outcome: 'generated', text: '{"content":"safe draft"}', usage,
    responseId: 'response-1', modelVersion: 'gemini-3.5-flash-001', ...overrides,
  };
}

function fakeCloud(generateJson: GoogleCloudMeetingProvider['generateJson']): GoogleCloudMeetingProvider {
  return {
    countTokens: async () => 1,
    embedQuery: async () => ({ values: [1], tokenCount: 1, billableCharacterCount: null }),
    generateJson,
  };
}

function kernelError(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

test('null qualification creates neither a Cloud provider nor an access-token provider', () => {
  let providerConstruction = 0;
  let tokenProviderConstruction = 0;
  const result = createQualifiedMeetingSynthesisProvider({
    binding: null,
    getAccessToken: () => { tokenProviderConstruction += 1; return Promise.resolve('unused'); },
    createProvider: () => { providerConstruction += 1; throw new Error('must not construct'); },
  });

  assert.equal(result, undefined);
  assert.equal(providerConstruction, 0);
  assert.equal(tokenProviderConstruction, 0);
});

test('qualified adapter pins model, JSON request and one Cloud generation call', async () => {
  const calls: unknown[] = [];
  const adapter = createQualifiedMeetingSynthesisProvider({
    binding,
    getAccessToken: async () => 'fake-token',
    createProvider: options => {
      assert.equal(options.getAccessToken instanceof Function, true);
      return fakeCloud(async input => { calls.push(input); return generated(); });
    },
  });
  assert.ok(adapter);
  assert.equal(await adapter.generate({ model: 'gemini-3.5-flash', prompt: 'meeting prompt',
    responseMimeType: 'application/json', temperature: 0.2 }), '{"content":"safe draft"}');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { prompt: 'meeting prompt', maxOutputTokens: 8192, signal: undefined });

  await assert.rejects(adapter.generate({ model: 'gemini-3.1-flash-lite', prompt: 'meeting prompt',
    responseMimeType: 'application/json', temperature: 0.2 }), kernelError('CONFIG_INVALID'));
  assert.equal(calls.length, 1);
});

test('unusable, cached, unknown-usage and model-drift responses fail safely', async () => {
  const invalid: MeetingCloudGeneration[] = [
    generated({ outcome: 'unusable', text: 'private provider body' }),
    generated({ usage: null }),
    generated({ usage: { ...usage, cachedTokens: 1 } }),
    generated({ modelVersion: 'gemini-3.1-flash-lite' }),
    generated({ text: null }),
  ];
  for (const response of invalid) {
    const adapter = createQualifiedMeetingSynthesisProvider({ binding, getAccessToken: async () => 'unused',
      createProvider: () => fakeCloud(async () => response) });
    assert.ok(adapter);
    await assert.rejects(adapter.generate({ model: 'gemini-3.5-flash', prompt: 'meeting prompt',
      responseMimeType: 'application/json', temperature: 0.2 }), error => {
      assert.ok(error instanceof KernelError);
      assert.equal(error.code, 'SYNTHESIS_INVALID_RESPONSE');
      assert.doesNotMatch(error.message, /private provider body|meeting prompt/u);
      return true;
    });
  }
});

test('provider rejection is safe and never triggers an alternate-model retry', async () => {
  let calls = 0;
  const adapter = createQualifiedMeetingSynthesisProvider({ binding, getAccessToken: async () => 'unused',
    createProvider: () => fakeCloud(async () => {
      calls += 1;
      throw new MeetingCloudProviderError('LLM_PROVIDER_REJECTED', true, 404);
    }) });
  assert.ok(adapter);
  await assert.rejects(adapter.generate({ model: 'gemini-3.5-flash', prompt: 'meeting prompt',
    responseMimeType: 'application/json', temperature: 0.2 }), error => {
    assert.ok(error instanceof KernelError);
    assert.equal(error.code, 'RAG_PROVIDER_UNAVAILABLE');
    assert.notEqual(error.code, 'RAG_MODEL_UNAVAILABLE');
    return true;
  });
  assert.equal(calls, 1);
});

test('HTTP meeting synthesis does not fall back to the legacy Developer API provider', async () => {
  const actor: ServerActorV1 = {
    principalId: 'google:test', localUserId: '95c1d3df-226a-4e6f-9db5-f0f7f0db9749',
    entry: 'main', contextId: '9fcadd06-a3cb-43c2-8d1f-7c17147d0e68',
    expiresAtMs: Date.now() + 60_000, accountGuardRevision: '1',
  };
  const tenantId = 'e0387ac1-18fd-4ce9-b2f8-a7f4929d7d18';
  const projectId = 'f3f223a1-a9d2-4967-aeaa-1d33cefbcb8f';
  let ragCalls = 0;
  const ragProvider: RagProvider = {
    embed: async () => [],
    generate: async () => { ragCalls += 1; return '{"content":"legacy provider"}'; },
  };
  const client = {
    async query(text: string) {
      if (text.includes('actor_context_valid_v1() AS valid')) return { rows: [{ valid: true }] };
      if (text.includes('FROM projed_core.tenants tenant')) {
        return { rows: [{ id: tenantId, legacy_workspace_id: 'legacy-workspace' }] };
      }
      if (text.includes('FROM projed_core.projects project')) {
        return { rows: [{ id: projectId, legacy_board_id: 'legacy-board', tenant_id: tenantId }] };
      }
      if (text.includes('actor_has_board_capability_v1')) return { rows: [{ allowed: true }] };
      return { rows: [] };
    },
  };
  const database = {
    checkout: async () => ({ client, release: () => undefined }),
    end: async () => undefined,
  } as unknown as RuntimeDatabase;
  const config = {
    env: 'disposable', entry: 'main', host: '127.0.0.1', port: 0, staticRoot: process.cwd(),
    profile: { runtime: { timeouts: { requestMillis: 2_000, transactionMillis: 2_000,
      statementMillis: 1_000, lockMillis: 1_000, idleInTransactionMillis: 1_000, shutdownMillis: 1_000 } } },
  } as unknown as RuntimeConfig;
  const server = createKernelHttpServer(config, database, [], { resolveActor: async () => actor, ragProvider });

  try {
    const address = await server.listen();
    const base = `http://${address.host}:${address.port}`;
    const response = await fetch(`${base}/api/v1/workspaces/legacy-workspace/boards/legacy-board/meeting:synthesize`, {
      method: 'POST',
      headers: {
        origin: base,
        'content-type': 'application/json',
        'x-projed-expected-account-id': actor.localUserId,
        'x-projed-expected-context-id': actor.contextId,
      },
      body: JSON.stringify({ title: 'Review', rawContent: '確認交付內容。', tasks: [], taskLinks: [], activities: [],
        requiredContractVersion: 'meeting-synthesis-v2' }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'RAG_PROVIDER_UNAVAILABLE');
    assert.equal(ragCalls, 0);
  } finally {
    await server.shutdown();
  }
});
