-- Opt-in ProJED device lifetime. Existing v1 rows retain their source horizon.
ALTER TABLE projed_core.app_login_intents ADD COLUMN remember_device boolean NOT NULL DEFAULT false;
ALTER TABLE projed_core.app_sessions ADD COLUMN session_version smallint NOT NULL DEFAULT 1 CHECK (session_version IN (1,2));
ALTER TABLE projed_core.app_sessions DROP CONSTRAINT app_sessions_check1;
ALTER TABLE projed_core.app_sessions ADD CONSTRAINT app_sessions_source_horizon_v1 CHECK (
  session_version=2 OR COALESCE(jsonb_typeof(identity->'sourceSessionExpiresAtMs')='number'
    AND expires_at_ms<=(identity->>'sourceSessionExpiresAtMs')::bigint,false));
GRANT INSERT(remember_device) ON projed_core.app_login_intents TO projed_runtime_disposable;
GRANT INSERT(session_version) ON projed_core.app_sessions TO projed_runtime_disposable;
GRANT UPDATE(expires_at_ms) ON projed_core.app_sessions TO projed_runtime_disposable;

-- v2 can only be enrolled by an explicitly opted-in processing login.
CREATE POLICY remembered_session_insert_v1 ON projed_core.app_sessions AS RESTRICTIVE
  FOR INSERT TO projed_runtime_disposable WITH CHECK (session_version=1 OR (
    expires_at_ms<=extract(epoch FROM clock_timestamp())*1000+7776000000+1000
    AND EXISTS(SELECT 1 FROM projed_core.app_login_intents intent
      WHERE intent.token_hash=current_setting('projed.login_token_hash',true)
        AND intent.status='processing' AND intent.remember_device
        AND intent.entry=app_sessions.entry AND intent.public_origin=app_sessions.public_origin
        AND intent.expires_at_ms>extract(epoch FROM clock_timestamp())*1000)));
CREATE POLICY remembered_session_renew_v1 ON projed_core.app_sessions
  FOR UPDATE TO projed_runtime_disposable
  USING (session_version=2 AND token_hash=current_setting('projed.session_token_hash',true)
    AND token_hash=current_setting('projed.renew_session',true) AND revoked_at_ms IS NULL
    AND context_id::text=current_setting('projed.actor_context_id',true)
    AND local_user_id=projed_core.current_actor_user_id_v1()
    AND entry=current_setting('projed.actor_entry',true)
    AND identity->>'principalId'=current_setting('projed.actor_principal_id',true)
    AND account_guard_revision=current_setting('projed.actor_guard_revision',true)::bigint
    AND projed_core.actor_context_valid_v1())
  WITH CHECK (session_version=2 AND token_hash=current_setting('projed.session_token_hash',true)
    AND token_hash=current_setting('projed.renew_session',true) AND revoked_at_ms IS NULL
    AND projed_core.actor_context_valid_v1());

CREATE OR REPLACE FUNCTION projed_core.app_session_revoke_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.revoked_at_ms IS NULL AND NEW.revoked_at_ms IS NOT NULL
    AND to_jsonb(OLD)-'revoked_at_ms'=to_jsonb(NEW)-'revoked_at_ms' THEN RETURN NEW; END IF;
  IF pg_trigger_depth()>1 AND OLD.revoked_at_ms IS NULL
    AND NEW.created_resource_permissions IS DISTINCT FROM OLD.created_resource_permissions
    AND to_jsonb(OLD)-'created_resource_permissions'=to_jsonb(NEW)-'created_resource_permissions'
    AND OLD.token_hash=current_setting('projed.session_token_hash',true)
    AND OLD.context_id::text=current_setting('projed.actor_context_id',true) THEN RETURN NEW; END IF;
  IF OLD.session_version=2 AND OLD.revoked_at_ms IS NULL
    AND OLD.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
    AND NEW.expires_at_ms>=OLD.expires_at_ms
    AND NEW.expires_at_ms<=extract(epoch FROM clock_timestamp())*1000+7776000000+1000
    AND to_jsonb(OLD)-'expires_at_ms'=to_jsonb(NEW)-'expires_at_ms'
    AND OLD.token_hash=current_setting('projed.renew_session',true)
    AND OLD.token_hash=current_setting('projed.session_token_hash',true)
    AND OLD.context_id::text=current_setting('projed.actor_context_id',true)
    AND OLD.account_guard_revision=current_setting('projed.actor_guard_revision',true)::bigint
    AND projed_core.actor_context_valid_v1() THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Session update is invalid' USING ERRCODE='23514';
END;
$$;

