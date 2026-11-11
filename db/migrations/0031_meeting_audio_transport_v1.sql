-- GCS writes are outside actor transactions. Their operation token and cleanup
-- proof live in the existing obligation so record/account deletion cannot erase
-- responsibility for an in-flight or unknown object write.
ALTER TABLE projed_core.meeting_capture_segments ADD COLUMN storage_generation text
  CHECK (storage_generation ~ '^[1-9][0-9]{0,18}$');
ALTER TABLE projed_core.meeting_artifact_cleanup
  ADD COLUMN upload_operation_token uuid,
  ADD COLUMN upload_outcome text CHECK (upload_outcome IN ('pending','uploaded','unknown','rejected')),
  ADD COLUMN storage_generation text CHECK (storage_generation ~ '^[1-9][0-9]{0,18}$'),
  ADD COLUMN upload_sha256 text CHECK (upload_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN upload_bytes bigint CHECK (upload_bytes BETWEEN 1 AND 10485760),
  ADD CONSTRAINT meeting_audio_operation_proof_v1 CHECK (
    (upload_operation_token IS NULL AND upload_outcome IS NULL AND storage_generation IS NULL
      AND upload_sha256 IS NULL AND upload_bytes IS NULL)
    OR (upload_operation_token IS NOT NULL AND storage_backend IS NOT DISTINCT FROM 'gcs'
      AND kind='storage' AND upload_outcome IS NOT NULL AND upload_sha256 IS NOT NULL AND upload_bytes IS NOT NULL
      AND (upload_outcome<>'uploaded' OR storage_generation IS NOT NULL)));
CREATE UNIQUE INDEX meeting_audio_operation_token_v1 ON projed_core.meeting_artifact_cleanup(upload_operation_token)
  WHERE upload_operation_token IS NOT NULL;

CREATE FUNCTION projed_core.meeting_audio_scope_v1(target_capture_id uuid,target_segment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_audio_segment_id',true)=target_segment_id::text
    AND current_setting('projed.meeting_audio_phase',true) IN ('reserve','claim','verify')
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
$$;
CREATE FUNCTION projed_core.meeting_audio_cleanup_scope_v1(target_capture_id uuid,target_attempt_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT EXISTS (SELECT 1 FROM projed_core.meeting_capture_segments segment
    WHERE segment.capture_id=target_capture_id
      AND projed_core.meeting_audio_scope_v1(segment.capture_id,segment.id)
      AND target_attempt_id='storage:'||segment.capture_id::text||':v'||segment.source_version::text||':segment:'||segment.segment_index::text);
$$;
CREATE POLICY meeting_audio_segment_insert_v1 ON projed_core.meeting_capture_segments
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_audio_scope_v1(capture_id,id)
    AND current_setting('projed.meeting_audio_phase',true)='reserve'
    AND storage_backend='gcs' AND storage_generation IS NULL AND sha256 IS NULL AND upload_state='pending'
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture WHERE capture.id=meeting_capture_segments.capture_id
      AND capture.source_version=meeting_capture_segments.source_version
      AND capture.state IN ('recording','paused','stopped','uploading')));
CREATE POLICY meeting_audio_segment_update_v1 ON projed_core.meeting_capture_segments
  FOR UPDATE TO projed_runtime_disposable USING (projed_core.meeting_audio_scope_v1(capture_id,id)
    AND storage_backend='gcs' AND upload_state<>'verified')
  WITH CHECK (projed_core.meeting_audio_scope_v1(capture_id,id) AND storage_backend='gcs'
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture WHERE capture.id=meeting_capture_segments.capture_id
      AND capture.source_version=meeting_capture_segments.source_version
      AND capture.state IN ('recording','paused','stopped','uploading')
      AND (capture.audio_expires_at IS NULL OR capture.audio_expires_at>now()))
    AND ((current_setting('projed.meeting_audio_phase',true)='claim' AND upload_state='uploading'
      AND sha256 ~ '^[a-f0-9]{64}$' AND bytes BETWEEN 1 AND 10485760 AND storage_generation IS NULL
      AND upload_token_expires_at>now())
    OR (current_setting('projed.meeting_audio_phase',true)='verify' AND upload_state='verified'
      AND EXISTS (SELECT 1 FROM projed_core.meeting_artifact_cleanup obligation
        WHERE obligation.capture_id=meeting_capture_segments.capture_id
          AND obligation.attempt_id='storage:'||meeting_capture_segments.capture_id::text||':v'||meeting_capture_segments.source_version::text||':segment:'||meeting_capture_segments.segment_index::text
          AND obligation.kind='storage' AND obligation.storage_backend='gcs' AND obligation.upload_outcome='uploaded'
          AND obligation.storage_generation=meeting_capture_segments.storage_generation
          AND obligation.upload_sha256=meeting_capture_segments.sha256 AND obligation.upload_bytes=meeting_capture_segments.bytes))));
