-- Complete a verified recording and reserve its first analysis attempt atomically.
-- No provider dispatch, worker authority, foundation role or public ledger API.
CREATE FUNCTION projed_core.meeting_upload_scope_v1(target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT current_setting('projed.meeting_ledger_phase',true)='complete'
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
$$;
CREATE FUNCTION projed_core.meeting_upload_budget_scope_v1(target_month date)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT target_month::text=current_setting('projed.meeting_upload_budget_month',true)
    AND target_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id::text=current_setting('projed.meeting_capture_id',true)
        AND projed_core.meeting_upload_scope_v1(capture.id));
$$;
CREATE FUNCTION projed_core.meeting_upload_run_scope_v1(target_run_id uuid,target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT target_run_id::text=current_setting('projed.meeting_upload_run_id',true)
    AND projed_core.meeting_upload_scope_v1(target_capture_id);
$$;

CREATE POLICY meeting_budget_upload_read_v1 ON projed_core.meeting_ai_budget_months
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_upload_budget_scope_v1(budget_month));
CREATE POLICY meeting_budget_upload_insert_v1 ON projed_core.meeting_ai_budget_months
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_upload_budget_scope_v1(budget_month)
    AND limit_twd_micros=1000000000 AND reserved_twd_micros=0 AND spent_twd_micros=0);
CREATE POLICY meeting_budget_upload_update_v1 ON projed_core.meeting_ai_budget_months
  FOR UPDATE TO projed_runtime_disposable
  USING (projed_core.meeting_upload_budget_scope_v1(budget_month))
  WITH CHECK (projed_core.meeting_upload_budget_scope_v1(budget_month));
GRANT SELECT (limit_twd_micros,spent_twd_micros) ON projed_core.meeting_ai_budget_months TO projed_runtime_disposable;
GRANT INSERT (budget_month) ON projed_core.meeting_ai_budget_months TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_budget_upload_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
BEGIN
  IF current_user='projed_runtime_disposable' AND current_setting('projed.meeting_ledger_phase',true)='complete' THEN
    IF NOT projed_core.meeting_upload_budget_scope_v1(NEW.budget_month) THEN
      RAISE EXCEPTION 'MEETING_BUDGET_SCOPE_INVALID' USING ERRCODE='42501';
    END IF;
    IF TG_OP='UPDATE' AND (
      NEW.budget_month IS DISTINCT FROM OLD.budget_month
      OR NEW.limit_twd_micros IS DISTINCT FROM OLD.limit_twd_micros
      OR NEW.spent_twd_micros IS DISTINCT FROM OLD.spent_twd_micros
      OR OLD.reserved_twd_micros<0 OR OLD.spent_twd_micros<0 OR OLD.limit_twd_micros<0
      OR NEW.reserved_twd_micros::numeric<>OLD.reserved_twd_micros::numeric+10000000
      OR NEW.reserved_twd_micros::numeric+NEW.spent_twd_micros::numeric>NEW.limit_twd_micros::numeric
    ) THEN RAISE EXCEPTION 'MEETING_BUDGET_RESERVATION_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_budget_upload_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_budget_months
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_budget_upload_guard_v1();

CREATE POLICY meeting_run_upload_insert_v1 ON projed_core.meeting_analysis_runs
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_upload_run_scope_v1(id,capture_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=meeting_analysis_runs.capture_id
        AND capture.source_version=meeting_analysis_runs.source_version
        AND capture.source_frozen_at IS NULL AND capture.state IN ('stopped','uploading'))
    AND request_key='source-v'||source_version::text AND config_version='dev-123.v1'
    AND resume_stage='transcribe' AND provider_mode='gemini'
    AND budget_month::text=current_setting('projed.meeting_upload_budget_month',true)
    AND upload_completed_at=now() AND deadline_at=now()+interval '24 hours'
    AND ((state='queued' AND reserved_twd_micros=10000000)
      OR (state='awaiting_budget' AND reserved_twd_micros=0))
  );