-- Workers keep their exact original Session and snapshot; only v2 owns its horizon.
CREATE OR REPLACE FUNCTION projed_core.meeting_run_cancel_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
BEGIN
  IF current_user='projed_runtime_disposable'
    AND current_setting('projed.meeting_asr_phase',true)='authorize' THEN
    IF NEW.id::text IS DISTINCT FROM current_setting('projed.meeting_asr_run_id',true)
      OR NEW.authorization_context_id::text IS DISTINCT FROM current_setting('projed.actor_context_id',true)
      OR NEW.authorization_context_id IS NULL
      OR (OLD.authorization_context_id IS NOT NULL AND NEW.authorization_context_id IS DISTINCT FROM OLD.authorization_context_id)
      OR (to_jsonb(NEW)-'authorization_context_id') IS DISTINCT FROM (to_jsonb(OLD)-'authorization_context_id')
      OR OLD.state NOT IN ('queued','awaiting_budget') OR OLD.deadline_at IS NULL OR OLD.deadline_at<=clock_timestamp()
      OR NOT projed_core.meeting_capture_mutable_v1(NEW.capture_id)
      OR NOT EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
        WHERE capture.id=NEW.capture_id AND capture.source_version=NEW.source_version
          AND capture.source_frozen_at IS NOT NULL AND capture.source_completeness='complete'
          AND capture.state IN ('queued','awaiting_budget')
          AND capture.audio_expires_at>clock_timestamp())
      OR NOT EXISTS (SELECT 1 FROM projed_core.app_sessions session
        WHERE session.context_id=NEW.authorization_context_id AND session.entry='main'
          AND session.local_user_id=projed_core.current_actor_user_id_v1()
          AND session.identity->>'principalId'=current_setting('projed.actor_principal_id',true)
          AND session.account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
          AND session.revoked_at_ms IS NULL
          AND session.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
          AND (session.session_version=2 OR (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000))
    THEN RAISE EXCEPTION 'MEETING_ASR_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF current_user='projed_runtime_disposable' AND (
    current_setting('projed.meeting_ledger_phase',true) IS DISTINCT FROM 'cancel'
    OR NEW.state<>'cancelled' OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
    OR NEW.error_code IS DISTINCT FROM CASE WHEN OLD.state IN ('running','failed_retryable')
      THEN 'CANCELLED_IN_FLIGHT' ELSE 'CANCELLED_BEFORE_DISPATCH' END
    OR OLD.state NOT IN ('queued','awaiting_budget','failed_retryable','running')
    OR NEW.authorization_context_id IS DISTINCT FROM OLD.authorization_context_id
  ) THEN RAISE EXCEPTION 'MEETING_RUN_CANCELLATION_INVALID' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION projed_core.meeting_asr_run_live_v1(target_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
  SELECT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
    JOIN projed_core.app_sessions session ON session.context_id=run.authorization_context_id
    WHERE run.id=target_run_id AND projed_core.meeting_asr_work_scope_v1(run.id,run.capture_id)
      AND run.resume_stage='transcribe' AND run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
      AND run.source_version=capture.source_version AND run.deadline_at>clock_timestamp()
      AND capture.state IN('queued','running') AND capture.source_completeness='complete'
      AND capture.source_frozen_at IS NOT NULL AND capture.audio_expires_at>clock_timestamp()
      AND session.context_id::text=current_setting('projed.actor_context_id',true)
      AND session.local_user_id=projed_core.current_actor_user_id_v1() AND session.entry='main'
      AND session.identity->>'principalId'=current_setting('projed.actor_principal_id',true)
      AND session.account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
      AND session.revoked_at_ms IS NULL AND session.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
      AND (session.session_version=2 OR (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000));
$$;

CREATE OR REPLACE FUNCTION projed_core.meeting_discussion_live_v1(target_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
    JOIN projed_core.app_sessions session ON session.context_id=run.authorization_context_id
    WHERE run.id=target_run_id AND projed_core.meeting_discussion_scope_v1(run.id,run.capture_id)
      AND run.resume_stage='retrieve' AND run.stage_cursor#>'{asr,done}'='true'::jsonb
      AND run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
      AND run.state IN('queued','running') AND run.transcript_revision_id IS NOT NULL
      AND run.source_version=capture.source_version AND run.deadline_at>clock_timestamp()
      AND capture.state IN('queued','running') AND capture.source_completeness='complete'
      AND capture.source_frozen_at IS NOT NULL AND capture.audio_expires_at>clock_timestamp()
      AND capture.active_transcript_revision_id IS DISTINCT FROM run.transcript_revision_id
      AND session.context_id::text=current_setting('projed.actor_context_id',true)
      AND session.local_user_id=projed_core.current_actor_user_id_v1() AND session.entry='main'
      AND session.identity->>'principalId'=current_setting('projed.actor_principal_id',true)
      AND session.account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
      AND session.revoked_at_ms IS NULL AND session.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
      AND (session.session_version=2 OR (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000));
$$;

CREATE OR REPLACE FUNCTION projed_core.meeting_llm_private_scope_v1(target_run uuid,target_capture uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.actor_entry',true)='main'
    AND projed_core.meeting_capture_mutable_v1(target_capture)
    AND EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.app_sessions session ON session.context_id=run.authorization_context_id
      WHERE run.id=target_run AND run.capture_id=target_capture
        AND session.context_id::text=current_setting('projed.actor_context_id',true)
        AND session.local_user_id=projed_core.current_actor_user_id_v1() AND session.entry='main'
        AND session.identity->>'principalId'=current_setting('projed.actor_principal_id',true)
        AND session.account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
        AND session.revoked_at_ms IS NULL AND session.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
        AND(session.session_version=2 OR (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000));
$$;

DROP POLICY meeting_asr_bound_session_read_v1 ON projed_core.app_sessions;
CREATE POLICY meeting_asr_bound_session_read_v1 ON projed_core.app_sessions
  FOR SELECT TO projed_runtime_disposable USING (
    entry='main' AND revoked_at_ms IS NULL
    AND expires_at_ms>extract(epoch FROM clock_timestamp())*1000
    AND (session_version=2 OR (identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_analysis_runs run
      WHERE run.id::text=current_setting('projed.meeting_asr_run_id',true)
        AND run.authorization_context_id=app_sessions.context_id
        AND run.state IN ('queued','running','awaiting_budget','failed_retryable')
        AND run.deadline_at>clock_timestamp())
  );
