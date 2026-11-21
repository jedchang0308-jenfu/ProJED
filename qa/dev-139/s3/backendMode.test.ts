import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BackendFeatureUnavailableError,
  requireLegacyProviderFeature,
  resolveDataBackend,
} from '../../../src/services/backendMode';

test('backend selector resolves only explicit supported modes', () => {
  assert.equal(resolveDataBackend('http'), 'http');
  assert.equal(resolveDataBackend('supabase'), 'supabase');
  assert.equal(resolveDataBackend('local-test'), 'local-test');
  assert.equal(resolveDataBackend('unexpected'), 'firebase');
  assert.equal(resolveDataBackend(undefined), 'firebase');
});

test('HTTP mode fails closed before invoking a legacy provider feature', () => {
  assert.throws(
    () => requireLegacyProviderFeature('專案智慧助理', 'http'),
    (error: unknown) => error instanceof BackendFeatureUnavailableError
      && error.code === 'BACKEND_UNSUPPORTED'
      && /專案智慧助理/.test(error.message),
  );
  assert.doesNotThrow(() => requireLegacyProviderFeature('專案智慧助理', 'supabase'));
});

