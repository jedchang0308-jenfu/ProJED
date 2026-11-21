-- Provider-owned Google IDs are imported from the same read-only snapshot as
-- profiles. Neither email nor profiles.external_auth_* is a linking authority.
CREATE TABLE projed_core.google_identity_proofs (
  google_subject text PRIMARY KEY CHECK (
    length(google_subject) BETWEEN 1 AND 255
    AND google_subject = btrim(google_subject)
    AND google_subject !~ '[[:cntrl:]]'
  ),
  local_user_id uuid NOT NULL REFERENCES projed_core.profiles(id)
);

ALTER TABLE projed_core.google_identity_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.google_identity_proofs FORCE ROW LEVEL SECURITY;

-- Only the server-side verified Google proof sets this transaction-local GUC.
-- A lookup does not establish an actor or grant access to any private content.
CREATE POLICY google_identity_proof_read_v1 ON projed_core.google_identity_proofs
  FOR SELECT TO projed_runtime_disposable
  USING (google_subject = current_setting('projed.verified_google_subject', true));

CREATE POLICY snapshot_importer_v1 ON projed_core.google_identity_proofs
  FOR ALL TO projed_importer_disposable USING (true) WITH CHECK (true);

REVOKE ALL ON projed_core.google_identity_proofs FROM PUBLIC;
GRANT SELECT ON projed_core.google_identity_proofs TO projed_runtime_disposable;
GRANT SELECT, INSERT ON projed_core.google_identity_proofs TO projed_importer_disposable;
