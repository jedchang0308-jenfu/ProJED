import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Client } from 'pg';

import {
  deriveSupabaseSourceDatabaseRole,
  sha256Bytes,
  validateSupabaseSourceBinding,
  validateSupabaseSourceUrl,
} from '../../../scripts/dev139-supabase-source-contract.js';
import { validateSource } from '../../../scripts/dev139-data-migration.js';

const projectRef = 'abcdefghijklmnopqrst';

function sourceIdentityClient(roleName: string): Client {
  return {
    query: async () => ({ rows: [{
      database_name: 'postgres', role_name: roleName, read_only: true, isolation_level: 'repeatable read',
    }] }),
  } as unknown as Client;
}

test('direct Supabase migration source requires exact endpoint and verify-full CA binding', async () => {
  const root = mkdtempSync(join(tmpdir(), 'projed-dev139-source-'));
  const ca = join(root, 'supabase-ca.crt');
  writeFileSync(ca, 'test-ca');
  try {
    const binding = validateSupabaseSourceBinding({
      bindingVersion: 1, provider: 'supabase-postgres', projectRef, connectionMode: 'direct',
      hostname: `db.${projectRef}.supabase.co`, port: 5432, databaseName: 'postgres', readerRole: 'postgres',
      sslMode: 'verify-full', sslRootCertSha256: sha256Bytes(Buffer.from('test-ca')),
    });
    assert.equal(deriveSupabaseSourceDatabaseRole(binding), 'postgres');
    await validateSource(sourceIdentityClient('postgres'), binding);
    await assert.rejects(validateSource(sourceIdentityClient('snapshot_reader'), binding), {
      code: 'SOURCE_IDENTITY_INVALID',
    });
    const encodedCa = encodeURIComponent(ca);
    const url = `postgresql://postgres:password@${binding.hostname}:5432/postgres?sslmode=verify-full&sslrootcert=${encodedCa}`;
    assert.equal(validateSupabaseSourceUrl(url, binding), url);
    assert.throws(() => validateSupabaseSourceUrl(url.replace('verify-full', 'require'), binding), /outside/);
    assert.throws(() => validateSupabaseSourceUrl(url.replace(binding.hostname, 'db.other.supabase.co'), binding), /outside/);
    writeFileSync(ca, 'drifted-ca');
    assert.throws(() => validateSupabaseSourceUrl(url, binding), /CA/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('session pooler routing username resolves to the exact database role for readback', async () => {
  const binding = validateSupabaseSourceBinding({
    bindingVersion: 1, provider: 'supabase-postgres', projectRef, connectionMode: 'session',
    hostname: 'aws-0-asia-east1.pooler.supabase.com', port: 5432, databaseName: 'postgres',
    readerRole: `snapshot_reader.${projectRef}`, sslMode: 'verify-full', sslRootCertSha256: 'a'.repeat(64),
  });
  assert.equal(binding.connectionMode, 'session');
  assert.equal(binding.readerRole, `snapshot_reader.${projectRef}`);
  assert.equal(deriveSupabaseSourceDatabaseRole(binding), 'snapshot_reader');
  await validateSource(sourceIdentityClient('snapshot_reader'), binding);
  await assert.rejects(validateSource(sourceIdentityClient(`snapshot_reader.${projectRef}`), binding), {
    code: 'SOURCE_IDENTITY_INVALID',
  });
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, port: 6543 }), /contract/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, readerRole: 'snapshot_reader' }), /project ref/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, readerRole: 'snapshot_reader.wrongref' }), /project ref/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, readerRole: undefined }), /contract/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, unexpected: true }), /unknown field/);

  const unmappedRoleBinding = validateSupabaseSourceBinding({
    ...binding, readerRole: `unmapped_reader.${projectRef}`,
  });
  assert.equal(deriveSupabaseSourceDatabaseRole(unmappedRoleBinding), 'unmapped_reader');
  await assert.rejects(validateSource(sourceIdentityClient('snapshot_reader'), unmappedRoleBinding), {
    code: 'SOURCE_IDENTITY_INVALID',
  });
});

test('session source URL remains bound to the complete pooler routing username', () => {
  const root = mkdtempSync(join(tmpdir(), 'projed-dev139-pooler-'));
  const ca = join(root, 'supabase-ca.crt');
  writeFileSync(ca, 'pooler-ca');
  try {
    const binding = validateSupabaseSourceBinding({
      bindingVersion: 1, provider: 'supabase-postgres', projectRef, connectionMode: 'session',
      hostname: 'aws-0-asia-east1.pooler.supabase.com', port: 5432, databaseName: 'postgres',
      readerRole: `snapshot_reader.${projectRef}`, sslMode: 'verify-full',
      sslRootCertSha256: sha256Bytes(Buffer.from('pooler-ca')),
    });
    const url = `postgresql://${binding.readerRole}:password@${binding.hostname}:5432/postgres`
      + `?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
    assert.equal(validateSupabaseSourceUrl(url, binding), url);
    assert.throws(() => validateSupabaseSourceUrl(url.replace(binding.readerRole, 'snapshot_reader'), binding), /outside/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
