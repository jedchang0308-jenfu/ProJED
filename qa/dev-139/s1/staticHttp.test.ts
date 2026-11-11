import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { createKernelHttpServer } from '../../../server/http.js';

const runtimeConfig = (staticRoot: string, entry: 'main' | 'quick'): RuntimeConfig => ({
  env: 'disposable',
  entry,
  host: '127.0.0.1',
  port: 0,
  databaseUrl: 'postgresql://unused',
  profilePath: 'unused',
  profile: {
    profileVersion: 1,
    appKey: 'projed',
    kernelContractVersion: 1,
    environment: 'disposable',
    database: { namePattern: '^unused$', host: '127.0.0.1', supportedPostgresMajors: [17, 18], schemas: ['projed_core', 'projed_contract'] },
    roles: { owner: 'owner', migrator: 'migrator', importer: 'importer', runtime: 'runtime' },
    migrations: [],
    objectAllowlist: [],
    staticFixturePath: staticRoot,
    runtime: {
      bindHost: '127.0.0.1', cloudRunBindHost: '0.0.0.0',
      pool: { max: 1, min: 0, idleTimeoutMillis: 1000, connectionTimeoutMillis: 1000, maxWaiting: 1 },
      timeouts: { requestMillis: 1000, transactionMillis: 1000, statementMillis: 1000, lockMillis: 1000, idleInTransactionMillis: 1000, shutdownMillis: 1000 },
    },
  },
  bindingPath: 'unused',
  binding: { databaseName: 'unused', databasePort: 5432, runtimeRole: 'runtime', profileSha256: '0'.repeat(64), migrationSha256: {}, staticFixtureSha256: '0'.repeat(64) },
  staticRoot,
});

const database = {
  readiness: async () => true,
  end: async () => undefined,
} as unknown as RuntimeDatabase;

test('static runtime keeps main, quick and API fallback boundaries distinct', async () => {
  const root = mkdtempSync(join(tmpdir(), 'projed-dev139-static-'));
  mkdirSync(join(root, 'quick-task'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<main>MAIN_SHELL</main>');
  writeFileSync(join(root, 'quick-task/index.html'), '<main>QUICK_SHELL</main>');
  writeFileSync(join(root, 'assets/app.js'), 'STATIC_ASSET');
  const main = createKernelHttpServer(runtimeConfig(root, 'main'), database, []);
  const quick = createKernelHttpServer(runtimeConfig(root, 'quick'), database, []);
  try {
    const mainAddress = await main.listen();
    const quickAddress = await quick.listen();
    const mainBase = `http://127.0.0.1:${mainAddress.port}`;
    const quickBase = `http://127.0.0.1:${quickAddress.port}`;

    assert.match(await (await fetch(`${mainBase}/`)).text(), /MAIN_SHELL/);
    assert.match(await (await fetch(`${mainBase}/boards/example`)).text(), /MAIN_SHELL/);
    assert.match(await (await fetch(`${mainBase}/quick-task`)).text(), /QUICK_SHELL/);
    assert.match(await (await fetch(`${mainBase}/quick-task/offline`)).text(), /QUICK_SHELL/);
    assert.match(await (await fetch(`${quickBase}/`)).text(), /QUICK_SHELL/);
    assert.equal(await (await fetch(`${mainBase}/assets/app.js`)).text(), 'STATIC_ASSET');

    const missingAsset = await fetch(`${mainBase}/assets/missing.js`);
    assert.equal(missingAsset.status, 404);
    assert.equal(missingAsset.headers.get('content-type'), 'application/json; charset=utf-8');
    const unknownApi = await fetch(`${mainBase}/api/v1/not-a-real-route`);
    assert.equal(unknownApi.status, 404);
    assert.equal(unknownApi.headers.get('content-type'), 'application/json; charset=utf-8');
  } finally {
    await Promise.all([main.shutdown(), quick.shutdown()]);
    rmSync(root, { recursive: true, force: true });
  }
});
