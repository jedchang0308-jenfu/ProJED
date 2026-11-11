-- ProJED owns its browser Session. Owner handoff codes and Firebase tokens
-- never become browser credentials. All context below is set by trusted code.
ALTER TABLE projed_core.google_identity_proofs
  ADD CONSTRAINT google_identity_proofs_subject_user_v1 UNIQUE (google_subject, local_user_id);

CREATE TABLE projed_core.app_login_intents (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  state_hash text NOT NULL UNIQUE CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  entry text NOT NULL CHECK (entry IN ('main','quick')),
  public_origin text NOT NULL CHECK (length(public_origin) BETWEEN 1 AND 2048),
  return_path text NOT NULL CHECK (length(return_path) BETWEEN 1 AND 1024 AND left(return_path,1)='/'),
  old_session_hash text CHECK (old_session_hash ~ '^[a-f0-9]{64}$'),
  code_verifier text CHECK (code_verifier ~ '^[A-Za-z0-9_-]{43,128}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','consumed','cancelled','rejected')),
  claim_hash text CHECK (claim_hash ~ '^[a-f0-9]{64}$'),
  completed_session_hash text CHECK (completed_session_hash ~ '^[a-f0-9]{64}$'),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms BETWEEN 1 AND 9007199254740991),
  CHECK ((status IN ('pending','processing')) = (code_verifier IS NOT NULL)),
  CHECK ((status='processing') = (claim_hash IS NOT NULL)),
  CHECK ((status='consumed') = (completed_session_hash IS NOT NULL))
);

CREATE TABLE projed_core.app_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  public_origin text NOT NULL CHECK (length(public_origin) BETWEEN 1 AND 2048),
  entry text NOT NULL CHECK (entry IN ('main','quick')),
  local_user_id uuid NOT NULL REFERENCES projed_core.profiles(id),
  google_subject text NOT NULL,
  context_id uuid NOT NULL UNIQUE,
  account_guard_revision bigint NOT NULL CHECK (account_guard_revision > 0),
  identity jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(identity)='object'
    AND identity->>'contractVersion'='jenfu.sso-handoff.v4'
    AND identity->>'audience'='projed'
    AND identity->>'googleSubject'=google_subject, false
  )),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms BETWEEN 1 AND 9007199254740991),
  revoked_at_ms bigint CHECK (revoked_at_ms BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (google_subject,local_user_id)
    REFERENCES projed_core.google_identity_proofs(google_subject,local_user_id),
  CHECK (COALESCE(jsonb_typeof(identity->'sourceSessionExpiresAtMs')='number'
    AND expires_at_ms <= (identity->>'sourceSessionExpiresAtMs')::bigint, false))
);
CREATE UNIQUE INDEX login_intents_active_old_session_v1
  ON projed_core.app_login_intents(old_session_hash)
  WHERE old_session_hash IS NOT NULL AND status IN ('pending','processing');

CREATE FUNCTION projed_core.app_login_intent_transition_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='pending' AND NEW.status IN ('processing','cancelled','rejected')
     OR OLD.status='processing' AND NEW.status IN ('consumed','cancelled','rejected') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid login intent transition' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER app_login_intent_transition_v1 BEFORE UPDATE ON projed_core.app_login_intents
  FOR EACH ROW EXECUTE FUNCTION projed_core.app_login_intent_transition_v1();

CREATE FUNCTION projed_core.app_session_revoke_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.revoked_at_ms IS NULL AND NEW.revoked_at_ms IS NOT NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Session revocation is irreversible' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER app_session_revoke_v1 BEFORE UPDATE ON projed_core.app_sessions
  FOR EACH ROW EXECUTE FUNCTION projed_core.app_session_revoke_v1();

ALTER TABLE projed_core.app_login_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.app_login_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE projed_core.app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.app_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY login_intent_runtime_v1 ON projed_core.app_login_intents
  FOR ALL TO projed_runtime_disposable
  USING (token_hash=current_setting('projed.login_token_hash',true)
    OR old_session_hash=current_setting('projed.session_token_hash',true))
  WITH CHECK (token_hash=current_setting('projed.login_token_hash',true)
    OR (old_session_hash=current_setting('projed.session_token_hash',true)
      AND status IN ('cancelled','rejected')));
CREATE POLICY app_session_runtime_read_v1 ON projed_core.app_sessions
  FOR SELECT TO projed_runtime_disposable
  USING (token_hash=current_setting('projed.session_token_hash',true));
CREATE POLICY app_session_runtime_insert_v1 ON projed_core.app_sessions
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    token_hash=current_setting('projed.session_token_hash',true)
    AND google_subject=current_setting('projed.verified_google_subject',true)
    AND local_user_id=projed_core.current_actor_user_id_v1()
    AND account_guard_revision=current_setting('projed.actor_guard_revision',true)::bigint
    AND identity->>'principalId'=current_setting('projed.actor_principal_id',true)
    AND projed_core.actor_context_valid_v1()
  );
CREATE POLICY app_session_runtime_revoke_v1 ON projed_core.app_sessions
  FOR UPDATE TO projed_runtime_disposable
  USING (token_hash=current_setting('projed.session_token_hash',true))
  WITH CHECK (token_hash=current_setting('projed.session_token_hash',true) AND revoked_at_ms IS NOT NULL);

REVOKE ALL ON projed_core.app_login_intents,projed_core.app_sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION projed_core.app_login_intent_transition_v1(),projed_core.app_session_revoke_v1() FROM PUBLIC;
GRANT SELECT ON projed_core.app_login_intents,projed_core.app_sessions TO projed_runtime_disposable;
GRANT INSERT (token_hash,state_hash,entry,public_origin,return_path,old_session_hash,code_verifier,expires_at_ms)
  ON projed_core.app_login_intents TO projed_runtime_disposable;
GRANT INSERT (token_hash,public_origin,entry,local_user_id,google_subject,context_id,account_guard_revision,identity,expires_at_ms)
  ON projed_core.app_sessions TO projed_runtime_disposable;
GRANT UPDATE (status,claim_hash,code_verifier,completed_session_hash)
  ON projed_core.app_login_intents TO projed_runtime_disposable;
GRANT UPDATE (revoked_at_ms) ON projed_core.app_sessions TO projed_runtime_disposable;
GRANT EXECUTE ON FUNCTION projed_core.app_login_intent_transition_v1(),projed_core.app_session_revoke_v1()
  TO projed_runtime_disposable;
