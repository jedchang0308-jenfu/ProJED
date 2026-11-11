-- ASR transport results are private checkpoints, not final discussion segments.
-- Their parent/source cascades remove content; the independent usage ledger
-- retains only dispatch/accounting facts after cancellation or source deletion.
CREATE TABLE projed_core.meeting_asr_unit_results (
  attempt_id text PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES projed_core.meeting_capture_sessions(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  source_version integer NOT NULL CHECK(source_version>0),
  unit_index integer NOT NULL CHECK(unit_index BETWEEN 0 AND 28671),
  source_segment_id uuid NOT NULL REFERENCES projed_core.meeting_capture_segments(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK(chunk_index BETWEEN 0 AND 6),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,unit_index),
  FOREIGN KEY(capture_id,run_id) REFERENCES projed_core.meeting_analysis_runs(capture_id,id) ON DELETE CASCADE
);
ALTER TABLE projed_core.meeting_asr_unit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.meeting_asr_unit_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON projed_core.meeting_asr_unit_results FROM PUBLIC;
CREATE POLICY meeting_asr_checkpoint_read_v1 ON projed_core.meeting_asr_unit_results
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_capture_visible_v1(capture_id));
GRANT SELECT ON projed_core.meeting_asr_unit_results TO projed_runtime_disposable;
GRANT INSERT(attempt_id,capture_id,run_id,source_version,unit_index,source_segment_id,chunk_index,result)
  ON projed_core.meeting_asr_unit_results TO projed_runtime_disposable;

-- Pure GUC scope avoids recursive ledger policies. The RPC validates the exact
-- opaque operation token before it marks the pool scope as verified. These
-- server-only scopes never create a business actor or authorize content access.
CREATE FUNCTION projed_core.meeting_asr_settle_scope_v1(target_run_id uuid,target_token uuid,target_attempt text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_asr_phase',true)='settle'
    AND target_run_id::text=current_setting('projed.meeting_asr_run_id',true)
    AND ((target_token IS NOT NULL AND target_token::text=current_setting('projed.meeting_asr_token',true))
      OR(target_token IS NULL AND target_attempt=target_run_id::text||':cloud-speech:pool'
        AND current_setting('projed.meeting_asr_verified_token',true)=current_setting('projed.meeting_asr_token',true)));
$$;
CREATE POLICY meeting_asr_settle_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable
  USING(projed_core.meeting_asr_settle_scope_v1(run_id,asr_operation_token,attempt_id));
CREATE POLICY meeting_asr_settle_usage_update_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_settle_scope_v1(run_id,asr_operation_token,attempt_id))
  WITH CHECK(projed_core.meeting_asr_settle_scope_v1(run_id,asr_operation_token,attempt_id));

CREATE FUNCTION projed_core.meeting_asr_settle_run_scope_v1(target_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_asr_phase',true)='settle'
    AND target_run_id::text=current_setting('projed.meeting_asr_run_id',true)
    AND nullif(current_setting('projed.meeting_asr_token',true),'') IS NOT NULL
    AND current_setting('projed.meeting_asr_verified_token',true)=current_setting('projed.meeting_asr_token',true);
$$;
CREATE POLICY meeting_asr_settle_run_read_v1 ON projed_core.meeting_analysis_runs
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_asr_settle_run_scope_v1(id));
CREATE POLICY meeting_asr_settle_run_update_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable USING(projed_core.meeting_asr_settle_run_scope_v1(id))
  WITH CHECK(projed_core.meeting_asr_settle_run_scope_v1(id));
GRANT UPDATE(actual_twd_micros,next_attempt_at,resume_stage) ON projed_core.meeting_analysis_runs TO projed_runtime_disposable;
CREATE POLICY meeting_asr_settle_budget_read_v1 ON projed_core.meeting_ai_budget_months
  FOR SELECT TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='settle'
    AND budget_month::text=current_setting('projed.meeting_asr_settle_month',true)
    AND current_setting('projed.meeting_asr_verified_token',true)=current_setting('projed.meeting_asr_token',true));
CREATE POLICY meeting_asr_settle_budget_update_v1 ON projed_core.meeting_ai_budget_months
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='settle'
    AND budget_month::text=current_setting('projed.meeting_asr_settle_month',true)
    AND current_setting('projed.meeting_asr_verified_token',true)=current_setting('projed.meeting_asr_token',true))
  WITH CHECK(budget_month::text=current_setting('projed.meeting_asr_settle_month',true));
GRANT UPDATE(spent_twd_micros) ON projed_core.meeting_ai_budget_months TO projed_runtime_disposable;

DROP TRIGGER meeting_asr_usage_work_guard_v1 ON projed_core.meeting_ai_usage_attempts;
CREATE TRIGGER meeting_asr_usage_work_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle')
  EXECUTE FUNCTION projed_core.meeting_asr_usage_work_guard_v1();
