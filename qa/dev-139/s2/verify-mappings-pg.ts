import assert from 'node:assert/strict';
import type { RuntimeDatabase } from '../../../server/db.js';
import { GooglePrincipalMappingResolver } from '../../../server/principalMappings.js';

export async function verifyGoogleMappingsPostgres(database: RuntimeDatabase): Promise<void> {
  const lease = await database.checkout();
  try {
    assert.equal((await lease.client.query('SELECT * FROM projed_core.google_identity_proofs')).rowCount, 0);
    const acl = (await lease.client.query<{ runtime_write: boolean; importer_update: boolean; forced: boolean }>(`
      SELECT has_table_privilege(current_user,'projed_core.google_identity_proofs','INSERT,UPDATE,DELETE') AS runtime_write,
             has_table_privilege('projed_importer_disposable','projed_core.google_identity_proofs','UPDATE,DELETE') AS importer_update,
             (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
               WHERE oid='projed_core.google_identity_proofs'::regclass) AS forced
    `)).rows[0]!;
    assert.equal(acl.runtime_write, false);
    assert.equal(acl.importer_update, false);
    assert.equal(acl.forced, true);
    await lease.client.query('BEGIN');
    await lease.client.query("SELECT set_config('projed.verified_google_subject','synthetic-google-a',true)");
    assert.equal((await lease.client.query("SELECT * FROM projed_core.google_identity_proofs WHERE google_subject='synthetic-google-b'")).rowCount, 0);
    await lease.client.query('ROLLBACK');
  } finally { lease.release(); }

  const resolver = new GooglePrincipalMappingResolver(database);
  const proof = {
    principalId: 'principal:a', identityIssuer: 'https://securetoken.google.com/local-test',
    identitySubject: 'firebase-a', googleSubject: 'synthetic-google-a', mappingRevision: '12',
  };
  const mapped = await resolver.resolve(proof);
  assert.deepEqual(mapped, {
    status: 'active', principalId: proof.principalId,
    identityIssuer: proof.identityIssuer, identitySubject: proof.identitySubject,
    googleSubject: proof.googleSubject,
    mappingRevision: '12', localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accountGuardRevision: '1',
  });
  assert.deepEqual(await resolver.resolve({ ...proof, googleSubject: 'not-in-the-snapshot' }), { status: 'missing' });
  assert.deepEqual(await resolver.resolve({ ...proof, googleSubject: 'synthetic-google-no-guard' }), { status: 'inactive' });
  assert.deepEqual(await resolver.resolve({ ...proof, googleSubject: 'synthetic-google-inactive' }), { status: 'inactive' });
  const after = await database.checkout();
  try {
    assert.equal((await after.client.query('SELECT * FROM projed_core.google_identity_proofs')).rowCount, 0);
    assert.equal((await after.client.query('SELECT * FROM projed_core.account_authorization_guards')).rowCount, 0);
  } finally { after.release(); }
}