GRANT INSERT (id,capture_id,segment_index,epoch,start_offset_ms,end_offset_ms,overlap_ms,gap_before_ms,
  object_path,mime,bytes,source_version,reservation_key,upload_token_expires_at,storage_backend)
  ON projed_core.meeting_capture_segments TO projed_runtime_disposable;
GRANT UPDATE (bytes,sha256,upload_state,upload_token_expires_at,last_error,verified_at,storage_generation,updated_at)
  ON projed_core.meeting_capture_segments TO projed_runtime_disposable;

CREATE POLICY meeting_audio_cleanup_read_v1 ON projed_core.meeting_artifact_cleanup FOR SELECT TO projed_runtime_disposable
  USING (kind='storage' AND storage_backend='gcs' AND projed_core.meeting_audio_cleanup_scope_v1(capture_id,attempt_id));
CREATE POLICY meeting_audio_cleanup_insert_v1 ON projed_core.meeting_artifact_cleanup FOR INSERT TO projed_runtime_disposable
  WITH CHECK (kind='storage' AND state='pending' AND storage_backend='gcs' AND run_id IS NULL
    AND upload_operation_token IS NULL AND upload_outcome IS NULL AND storage_generation IS NULL
    AND projed_core.meeting_audio_cleanup_scope_v1(capture_id,attempt_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_segments segment
      WHERE segment.capture_id=meeting_artifact_cleanup.capture_id
        AND segment.id::text=current_setting('projed.meeting_audio_segment_id',true)
        AND segment.storage_backend='gcs' AND segment.object_path=meeting_artifact_cleanup.object_locator
        AND segment.upload_token_expires_at=meeting_artifact_cleanup.upload_token_expires_at)
    AND due_at>=greatest(coalesce((SELECT capture.audio_expires_at FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=meeting_artifact_cleanup.capture_id),now()+interval '7 days'),coalesce(upload_token_expires_at,now())));
CREATE POLICY meeting_audio_cleanup_claim_v1 ON projed_core.meeting_artifact_cleanup FOR UPDATE TO projed_runtime_disposable
  USING (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND current_setting('projed.meeting_audio_phase',true)='claim'
    AND (upload_outcome IS NULL OR upload_outcome='rejected')
    AND projed_core.meeting_audio_cleanup_scope_v1(capture_id,attempt_id))
  WITH CHECK (kind='storage' AND storage_backend='gcs' AND state='pending' AND upload_outcome='pending'
    AND upload_operation_token IS NOT NULL AND upload_sha256 IS NOT NULL AND upload_bytes IS NOT NULL
    AND current_setting('projed.meeting_audio_phase',true)='claim'
    AND projed_core.meeting_audio_cleanup_scope_v1(capture_id,attempt_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_segments segment
      WHERE segment.id::text=current_setting('projed.meeting_audio_segment_id',true)
        AND segment.capture_id=meeting_artifact_cleanup.capture_id
        AND segment.sha256=meeting_artifact_cleanup.upload_sha256 AND segment.bytes=meeting_artifact_cleanup.upload_bytes
        AND segment.upload_token_expires_at=meeting_artifact_cleanup.upload_token_expires_at)
    AND due_at>=greatest(coalesce((SELECT capture.audio_expires_at FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=meeting_artifact_cleanup.capture_id),now()+interval '7 days'),coalesce(upload_token_expires_at,now())));

