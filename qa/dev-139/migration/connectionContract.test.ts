import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  sha256Bytes,
  validateSupabaseSourceBinding,
  validateSupabaseSourceUrl,
} from '../../../scripts/dev139-supabase-source-contract.js';

const projectRef = 'abcdefghijklmnopqrst';

test('direct Supabase migration source requires exact endpoint and verify-full CA binding', () => {
  const root = mkdtempSync(join(tmpdir(), 'projed-dev139-source-'));
  const ca = join(root, 'supabase-ca.crt');
  writeFileSync(ca, 'test-ca');
  try {
    const binding = validateSupabaseSourceBinding({
      bindingVersion: 1, provider: 'supabase-postgres', projectRef, connectionMode: 'direct',
      hostname: `db.${projectRef}.supabase.co`, port: 5432, databaseName: 'postgres', readerRole: 'postgres',
      sslMode: 'verify-full', sslRootCertSha256: sha256Bytes(Buffer.from('test-ca')),
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

test('session source permits only port 5432 pooler with a project-scoped role', () => {
  const binding = validateSupabaseSourceBinding({
    bindingVersion: 1, provider: 'supabase-postgres', projectRef, connectionMode: 'session',
    hostname: 'aws-0-asia-east1.pooler.supabase.com', port: 5432, databaseName: 'postgres',
    readerRole: `snapshot_reader.${projectRef}`, sslMode: 'verify-full', sslRootCertSha256: 'a'.repeat(64),
  });
  assert.equal(binding.connectionMode, 'session');
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, port: 6543 }), /contract/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, readerRole: 'snapshot_reader' }), /project ref/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, readerRole: undefined }), /contract/);
  assert.throws(() => validateSupabaseSourceBinding({ ...binding, unexpected: true }), /unknown field/);
});