GRANT INSERT (id,capture_id,source_version,request_key,config_version,state,resume_stage,
  upload_completed_at,deadline_at,budget_month,provider_mode,reserved_twd_micros)
  ON projed_core.meeting_analysis_runs TO projed_runtime_disposable;

CREATE POLICY meeting_usage_upload_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING (
    projed_core.meeting_upload_run_scope_v1(run_id,capture_id) AND attempt_id=run_id::text||':0');
CREATE POLICY meeting_usage_upload_insert_v1 ON projed_core.meeting_ai_usage_attempts
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_upload_run_scope_v1(run_id,capture_id)
    AND attempt_id=run_id::text||':0' AND unit_identity=run_id::text||':transcribe'
    AND dispatch_month::text=current_setting('projed.meeting_upload_budget_month',true)
    AND provider='gemini' AND model='gemini-3.5-transcribe' AND price_version='dev-123.v1'
    AND reserved_twd_micros=10000000 AND actual_twd_micros IS NULL
    AND usage_state='reserved' AND dispatch_state='pending' AND outcome='reserved'
    AND EXISTS (SELECT 1 FROM projed_core.meeting_analysis_runs run
      WHERE run.id=run_id AND run.capture_id=meeting_ai_usage_attempts.capture_id
        AND run.state='queued' AND run.reserved_twd_micros=10000000)
  );
GRANT SELECT (unit_identity,provider,model,price_version,outcome) ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
GRANT INSERT (attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
  reserved_twd_micros,usage_state,outcome,dispatch_state)
  ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;