DROP TRIGGER meeting_run_cancel_guard_v1 ON projed_core.meeting_analysis_runs;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'prepare'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();

CREATE FUNCTION projed_core.meeting_asr_settlement_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE receipt jsonb;unit record;pool record;released bigint;charged bigint;
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW; END IF;
  IF current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle' THEN
    -- A new spent grant must not widen the older cancellation path.
    IF TG_TABLE_NAME='meeting_ai_budget_months' THEN
      IF NEW.spent_twd_micros IS DISTINCT FROM OLD.spent_twd_micros THEN
        RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  receipt:=nullif(current_setting('projed.meeting_asr_settle_receipt',true),'')::jsonb;
  IF receipt IS NULL OR current_setting('projed.meeting_asr_verified_token',true)
    IS DISTINCT FROM current_setting('projed.meeting_asr_token',true) THEN
    RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='meeting_ai_usage_attempts' THEN
    IF NOT projed_core.meeting_asr_settle_scope_v1(OLD.run_id,OLD.asr_operation_token,OLD.attempt_id) THEN
      RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
    IF OLD.asr_operation_token IS NOT NULL THEN
      IF OLD.usage_state<>'reserved'
        OR NEW.usage_state IS DISTINCT FROM (CASE WHEN receipt->>'kind'='usage_unknown' THEN 'unknown' ELSE 'known' END)
        OR NEW.actual_twd_micros IS DISTINCT FROM (receipt->>'chargeMicros')::bigint
        OR NEW.outcome IS DISTINCT FROM receipt->>'outcome'
        OR NEW.asr_manifest IS DISTINCT FROM (OLD.asr_manifest||jsonb_build_object('settlement',receipt))
        OR(to_jsonb(NEW)-ARRAY['actual_twd_micros','usage_state','outcome','asr_manifest','updated_at'])
          IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['actual_twd_micros','usage_state','outcome','asr_manifest','updated_at'])
      THEN RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
    ELSE
      IF receipt->>'releasePool' IS DISTINCT FROM 'true' OR OLD.usage_state<>'reserved' OR OLD.dispatch_state IS DISTINCT FROM 'pending'
        OR NEW.usage_state<>'known' OR NEW.actual_twd_micros IS DISTINCT FROM 0 OR NEW.outcome<>'asr_pool_released'
        OR NEW.asr_remaining_twd_micros IS DISTINCT FROM 0
        OR(to_jsonb(NEW)-ARRAY['actual_twd_micros','usage_state','outcome','asr_remaining_twd_micros','updated_at'])
          IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['actual_twd_micros','usage_state','outcome','asr_remaining_twd_micros','updated_at'])
      THEN RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='meeting_analysis_runs' THEN
    IF NOT projed_core.meeting_asr_settle_run_scope_v1(OLD.id) OR OLD.state<>'running'
      OR OLD.lease_token::text IS DISTINCT FROM current_setting('projed.meeting_asr_token',true)
      OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR NEW.state IS DISTINCT FROM receipt->>'nextState' OR NEW.resume_stage IS DISTINCT FROM receipt->>'nextStage'
      OR NEW.stage_cursor IS DISTINCT FROM receipt->'nextCursor'
      OR NEW.error_code IS DISTINCT FROM receipt->>'errorCode'
      OR NEW.actual_twd_micros IS DISTINCT FROM (receipt->>'runActualMicros')::bigint
      OR NEW.next_attempt_at IS DISTINCT FROM (receipt->>'nextAttemptAt')::timestamptz
      OR(to_jsonb(NEW)-ARRAY['state','resume_stage','stage_cursor','lease_token','lease_expires_at','error_code',
        'actual_twd_micros','next_attempt_at','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY[
        'state','resume_stage','stage_cursor','lease_token','lease_expires_at','error_code','actual_twd_micros','next_attempt_at','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='meeting_ai_budget_months' THEN
    SELECT dispatch_month,reserved_twd_micros,usage_state INTO STRICT unit
      FROM projed_core.meeting_ai_usage_attempts WHERE asr_operation_token::text=current_setting('projed.meeting_asr_token',true)
        AND run_id::text=current_setting('projed.meeting_asr_run_id',true);
    SELECT asr_remaining_twd_micros,reserved_twd_micros,usage_state,dispatch_state INTO STRICT pool
      FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=current_setting('projed.meeting_asr_run_id',true)||':cloud-speech:pool';
    released:=CASE WHEN receipt->>'kind'='usage_unknown' THEN 0 ELSE unit.reserved_twd_micros END;
    IF receipt->>'releasePool'='true' AND pool.usage_state='reserved' THEN
      IF pool.dispatch_state IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
      released:=released+coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros);
    END IF;
    charged:=coalesce((receipt->>'chargeMicros')::bigint,0);
    IF unit.usage_state<>'reserved' OR OLD.budget_month<>unit.dispatch_month
      OR OLD.limit_twd_micros<0 OR OLD.spent_twd_micros<0 OR OLD.reserved_twd_micros<released OR released<0
      OR charged<0 OR charged>unit.reserved_twd_micros
      OR NEW.budget_month IS DISTINCT FROM OLD.budget_month OR NEW.limit_twd_micros IS DISTINCT FROM OLD.limit_twd_micros
      OR NEW.reserved_twd_micros::numeric<>OLD.reserved_twd_micros::numeric-released
      OR NEW.spent_twd_micros::numeric<>OLD.spent_twd_micros::numeric+charged
      OR NEW.spent_twd_micros::numeric+NEW.reserved_twd_micros::numeric>NEW.limit_twd_micros::numeric
    THEN RAISE EXCEPTION 'MEETING_ASR_ACCOUNTING_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_asr_settlement_usage_guard_v1 BEFORE UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_settlement_guard_v1();
CREATE TRIGGER meeting_asr_settlement_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_settlement_guard_v1();
CREATE TRIGGER meeting_asr_settlement_budget_guard_v1 BEFORE UPDATE ON projed_core.meeting_ai_budget_months
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_settlement_guard_v1();

CREATE POLICY meeting_asr_checkpoint_insert_v1 ON projed_core.meeting_asr_unit_results
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.meeting_asr_phase',true)='settle'
    AND projed_core.meeting_asr_run_live_v1(run_id)
    AND EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_ai_usage_attempts usage ON usage.run_id=run.id
      WHERE run.id=meeting_asr_unit_results.run_id AND run.capture_id=meeting_asr_unit_results.capture_id
        AND run.source_version=meeting_asr_unit_results.source_version AND run.state='running'
        AND run.lease_token=usage.asr_operation_token AND run.lease_expires_at>clock_timestamp()
        AND usage.asr_operation_token::text=current_setting('projed.meeting_asr_token',true)
        AND usage.attempt_id=meeting_asr_unit_results.attempt_id AND usage.usage_state='reserved' AND usage.dispatch_state='dispatched'
        AND meeting_asr_unit_results.source_segment_id=(usage.asr_manifest#>>'{source,id}')::uuid
        AND meeting_asr_unit_results.unit_index=(usage.asr_manifest->>'unitIndex')::integer
        AND meeting_asr_unit_results.chunk_index=(usage.asr_manifest->>'chunkIndex')::integer
        AND meeting_asr_unit_results.result-ARRAY['sourceHash','rawText','wordOffsets']=usage.asr_manifest->'dispatch'));