-- A server-held random operation token can settle only its own cleanup proof,
-- even if the authorizing account/record no longer exists. It never grants
-- business segment writes or access to another obligation/global budget.
CREATE FUNCTION projed_core.meeting_audio_settlement_scope_v1(target_token uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_upload_phase',true)='settle'
    AND current_setting('projed.meeting_upload_token',true)=target_token::text;
$$;
CREATE POLICY meeting_audio_settlement_read_v1 ON projed_core.meeting_artifact_cleanup FOR SELECT TO projed_runtime_disposable
  USING (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND projed_core.meeting_audio_settlement_scope_v1(upload_operation_token));
CREATE POLICY meeting_audio_settlement_update_v1 ON projed_core.meeting_artifact_cleanup FOR UPDATE TO projed_runtime_disposable
  USING (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND projed_core.meeting_audio_settlement_scope_v1(upload_operation_token))
  WITH CHECK (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND projed_core.meeting_audio_settlement_scope_v1(upload_operation_token)
    AND upload_outcome IN ('uploaded','unknown','rejected')
    AND (upload_outcome<>'uploaded' OR storage_generation IS NOT NULL));
GRANT SELECT (state,object_locator,storage_backend,upload_operation_token,upload_outcome,
  storage_generation,upload_sha256,upload_bytes) ON projed_core.meeting_artifact_cleanup TO projed_runtime_disposable;
GRANT UPDATE (upload_operation_token,upload_outcome,storage_generation,upload_sha256,upload_bytes,
  upload_token_expires_at,due_at,updated_at)
  ON projed_core.meeting_artifact_cleanup TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_audio_proof_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW; END IF;
  IF current_setting('projed.meeting_audio_phase',true)='anchor' THEN
    IF NEW.upload_operation_token IS DISTINCT FROM OLD.upload_operation_token
      OR NEW.upload_outcome IS DISTINCT FROM OLD.upload_outcome
      OR NEW.storage_generation IS DISTINCT FROM OLD.storage_generation
      OR NEW.upload_token_expires_at IS DISTINCT FROM OLD.upload_token_expires_at
      OR NEW.upload_sha256 IS DISTINCT FROM OLD.upload_sha256 OR NEW.upload_bytes IS DISTINCT FROM OLD.upload_bytes THEN
      RAISE EXCEPTION 'AUDIO_RETENTION_PROOF_CHANGED' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.upload_token_expires_at IS DISTINCT FROM OLD.upload_token_expires_at)
    AND current_setting('projed.meeting_audio_phase',true) IS DISTINCT FROM 'claim' THEN
    RAISE EXCEPTION 'AUDIO_RETENTION_SCOPE_MISSING' USING ERRCODE='42501';
  END IF;
  IF current_setting('projed.meeting_audio_phase',true)='claim' THEN
    IF OLD.upload_outcome IS NOT NULL AND OLD.upload_outcome<>'rejected' THEN
      RAISE EXCEPTION 'AUDIO_WRITE_ALREADY_CLAIMED' USING ERRCODE='42501';
    END IF;
    IF NEW.upload_outcome<>'pending' OR NEW.upload_operation_token IS NULL OR NEW.storage_generation IS NOT NULL
      OR (OLD.upload_sha256 IS NOT NULL AND OLD.upload_sha256 IS DISTINCT FROM NEW.upload_sha256)
      OR (OLD.upload_bytes IS NOT NULL AND OLD.upload_bytes IS DISTINCT FROM NEW.upload_bytes) THEN
      RAISE EXCEPTION 'AUDIO_WRITE_CLAIM_INVALID' USING ERRCODE='42501';
    END IF;
  ELSIF projed_core.meeting_audio_settlement_scope_v1(OLD.upload_operation_token) THEN
    IF NEW.upload_operation_token IS DISTINCT FROM OLD.upload_operation_token
      OR NEW.upload_sha256 IS DISTINCT FROM OLD.upload_sha256 OR NEW.upload_bytes IS DISTINCT FROM OLD.upload_bytes
      OR (OLD.upload_outcome='uploaded' AND (NEW.upload_outcome<>'uploaded' OR NEW.storage_generation IS DISTINCT FROM OLD.storage_generation))
      OR (NEW.upload_outcome='uploaded' AND NEW.storage_generation IS NULL)
      OR NEW.upload_outcome NOT IN ('uploaded','unknown','rejected') THEN
      RAISE EXCEPTION 'AUDIO_WRITE_SETTLEMENT_INVALID' USING ERRCODE='42501';
    END IF;
  ELSE RAISE EXCEPTION 'AUDIO_WRITE_SCOPE_MISSING' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_audio_proof_guard_v1 BEFORE UPDATE OF upload_operation_token,upload_outcome,
  storage_generation,upload_sha256,upload_bytes,upload_token_expires_at,due_at ON projed_core.meeting_artifact_cleanup
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_audio_proof_guard_v1();

