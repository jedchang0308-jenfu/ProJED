import assert from 'node:assert/strict';
import pg from 'pg';
import type { RuntimeConfig } from '../../../server/config.js';
import type { ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';

const installed = new Set<string>();

/** Synthetic producer only in the nonce QA cluster; never imported by server. */
export async function publishSyntheticPrincipalState(config: RuntimeConfig, proof: ProducerVerifiedIdentity): Promise<void> {
  assert.equal(config.profile.environment,'disposable');
  assert.match(config.binding.databaseName,/^dev139_s3_[a-f0-9]{32}$/u);
  const url = new URL(process.env.PROJED_QA_MEETING_ADMIN_URL!);
  assert.equal(url.hostname,'127.0.0.1');
  assert.equal(Number(url.port),config.binding.databasePort);
  assert.equal(url.pathname,`/${config.binding.databaseName}`);
  const admin = new pg.Client({connectionString:url.toString()});
  await admin.connect();
  try {
    if (!installed.has(config.binding.databaseName)) {
      await admin.query(`CREATE SCHEMA platform_contract;
        CREATE TABLE platform_contract.synthetic_projed_states (principal_id text PRIMARY KEY, proof jsonb NOT NULL);
        CREATE FUNCTION platform_contract.read_projed_principal_state_v1(p_issuer text,p_subject text,p_principal text)
        RETURNS TABLE(contract_version text,principal_id text,principal_kind text,employee_id text,
          identity_issuer text,identity_subject text,google_subject text,mapping_revision bigint,
          auth_epoch bigint,revoked_before timestamptz,read_at timestamptz)
        LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
          SELECT 'jenfu.platform.projed-principal-state.v1'::text,s.principal_id,s.proof->>'principalKind',s.proof->>'employeeId',
            s.proof->>'identityIssuer',s.proof->>'identitySubject',s.proof->>'googleSubject',
            (s.proof->>'mappingRevision')::bigint,(s.proof->>'authEpoch')::bigint,
            CASE WHEN s.proof->>'revokedBeforeMs' IS NOT NULL THEN to_timestamp((s.proof->>'revokedBeforeMs')::double precision/1000) END,
            clock_timestamp()
          FROM platform_contract.synthetic_projed_states s WHERE s.principal_id=p_principal
            AND s.proof->>'identityIssuer'=p_issuer AND s.proof->>'identitySubject'=p_subject;
        $$;
        REVOKE ALL ON FUNCTION platform_contract.read_projed_principal_state_v1(text,text,text) FROM PUBLIC;
        GRANT USAGE ON SCHEMA platform_contract TO projed_runtime_disposable;
        GRANT EXECUTE ON FUNCTION platform_contract.read_projed_principal_state_v1(text,text,text) TO projed_runtime_disposable;`);
      installed.add(config.binding.databaseName);
    }
    await admin.query(`INSERT INTO platform_contract.synthetic_projed_states VALUES($1,$2::jsonb)
      ON CONFLICT(principal_id) DO UPDATE SET proof=EXCLUDED.proof`,[proof.principalId,JSON.stringify(proof)]);
  } finally { await admin.end(); }
}
