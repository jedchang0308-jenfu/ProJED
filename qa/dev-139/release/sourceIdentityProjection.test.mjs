import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const applySql = readFileSync('scripts/dev139-source-identity-projections.apply.sql', 'utf8');
const removeSql = readFileSync('scripts/dev139-source-identity-projections.remove.sql', 'utf8');

test('source identity projections expose only the approved columns through fixed barrier views', () => {
  assert.match(applySql, /CREATE VIEW private\.projed_dev139_google_identities_v1\s+WITH \(security_barrier = true\) AS\s+SELECT identity\.user_id,\s+identity\.provider,\s+identity\.provider_id,\s+identity\.identity_data\s+FROM auth\.identities AS identity\s+WHERE identity\.provider = 'google';/u);
  assert.match(applySql, /CREATE VIEW private\.projed_dev139_auth_users_v1\s+WITH \(security_barrier = true\) AS\s+SELECT source_user\.id,\s+source_user\.banned_until,\s+source_user\.deleted_at\s+FROM auth\.users AS source_user\s+WHERE EXISTS \([\s\S]*?identity\.user_id = source_user\.id[\s\S]*?identity\.provider = 'google'[\s\S]*?\);/u);
  assert.doesNotMatch(applySql, /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)|SECURITY\s+DEFINER|SELECT\s+\*/iu);
  assert.match(applySql, /ALTER VIEW private\.projed_dev139_google_identities_v1 OWNER TO postgres;/u);
  assert.match(applySql, /ALTER VIEW private\.projed_dev139_auth_users_v1 OWNER TO postgres;/u);
});

test('source projection grants are create-only and exclude direct Auth access', () => {
  assert.match(applySql, /DEV139_SOURCE_PROJECTION_ALREADY_EXISTS/u);
  assert.doesNotMatch(applySql, /CREATE\s+OR\s+REPLACE\s+VIEW/iu);
  assert.match(applySql, /REVOKE ALL ON TABLE auth\.identities FROM projed_dev139_source_reader;/u);
  assert.match(applySql, /REVOKE ALL ON TABLE auth\.users FROM projed_dev139_source_reader;/u);
  assert.equal((applySql.match(/GRANT SELECT ON TABLE private\.projed_dev139_/gu) ?? []).length, 2);
  assert.doesNotMatch(applySql, /GRANT[\s\S]*?ON TABLE auth\./iu);
});

test('source projection apply verifies its contract before commit', () => {
  assert.match(applySql, /DEV139_SOURCE_PROJECTION_POSTFLIGHT_INVALID/u);
  assert.match(applySql, /DEV139_SOURCE_PROJECTION_COLUMNS_INVALID/u);
  assert.match(applySql, /DEV139_SOURCE_PROJECTION_PRIVILEGES_INVALID/u);
  assert.match(applySql, /DEV139_SOURCE_PROJECTION_PUBLIC_GRANT_INVALID/u);
  assert.match(applySql, /pg_catalog\.has_table_privilege\(\s*'projed_dev139_source_reader', 'auth\.identities', 'SELECT'\s*\)/u);
  assert.match(applySql, /pg_catalog\.aclexplode\(/u);
  assert.ok(applySql.indexOf('$dev139_source_projection_postflight$') < applySql.lastIndexOf('COMMIT;'));
});

test('source projection removal drops only the two fixed views with dependency protection', () => {
  assert.equal((removeSql.match(/DROP VIEW private\.projed_dev139_/gu) ?? []).length, 2);
  assert.match(removeSql, /DROP VIEW private\.projed_dev139_auth_users_v1 RESTRICT;/u);
  assert.match(removeSql, /DROP VIEW private\.projed_dev139_google_identities_v1 RESTRICT;/u);
  assert.doesNotMatch(removeSql, /CASCADE|DROP\s+(?:SCHEMA|TABLE|ROLE)|DELETE\s+FROM|TRUNCATE/iu);
});
