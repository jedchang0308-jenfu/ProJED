import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectGoogleIdentityProofs,
  validateGoogleIdentitySourceColumns,
  type GoogleIdentitySourceRow,
} from '../../../scripts/lib/dev139-google-identity-proof.js';

const owner = '11111111-1111-4111-8111-111111111111';
const guest = '22222222-2222-4222-8222-222222222222';
const subject = 'synthetic-google-subject-owner';
const profiles = new Set([owner, guest]);

const identity = (overrides: Partial<GoogleIdentitySourceRow> = {}): GoogleIdentitySourceRow => ({
  local_user_id: owner,
  google_subject: subject,
  identity_data_type: 'object',
  identity_data_has_sub: true,
  identity_data_sub_type: 'string',
  identity_data_sub: subject,
  ...overrides,
});

const assertCode = (expectedCode: string, action: () => unknown): void => {
  assert.throws(action, error => Boolean(error && typeof error === 'object'
    && 'code' in error && error.code === expectedCode));
};

test('auth.identities source columns require the exact relation shape and PostgreSQL types', () => {
  validateGoogleIdentitySourceColumns([
    { relation_kind: 'r', column_name: 'id', data_type: 'uuid' },
    { relation_kind: 'r', column_name: 'provider', data_type: 'text' },
    { relation_kind: 'r', column_name: 'user_id', data_type: 'uuid' },
    { relation_kind: 'r', column_name: 'provider_id', data_type: 'text' },
    { relation_kind: 'r', column_name: 'identity_data', data_type: 'jsonb' },
  ]);
  assertCode('SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID', () => validateGoogleIdentitySourceColumns([]));
  assertCode('SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID', () => validateGoogleIdentitySourceColumns([
    { relation_kind: 'r', column_name: 'provider', data_type: 'text' },
    { relation_kind: 'r', column_name: 'user_id', data_type: 'text' },
    { relation_kind: 'r', column_name: 'provider_id', data_type: 'text' },
    { relation_kind: 'r', column_name: 'identity_data', data_type: 'jsonb' },
  ]));
  assertCode('SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID', () => validateGoogleIdentitySourceColumns([
    { relation_kind: 'v', column_name: 'provider', data_type: 'text' },
    { relation_kind: 'v', column_name: 'user_id', data_type: 'uuid' },
    { relation_kind: 'v', column_name: 'provider_id', data_type: 'text' },
    { relation_kind: 'v', column_name: 'identity_data', data_type: 'jsonb' },
  ]));
});

test('Google provider_id maps directly to an existing profile UUID and missing sub remains acceptable', () => {
  const projected = projectGoogleIdentityProofs([
    identity(),
    identity({
      local_user_id: guest,
      google_subject: 'synthetic-google-subject-without-sub',
      identity_data_has_sub: false,
      identity_data_sub_type: null,
      identity_data_sub: null,
    }),
  ], profiles);
  assert.deepEqual(projected, [
    { google_subject: subject, local_user_id: owner },
    { google_subject: 'synthetic-google-subject-without-sub', local_user_id: guest },
  ]);
});

test('identity_data.sub, when present, must exactly equal provider_id', () => {
  assertCode('SOURCE_GOOGLE_IDENTITY_SUB_MISMATCH', () => projectGoogleIdentityProofs([
    identity({ identity_data_sub: 'different-google-subject' }),
  ], profiles));
  assertCode('SOURCE_GOOGLE_IDENTITY_SUB_MISMATCH', () => projectGoogleIdentityProofs([
    identity({ identity_data_sub_type: 'null', identity_data_sub: null }),
  ], profiles));
});

test('a Google subject cannot map to multiple UUIDs and orphan identities are rejected', () => {
  assertCode('SOURCE_GOOGLE_IDENTITY_AMBIGUOUS', () => projectGoogleIdentityProofs([
    identity(), identity({ local_user_id: guest }),
  ], profiles));
  assertCode('SOURCE_GOOGLE_IDENTITY_ORPHAN', () => projectGoogleIdentityProofs([
    identity({ local_user_id: '33333333-3333-4333-8333-333333333333' }),
  ], profiles));
});

test('invalid UUIDs, incomplete rows, and noncanonical or controlled subjects fail closed', () => {
  assertCode('SOURCE_GOOGLE_IDENTITY_INVALID', () => projectGoogleIdentityProofs([
    identity({ local_user_id: 'not-a-uuid' }),
  ], profiles));
  assertCode('SOURCE_GOOGLE_IDENTITY_INVALID', () => projectGoogleIdentityProofs([
    identity({ identity_data_type: 'array' }),
  ], profiles));
  assertCode('SOURCE_GOOGLE_IDENTITY_INVALID', () => projectGoogleIdentityProofs([
    identity({ google_subject: `bad\u0001subject`, identity_data_sub: `bad\u0001subject` }),
  ], profiles));
  assertCode('SOURCE_GOOGLE_IDENTITY_INVALID', () => projectGoogleIdentityProofs([
    identity({ google_subject: 'x'.repeat(256), identity_data_sub: 'x'.repeat(256) }),
  ], profiles));
});

test('profiles without Google identities stay absent from the proof projection', () => {
  assert.deepEqual(projectGoogleIdentityProofs([], profiles), []);
});
