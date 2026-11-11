-- First login may create a new local UUID only while its verified Google
-- proof is bound to the current, unexpired processing login-intent claim.
-- This is a one-time insert path; it cannot update or rebind existing rows.
CREATE FUNCTION projed_core.registration_scope_valid_v1()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  registration_user_id text := current_setting('projed.registration_user_id', true);
  verified_google_subject text := current_setting('projed.verified_google_subject', true);
  registration_email text := current_setting('projed.registration_email', true);
  registration_claim_hash text := current_setting('projed.registration_claim_hash', true);
  login_token_hash text := current_setting('projed.login_token_hash', true);
BEGIN
  -- Validate the textual UUID before any conversion can be planned or run.
  IF COALESCE(registration_user_id !~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$', true)
     OR projed_core.current_actor_user_id_v1()::text IS DISTINCT FROM registration_user_id
     OR COALESCE(verified_google_subject <> btrim(verified_google_subject), true)
     OR COALESCE(length(verified_google_subject) NOT BETWEEN 1 AND 255, true)
     OR COALESCE(verified_google_subject ~ '[[:cntrl:]]', true)
     OR COALESCE(registration_email <> lower(btrim(registration_email)), true)
     OR COALESCE(length(registration_email) NOT BETWEEN 3 AND 320, true)
     OR COALESCE(registration_email !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+[.][^@[:space:][:cntrl:]]+$', true)
     OR COALESCE(registration_claim_hash !~ '^[a-f0-9]{64}$', true)
     OR COALESCE(login_token_hash !~ '^[a-f0-9]{64}$', true) THEN
    RETURN false;
  END IF;

  -- app_login_intents has an exact login_token_hash runtime RLS scope. This
  -- lookup is invoker-scoped and does not recurse through registration policy.
  RETURN EXISTS (
    SELECT 1
      FROM projed_core.app_login_intents intent
     WHERE intent.token_hash = login_token_hash
       AND intent.status = 'processing'
       AND intent.claim_hash = registration_claim_hash
       AND intent.expires_at_ms > floor(extract(epoch FROM statement_timestamp()) * 1000)::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION projed_core.registration_scope_valid_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.registration_scope_valid_v1() TO projed_runtime_disposable;

-- A registration creates a fresh local UUID with no legacy external-auth link.
-- Existing profile IDs or Google subjects cannot be overwritten or rebound.
CREATE POLICY profile_first_registration_insert_v1
  ON projed_core.profiles
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    id::text = current_setting('projed.registration_user_id', true)
    AND id = projed_core.current_actor_user_id_v1()
    AND email = current_setting('projed.registration_email', true)
    AND external_auth_provider IS NULL
    AND external_auth_id IS NULL
    AND NOT EXISTS (
      SELECT 1
        FROM projed_core.google_identity_proofs proof
       WHERE proof.google_subject = current_setting('projed.verified_google_subject', true)
    )
    AND projed_core.registration_scope_valid_v1()
  );

CREATE POLICY google_identity_proof_first_registration_insert_v1
  ON projed_core.google_identity_proofs
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    google_subject = current_setting('projed.verified_google_subject', true)
    AND local_user_id::text = current_setting('projed.registration_user_id', true)
    AND projed_core.registration_scope_valid_v1()
  );

CREATE POLICY account_guard_first_registration_insert_v1
  ON projed_core.account_authorization_guards
  FOR INSERT TO projed_runtime_disposable
  WITH CHECK (
    local_user_id::text = current_setting('projed.registration_user_id', true)
    AND active IS TRUE
    AND revision = 1
    AND EXISTS (
      SELECT 1
        FROM projed_core.google_identity_proofs proof
       WHERE proof.google_subject = current_setting('projed.verified_google_subject', true)
         AND proof.local_user_id = account_authorization_guards.local_user_id
    )
    AND projed_core.registration_scope_valid_v1()
  );

REVOKE ALL ON projed_core.profiles, projed_core.google_identity_proofs,
  projed_core.account_authorization_guards FROM PUBLIC;
REVOKE ALL ON projed_core.profiles FROM projed_runtime_disposable;
GRANT SELECT ON projed_core.profiles TO projed_runtime_disposable;
GRANT UPDATE (display_name, ui_preferences, updated_at)
  ON projed_core.profiles TO projed_runtime_disposable;
GRANT INSERT (id, email, display_name)
  ON projed_core.profiles TO projed_runtime_disposable;

REVOKE ALL ON projed_core.google_identity_proofs FROM projed_runtime_disposable;
GRANT SELECT ON projed_core.google_identity_proofs TO projed_runtime_disposable;
GRANT INSERT (google_subject, local_user_id)
  ON projed_core.google_identity_proofs TO projed_runtime_disposable;

REVOKE ALL ON projed_core.account_authorization_guards FROM projed_runtime_disposable;
GRANT SELECT ON projed_core.account_authorization_guards TO projed_runtime_disposable;
GRANT INSERT (local_user_id, active, revision)
  ON projed_core.account_authorization_guards TO projed_runtime_disposable;
