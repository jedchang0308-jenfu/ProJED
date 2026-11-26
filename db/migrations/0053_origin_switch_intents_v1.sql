-- Short-lived proof metadata only. No private drafts, browser tokens or emails.
CREATE TABLE projed_core.origin_switch_intents (
  id uuid PRIMARY KEY,
  campaign text NOT NULL CHECK (campaign ~ '^[a-zA-Z0-9._-]{1,80}$'),
  local_user_id uuid NOT NULL REFERENCES projed_core.profiles(id),
  principal_id text NOT NULL CHECK (length(principal_id) BETWEEN 1 AND 255),
  guard_revision bigint NOT NULL CHECK (guard_revision > 0),
  guide_entry text NOT NULL CHECK (guide_entry IN ('main','quick')),
  source_origin text NOT NULL CHECK (length(source_origin) BETWEEN 1 AND 2048),
  target_origin text NOT NULL CHECK (length(target_origin) BETWEEN 1 AND 2048 AND target_origin<>source_origin),
  source_entry text NOT NULL CHECK (source_entry IN ('main','quick')),
  target_entry text NOT NULL CHECK (target_entry IN ('main','quick')),
  source_context_id uuid NOT NULL,
  source_permissions jsonb NOT NULL CHECK (jsonb_typeof(source_permissions)='object'),
  target_context_id uuid,
  created_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms>created_at_ms AND expires_at_ms<=created_at_ms+900000),
  confirmed_at_ms bigint,
  CHECK ((target_context_id IS NULL)=(confirmed_at_ms IS NULL)),
  CHECK (confirmed_at_ms IS NULL OR confirmed_at_ms BETWEEN created_at_ms AND expires_at_ms)
);
ALTER TABLE projed_core.origin_switch_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.origin_switch_intents FORCE ROW LEVEL SECURITY;
-- The locator is not a credential: every read still requires the same actor.
-- This policy must not query app_sessions (the exact Session policy uses it).
CREATE POLICY origin_switch_read_v1 ON projed_core.origin_switch_intents FOR SELECT TO projed_runtime_disposable
  USING (id::text=current_setting('projed.origin_switch_intent_id',true)
    AND local_user_id=projed_core.current_actor_user_id_v1()
    AND principal_id=current_setting('projed.actor_principal_id',true)
    AND guard_revision::text=current_setting('projed.actor_guard_revision',true)
    AND (source_context_id::text=current_setting('projed.actor_context_id',true)
      OR target_context_id::text=current_setting('projed.actor_context_id',true)
      OR (target_context_id IS NULL AND target_origin=current_setting('projed.actor_public_origin',true)
        AND target_entry=current_setting('projed.actor_entry',true)))
    AND projed_core.actor_context_valid_v1());
CREATE POLICY origin_switch_insert_v1 ON projed_core.origin_switch_intents FOR INSERT TO projed_runtime_disposable
  WITH CHECK (id::text=current_setting('projed.origin_switch_intent_id',true)
    AND local_user_id=projed_core.current_actor_user_id_v1()
    AND principal_id=current_setting('projed.actor_principal_id',true)
    AND guard_revision::text=current_setting('projed.actor_guard_revision',true)
    AND source_context_id::text=current_setting('projed.actor_context_id',true)
    AND projed_core.actor_context_valid_v1());
CREATE POLICY origin_switch_confirm_v1 ON projed_core.origin_switch_intents FOR UPDATE TO projed_runtime_disposable
  USING (id::text=current_setting('projed.origin_switch_intent_id',true)
    AND local_user_id=projed_core.current_actor_user_id_v1()
    AND principal_id=current_setting('projed.actor_principal_id',true)
    AND guard_revision::text=current_setting('projed.actor_guard_revision',true)
    AND projed_core.actor_context_valid_v1())
  WITH CHECK (target_context_id::text=current_setting('projed.actor_context_id',true));
-- Purpose-scoped counterpart proof, never a same-account Session listing.
CREATE POLICY origin_switch_exact_session_read_v1 ON projed_core.app_sessions FOR SELECT TO projed_runtime_disposable
  USING (local_user_id=projed_core.current_actor_user_id_v1()
    AND identity->>'principalId'=current_setting('projed.actor_principal_id',true)
    AND EXISTS (SELECT 1 FROM projed_core.origin_switch_intents intent
      WHERE intent.id::text=current_setting('projed.origin_switch_intent_id',true)
        AND intent.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
        AND app_sessions.context_id IN (intent.source_context_id,intent.target_context_id)));
CREATE FUNCTION projed_core.origin_switch_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  session_row projed_core.app_sessions%ROWTYPE;
  now_ms bigint := floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
  SELECT * INTO STRICT session_row FROM projed_core.app_sessions
    WHERE token_hash=current_setting('projed.session_token_hash',true)
      AND context_id::text=current_setting('projed.actor_context_id',true)
      AND local_user_id=NEW.local_user_id AND identity->>'principalId'=NEW.principal_id
      AND account_guard_revision=NEW.guard_revision AND revoked_at_ms IS NULL AND expires_at_ms>now_ms;
  IF TG_OP='INSERT' THEN
    IF NEW.source_context_id<>session_row.context_id OR NEW.source_origin<>session_row.public_origin
      OR NEW.source_entry<>session_row.entry OR NEW.target_context_id IS NOT NULL
      OR NEW.confirmed_at_ms IS NOT NULL OR NEW.created_at_ms<>now_ms AND abs(NEW.created_at_ms-now_ms)>5000
      OR NEW.expires_at_ms>session_row.expires_at_ms OR NEW.expires_at_ms<=now_ms
      OR NEW.source_permissions IS DISTINCT FROM projed_core.session_effective_permissions_v1(
        session_row.permission_snapshot,session_row.created_resource_permissions) THEN
      RAISE EXCEPTION 'Invalid source origin intent' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.target_context_id IS NOT NULL OR NEW.target_context_id<>session_row.context_id
      OR NEW.target_entry<>session_row.entry OR NEW.target_origin<>session_row.public_origin
      OR NEW.confirmed_at_ms IS NULL OR abs(NEW.confirmed_at_ms-now_ms)>5000 OR NEW.expires_at_ms<=now_ms
      OR to_jsonb(OLD)-ARRAY['target_context_id','confirmed_at_ms']
        IS DISTINCT FROM to_jsonb(NEW)-ARRAY['target_context_id','confirmed_at_ms'] THEN
      RAISE EXCEPTION 'Invalid destination origin confirmation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER origin_switch_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.origin_switch_intents
  FOR EACH ROW EXECUTE FUNCTION projed_core.origin_switch_guard_v1();
REVOKE ALL ON projed_core.origin_switch_intents FROM PUBLIC;
REVOKE ALL ON FUNCTION projed_core.origin_switch_guard_v1() FROM PUBLIC;
GRANT SELECT ON projed_core.origin_switch_intents TO projed_runtime_disposable;
GRANT INSERT(id,campaign,local_user_id,principal_id,guard_revision,guide_entry,source_origin,target_origin,
  source_entry,target_entry,source_context_id,source_permissions,created_at_ms,expires_at_ms)
  ON projed_core.origin_switch_intents TO projed_runtime_disposable;
GRANT UPDATE(target_context_id,confirmed_at_ms) ON projed_core.origin_switch_intents TO projed_runtime_disposable;
