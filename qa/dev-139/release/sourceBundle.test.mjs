import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';

import {
  materializeSourceBundle,
  parseSourceBundleBytes,
} from '../../../scripts/run-dev139-managed-job.mjs';

const PROJECT_REF = 'knodlkxqpcqyrtgwpdst';
const HOSTNAME = `db.${PROJECT_REF}.supabase.co`;
const CERTIFICATE = '-----BEGIN CERTIFICATE-----\nfixture-root-ca\n-----END CERTIFICATE-----\n';
const CERTIFICATE_SHA256 = createHash('sha256').update(CERTIFICATE, 'utf8').digest('hex');

function makeBundle(overrides = {}) {
  return {
    bundleVersion: 1,
    sourceBinding: {
      bindingVersion: 1,
      provider: 'supabase-postgres',
      projectRef: PROJECT_REF,
      connectionMode: 'direct',
      hostname: HOSTNAME,
      port: 5432,
      databaseName: 'postgres',
      readerRole: 'projed_snapshot_reader',
      sslMode: 'verify-full',
      sslRootCertSha256: CERTIFICATE_SHA256,
    },
    databaseUrl: `postgresql://projed_snapshot_reader:source-password@${HOSTNAME}:5432/postgres?sslmode=verify-full&sslrootcert=%2Fcaller%2Fsupabase-root-ca.pem`,
    sslRootCertPem: CERTIFICATE,
    ...overrides,
  };
}

function assertInvalid(work) {
  assert.throws(work, (error) => {
    assert.equal(error.code, 'SOURCE_BUNDLE_INVALID');
    assert.equal(error.message, 'Managed source bundle is invalid');
    assert.doesNotMatch(error.message, /source-password|supabase|projed_snapshot_reader/u);
    return true;
  });
}

test('source bundle materialization pins the CA, writes 0600 files, and changes only sslrootcert', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'projed-dev139-source-bundle-'));
  try {
    const bundle = makeBundle();
    const original = new URL(bundle.databaseUrl);
    const result = materializeSourceBundle(bundle, temporaryDirectory);
    const materialized = new URL(result.sourceDatabaseUrl);

    assert.equal(readFileSync(result.sourceCaPath, 'utf8'), CERTIFICATE);
    assert.deepEqual(JSON.parse(readFileSync(result.sourceBindingPath, 'utf8')), bundle.sourceBinding);
    assert.equal(materialized.protocol, original.protocol);
    assert.equal(materialized.hostname, original.hostname);
    assert.equal(materialized.port, original.port);
    assert.equal(materialized.pathname, original.pathname);
    assert.equal(materialized.username, original.username);
    assert.equal(materialized.password, original.password);
    assert.equal(materialized.searchParams.get('sslmode'), original.searchParams.get('sslmode'));
    assert.equal(materialized.searchParams.get('sslrootcert'), result.sourceCaPath);
    assert.deepEqual([...materialized.searchParams.keys()].sort(), ['sslmode', 'sslrootcert']);
    if (process.platform !== 'win32') {
      assert.equal(statSync(result.sourceCaPath).mode & 0o777, 0o600);
      assert.equal(statSync(result.sourceBindingPath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('source bundle JSON parser accepts the exact v1 shape and rejects extras', () => {
  const bundle = makeBundle();
  const parsed = parseSourceBundleBytes(Buffer.from(`${JSON.stringify(bundle)}\n`, 'utf8'));
  assert.deepEqual(parsed, bundle);

  assertInvalid(() => parseSourceBundleBytes(Buffer.from(JSON.stringify({ ...bundle, password: 'extra-secret' }), 'utf8')));
  assertInvalid(() => parseSourceBundleBytes(Buffer.from(JSON.stringify({ ...bundle, sourceBinding: {
    ...bundle.sourceBinding, unexpected: 'extra',
  } }), 'utf8')));
  assertInvalid(() => parseSourceBundleBytes(Buffer.from('{malformed source-password json', 'utf8')));
  assertInvalid(() => parseSourceBundleBytes(Buffer.from('x'.repeat(256 * 1024 + 1), 'utf8')));
});

test('source bundle rejects wrong project, certificate drift, and oversized CA without echoing values', () => {
  const base = makeBundle();
  assertInvalid(() => parseSourceBundleBytes(JSON.stringify({ ...base, sourceBinding: {
    ...base.sourceBinding,
    projectRef: 'otherprojectreference123',
  } })));
  assertInvalid(() => parseSourceBundleBytes(JSON.stringify({ ...base, sslRootCertPem: CERTIFICATE.replace('fixture-root-ca', 'tampered-ca') })));

  const oversizedCertificate = `-----BEGIN CERTIFICATE-----\n${'a'.repeat(128 * 1024)}\n-----END CERTIFICATE-----\n`;
  const oversizedBundle = makeBundle({
    sslRootCertPem: oversizedCertificate,
    sourceBinding: {
      ...base.sourceBinding,
      sslRootCertSha256: createHash('sha256').update(oversizedCertificate, 'utf8').digest('hex'),
    },
  });
  assertInvalid(() => parseSourceBundleBytes(JSON.stringify(oversizedBundle)));
});

test('source bundle URL validation rejects project, port, TLS, password, extra, and duplicate query drift', () => {
  const base = makeBundle();
  const invalidUrls = [
    base.databaseUrl.replace(HOSTNAME, `db.otherprojectreference123.supabase.co`),
    base.databaseUrl.replace(':5432/', ':6543/'),
    base.databaseUrl.replace('sslmode=verify-full', 'sslmode=require'),
    base.databaseUrl.replace('source-password@', '@'),
    `${base.databaseUrl}&application_name=unexpected`,
    `${base.databaseUrl}&sslrootcert=%2Fcaller%2Fother.pem`,
    'postgresql://source-password@[',
  ];
  for (const databaseUrl of invalidUrls) {
    assertInvalid(() => parseSourceBundleBytes(JSON.stringify({ ...base, databaseUrl })));
  }
});
