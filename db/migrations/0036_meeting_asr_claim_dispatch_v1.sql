-- Durable per-unit dispatch intent. Existing runs remain the queue. Tokens stay
-- server-side and survive parent deletion for the later accounting-only path.
ALTER TABLE projed_core.meeting_ai_usage_attempts
  ADD COLUMN asr_operation_token uuid NULL,
  ADD COLUMN asr_manifest jsonb NULL,
  ADD COLUMN asr_remaining_twd_micros bigint NULL CHECK(asr_remaining_twd_micros>=0),
  ADD CONSTRAINT meeting_asr_manifest_pair_v1 CHECK(
    (asr_operation_token IS NULL AND asr_manifest IS NULL)
    OR(asr_operation_token IS NOT NULL AND asr_manifest IS NOT NULL AND jsonb_typeof(asr_manifest)='object'));
CREATE UNIQUE INDEX meeting_usage_asr_operation_token_v1
  ON projed_core.meeting_ai_usage_attempts(asr_operation_token) WHERE asr_operation_token IS NOT NULL;

CREATE FUNCTION projed_core.meeting_asr_work_scope_v1(target_run_id uuid,target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_asr_phase',true) IN('claim','dispatch')
    AND target_run_id::text=current_setting('projed.meeting_asr_run_id',true)
    AND current_setting('projed.actor_entry',true)='main'
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
$$;
CREATE FUNCTION projed_core.meeting_asr_run_live_v1(target_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
  SELECT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
    JOIN projed_core.app_sessions session ON session.context_id=run.authorization_context_id
    WHERE run.id=target_run_id AND projed_core.meeting_asr_work_scope_v1(run.id,run.capture_id)
      AND run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
      AND run.source_version=capture.source_version AND run.deadline_at>clock_timestamp()
      AND capture.state IN('queued','running') AND capture.source_completeness='complete'
      AND capture.source_frozen_at IS NOT NULL AND capture.audio_expires_at>clock_timestamp()
      AND session.context_id::text=current_setting('projed.actor_context_id',true)
      AND session.local_user_id=projed_core.current_actor_user_id_v1() AND session.entry='main'
      AND session.identity->>'principalId'=current_setting('projed.actor_principal_id',true)
      AND session.account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
      AND session.revoked_at_ms IS NULL AND session.expires_at_ms>extract(epoch FROM clock_timestamp())*1000
      AND (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000);
$$;
CREATE POLICY meeting_asr_work_run_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_work_scope_v1(id,capture_id))
  WITH CHECK(projed_core.meeting_asr_work_scope_v1(id,capture_id));
GRANT UPDATE(attempt_count) ON projed_core.meeting_analysis_runs TO projed_runtime_disposable;
DROP TRIGGER meeting_run_cancel_guard_v1 ON projed_core.meeting_analysis_runs;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'prepare'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'claim')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();
CREATE FUNCTION projed_core.meeting_asr_claim_run_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
BEGIN
  IF current_user='projed_runtime_disposable' AND current_setting('projed.meeting_asr_phase',true)='claim' THEN
    IF NOT projed_core.meeting_asr_run_live_v1(OLD.id) OR OLD.state<>'queued'
      OR OLD.lease_token IS NOT NULL OR OLD.lease_expires_at IS NOT NULL
      OR NEW.state<>'running' OR NEW.lease_token IS NULL
      OR NEW.lease_token::text IS DISTINCT FROM current_setting('projed.meeting_asr_token',true)
      OR NEW.lease_expires_at<=clock_timestamp() OR NEW.lease_expires_at>clock_timestamp()+interval '150 seconds'
      OR NEW.attempt_count<>OLD.attempt_count+1
      OR(to_jsonb(NEW)-ARRAY['state','lease_token','lease_expires_at','attempt_count','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','lease_token','lease_expires_at','attempt_count','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_ASR_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_asr_claim_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_claim_run_guard_v1();

CREATE POLICY meeting_asr_work_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_asr_work_scope_v1(run_id,capture_id));
CREATE POLICY meeting_asr_unit_insert_v1 ON projed_core.meeting_ai_usage_attempts
  FOR INSERT TO projed_runtime_disposable WITH CHECK(
    projed_core.meeting_asr_work_scope_v1(run_id,capture_id)
    AND current_setting('projed.meeting_asr_phase',true)='claim'
    AND asr_operation_token::text=current_setting('projed.meeting_asr_token',true)
    AND provider='google-cloud-speech' AND model='default'
    AND price_version='google-cloud-speech-v1-standard-no-data-logging-2026-10-29'
    AND actual_twd_micros IS NULL AND usage_state='reserved' AND dispatch_state='pending' AND outcome='reserved');
CREATE POLICY meeting_asr_pool_allocate_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_work_scope_v1(run_id,capture_id)
    AND current_setting('projed.meeting_asr_phase',true)='claim'
    AND attempt_id=run_id::text||':cloud-speech:pool' AND asr_operation_token IS NULL
    AND usage_state='reserved' AND dispatch_state='pending')
  WITH CHECK(projed_core.meeting_asr_work_scope_v1(run_id,capture_id)
    AND attempt_id=run_id::text||':cloud-speech:pool' AND usage_state='reserved' AND dispatch_state='pending');