CREATE FUNCTION projed_core.complete_meeting_upload_v1(
  target_capture_id uuid,expected_version integer,audio_manifest jsonb,
  audio_hash text,pointer_hash text,completeness text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
DECLARE capture projed_core.meeting_capture_sessions; run projed_core.meeting_analysis_runs;
  segment projed_core.meeting_capture_segments; item jsonb; manifest_count integer; segment_count integer;
  new_run_id uuid; budget_month_value date; budget record; allowed boolean; next_state text;
  prior_phase text; prior_run text; prior_month text;
BEGIN
  SELECT * INTO capture FROM projed_core.meeting_capture_sessions WHERE id=target_capture_id FOR UPDATE;
  IF NOT FOUND OR NOT projed_core.meeting_capture_mutable_v1(target_capture_id) THEN
    RAISE EXCEPTION 'MEETING_CAPTURE_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF expected_version IS NULL OR expected_version<1 OR capture.source_version<>expected_version THEN
    RAISE EXCEPTION 'MEETING_UPLOAD_SOURCE_CONFLICT';
  END IF;
  IF capture.state NOT IN ('stopped','uploading','queued','awaiting_budget') THEN
    RAISE EXCEPTION 'MEETING_UPLOAD_CAPTURE_NOT_READY';
  END IF;
  IF capture.audio_expires_at IS NOT NULL AND capture.audio_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'MEETING_UPLOAD_AUDIO_EXPIRED';
  END IF;
  IF completeness IS NULL OR completeness NOT IN ('complete','partial','missing')
    OR audio_hash IS NULL OR btrim(audio_hash)='' OR pointer_hash IS NULL OR btrim(pointer_hash)=''
    OR length(audio_hash)>256 OR length(pointer_hash)>256
    OR audio_manifest IS NULL OR jsonb_typeof(audio_manifest)<>'array'
  THEN RAISE EXCEPTION 'MEETING_UPLOAD_MANIFEST_CONFLICT'; END IF;
  manifest_count:=jsonb_array_length(audio_manifest);
  IF manifest_count>4096 OR manifest_count<>(SELECT count(DISTINCT value->>'segmentIndex') FROM jsonb_array_elements(audio_manifest))
  THEN RAISE EXCEPTION 'MEETING_UPLOAD_MANIFEST_CONFLICT'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(audio_manifest) LOOP
    SELECT * INTO segment FROM projed_core.meeting_capture_segments
      WHERE capture_id=target_capture_id AND source_version=expected_version
        AND segment_index=(item->>'segmentIndex')::integer;
    IF NOT FOUND OR segment.upload_state<>'verified' OR segment.bytes<=0 OR segment.bytes>10485760
      OR segment.bytes IS DISTINCT FROM (item->>'bytes')::bigint
      OR segment.object_path IS DISTINCT FROM item->>'objectPath'
      OR lower(segment.sha256) IS DISTINCT FROM item->>'sha256'
      OR segment.sha256 IS NULL OR segment.sha256 !~ '^[a-fA-F0-9]{64}$'
      OR lower(segment.mime) IS DISTINCT FROM item->>'mime'
      OR segment.epoch IS DISTINCT FROM (item->>'epoch')::integer
      OR segment.start_offset_ms IS DISTINCT FROM (item->>'startOffsetMs')::bigint
      OR segment.end_offset_ms IS DISTINCT FROM (item->>'endOffsetMs')::bigint
      OR segment.overlap_ms IS DISTINCT FROM (item->>'overlapMs')::integer
      OR segment.gap_before_ms IS DISTINCT FROM (item->>'gapBeforeMs')::integer
    THEN RAISE EXCEPTION 'MEETING_UPLOAD_MANIFEST_CONFLICT'; END IF;
  END LOOP;
  IF completeness='complete' THEN
    -- A known pending upload cannot silently disappear from a complete source.
    SELECT count(*) INTO segment_count FROM projed_core.meeting_capture_segments
      WHERE capture_id=target_capture_id AND source_version=expected_version;
    IF manifest_count=0 OR segment_count<>manifest_count OR EXISTS (
      SELECT 1 FROM generate_series(0,manifest_count-1) wanted(index)
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(audio_manifest) entry(value)
        WHERE (entry.value->>'segmentIndex')::integer=wanted.index)
    ) THEN RAISE EXCEPTION 'MEETING_UPLOAD_MANIFEST_CONFLICT'; END IF;
  END IF;
  IF capture.source_frozen_at IS NOT NULL THEN
    IF completeness<>'complete' OR capture.audio_manifest_hash IS DISTINCT FROM audio_hash
      OR capture.pointer_manifest_hash IS DISTINCT FROM pointer_hash
    THEN RAISE EXCEPTION 'MEETING_UPLOAD_SOURCE_CONFLICT'; END IF;
    SELECT * INTO run FROM projed_core.meeting_analysis_runs
      WHERE capture_id=target_capture_id AND request_key='source-v'||expected_version::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_UPLOAD_SOURCE_RUN_MISSING'; END IF;
    RETURN jsonb_build_object('state',capture.state,'runId',run.id,'sourceVersion',expected_version,
      'deadlineAt',run.deadline_at,'sourceComplete',true,'idempotent',true);
  END IF;
  IF EXISTS (SELECT 1 FROM projed_core.meeting_analysis_runs
    WHERE capture_id=target_capture_id AND request_key='source-v'||expected_version::text)
  THEN RAISE EXCEPTION 'MEETING_UPLOAD_SOURCE_RUN_INCONSISTENT'; END IF;
  IF completeness<>'complete' THEN
    UPDATE projed_core.meeting_capture_sessions SET state='stopped',source_completeness=completeness,
      audio_manifest_hash=audio_hash,pointer_manifest_hash=pointer_hash,source_frozen_at=NULL,updated_at=now()
      WHERE id=target_capture_id;
    RETURN jsonb_build_object('state','stopped','runId',NULL,'sourceVersion',expected_version,
      'sourceComplete',false,'idempotent',false);
  END IF;
  prior_phase:=current_setting('projed.meeting_ledger_phase',true);
  prior_run:=current_setting('projed.meeting_upload_run_id',true);
  prior_month:=current_setting('projed.meeting_upload_budget_month',true);
  budget_month_value:=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date;
  new_run_id:=pg_catalog.gen_random_uuid();
  PERFORM set_config('projed.meeting_ledger_phase','complete',true),
    set_config('projed.meeting_upload_run_id',new_run_id::text,true),
    set_config('projed.meeting_upload_budget_month',budget_month_value::text,true);
  INSERT INTO projed_core.meeting_ai_budget_months(budget_month) VALUES(budget_month_value) ON CONFLICT DO NOTHING;
  SELECT budget_month,limit_twd_micros,reserved_twd_micros,spent_twd_micros INTO budget
    FROM projed_core.meeting_ai_budget_months WHERE budget_month=budget_month_value FOR UPDATE;
  IF NOT FOUND OR budget.limit_twd_micros<0 OR budget.reserved_twd_micros<0 OR budget.spent_twd_micros<0
    OR budget.reserved_twd_micros::numeric+budget.spent_twd_micros::numeric>budget.limit_twd_micros::numeric
  THEN RAISE EXCEPTION 'MEETING_BUDGET_INTEGRITY_INVALID'; END IF;
  allowed:=budget.reserved_twd_micros::numeric+budget.spent_twd_micros::numeric+10000000<=budget.limit_twd_micros::numeric;
  next_state:=CASE WHEN allowed THEN 'queued' ELSE 'awaiting_budget' END;
  IF allowed THEN
    UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros+10000000,updated_at=now()
      WHERE budget_month=budget_month_value;
  END IF;
  INSERT INTO projed_core.meeting_analysis_runs(id,capture_id,source_version,request_key,config_version,state,
    resume_stage,upload_completed_at,deadline_at,budget_month,provider_mode,reserved_twd_micros)
  VALUES(new_run_id,target_capture_id,expected_version,'source-v'||expected_version::text,'dev-123.v1',next_state,
    'transcribe',now(),now()+interval '24 hours',budget_month_value,'gemini',CASE WHEN allowed THEN 10000000 ELSE 0 END);
  IF allowed THEN
    INSERT INTO projed_core.meeting_ai_usage_attempts(attempt_id,capture_id,run_id,unit_identity,
      dispatch_month,provider,model,price_version,reserved_twd_micros,usage_state,outcome,dispatch_state)
    VALUES(new_run_id::text||':0',target_capture_id,new_run_id,new_run_id::text||':transcribe',budget_month_value,
      'gemini','gemini-3.5-transcribe','dev-123.v1',10000000,'reserved','reserved','pending');
  END IF;
  UPDATE projed_core.meeting_capture_sessions SET state=next_state,source_completeness='complete',
    source_frozen_at=now(),audio_manifest_hash=audio_hash,pointer_manifest_hash=pointer_hash,updated_at=now()
    WHERE id=target_capture_id;
  PERFORM set_config('projed.meeting_ledger_phase',coalesce(prior_phase,''),true),
    set_config('projed.meeting_upload_run_id',coalesce(prior_run,''),true),
    set_config('projed.meeting_upload_budget_month',coalesce(prior_month,''),true);
  RETURN jsonb_build_object('state',next_state,'runId',new_run_id,'sourceVersion',expected_version,
    'deadlineAt',now()+interval '24 hours','sourceComplete',true,'idempotent',false);
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_upload_scope_v1(uuid),
  projed_core.meeting_upload_budget_scope_v1(date),projed_core.meeting_upload_run_scope_v1(uuid,uuid),
  projed_core.meeting_budget_upload_guard_v1(),
  projed_core.complete_meeting_upload_v1(uuid,integer,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_upload_scope_v1(uuid),
  projed_core.meeting_upload_budget_scope_v1(date),projed_core.meeting_upload_run_scope_v1(uuid,uuid),
  projed_core.meeting_budget_upload_guard_v1(),
  projed_core.complete_meeting_upload_v1(uuid,integer,jsonb,text,text,text) TO projed_runtime_disposable;
