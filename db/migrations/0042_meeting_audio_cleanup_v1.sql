-- Reuse the existing storage obligations; no content, actor or fee authority.
CREATE FUNCTION projed_core.meeting_audio_cleanup_due_v1(target_capture uuid,not_before timestamptz,upload_expiry timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT not_before<=clock_timestamp() AND coalesce(upload_expiry,'-infinity'::timestamptz)<=clock_timestamp()
    AND(target_capture IS NULL OR EXISTS(SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=target_capture AND capture.state NOT IN('created','recording','paused')
        AND coalesce(capture.audio_expires_at,capture.updated_at+interval '7 days')<=clock_timestamp()));
$$;

-- Capture rows contain lifecycle metadata, never transcript or record bodies.
-- Only the RPC's short-lived purpose can read them without a business actor.
CREATE POLICY meeting_audio_cleanup_capture_read_v1 ON projed_core.meeting_capture_sessions
  FOR SELECT TO projed_runtime_disposable USING(coalesce(current_setting('projed.actor_local_user_id',true),'')=''
    AND(current_setting('projed.audio_cleanup_phase',true)='scan'
      OR(current_setting('projed.audio_cleanup_phase',true)='claim'
        AND id::text=current_setting('projed.audio_cleanup_capture',true))));
CREATE POLICY meeting_audio_cleanup_maintenance_read_v1 ON projed_core.meeting_artifact_cleanup
  FOR SELECT TO projed_runtime_disposable USING(kind='storage' AND storage_backend='gcs'
    AND((coalesce(current_setting('projed.actor_local_user_id',true),'')=''
      AND(current_setting('projed.audio_cleanup_phase',true)='scan'
        OR(obligation_id::text=current_setting('projed.audio_cleanup_id',true)
          AND current_setting('projed.audio_cleanup_phase',true) IN('claim','finish'))))
      OR(capture_id::text=current_setting('projed.audio_cleanup_capture',true)
        AND current_setting('projed.audio_cleanup_phase',true)='anchor' AND pg_trigger_depth()>0)));
CREATE POLICY meeting_audio_cleanup_maintenance_update_v1 ON projed_core.meeting_artifact_cleanup
  FOR UPDATE TO projed_runtime_disposable
  USING(kind='storage' AND storage_backend='gcs'
    AND((coalesce(current_setting('projed.actor_local_user_id',true),'')=''
      AND obligation_id::text=current_setting('projed.audio_cleanup_id',true)
      AND current_setting('projed.audio_cleanup_phase',true) IN('claim','finish'))
      OR(capture_id::text=current_setting('projed.audio_cleanup_capture',true)
        AND current_setting('projed.audio_cleanup_phase',true)='anchor' AND pg_trigger_depth()>0)))
  WITH CHECK(kind='storage' AND storage_backend='gcs');
GRANT SELECT(lease_token,lease_expires_at,attempts,error_code,last_verified_at,updated_at)
  ON projed_core.meeting_artifact_cleanup TO projed_runtime_disposable;
GRANT UPDATE(state,lease_token,lease_expires_at,attempts,error_code,last_verified_at)
  ON projed_core.meeting_artifact_cleanup TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_audio_cleanup_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE phase text:=current_setting('projed.audio_cleanup_phase',true);expected jsonb;
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW;END IF;
  IF coalesce(phase,'') NOT IN('anchor','claim','finish') THEN
    IF(to_jsonb(NEW)-ARRAY['capture_id','run_id','due_at','updated_at','upload_operation_token','upload_outcome',
        'storage_generation','upload_sha256','upload_bytes','upload_token_expires_at'])
      IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['capture_id','run_id','due_at','updated_at','upload_operation_token','upload_outcome',
        'storage_generation','upload_sha256','upload_bytes','upload_token_expires_at'])
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_SCOPE_INVALID' USING ERRCODE='42501';END IF;
    RETURN NEW;
  END IF;
  IF OLD.kind<>'storage' OR OLD.storage_backend IS DISTINCT FROM 'gcs' OR NEW.due_at<OLD.due_at
  THEN RAISE EXCEPTION 'AUDIO_CLEANUP_SCOPE_INVALID' USING ERRCODE='42501';END IF;
  IF phase='anchor' THEN
    IF pg_trigger_depth()<2 OR OLD.capture_id::text IS DISTINCT FROM current_setting('projed.audio_cleanup_capture',true)
      OR(to_jsonb(NEW)-ARRAY['due_at','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['due_at','updated_at'])
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_ANCHOR_INVALID' USING ERRCODE='42501';END IF;
    RETURN NEW;
  END IF;
  expected:=nullif(current_setting('projed.audio_cleanup_expected',true),'')::jsonb;
  IF expected IS NULL OR OLD.obligation_id::text IS DISTINCT FROM current_setting('projed.audio_cleanup_id',true)
    OR coalesce(current_setting('projed.actor_local_user_id',true),'')<>''
  THEN RAISE EXCEPTION 'AUDIO_CLEANUP_WRITE_INVALID' USING ERRCODE='42501';END IF;
  IF phase='claim' THEN
    IF jsonb_build_object('state',NEW.state,'lease_token',NEW.lease_token,'lease_expires_at',NEW.lease_expires_at,
        'attempts',NEW.attempts,'error_code',NEW.error_code) IS DISTINCT FROM expected
      OR OLD.state='deleted' OR(OLD.lease_expires_at IS NOT NULL AND OLD.lease_expires_at>clock_timestamp())
      OR NOT projed_core.meeting_audio_cleanup_due_v1(OLD.capture_id,OLD.due_at,OLD.upload_token_expires_at)
      OR NEW.state<>'deleting' OR NEW.lease_token::text IS DISTINCT FROM current_setting('projed.audio_cleanup_token',true)
      OR NEW.attempts<>OLD.attempts+1 OR NEW.lease_expires_at<=clock_timestamp()
      OR(to_jsonb(NEW)-ARRAY['state','lease_token','lease_expires_at','attempts','error_code','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','lease_token','lease_expires_at','attempts','error_code','updated_at'])
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_CLAIM_INVALID' USING ERRCODE='42501';END IF;
  ELSE
    IF jsonb_build_object('state',NEW.state,'lease_token',NEW.lease_token,'lease_expires_at',NEW.lease_expires_at,
        'storage_generation',NEW.storage_generation,'due_at',NEW.due_at,'last_verified_at',NEW.last_verified_at,'error_code',NEW.error_code)
        IS DISTINCT FROM expected
      OR OLD.state<>'deleting' OR OLD.lease_token::text IS DISTINCT FROM current_setting('projed.audio_cleanup_token',true)
      OR OLD.lease_expires_at<=clock_timestamp() OR NEW.state NOT IN('deleted','unknown','failed')
      OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR(OLD.storage_generation IS NOT NULL AND NEW.storage_generation IS DISTINCT FROM OLD.storage_generation)
      OR(OLD.storage_generation IS NULL AND NEW.storage_generation IS NOT NULL
        AND(NEW.state<>'deleted' OR OLD.upload_sha256 IS NULL OR OLD.upload_bytes IS NULL))
      OR(to_jsonb(NEW)-ARRAY['state','lease_token','lease_expires_at','storage_generation','due_at','error_code','last_verified_at','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','lease_token','lease_expires_at','storage_generation','due_at','error_code','last_verified_at','updated_at'])
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_FINISH_INVALID' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_audio_cleanup_guard_v1 BEFORE UPDATE ON projed_core.meeting_artifact_cleanup
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_audio_cleanup_guard_v1();
-- The new guard owns these exact phases. All original upload proof paths retain
-- their original guard; no phase can alter its immutable upload proof.
DROP TRIGGER meeting_audio_proof_guard_v1 ON projed_core.meeting_artifact_cleanup;
CREATE TRIGGER meeting_audio_proof_guard_v1 BEFORE UPDATE OF upload_operation_token,upload_outcome,
  storage_generation,upload_sha256,upload_bytes,upload_token_expires_at,due_at ON projed_core.meeting_artifact_cleanup
  FOR EACH ROW WHEN(current_setting('projed.audio_cleanup_phase',true) IS DISTINCT FROM 'anchor'
    AND current_setting('projed.audio_cleanup_phase',true) IS DISTINCT FROM 'finish')
  EXECUTE FUNCTION projed_core.meeting_audio_proof_guard_v1();

CREATE FUNCTION projed_core.meeting_audio_cleanup_detach_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE prior_phase text;prior_capture text;anchor timestamptz;
BEGIN
  -- Preserve the stop/cancel minimum even after FK SET NULL removes the parent.
  anchor:=CASE WHEN OLD.state IN('created','recording','paused') THEN clock_timestamp()+interval '7 days'
    ELSE coalesce(OLD.audio_expires_at,OLD.updated_at+interval '7 days') END;
  prior_phase:=current_setting('projed.audio_cleanup_phase',true);prior_capture:=current_setting('projed.audio_cleanup_capture',true);
  PERFORM set_config('projed.audio_cleanup_phase','anchor',true),set_config('projed.audio_cleanup_capture',OLD.id::text,true);
  UPDATE projed_core.meeting_artifact_cleanup SET due_at=greatest(due_at,anchor,coalesce(upload_token_expires_at,anchor)),updated_at=now()
    WHERE capture_id=OLD.id AND kind='storage' AND storage_backend='gcs' AND state<>'deleted';
  PERFORM set_config('projed.audio_cleanup_phase',coalesce(prior_phase,''),true),
    set_config('projed.audio_cleanup_capture',coalesce(prior_capture,''),true);
  RETURN OLD;
END;
$$;
CREATE TRIGGER meeting_audio_cleanup_detach_v1 BEFORE DELETE ON projed_core.meeting_capture_sessions
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_audio_cleanup_detach_v1();
-- Older detached GCS obligations have lost their lifecycle clock. Conservatively
-- retain them for seven more days; never infer a historical NULL backend.
UPDATE projed_core.meeting_artifact_cleanup SET due_at=greatest(due_at,clock_timestamp()+interval '7 days'),updated_at=now()
  WHERE kind='storage' AND storage_backend='gcs' AND capture_id IS NULL AND state<>'deleted';

CREATE FUNCTION projed_core.scan_meeting_audio_cleanup_v1(max_items integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE result jsonb;prior text;
BEGIN
  IF max_items IS NULL OR max_items NOT BETWEEN 1 AND 20 OR coalesce(current_setting('projed.actor_local_user_id',true),'')<>''
  THEN RAISE EXCEPTION 'AUDIO_CLEANUP_SCAN_INVALID' USING ERRCODE='42501';END IF;
  prior:=current_setting('projed.audio_cleanup_phase',true);
  PERFORM set_config('projed.audio_cleanup_phase','scan',true);
  SELECT coalesce(jsonb_agg(candidate.obligation_id ORDER BY candidate.updated_at,candidate.obligation_id),'[]'::jsonb) INTO result
    FROM(SELECT obligation_id,updated_at FROM projed_core.meeting_artifact_cleanup
      WHERE kind='storage' AND storage_backend='gcs' AND state<>'deleted'
        AND(lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
        AND projed_core.meeting_audio_cleanup_due_v1(capture_id,due_at,upload_token_expires_at)
      ORDER BY updated_at,obligation_id LIMIT max_items) candidate;
  PERFORM set_config('projed.audio_cleanup_phase',coalesce(prior,''),true);
  RETURN result;
END;
$$;

CREATE FUNCTION projed_core.claim_meeting_audio_cleanup_v1(target_id uuid,token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE item record;prior jsonb;key_name text;expected jsonb;lease_until timestamptz;result jsonb;
  keys text[]:=ARRAY['projed.audio_cleanup_phase','projed.audio_cleanup_id','projed.audio_cleanup_token','projed.audio_cleanup_expected','projed.audio_cleanup_capture'];
BEGIN
  IF target_id IS NULL OR token IS NULL OR coalesce(current_setting('projed.actor_local_user_id',true),'')<>''
  THEN RAISE EXCEPTION 'AUDIO_CLEANUP_CLAIM_INVALID' USING ERRCODE='42501';END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.audio_cleanup_phase','claim',true),set_config('projed.audio_cleanup_id',target_id::text,true),
    set_config('projed.audio_cleanup_token',token::text,true);
  SELECT obligation_id,capture_id,attempt_id,kind,object_locator,state,lease_token,lease_expires_at,
    upload_token_expires_at,due_at,attempts,error_code,storage_backend,upload_operation_token,upload_outcome,
    storage_generation,upload_sha256,upload_bytes,last_verified_at INTO item
    FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=target_id FOR UPDATE;
  IF FOUND THEN
    PERFORM set_config('projed.audio_cleanup_capture',coalesce(item.capture_id::text,''),true);
  IF item.state<>'deleted' AND(item.lease_expires_at IS NULL OR item.lease_expires_at<=clock_timestamp()
      OR(item.state='deleting' AND item.lease_token=token))
    AND projed_core.meeting_audio_cleanup_due_v1(item.capture_id,item.due_at,item.upload_token_expires_at)
    AND item.object_locator ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/){4}v[1-9][0-9]*/(0|[1-9][0-9]*)\.(webm|ogg|m4a|mp3|wav)$'
    AND item.attempt_id=('storage:'||split_part(item.object_locator,'/',4)||':'||split_part(item.object_locator,'/',5)
      ||':segment:'||split_part(split_part(item.object_locator,'/',6),'.',1))
  THEN
    IF item.state<>'deleting' OR item.lease_token IS DISTINCT FROM token OR item.lease_expires_at<=clock_timestamp() THEN
      lease_until:=clock_timestamp()+interval '150 seconds';
      expected:=jsonb_build_object('state','deleting','lease_token',token,
        'lease_expires_at',lease_until,'attempts',item.attempts+1,'error_code',NULL);
      PERFORM set_config('projed.audio_cleanup_expected',expected::text,true);
      UPDATE projed_core.meeting_artifact_cleanup SET state='deleting',lease_token=token,lease_expires_at=lease_until,
        attempts=attempts+1,error_code=NULL,updated_at=now() WHERE obligation_id=target_id
        RETURNING obligation_id,capture_id,attempt_id,kind,object_locator,state,lease_token,lease_expires_at,
          upload_token_expires_at,due_at,attempts,error_code,storage_backend,upload_operation_token,upload_outcome,
          storage_generation,upload_sha256,upload_bytes,last_verified_at INTO item;
    END IF;
    result:=jsonb_build_object('obligationId',item.obligation_id,'leaseToken',item.lease_token,
      'leaseExpiresAtMs',floor(extract(epoch FROM item.lease_expires_at)*1000)::bigint,'key',item.object_locator,
      'generation',item.storage_generation,'uploadOperationToken',item.upload_operation_token,
      'sha256',item.upload_sha256,'bytes',item.upload_bytes,'uploadOutcome',item.upload_outcome);
  END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION projed_core.finish_meeting_audio_cleanup_v1(target_id uuid,token uuid,payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE item record;prior jsonb;key_name text;expected jsonb;outcome text;generation_value text;
  next_state text;next_due timestamptz;verified_at timestamptz;stored_generation text;result boolean:=false;
  keys text[]:=ARRAY['projed.audio_cleanup_phase','projed.audio_cleanup_id','projed.audio_cleanup_token','projed.audio_cleanup_expected'];
BEGIN
  IF target_id IS NULL OR token IS NULL OR payload IS NULL OR jsonb_typeof(payload)<>'object'
    OR payload-ARRAY['kind','generation']<>'{}'::jsonb OR coalesce(payload->>'kind','') NOT IN('deleted','unknown','conflict')
    OR coalesce(current_setting('projed.actor_local_user_id',true),'')<>''
  THEN RAISE EXCEPTION 'AUDIO_CLEANUP_FINISH_INVALID' USING ERRCODE='42501';END IF;
  outcome:=payload->>'kind';generation_value:=payload->>'generation';
  IF generation_value IS NOT NULL THEN
    IF generation_value !~ '^[1-9][0-9]{0,18}$'
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_FINISH_INVALID' USING ERRCODE='42501';END IF;
    IF generation_value::numeric>9223372036854775807
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_FINISH_INVALID' USING ERRCODE='42501';END IF;
  END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.audio_cleanup_phase','finish',true),set_config('projed.audio_cleanup_id',target_id::text,true),
    set_config('projed.audio_cleanup_token',token::text,true);
  SELECT obligation_id,capture_id,attempt_id,kind,object_locator,state,lease_token,lease_expires_at,
    upload_token_expires_at,due_at,attempts,error_code,storage_backend,upload_operation_token,upload_outcome,
    storage_generation,upload_sha256,upload_bytes,last_verified_at INTO item
    FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=target_id FOR UPDATE;
  IF FOUND AND item.state='deleting' AND item.lease_token=token AND item.lease_expires_at>clock_timestamp() THEN
    IF(item.storage_generation IS NOT NULL AND generation_value IS DISTINCT FROM item.storage_generation)
      OR(generation_value IS NOT NULL AND item.storage_generation IS NULL AND(item.upload_sha256 IS NULL OR item.upload_bytes IS NULL))
      OR(outcome='deleted' AND generation_value IS NULL AND item.upload_operation_token IS NOT NULL)
    THEN RAISE EXCEPTION 'AUDIO_CLEANUP_PROOF_INVALID' USING ERRCODE='42501';END IF;
    next_state:=CASE outcome WHEN 'deleted' THEN 'deleted' WHEN 'conflict' THEN 'failed' ELSE 'unknown' END;
    -- An observation from a failed/unknown read is not upload proof. Never turn
    -- it into a trusted generation that a later worker could delete unchecked.
    stored_generation:=CASE WHEN outcome='deleted' THEN coalesce(item.storage_generation,generation_value) ELSE item.storage_generation END;
    next_due:=CASE WHEN outcome='deleted' THEN item.due_at ELSE greatest(item.due_at,clock_timestamp()+interval '15 minutes') END;
    verified_at:=CASE WHEN outcome='deleted' THEN clock_timestamp() ELSE item.last_verified_at END;
    expected:=jsonb_build_object('state',next_state,'lease_token',NULL,'lease_expires_at',NULL,
      'storage_generation',stored_generation,'due_at',next_due,'last_verified_at',verified_at,
      'error_code',CASE outcome WHEN 'deleted' THEN NULL WHEN 'conflict' THEN 'AUDIO_CLEANUP_PROOF_CONFLICT' ELSE 'AUDIO_CLEANUP_UNKNOWN' END);
    PERFORM set_config('projed.audio_cleanup_expected',expected::text,true);
    UPDATE projed_core.meeting_artifact_cleanup SET state=next_state,lease_token=NULL,lease_expires_at=NULL,
      storage_generation=stored_generation,due_at=next_due,last_verified_at=verified_at,
      error_code=CASE outcome WHEN 'deleted' THEN NULL WHEN 'conflict' THEN 'AUDIO_CLEANUP_PROOF_CONFLICT' ELSE 'AUDIO_CLEANUP_UNKNOWN' END,
      updated_at=now() WHERE obligation_id=target_id;
    result:=true;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_audio_cleanup_due_v1(uuid,timestamptz,timestamptz),
  projed_core.meeting_audio_cleanup_guard_v1(),projed_core.meeting_audio_cleanup_detach_v1(),
  projed_core.scan_meeting_audio_cleanup_v1(integer),projed_core.claim_meeting_audio_cleanup_v1(uuid,uuid),
  projed_core.finish_meeting_audio_cleanup_v1(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_audio_cleanup_due_v1(uuid,timestamptz,timestamptz),
  projed_core.meeting_audio_cleanup_guard_v1(),projed_core.meeting_audio_cleanup_detach_v1(),
  projed_core.scan_meeting_audio_cleanup_v1(integer),projed_core.claim_meeting_audio_cleanup_v1(uuid,uuid),
  projed_core.finish_meeting_audio_cleanup_v1(uuid,uuid,jsonb) TO projed_runtime_disposable;
