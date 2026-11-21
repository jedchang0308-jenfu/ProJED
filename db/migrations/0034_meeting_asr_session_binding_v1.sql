-- Persist the authorizing Session reference, not its browser bearer or a second
-- identity snapshot. This migration alone does not grant ASR dispatch/content writes.
ALTER TABLE projed_core.meeting_analysis_runs
  ADD COLUMN authorization_context_id uuid NULL;
-- Retain this immutable identifier when Session metadata is eventually deleted:
-- a missing Session stops work and must never reopen authorization for rebinding.

-- The current HTTP actor may bind only its own main Session. Cleared GUCs are
-- compared as text, never cast to uuid. Worker metadata reads are exact-run only.
CREATE POLICY meeting_asr_current_session_read_v1 ON projed_core.app_sessions
  FOR SELECT TO projed_runtime_disposable USING (
    entry='main' AND context_id::text=current_setting('projed.actor_context_id',true)
    AND local_user_id=projed_core.current_actor_user_id_v1()
    AND identity->>'principalId'=current_setting('projed.actor_principal_id',true)
    AND account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
    AND projed_core.actor_context_valid_v1()
    AND revoked_at_ms IS NULL
    AND expires_at_ms>extract(epoch FROM clock_timestamp())*1000
  );
CREATE POLICY meeting_asr_run_metadata_read_v1 ON projed_core.meeting_analysis_runs
  FOR SELECT TO projed_runtime_disposable USING (
    id::text=current_setting('projed.meeting_asr_run_id',true)
    AND authorization_context_id IS NOT NULL
    AND state IN ('queued','running','awaiting_budget','failed_retryable')
    AND deadline_at>clock_timestamp()
  );
CREATE POLICY meeting_asr_bound_session_read_v1 ON projed_core.app_sessions
  FOR SELECT TO projed_runtime_disposable USING (
    entry='main' AND revoked_at_ms IS NULL
    AND expires_at_ms>extract(epoch FROM clock_timestamp())*1000
    AND (identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000
    AND EXISTS (SELECT 1 FROM projed_core.meeting_analysis_runs run
      WHERE run.id::text=current_setting('projed.meeting_asr_run_id',true)
        AND run.authorization_context_id=app_sessions.context_id
        AND run.state IN ('queued','running','awaiting_budget','failed_retryable')
        AND run.deadline_at>clock_timestamp())
  );
CREATE POLICY meeting_asr_authorization_bind_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable
  USING (current_setting('projed.meeting_asr_phase',true)='authorize'
    AND id::text=current_setting('projed.meeting_asr_run_id',true)
    AND projed_core.meeting_capture_mutable_v1(capture_id))
  WITH CHECK (current_setting('projed.meeting_asr_phase',true)='authorize'
    AND id::text=current_setting('projed.meeting_asr_run_id',true)
    AND authorization_context_id::text=current_setting('projed.actor_context_id',true)
    AND projed_core.meeting_capture_mutable_v1(capture_id));
GRANT UPDATE (authorization_context_id) ON projed_core.meeting_analysis_runs TO projed_runtime_disposable;

-- Preserve the existing cancellation guard and add exactly one mutation:
-- NULL -> current Session context (or replay of the same context).
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
          AND (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000)
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

CREATE FUNCTION projed_core.bind_meeting_asr_session_v1(target_run_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
DECLARE result uuid; prior_phase text; prior_run text;
BEGIN
  IF target_run_id IS NULL OR NOT projed_core.actor_context_valid_v1()
    OR current_setting('projed.actor_entry',true) IS DISTINCT FROM 'main'
  THEN RAISE EXCEPTION 'MEETING_ASR_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
  prior_phase:=current_setting('projed.meeting_asr_phase',true);
  prior_run:=current_setting('projed.meeting_asr_run_id',true);
  PERFORM set_config('projed.meeting_asr_phase','authorize',true),
    set_config('projed.meeting_asr_run_id',target_run_id::text,true);
  UPDATE projed_core.meeting_analysis_runs
    SET authorization_context_id=current_setting('projed.actor_context_id',true)::uuid
    WHERE id=target_run_id RETURNING authorization_context_id INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_ASR_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
  PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true),
    set_config('projed.meeting_asr_run_id',coalesce(prior_run,''),true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.bind_meeting_asr_session_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.bind_meeting_asr_session_v1(uuid) TO projed_runtime_disposable;