CREATE FUNCTION projed_core.settle_meeting_asr_unit_v1(target_run_id uuid,claim_token uuid,result_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;unit record;pool record;source projed_core.meeting_capture_segments;
  kind text;payload_hash text;receipt jsonb;transcript jsonb;charge bigint;released bigint;pcm_charge bigint;
  live boolean:=false;actor_live boolean:=false;stored boolean:=false;complete boolean:=false;retry boolean:=false;release_pool boolean:=true;
  next_cursor jsonb;next_state text:='failed_terminal';next_stage text;final_error text;next_at timestamptz:=clock_timestamp();
  segment_index_value integer;chunk_index_value integer;unit_index_value integer;attempt_value integer;
  word record;previous_word_start numeric:=-1;
  prior jsonb;setting_key text;setting_keys text[]:=ARRAY['projed.meeting_asr_phase','projed.meeting_asr_run_id',
    'projed.meeting_asr_token','projed.meeting_asr_verified_token','projed.meeting_asr_settle_month','projed.meeting_asr_settle_receipt'];
BEGIN
  IF target_run_id IS NULL OR claim_token IS NULL OR result_payload IS NULL OR jsonb_typeof(result_payload)<>'object'
  THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
  kind:=result_payload->>'kind';
  IF kind='recognized' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(result_payload))<>4 OR NOT(result_payload ?& ARRAY['kind','transcript','chargeMicros','chargeSource'])
      OR jsonb_typeof(result_payload->'transcript') IS DISTINCT FROM 'object'
      OR jsonb_typeof(result_payload->'chargeMicros') IS DISTINCT FROM 'string' OR result_payload->>'chargeMicros' !~ '^[0-9]{1,6}$'
      OR jsonb_typeof(result_payload->'chargeSource') IS DISTINCT FROM 'string'
      OR result_payload->>'chargeSource' NOT IN('provider_metadata','validated_pcm_upper_bound')
    THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    charge:=(result_payload->>'chargeMicros')::bigint;transcript:=result_payload->'transcript';
  ELSIF kind IN('not_sent','rejected_unbilled','usage_unknown') THEN
    IF (SELECT count(*) FROM jsonb_object_keys(result_payload))<>2 OR NOT(result_payload ?& ARRAY['kind','code'])
      OR jsonb_typeof(result_payload->'code') IS DISTINCT FROM 'string' OR result_payload->>'code' !~ '^[A-Z0-9_]{1,80}$'
      OR(kind='rejected_unbilled' AND result_payload->>'code'<>'ASR_PROVIDER_REJECTED')
    THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    charge:=CASE WHEN kind='usage_unknown' THEN NULL ELSE 0 END;
  ELSE RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
  payload_hash:=encode(sha256(convert_to(result_payload::text,'UTF8')),'hex');
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior
    FROM unnest(setting_keys) AS settings(key_name);
  PERFORM set_config('projed.meeting_asr_phase','settle',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true),
    set_config('projed.meeting_asr_token',claim_token::text,true),set_config('projed.meeting_asr_verified_token','',true);
  -- Share the existing app mutation lock with the actor transaction kernel,
  -- including calls that can only account after the original actor is gone.
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  -- Prove the exact token without a lock first; usage policies already consult
  -- runs, so run policies must never consult usage in return. Re-read the unit
  -- under locks after establishing the verified, metadata-only run scope.
  PERFORM 1 FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run_id AND asr_operation_token=claim_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
  PERFORM set_config('projed.meeting_asr_verified_token',claim_token::text,true);
  -- Match claim/cancel lock ordering: parent run, exact unit, pool, month.
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
  SELECT attempt_id,capture_id,run_id,dispatch_month,reserved_twd_micros,actual_twd_micros,usage_state,dispatch_state,asr_manifest
    INTO STRICT unit FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run_id AND asr_operation_token=claim_token FOR UPDATE;
  IF unit.asr_manifest->'settlement' IS NOT NULL THEN
    receipt:=unit.asr_manifest->'settlement';
    IF receipt->>'hash'=payload_hash THEN
      FOREACH setting_key IN ARRAY setting_keys LOOP PERFORM set_config(setting_key,coalesce(prior->>setting_key,''),true); END LOOP;
      RETURN receipt;
    ELSE
      RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_CONFLICT' USING ERRCODE='42501';
    END IF;
  END IF;
  IF unit.usage_state<>'reserved'
  THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_CONFLICT' USING ERRCODE='42501'; END IF;
  IF kind IN('recognized','rejected_unbilled','usage_unknown') AND unit.dispatch_state IS DISTINCT FROM 'dispatched'
  THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
  IF kind='recognized' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(transcript))<>10
      OR NOT(transcript ?& ARRAY['chunkIndex','chunkCount','startSample','endSample','decodedSha256','startOffsetMs','endOffsetMs','rawText','wordOffsets','sourceHash'])
      OR transcript-ARRAY['rawText','wordOffsets','sourceHash'] IS DISTINCT FROM unit.asr_manifest->'dispatch'
      OR jsonb_typeof(transcript->'rawText') IS DISTINCT FROM 'string' OR length(transcript->>'rawText')>128000
      OR jsonb_typeof(transcript->'wordOffsets') IS DISTINCT FROM 'array'
      OR transcript->>'sourceHash' IS NULL OR transcript->>'sourceHash' !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    IF jsonb_array_length(transcript->'wordOffsets')>50000 THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    IF length(transcript->>'rawText')>0 AND jsonb_array_length(transcript->'wordOffsets')=0 THEN
      RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    FOR word IN SELECT value,ordinality FROM jsonb_array_elements(transcript->'wordOffsets') WITH ORDINALITY LOOP
      IF jsonb_typeof(word.value) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(word.value))<>5
        OR NOT(word.value ?& ARRAY['text','start_ms','end_ms','source_audio_segment_id','source_word_index'])
        OR jsonb_typeof(word.value->'text') IS DISTINCT FROM 'string' OR length(word.value->>'text') NOT BETWEEN 1 AND 1000
        OR jsonb_typeof(word.value->'start_ms') IS DISTINCT FROM 'number' OR jsonb_typeof(word.value->'end_ms') IS DISTINCT FROM 'number'
        OR jsonb_typeof(word.value->'source_word_index') IS DISTINCT FROM 'number'
        OR word.value->>'source_audio_segment_id' IS DISTINCT FROM unit.asr_manifest#>>'{source,id}'
      THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
      IF (word.value->>'source_word_index')::numeric<>word.ordinality-1
        OR (word.value->>'start_ms')::numeric<(transcript->>'startOffsetMs')::numeric
        OR (word.value->>'end_ms')::numeric>(transcript->>'endOffsetMs')::numeric
        OR (word.value->>'end_ms')::numeric<(word.value->>'start_ms')::numeric
        OR (word.value->>'start_ms')::numeric+0.000001<previous_word_start
      THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
      previous_word_start:=(word.value->>'start_ms')::numeric;
    END LOOP;
    pcm_charge:=(((transcript->>'endSample')::bigint-(transcript->>'startSample')::bigint+15999)/16000)*16000;
    IF charge IS NULL OR charge<16000 OR charge>unit.reserved_twd_micros OR charge>pcm_charge OR charge%16000<>0
      OR(result_payload->>'chargeSource'='validated_pcm_upper_bound' AND charge<>pcm_charge)
    THEN RAISE EXCEPTION 'MEETING_ASR_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT attempt_id,reserved_twd_micros,asr_remaining_twd_micros,usage_state,dispatch_state INTO STRICT pool
    FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=target_run_id::text||':cloud-speech:pool' FOR UPDATE;
  segment_index_value:=(unit.asr_manifest#>>'{source,segmentIndex}')::integer;
  chunk_index_value:=(unit.asr_manifest->>'chunkIndex')::integer;
  unit_index_value:=(unit.asr_manifest->>'unitIndex')::integer;attempt_value:=(unit.asr_manifest->>'attempt')::integer;
  next_stage:=coalesce(run.resume_stage,'transcribe');next_cursor:=coalesce(run.stage_cursor,'{}'::jsonb);
  live:=run.id IS NOT NULL AND run.state='running' AND run.lease_token=claim_token
    AND (run.lease_expires_at>clock_timestamp() OR(kind='not_sent' AND result_payload->>'code'='ASR_LEASE_EXPIRED'
      AND unit.dispatch_state='pending' AND run.lease_expires_at<=clock_timestamp()))
    AND projed_core.meeting_asr_run_live_v1(target_run_id);
  actor_live:=live;
  -- An already-sent response may finish over midnight. New dispatches/retries
  -- still require their current month's reserved funds.
  live:=live AND(kind='recognized' OR unit.dispatch_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date);
  IF live THEN
    SELECT * INTO source FROM projed_core.meeting_capture_segments WHERE id=(unit.asr_manifest#>>'{source,id}')::uuid
      AND capture_id=run.capture_id AND source_version=run.source_version AND upload_state='verified' AND storage_backend='gcs'
      AND sha256=(unit.asr_manifest#>>'{source,sha256}') AND storage_generation=(unit.asr_manifest#>>'{source,generation}')
      AND start_offset_ms=(unit.asr_manifest#>>'{source,startOffsetMs}')::bigint
      AND end_offset_ms=(unit.asr_manifest#>>'{source,endOffsetMs}')::bigint AND bytes=(unit.asr_manifest#>>'{source,bytes}')::bigint
      AND mime=(unit.asr_manifest#>>'{source,mime}') AND object_path=(unit.asr_manifest#>>'{source,objectPath}');
    live:=FOUND;
  END IF;
  -- A stale result may settle its own cost, never the pool still needed by a
  -- newer lease/cursor. Terminal/deleted parents have no remaining ASR work.
  release_pool:=run.id IS NULL OR run.state IN('cancelled','failed_terminal','ready')
    OR(run.state='running' AND run.lease_token=claim_token);
  IF kind='recognized' AND live THEN
    live:=NOT((transcript->>'chunkIndex')::integer=(transcript->>'chunkCount')::integer-1
      AND (transcript->>'endSample')::bigint<greatest(0,source.end_offset_ms-source.start_offset_ms-2000)*16);
  END IF;
  IF kind='recognized' AND live AND unit.usage_state='reserved' THEN
    INSERT INTO projed_core.meeting_asr_unit_results(attempt_id,capture_id,run_id,source_version,unit_index,source_segment_id,chunk_index,result)
      VALUES(unit.attempt_id,run.capture_id,run.id,run.source_version,unit_index_value,source.id,chunk_index_value,transcript);
    stored:=true;next_state:='queued';
    IF chunk_index_value+1<(transcript->>'chunkCount')::integer THEN
      next_cursor:=jsonb_build_object('asr',jsonb_build_object('segmentIndex',segment_index_value,'chunkIndex',chunk_index_value+1,'unitIndex',unit_index_value+1,'attempt',0));
    ELSIF EXISTS(SELECT 1 FROM projed_core.meeting_capture_segments WHERE capture_id=run.capture_id
      AND source_version=run.source_version AND segment_index=segment_index_value+1) THEN
      next_cursor:=jsonb_build_object('asr',jsonb_build_object('segmentIndex',segment_index_value+1,'chunkIndex',0,'unitIndex',unit_index_value+1,'attempt',0));
    ELSE
      IF (SELECT count(*) FROM projed_core.meeting_asr_unit_results WHERE run_id=run.id)<>unit_index_value+1 THEN
        RAISE EXCEPTION 'MEETING_ASR_COVERAGE_INVALID' USING ERRCODE='42501'; END IF;
      complete:=true;next_stage:='retrieve';
      next_cursor:=jsonb_build_object('asr',jsonb_build_object('done',true,'segmentIndex',segment_index_value,
        'chunkIndex',chunk_index_value,'unitIndex',unit_index_value,'attempt',0));
    END IF;
    release_pool:=complete;
    IF NOT complete AND unit.dispatch_month<>date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date THEN
      -- Keep this successful checkpoint for an explicit resume; do not spend a
      -- prior month's remaining reservation on another paid request.
      next_state:='failed_terminal';release_pool:=true;
    END IF;
  ELSIF kind IN('not_sent','rejected_unbilled') AND live AND attempt_value=0 AND pool.usage_state='reserved'
    AND (kind='rejected_unbilled' OR result_payload->>'code' IN('ASR_AUTH_UNAVAILABLE','ASR_REQUEST_ABORTED','ASR_REQUEST_TIMEOUT','ASR_UNIT_UNAVAILABLE','ASR_LEASE_EXPIRED')) THEN
    retry:=true;next_state:='queued';next_at:=clock_timestamp()+interval '30 seconds';release_pool:=false;
    next_cursor:=jsonb_build_object('asr',jsonb_build_object('segmentIndex',segment_index_value,'chunkIndex',chunk_index_value,'unitIndex',unit_index_value,'attempt',1));
  END IF;
  final_error:=CASE WHEN stored AND next_state='failed_terminal' THEN 'ASR_BUDGET_MONTH_CHANGED'
    WHEN stored OR retry THEN NULL WHEN kind='usage_unknown' THEN 'ASR_USAGE_UNKNOWN'
    ELSE coalesce(result_payload->>'code','ASR_RESULT_NOT_PUBLISHED') END;
  receipt:=jsonb_build_object('hash',payload_hash,'kind',kind,'chargeMicros',charge::text,
    'chargeSource',result_payload->>'chargeSource','outcome',CASE WHEN kind='recognized'
      THEN 'asr_recognized_'||(result_payload->>'chargeSource') ELSE result_payload->>'code' END,
    'published',stored,'asrComplete',complete,'releasePool',release_pool,'nextState',next_state,'nextStage',next_stage,
    'nextCursor',next_cursor,'errorCode',final_error,'nextAttemptAt',next_at,
    'runActualMicros',CASE WHEN kind='usage_unknown' THEN NULL ELSE (coalesce(run.actual_twd_micros,0)+coalesce(charge,0))::text END);
  PERFORM set_config('projed.meeting_asr_settle_receipt',receipt::text,true),set_config('projed.meeting_asr_settle_month',unit.dispatch_month::text,true);
  released:=CASE WHEN kind='usage_unknown' THEN 0 ELSE unit.reserved_twd_micros END;
  IF release_pool AND pool.usage_state='reserved' THEN released:=released+coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros); END IF;
  UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros-released,
    spent_twd_micros=spent_twd_micros+coalesce(charge,0),updated_at=now() WHERE budget_month=unit.dispatch_month;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_ASR_BUDGET_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  UPDATE projed_core.meeting_ai_usage_attempts SET actual_twd_micros=charge,
    usage_state=CASE WHEN kind='usage_unknown' THEN 'unknown' ELSE 'known' END,outcome=receipt->>'outcome',
    asr_manifest=asr_manifest||jsonb_build_object('settlement',receipt),updated_at=now() WHERE attempt_id=unit.attempt_id;
  IF release_pool AND pool.usage_state='reserved' THEN
    UPDATE projed_core.meeting_ai_usage_attempts SET actual_twd_micros=0,usage_state='known',outcome='asr_pool_released',
      asr_remaining_twd_micros=0,updated_at=now() WHERE attempt_id=pool.attempt_id;
  END IF;
  IF run.id IS NOT NULL AND run.state='running' AND run.lease_token=claim_token THEN
    UPDATE projed_core.meeting_analysis_runs SET state=next_state,resume_stage=next_stage,stage_cursor=next_cursor,
      lease_token=NULL,lease_expires_at=NULL,error_code=final_error,actual_twd_micros=(receipt->>'runActualMicros')::bigint,
      next_attempt_at=next_at,updated_at=now() WHERE id=run.id;
    IF actor_live AND next_state='failed_terminal' THEN UPDATE projed_core.meeting_capture_sessions SET state='failed_terminal',updated_at=now()
      WHERE id=run.capture_id AND source_version=run.source_version; END IF;
  END IF;
  FOREACH setting_key IN ARRAY setting_keys LOOP PERFORM set_config(setting_key,coalesce(prior->>setting_key,''),true); END LOOP;
  RETURN receipt;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_asr_settle_scope_v1(uuid,uuid,text),projed_core.meeting_asr_settle_run_scope_v1(uuid),
  projed_core.meeting_asr_settlement_guard_v1(),projed_core.settle_meeting_asr_unit_v1(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_asr_settle_scope_v1(uuid,uuid,text),projed_core.meeting_asr_settle_run_scope_v1(uuid),
  projed_core.meeting_asr_settlement_guard_v1(),projed_core.settle_meeting_asr_unit_v1(uuid,uuid,jsonb) TO projed_runtime_disposable;

-- Dispatch COMMIT uncertainty is resolved by a read, never by a second intent
-- write. Returning true is a fresh eligibility check for this exact payload.
CREATE FUNCTION projed_core.read_meeting_asr_dispatch_v1(target_run_id uuid,claim_token uuid,unit_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE result boolean;prior_phase text;prior_run text;prior_token text;
BEGIN
  IF target_run_id IS NULL OR claim_token IS NULL OR unit_payload IS NULL THEN RETURN false; END IF;
  prior_phase:=current_setting('projed.meeting_asr_phase',true);prior_run:=current_setting('projed.meeting_asr_run_id',true);
  prior_token:=current_setting('projed.meeting_asr_token',true);
  PERFORM set_config('projed.meeting_asr_phase','dispatch',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true),
    set_config('projed.meeting_asr_token',claim_token::text,true);
  SELECT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_ai_usage_attempts usage ON usage.run_id=run.id AND usage.asr_operation_token=claim_token
    JOIN projed_core.meeting_capture_segments source ON source.id=(usage.asr_manifest#>>'{source,id}')::uuid
      AND source.capture_id=run.capture_id AND source.source_version=run.source_version
    WHERE run.id=target_run_id AND run.state='running' AND run.lease_token=claim_token AND run.lease_expires_at>clock_timestamp()
      AND projed_core.meeting_asr_run_live_v1(run.id) AND usage.usage_state='reserved' AND usage.dispatch_state='dispatched'
      AND usage.dispatch_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
      AND usage.asr_manifest->'dispatch'=unit_payload AND source.upload_state='verified' AND source.storage_backend='gcs'
      AND source.sha256=(usage.asr_manifest#>>'{source,sha256}') AND source.storage_generation=(usage.asr_manifest#>>'{source,generation}')
      AND source.segment_index=(usage.asr_manifest#>>'{source,segmentIndex}')::integer
      AND source.start_offset_ms=(usage.asr_manifest#>>'{source,startOffsetMs}')::bigint
      AND source.end_offset_ms=(usage.asr_manifest#>>'{source,endOffsetMs}')::bigint
      AND source.bytes=(usage.asr_manifest#>>'{source,bytes}')::bigint
      AND source.mime=(usage.asr_manifest#>>'{source,mime}') AND source.object_path=(usage.asr_manifest#>>'{source,objectPath}')) INTO result;
  PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true),
    set_config('projed.meeting_asr_run_id',coalesce(prior_run,''),true),set_config('projed.meeting_asr_token',coalesce(prior_token,''),true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.read_meeting_asr_dispatch_v1(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.read_meeting_asr_dispatch_v1(uuid,uuid,jsonb) TO projed_runtime_disposable;


-- Extend only the named worker phase; complete ASR moves to retrieve, never
-- directly to analysis-ready. Prior checkpoint decode identity fences new POSTs.
CREATE OR REPLACE FUNCTION projed_core.meeting_asr_work_scope_v1(target_run_id uuid,target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_asr_phase',true) IN('claim','dispatch','settle')
    AND target_run_id::text=current_setting('projed.meeting_asr_run_id',true)
    AND current_setting('projed.actor_entry',true)='main'
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
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
      AND (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000);
$$;

CREATE OR REPLACE FUNCTION projed_core.mark_meeting_asr_dispatch_v1(target_run_id uuid,claim_token uuid,unit_payload jsonb)
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
        AND end_sample<=(source.end_offset_ms-source.start_offset_ms+2000)*16
        AND(chunk_index_value<chunk_count-1 OR end_sample>=greatest(0,source.end_offset_ms-source.start_offset_ms-2000)*16)
        AND NOT EXISTS(SELECT 1 FROM projed_core.meeting_asr_unit_results previous
          WHERE previous.run_id=run.id AND previous.source_segment_id=source.id
            AND(previous.result->>'decodedSha256' IS DISTINCT FROM unit_payload->>'decodedSha256'
              OR previous.result->>'chunkCount' IS DISTINCT FROM unit_payload->>'chunkCount')) THEN
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

-- A partly consumed ASR pool refunds only its unallocated remainder. Existing
-- legacy pending/unknown and in-flight cancellation protections stay intact.
CREATE OR REPLACE FUNCTION projed_core.cancel_meeting_capture_v1(target_capture_id uuid,expected_version integer,reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
DECLARE capture projed_core.meeting_capture_sessions; attempt record; prior_state text;
BEGIN
  SELECT * INTO capture FROM projed_core.meeting_capture_sessions
    WHERE id=target_capture_id FOR UPDATE;
  IF NOT FOUND OR NOT projed_core.meeting_capture_mutable_v1(target_capture_id) THEN
    RAISE EXCEPTION 'MEETING_CAPTURE_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF expected_version IS NULL OR expected_version<=0 OR capture.source_version<>expected_version THEN
    RAISE EXCEPTION 'SOURCE_CONFLICT';
  END IF;
  prior_state:=capture.state;
  IF capture.state IN ('ready','expired','failed_terminal') THEN
    RETURN jsonb_build_object('captureId',capture.id,'state',capture.state,'sourceVersion',capture.source_version,'idempotent',true);
  END IF;
  PERFORM set_config('projed.meeting_ledger_phase','cancel',true);
  UPDATE projed_core.meeting_capture_sessions SET state='cancelled',
    stopped_reason=left(reason,160),last_progress_at=now(),updated_at=now() WHERE id=capture.id;
  UPDATE projed_core.meeting_analysis_runs SET error_code=CASE
      WHEN state IN ('running','failed_retryable') THEN 'CANCELLED_IN_FLIGHT' ELSE 'CANCELLED_BEFORE_DISPATCH' END,
    state='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
    WHERE capture_id=capture.id AND state IN ('queued','awaiting_budget','failed_retryable','running');
  INSERT INTO projed_core.meeting_artifact_cleanup
    (obligation_id,capture_id,attempt_id,kind,object_locator,state,upload_token_expires_at,due_at,storage_backend)
    SELECT gen_random_uuid(),capture.id,
      'storage:'||capture.id::text||':v'||segment.source_version::text||':segment:'||segment.segment_index::text,
      'storage',segment.object_path,'pending',segment.upload_token_expires_at,
      greatest(now(),coalesce(segment.upload_token_expires_at,now())),segment.storage_backend
    FROM projed_core.meeting_capture_segments segment
    WHERE segment.capture_id=capture.id AND segment.upload_state<>'purged'
    ON CONFLICT (attempt_id,kind) DO NOTHING;
  FOR attempt IN SELECT usage.attempt_id,usage.dispatch_month,
      CASE WHEN usage.attempt_id=run.id::text||':cloud-speech:pool' AND usage.provider='google-cloud-speech'
        AND usage.asr_remaining_twd_micros IS NOT NULL THEN usage.asr_remaining_twd_micros
        ELSE usage.reserved_twd_micros END AS reserved_twd_micros
    FROM projed_core.meeting_ai_usage_attempts usage
    JOIN projed_core.meeting_analysis_runs run ON run.id=usage.run_id AND run.capture_id=usage.capture_id
    WHERE usage.capture_id=capture.id AND usage.usage_state='reserved' AND usage.dispatch_state='pending'
      AND run.state='cancelled' AND run.error_code='CANCELLED_BEFORE_DISPATCH'
    ORDER BY usage.dispatch_month,usage.attempt_id FOR UPDATE OF usage
  LOOP
    PERFORM set_config('projed.meeting_refund_month',attempt.dispatch_month::text,true);
    UPDATE projed_core.meeting_ai_budget_months
      SET reserved_twd_micros=reserved_twd_micros-attempt.reserved_twd_micros,updated_at=now()
      WHERE budget_month=attempt.dispatch_month AND attempt.reserved_twd_micros>=0
        AND reserved_twd_micros>=attempt.reserved_twd_micros;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_BUDGET_LEDGER_MISSING'; END IF;
    UPDATE projed_core.meeting_ai_usage_attempts SET actual_twd_micros=0,usage_state='known',
      outcome='cancelled_before_dispatch',updated_at=now() WHERE attempt_id=attempt.attempt_id AND usage_state='reserved';
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_USAGE_SETTLEMENT_CONFLICT'; END IF;
  END LOOP;
  PERFORM set_config('projed.meeting_refund_month','',true);
  PERFORM set_config('projed.meeting_ledger_phase','',true);
  RETURN jsonb_build_object('captureId',capture.id,'state','cancelled','sourceVersion',capture.source_version,
    'idempotent',prior_state='cancelled');
END;
$$;
