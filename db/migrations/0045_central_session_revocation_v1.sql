-- Synchronous shared-database revocation. Central owners see only the two
-- versioned metadata views; no sibling receives a core grant or private data.
CREATE VIEW projed_contract.v_google_session_accounts_v1 WITH (security_barrier=true) AS
  SELECT google_subject,local_user_id FROM projed_core.google_identity_proofs;
CREATE VIEW projed_contract.v_account_session_guards_v1 WITH (security_barrier=true) AS
  SELECT local_user_id,revision FROM projed_core.account_authorization_guards;

-- The views use their app owner, while FORCE RLS retains the exact scope set
-- by the invoker below. No runtime role can read or update these views.
CREATE POLICY google_session_revocation_owner_v1 ON projed_core.google_identity_proofs
  FOR SELECT TO projed_owner_disposable
  USING (google_subject=current_setting('projed.revocation_google_subject',true));
CREATE POLICY account_session_revocation_owner_read_v1 ON projed_core.account_authorization_guards
  FOR SELECT TO projed_owner_disposable
  USING (local_user_id::text=current_setting('projed.revocation_local_user_id',true));
CREATE POLICY account_session_revocation_owner_write_v1 ON projed_core.account_authorization_guards
  FOR UPDATE TO projed_owner_disposable
  USING (local_user_id::text=current_setting('projed.revocation_local_user_id',true))
  WITH CHECK (local_user_id::text=current_setting('projed.revocation_local_user_id',true));

CREATE FUNCTION projed_core.account_session_revocation_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM OLD.revision AND
    (OLD.revision=9223372036854775807 OR NEW.revision<>OLD.revision+1) THEN
    RAISE EXCEPTION 'Session guard can only advance one revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_session_revocation_guard_v1 BEFORE UPDATE ON projed_core.account_authorization_guards
  FOR EACH ROW EXECUTE FUNCTION projed_core.account_session_revocation_guard_v1();

CREATE FUNCTION projed_contract.invalidate_google_sessions_v1(p_google_subject text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE account_id uuid;
BEGIN
  IF p_google_subject IS NULL OR p_google_subject<>btrim(p_google_subject)
    OR length(p_google_subject) NOT BETWEEN 1 AND 255 OR p_google_subject~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid revocation subject' USING ERRCODE='22023';
  END IF;
  -- Same order as login completion and every domain transaction. A prior
  -- commit completes before publication; a later old actor fails its guard.
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.revocation_google_subject',p_google_subject,true);
  SELECT local_user_id INTO account_id FROM projed_contract.v_google_session_accounts_v1
    WHERE google_subject=p_google_subject;
  IF account_id IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:account:'||account_id::text,0));
  PERFORM set_config('projed.revocation_local_user_id',account_id::text,true);
  UPDATE projed_contract.v_account_session_guards_v1 SET revision=revision+1 WHERE local_user_id=account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account revocation guard unavailable' USING ERRCODE='55000'; END IF;
END;
$$;
REVOKE ALL ON projed_contract.v_google_session_accounts_v1,projed_contract.v_account_session_guards_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION projed_contract.invalidate_google_sessions_v1(text),
  projed_core.account_session_revocation_guard_v1() FROM PUBLIC;

-- Disposable ProJED-only verification need not invent the upstream roles.
-- In the shared DB these already belong to the actual owner-trigger executor.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jenfu_platform_migrator') THEN
    GRANT USAGE ON SCHEMA projed_contract TO jenfu_platform_migrator;
    GRANT SELECT ON projed_contract.v_google_session_accounts_v1,projed_contract.v_account_session_guards_v1 TO jenfu_platform_migrator;
    GRANT UPDATE(revision) ON projed_contract.v_account_session_guards_v1 TO jenfu_platform_migrator;
    GRANT EXECUTE ON FUNCTION projed_contract.invalidate_google_sessions_v1(text) TO jenfu_platform_migrator;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jenfu_orgmaster_migrator') THEN
    GRANT USAGE ON SCHEMA projed_contract TO jenfu_orgmaster_migrator;
    GRANT SELECT ON projed_contract.v_google_session_accounts_v1,projed_contract.v_account_session_guards_v1 TO jenfu_orgmaster_migrator;
    GRANT UPDATE(revision) ON projed_contract.v_account_session_guards_v1 TO jenfu_orgmaster_migrator;
    GRANT EXECUTE ON FUNCTION projed_contract.invalidate_google_sessions_v1(text) TO jenfu_orgmaster_migrator;
  END IF;
END $$;