CREATE POLICY meeting_audio_retention_update_v1 ON projed_core.meeting_artifact_cleanup FOR UPDATE TO projed_runtime_disposable
  USING (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND current_setting('projed.meeting_audio_phase',true)='anchor'
    AND projed_core.meeting_capture_mutable_v1(capture_id))
  WITH CHECK (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND current_setting('projed.meeting_audio_phase',true)='anchor'
    AND projed_core.meeting_capture_mutable_v1(capture_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=meeting_artifact_cleanup.capture_id AND capture.audio_expires_at IS NOT NULL
        AND due_at>=greatest(capture.audio_expires_at,coalesce(upload_token_expires_at,now()))));
CREATE POLICY meeting_audio_retention_read_v1 ON projed_core.meeting_artifact_cleanup FOR SELECT TO projed_runtime_disposable
  USING (kind='storage' AND storage_backend='gcs' AND state='pending'
    AND current_setting('projed.meeting_audio_phase',true)='anchor'
    AND projed_core.meeting_capture_mutable_v1(capture_id));
CREATE FUNCTION projed_core.meeting_audio_anchor_retention_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE previous_phase text;
BEGIN
  IF NEW.audio_expires_at IS NULL THEN RETURN NEW; END IF;
  previous_phase:=current_setting('projed.meeting_audio_phase',true);
  PERFORM set_config('projed.meeting_audio_phase','anchor',true);
  UPDATE projed_core.meeting_artifact_cleanup SET
    due_at=greatest(due_at,NEW.audio_expires_at,coalesce(upload_token_expires_at,now())),updated_at=now()
    WHERE capture_id=NEW.id AND kind='storage' AND storage_backend='gcs' AND state='pending';
  PERFORM set_config('projed.meeting_audio_phase',coalesce(previous_phase,''),true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_audio_anchor_retention_v1 AFTER UPDATE OF stopped_at,audio_expires_at
  ON projed_core.meeting_capture_sessions FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_audio_anchor_retention_v1();
REVOKE ALL ON FUNCTION projed_core.meeting_audio_scope_v1(uuid,uuid),
  projed_core.meeting_audio_cleanup_scope_v1(uuid,text),projed_core.meeting_audio_settlement_scope_v1(uuid),
  projed_core.meeting_audio_proof_guard_v1(),projed_core.meeting_audio_anchor_retention_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_audio_scope_v1(uuid,uuid),
  projed_core.meeting_audio_cleanup_scope_v1(uuid,text),projed_core.meeting_audio_settlement_scope_v1(uuid),
  projed_core.meeting_audio_proof_guard_v1(),projed_core.meeting_audio_anchor_retention_v1() TO projed_runtime_disposable;
