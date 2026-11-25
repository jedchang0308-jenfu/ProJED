-- Only account metadata crosses the owner boundary; no workspace/task grants.
CREATE POLICY profile_user_directory_owner_v1 ON projed_core.profiles
  FOR SELECT TO projed_owner_disposable USING (true);
CREATE POLICY proof_user_directory_owner_v1 ON projed_core.google_identity_proofs
  FOR SELECT TO projed_owner_disposable USING (true);
CREATE POLICY guard_user_directory_owner_v1 ON projed_core.account_authorization_guards
  FOR SELECT TO projed_owner_disposable USING (true);

CREATE VIEW projed_contract.v_user_directory_v1 WITH (security_barrier=true) AS
  SELECT profile.id AS account_id,proof.google_subject,profile.email,profile.display_name,guard.active,guard.revision
    FROM projed_core.profiles profile
    JOIN projed_core.google_identity_proofs proof ON proof.local_user_id=profile.id
    JOIN projed_core.account_authorization_guards guard ON guard.local_user_id=profile.id;
CREATE VIEW projed_contract.v_user_activation_guards_v1 WITH (security_barrier=true) AS
  SELECT local_user_id,active,revision,updated_at FROM projed_core.account_authorization_guards;
CREATE FUNCTION projed_contract.read_user_directory_v1()
RETURNS TABLE(account_id uuid,google_subject text,email text,display_name text,active boolean,revision bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT account_id,google_subject,email,display_name,active,revision FROM projed_contract.v_user_directory_v1
$$;

CREATE FUNCTION projed_contract.set_user_active_v1(p_account_id uuid,p_expected_revision bigint,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE current_guard record;
BEGIN
  IF p_account_id IS NULL OR p_expected_revision IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'PROJED_USER_REQUEST_INVALID';
  END IF;
  -- Same fence/order as domain writes and central session invalidation.
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:account:'||p_account_id::text,0));
  PERFORM set_config('projed.revocation_local_user_id',p_account_id::text,true);
  SELECT * INTO current_guard FROM projed_contract.v_user_activation_guards_v1
    WHERE local_user_id=p_account_id FOR UPDATE;
  IF NOT FOUND OR current_guard.revision<>p_expected_revision THEN RAISE EXCEPTION 'PROJED_USER_CONFLICT'; END IF;
  IF current_guard.active IS DISTINCT FROM p_active THEN
    UPDATE projed_contract.v_user_activation_guards_v1 SET active=p_active,revision=revision+1,updated_at=clock_timestamp()
      WHERE local_user_id=p_account_id;
  END IF;
END; $$;
REVOKE ALL ON projed_contract.v_user_directory_v1,projed_contract.v_user_activation_guards_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION projed_contract.read_user_directory_v1(),projed_contract.set_user_active_v1(uuid,bigint,boolean) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jenfu_orgmaster_migrator') THEN
    GRANT USAGE ON SCHEMA projed_contract TO jenfu_orgmaster_migrator;
    GRANT SELECT ON projed_contract.v_user_directory_v1,projed_contract.v_user_activation_guards_v1 TO jenfu_orgmaster_migrator;
    GRANT UPDATE(active,revision,updated_at) ON projed_contract.v_user_activation_guards_v1 TO jenfu_orgmaster_migrator;
    GRANT EXECUTE ON FUNCTION projed_contract.read_user_directory_v1(),projed_contract.set_user_active_v1(uuid,bigint,boolean)
      TO jenfu_orgmaster_migrator;
  END IF;
END $$;
