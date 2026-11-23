import { readFileSync } from 'node:fs';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { startBrowserFixtureSession } from '../s2/verify-app-sessions-pg.js';
import { verifyQuickBackendUpgradePostgres } from './verify-quick-upgrade-pg.js';

// Focused entry on the existing disposable wrapper/seed; no new DB/runtime
// lifecycle or production auth route. The fixture identities remain synthetic.
const config = loadRuntimeConfig();
const database = new RuntimeDatabase(config);
const expected = config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
try {
  await database.assertRuntimeBoundary(expected);
  const owner = await startBrowserFixtureSession(database, config, 'owner');
  const other = await startBrowserFixtureSession(database, config, 'employeeCollaborator');
  const http = createKernelHttpServer(config, database, expected, {
    resolveActor: async request => {
      if (request.headers.cookie === '__session=qa-upgrade-owner') return owner;
      if (request.headers.cookie === '__session=qa-upgrade-other') return other;
      throw new KernelError('ACTOR_INVALID', 'Isolated Quick session is unavailable', 401);
    },
  });
  try {
    const address = await http.listen();
    await verifyQuickBackendUpgradePostgres(database, config, `http://${address.host}:${address.port}`, owner, other);
    console.log(JSON.stringify({ status: 'PASS', scope: 'A06_QUICK_BACKEND_UPGRADE_LOCAL_ACCEPTANCE', checks: [
      'live-legacy-source-1437a25-normal-ui-same-origin-manual-update',
      'offline-uncommitted-original-capture-first-create-and-replay',
      'source-committed-response-lost-production-two-domain-projection-insert-reconcile',
      'first-target-response-created-false-original-owner-id-content-and-committed-time',
      'single-task-single-receipt-and-other-account-invisibility',
    ] }));
  } finally { await http.shutdown(); }
} finally { await database.end(); }
