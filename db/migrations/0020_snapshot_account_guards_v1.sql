-- Import the already-authorized account state once with the source snapshot.
-- Runtime roles retain their existing read-only guard access.
CREATE POLICY account_guard_snapshot_importer_read_v1
  ON projed_core.account_authorization_guards
  FOR SELECT TO projed_importer_disposable
  USING (true);

CREATE POLICY account_guard_snapshot_importer_insert_v1
  ON projed_core.account_authorization_guards
  FOR INSERT TO projed_importer_disposable
  WITH CHECK (
    active IS TRUE
    AND revision = 1
    AND EXISTS (
      SELECT 1
        FROM projed_core.google_identity_proofs proof
       WHERE proof.local_user_id = account_authorization_guards.local_user_id
    )
  );

REVOKE ALL ON projed_core.account_authorization_guards FROM PUBLIC;
REVOKE ALL ON projed_core.account_authorization_guards FROM projed_importer_disposable;
GRANT SELECT ON projed_core.account_authorization_guards TO projed_importer_disposable;
GRANT INSERT (local_user_id, active, revision, updated_at)
  ON projed_core.account_authorization_guards TO projed_importer_disposable;