CREATE POLICY meeting_asr_unit_dispatch_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_work_scope_v1(run_id,capture_id)
    AND current_setting('projed.meeting_asr_phase',true)='dispatch'
    AND asr_operation_token::text=current_setting('projed.meeting_asr_token',true)
    AND usage_state='reserved' AND dispatch_state='pending')
  WITH CHECK(projed_core.meeting_asr_work_scope_v1(run_id,capture_id)
    AND asr_operation_token::text=current_setting('projed.meeting_asr_token',true)
    AND usage_state='reserved' AND dispatch_state='dispatched');
GRANT SELECT(asr_operation_token,asr_manifest,asr_remaining_twd_micros) ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
GRANT INSERT(asr_operation_token,asr_manifest) ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
GRANT UPDATE(dispatch_state,asr_manifest,asr_remaining_twd_micros) ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_asr_usage_work_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
DECLARE allocated bigint;
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF current_setting('projed.meeting_asr_phase',true)='prepare'
      AND NEW.attempt_id=NEW.run_id::text||':cloud-speech:pool' THEN
      IF NEW.asr_operation_token IS NOT NULL OR NEW.asr_manifest IS NOT NULL OR NEW.asr_remaining_twd_micros IS NOT NULL THEN
        RAISE EXCEPTION 'MEETING_ASR_ALLOCATION_INVALID' USING ERRCODE='42501'; END IF;
      NEW.asr_remaining_twd_micros:=NEW.reserved_twd_micros;
    ELSIF current_setting('projed.meeting_asr_phase',true)='claim' THEN
      IF NOT projed_core.meeting_asr_run_live_v1(NEW.run_id) OR NOT projed_core.meeting_asr_work_scope_v1(NEW.run_id,NEW.capture_id)
        OR NEW.asr_operation_token IS NULL OR NEW.asr_manifest IS NULL OR NEW.asr_remaining_twd_micros IS NOT NULL
        OR NEW.asr_operation_token::text IS DISTINCT FROM current_setting('projed.meeting_asr_token',true)
        OR NEW.dispatch_month<>date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
        OR NEW.reserved_twd_micros<=0 OR NEW.reserved_twd_micros>800000
        OR NEW.attempt_id IS DISTINCT FROM NEW.unit_identity||':'||(NEW.asr_manifest->>'attempt')
        OR NOT EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts pool
          WHERE pool.attempt_id=NEW.run_id::text||':cloud-speech:pool' AND pool.capture_id=NEW.capture_id
            AND pool.dispatch_month=NEW.dispatch_month AND pool.usage_state='reserved' AND pool.dispatch_state='pending'
            AND coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros)>=NEW.reserved_twd_micros)
      THEN RAISE EXCEPTION 'MEETING_ASR_ALLOCATION_INVALID' USING ERRCODE='42501'; END IF;
    ELSIF NEW.asr_operation_token IS NOT NULL OR NEW.asr_manifest IS NOT NULL OR NEW.asr_remaining_twd_micros IS NOT NULL THEN
      RAISE EXCEPTION 'MEETING_ASR_ALLOCATION_INVALID' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF current_setting('projed.meeting_asr_phase',true)='claim' THEN
    SELECT usage.reserved_twd_micros INTO allocated FROM projed_core.meeting_ai_usage_attempts usage
      WHERE usage.asr_operation_token::text=current_setting('projed.meeting_asr_token',true)
        AND usage.run_id=OLD.run_id AND usage.capture_id=OLD.capture_id AND usage.dispatch_month=OLD.dispatch_month
        AND usage.usage_state='reserved' AND usage.dispatch_state='pending';
    IF allocated IS NULL OR OLD.attempt_id<>OLD.run_id::text||':cloud-speech:pool'
      OR OLD.usage_state<>'reserved' OR OLD.dispatch_state IS DISTINCT FROM 'pending'
      OR NEW.asr_remaining_twd_micros IS DISTINCT FROM coalesce(OLD.asr_remaining_twd_micros,OLD.reserved_twd_micros)-allocated
      OR(to_jsonb(NEW)-'asr_remaining_twd_micros') IS DISTINCT FROM(to_jsonb(OLD)-'asr_remaining_twd_micros')
    THEN RAISE EXCEPTION 'MEETING_ASR_ALLOCATION_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF current_setting('projed.meeting_asr_phase',true)='dispatch' THEN
    IF OLD.asr_operation_token IS NULL OR OLD.asr_operation_token::text IS DISTINCT FROM current_setting('projed.meeting_asr_token',true)
      OR OLD.dispatch_state IS DISTINCT FROM 'pending' OR NEW.dispatch_state<>'dispatched'
      OR NEW.asr_manifest-'dispatch' IS DISTINCT FROM OLD.asr_manifest
      OR(to_jsonb(NEW)-ARRAY['dispatch_state','asr_manifest','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['dispatch_state','asr_manifest','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_ASR_DISPATCH_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF(to_jsonb(NEW)-ARRAY['actual_twd_micros','usage_state','outcome','updated_at'])
    IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['actual_twd_micros','usage_state','outcome','updated_at']) THEN
    RAISE EXCEPTION 'MEETING_ASR_USAGE_MUTATION_INVALID' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_asr_usage_work_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_usage_work_guard_v1();

CREATE FUNCTION projed_core.claim_meeting_asr_unit_v1(target_run_id uuid,proposed_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs; source projed_core.meeting_capture_segments; capture projed_core.meeting_capture_sessions;
  pool record;usage record;segment_index_value integer;chunk_index_value integer;attempt_value integer;unit_index_value integer;
  unit_key text;attempt_key text;amount bigint;source_json jsonb;receipt jsonb;prior_phase text;prior_run text;prior_token text;
BEGIN
  IF proposed_token IS NULL THEN RAISE EXCEPTION 'MEETING_ASR_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  prior_phase:=current_setting('projed.meeting_asr_phase',true);prior_run:=current_setting('projed.meeting_asr_run_id',true);
  prior_token:=current_setting('projed.meeting_asr_token',true);
  PERFORM set_config('projed.meeting_asr_phase','claim',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true),
    set_config('projed.meeting_asr_token',proposed_token::text,true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
  IF FOUND AND projed_core.meeting_asr_run_live_v1(run.id) THEN
    IF run.state='running' AND run.lease_token=proposed_token AND run.lease_expires_at>clock_timestamp() THEN
      SELECT asr_manifest,attempt_id INTO usage FROM projed_core.meeting_ai_usage_attempts
        WHERE asr_operation_token=proposed_token AND run_id=run.id AND usage_state='reserved' AND dispatch_state='pending';
      IF FOUND THEN source_json:=usage.asr_manifest->'source';attempt_key:=usage.attempt_id;
        chunk_index_value:=(usage.asr_manifest->>'chunkIndex')::integer; END IF;
    ELSIF run.state='queued' AND run.lease_token IS NULL AND run.lease_expires_at IS NULL AND run.next_attempt_at<=clock_timestamp() THEN
      segment_index_value:=(run.stage_cursor#>>'{asr,segmentIndex}')::integer;
      chunk_index_value:=(run.stage_cursor#>>'{asr,chunkIndex}')::integer;
      unit_index_value:=(run.stage_cursor#>>'{asr,unitIndex}')::integer;
      attempt_value:=(run.stage_cursor#>>'{asr,attempt}')::integer;
      IF segment_index_value IS NULL OR chunk_index_value IS NULL OR unit_index_value IS NULL OR attempt_value IS NULL
        OR segment_index_value NOT BETWEEN 0 AND 4095 OR chunk_index_value NOT BETWEEN 0 AND 6
        OR unit_index_value NOT BETWEEN 0 AND 28671 OR attempt_value NOT BETWEEN 0 AND 1
      THEN RAISE EXCEPTION 'MEETING_ASR_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
      SELECT * INTO STRICT capture FROM projed_core.meeting_capture_sessions WHERE id=run.capture_id;
      SELECT * INTO STRICT source FROM projed_core.meeting_capture_segments WHERE capture_id=run.capture_id
        AND source_version=run.source_version AND segment_index=segment_index_value AND upload_state='verified'
        AND storage_backend='gcs' AND storage_generation IS NOT NULL AND sha256 IS NOT NULL;
      PERFORM projed_core.meeting_cloud_speech_reservation_v1(run.capture_id);
      IF source.start_offset_ms>9007199254740991 OR source.end_offset_ms>9007199254740991 THEN
        RAISE EXCEPTION 'MEETING_ASR_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
      amount:=least(50000,source.end_offset_ms-source.start_offset_ms+2000-chunk_index_value::bigint*50000);
      IF amount<=0 THEN RAISE EXCEPTION 'MEETING_ASR_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
      amount:=((amount+999)/1000)*16000;
      SELECT attempt_id,reserved_twd_micros,asr_remaining_twd_micros,dispatch_month INTO STRICT pool
        FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=run.id::text||':cloud-speech:pool'
          AND usage_state='reserved' AND dispatch_state='pending' FOR UPDATE;
      IF pool.dispatch_month<>date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
        OR coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros)<amount
      THEN RAISE EXCEPTION 'MEETING_ASR_BUDGET_UNAVAILABLE' USING ERRCODE='42501'; END IF;
      unit_key:=run.id::text||':asr:'||segment_index_value::text||':'||chunk_index_value::text;
      attempt_key:=unit_key||':'||attempt_value::text;
      source_json:=jsonb_build_object('id',source.id,'tenantId',capture.tenant_id,'projectId',capture.project_id,
        'recordId',capture.record_id,'segmentIndex',source.segment_index,'startOffsetMs',source.start_offset_ms,
        'endOffsetMs',source.end_offset_ms,'mime',source.mime,'bytes',source.bytes,'sha256',source.sha256,
        'generation',source.storage_generation,'objectPath',source.object_path);
      INSERT INTO projed_core.meeting_ai_usage_attempts(attempt_id,capture_id,run_id,unit_identity,dispatch_month,
        provider,model,price_version,reserved_twd_micros,usage_state,outcome,dispatch_state,asr_operation_token,asr_manifest)
      VALUES(attempt_key,run.capture_id,run.id,unit_key,pool.dispatch_month,'google-cloud-speech','default',
        'google-cloud-speech-v1-standard-no-data-logging-2026-10-29',amount,'reserved','reserved','pending',proposed_token,
        jsonb_build_object('source',source_json,'sourceVersion',run.source_version,'chunkIndex',chunk_index_value,
          'unitIndex',unit_index_value,'attempt',attempt_value));
      UPDATE projed_core.meeting_ai_usage_attempts SET asr_remaining_twd_micros=
        coalesce(asr_remaining_twd_micros,reserved_twd_micros)-amount WHERE attempt_id=pool.attempt_id;
      UPDATE projed_core.meeting_analysis_runs SET state='running',lease_token=proposed_token,
        lease_expires_at=clock_timestamp()+interval '150 seconds',attempt_count=attempt_count+1,updated_at=now()
        WHERE id=run.id RETURNING * INTO run;
    END IF;
    IF source_json IS NOT NULL THEN receipt:=jsonb_build_object('runId',run.id,'captureId',run.capture_id,
      'sourceVersion',run.source_version,'leaseToken',proposed_token,'leaseExpiresAtMs',floor(extract(epoch FROM run.lease_expires_at)*1000)::bigint,
      'attemptId',attempt_key,'chunkIndex',chunk_index_value,'source',source_json); END IF;
  END IF;
  PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true),
    set_config('projed.meeting_asr_run_id',coalesce(prior_run,''),true),set_config('projed.meeting_asr_token',coalesce(prior_token,''),true);
  RETURN receipt;
END;
$$;

CREATE FUNCTION projed_core.mark_meeting_asr_dispatch_v1(target_run_id uuid,claim_token uuid,unit_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;usage record;source projed_core.meeting_capture_segments;
  start_sample bigint;end_sample bigint;start_ms bigint;end_ms bigint;chunk_index_value integer;chunk_count integer;key text;
  result boolean:=false;prior_phase text;prior_run text;prior_token text;
BEGIN
  IF claim_token IS NULL OR unit_payload IS NULL OR jsonb_typeof(unit_payload)<>'object'
  THEN RAISE EXCEPTION 'MEETING_ASR_DISPATCH_INVALID' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(unit_payload))<>7
  THEN RAISE EXCEPTION 'MEETING_ASR_DISPATCH_INVALID' USING ERRCODE='42501'; END IF;
  FOR key IN SELECT jsonb_object_keys(unit_payload) LOOP
    IF key NOT IN('chunkIndex','chunkCount','startSample','endSample','decodedSha256','startOffsetMs','endOffsetMs')
      OR(key<>'decodedSha256' AND(jsonb_typeof(unit_payload->key)<>'number' OR unit_payload->>key !~ '^[0-9]{1,16}$'))
    THEN RAISE EXCEPTION 'MEETING_ASR_DISPATCH_INVALID' USING ERRCODE='42501'; END IF;
  END LOOP;
  start_sample:=(unit_payload->>'startSample')::bigint;end_sample:=(unit_payload->>'endSample')::bigint;
  start_ms:=(unit_payload->>'startOffsetMs')::bigint;end_ms:=(unit_payload->>'endOffsetMs')::bigint;
  chunk_index_value:=(unit_payload->>'chunkIndex')::integer;chunk_count:=(unit_payload->>'chunkCount')::integer;
  IF chunk_index_value NOT BETWEEN 0 AND 6 OR chunk_count NOT BETWEEN 1 AND 7 OR chunk_index_value>=chunk_count
    OR start_sample<>chunk_index_value::bigint*800000 OR end_sample<=start_sample OR end_sample>start_sample+800000
    OR(chunk_index_value<chunk_count-1 AND end_sample<>start_sample+800000)
    OR start_ms>9007199254740991 OR end_ms>9007199254740991 OR end_ms<=start_ms
    OR jsonb_typeof(unit_payload->'decodedSha256')<>'string'
    OR unit_payload->>'decodedSha256' !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'MEETING_ASR_DISPATCH_INVALID' USING ERRCODE='42501'; END IF;
  prior_phase:=current_setting('projed.meeting_asr_phase',true);prior_run:=current_setting('projed.meeting_asr_run_id',true);
  prior_token:=current_setting('projed.meeting_asr_token',true);
  PERFORM set_config('projed.meeting_asr_phase','dispatch',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true),
    set_config('projed.meeting_asr_token',claim_token::text,true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
  IF FOUND AND projed_core.meeting_asr_run_live_v1(run.id) AND run.state='running'
    AND run.lease_token=claim_token AND run.lease_expires_at>clock_timestamp() THEN
    SELECT attempt_id,asr_manifest,dispatch_state,dispatch_month INTO usage FROM projed_core.meeting_ai_usage_attempts
      WHERE asr_operation_token=claim_token AND run_id=run.id AND usage_state='reserved';
    IF FOUND AND usage.dispatch_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
      AND chunk_index_value=(usage.asr_manifest->>'chunkIndex')::integer THEN
      SELECT * INTO source FROM projed_core.meeting_capture_segments
        WHERE id=(usage.asr_manifest#>>'{source,id}')::uuid AND capture_id=run.capture_id AND source_version=run.source_version
          AND upload_state='verified' AND storage_backend='gcs'
          AND sha256=(usage.asr_manifest#>>'{source,sha256}') AND storage_generation=(usage.asr_manifest#>>'{source,generation}')
          AND segment_index=(usage.asr_manifest#>>'{source,segmentIndex}')::integer
          AND start_offset_ms=(usage.asr_manifest#>>'{source,startOffsetMs}')::bigint
          AND end_offset_ms=(usage.asr_manifest#>>'{source,endOffsetMs}')::bigint
          AND bytes=(usage.asr_manifest#>>'{source,bytes}')::bigint
          AND mime=(usage.asr_manifest#>>'{source,mime}') AND object_path=(usage.asr_manifest#>>'{source,objectPath}');
      IF FOUND AND start_ms=source.start_offset_ms+start_sample/16 AND end_ms=start_ms+(end_sample-start_sample+15)/16
        AND end_sample<=(source.end_offset_ms-source.start_offset_ms+2000)*16 THEN
        IF usage.dispatch_state='dispatched' THEN result:=usage.asr_manifest->'dispatch'=unit_payload;
        ELSIF usage.dispatch_state='pending' THEN
          UPDATE projed_core.meeting_ai_usage_attempts SET dispatch_state='dispatched',
            asr_manifest=asr_manifest||jsonb_build_object('dispatch',unit_payload),updated_at=now()
            WHERE attempt_id=usage.attempt_id;
          result:=FOUND;
        END IF;
      END IF;
    END IF;
  END IF;
  PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true),
    set_config('projed.meeting_asr_run_id',coalesce(prior_run,''),true),set_config('projed.meeting_asr_token',coalesce(prior_token,''),true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_asr_work_scope_v1(uuid,uuid),projed_core.meeting_asr_run_live_v1(uuid),
  projed_core.meeting_asr_claim_run_guard_v1(),projed_core.meeting_asr_usage_work_guard_v1(),
  projed_core.claim_meeting_asr_unit_v1(uuid,uuid),projed_core.mark_meeting_asr_dispatch_v1(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_asr_work_scope_v1(uuid,uuid),projed_core.meeting_asr_run_live_v1(uuid),
  projed_core.meeting_asr_claim_run_guard_v1(),projed_core.meeting_asr_usage_work_guard_v1(),
  projed_core.claim_meeting_asr_unit_v1(uuid,uuid),projed_core.mark_meeting_asr_dispatch_v1(uuid,uuid,jsonb) TO projed_runtime_disposable;
