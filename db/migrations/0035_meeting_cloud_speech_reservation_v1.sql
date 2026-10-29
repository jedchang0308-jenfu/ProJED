-- Price only the existing frozen/verified GCS source. No provider dispatch or
-- transcript authority is introduced here. $0.024/min, 40 TWD/USD budget buffer,
-- one-second rounding per <=50s chunk, at most two attempts: 32000 microTWD/sec.
CREATE FUNCTION projed_core.meeting_cloud_speech_reservation_v1(target_capture_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
DECLARE source record; count_value integer:=0; amount bigint:=0;
BEGIN
  IF NOT projed_core.meeting_capture_mutable_v1(target_capture_id) THEN
    RAISE EXCEPTION 'MEETING_ASR_SOURCE_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  FOR source IN SELECT segment.* FROM projed_core.meeting_capture_segments segment
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=segment.capture_id
    WHERE capture.id=target_capture_id AND segment.source_version=capture.source_version
    ORDER BY segment.segment_index LOOP
    IF source.segment_index<>count_value OR source.upload_state<>'verified'
      OR source.storage_backend IS DISTINCT FROM 'gcs'
      OR source.storage_generation IS NULL OR source.storage_generation !~ '^[1-9][0-9]{0,18}$'
      OR source.sha256 IS NULL OR source.sha256 !~ '^[a-f0-9]{64}$'
      OR source.bytes<1 OR source.bytes>10485760
      OR source.end_offset_ms<=source.start_offset_ms
      OR source.end_offset_ms-source.start_offset_ms>302000
    THEN RAISE EXCEPTION 'MEETING_ASR_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    count_value:=count_value+1;
    -- Include decoder/clock slack, without trimming any decoded samples. Full
    -- 50-second chunks are integral seconds, so only the final chunk rounds up.
    amount:=amount+((source.end_offset_ms-source.start_offset_ms+2999)/1000)*32000;
  END LOOP;
  IF count_value<1 OR count_value>4096 OR amount<=0 THEN
    RAISE EXCEPTION 'MEETING_ASR_SOURCE_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  RETURN amount;
END;
$$;

CREATE FUNCTION projed_core.meeting_asr_prepare_scope_v1(target_run_id uuid,target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_asr_phase',true)='prepare'
    AND target_run_id::text=current_setting('projed.meeting_asr_run_id',true)
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
$$;
CREATE POLICY meeting_asr_prepare_run_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_prepare_scope_v1(id,capture_id))
  WITH CHECK(projed_core.meeting_asr_prepare_scope_v1(id,capture_id));
GRANT UPDATE(provider_mode,config_version,transcript_revision_id,stage_cursor,budget_month,reserved_twd_micros)
  ON projed_core.meeting_analysis_runs TO projed_runtime_disposable;

-- Route this one new phase to its own guard; the frozen cancellation/Session
-- guard remains mandatory for every other phase. A separate invariant below
-- prevents new column grants from broadening the old cancellation path.
DROP TRIGGER meeting_run_cancel_guard_v1 ON projed_core.meeting_analysis_runs;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'prepare')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();
CREATE FUNCTION projed_core.meeting_asr_prepare_run_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW; END IF;
  IF current_setting('projed.meeting_asr_phase',true)='prepare' THEN
    IF NOT projed_core.meeting_asr_prepare_scope_v1(NEW.id,NEW.capture_id)
      OR OLD.state NOT IN('queued','awaiting_budget')
      OR OLD.lease_token IS NOT NULL OR OLD.lease_expires_at IS NOT NULL
      OR OLD.actual_twd_micros IS NOT NULL
      OR NEW.authorization_context_id IS NULL
      OR NEW.authorization_context_id::text IS DISTINCT FROM current_setting('projed.actor_context_id',true)
      OR NEW.authorization_context_id IS DISTINCT FROM OLD.authorization_context_id
      OR NEW.provider_mode<>'cloud-speech-v1' OR NEW.config_version<>'dev139.cloud-speech.v1'
      OR NEW.transcript_revision_id IS NULL
      OR NEW.state NOT IN('queued','awaiting_budget')
      OR NEW.stage_cursor<>jsonb_build_object('asr',jsonb_build_object('segmentIndex',0,'chunkIndex',0,'unitIndex',0,'attempt',0))
      OR NEW.budget_month<>date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
      OR NEW.reserved_twd_micros<>CASE WHEN NEW.state='queued'
        THEN projed_core.meeting_cloud_speech_reservation_v1(NEW.capture_id) ELSE 0 END
      OR NOT((OLD.provider_mode='gemini' AND OLD.config_version='dev-123.v1'
          AND OLD.transcript_revision_id IS NULL AND OLD.stage_cursor='{}'::jsonb AND OLD.attempt_count=0)
        OR(OLD.provider_mode='cloud-speech-v1' AND OLD.config_version='dev139.cloud-speech.v1'
          AND OLD.state='awaiting_budget' AND OLD.reserved_twd_micros=0
          AND OLD.transcript_revision_id=NEW.transcript_revision_id AND OLD.stage_cursor=NEW.stage_cursor))
      OR(to_jsonb(NEW)-ARRAY['provider_mode','config_version','transcript_revision_id','stage_cursor',
        'budget_month','reserved_twd_micros','state','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['provider_mode','config_version','transcript_revision_id','stage_cursor',
        'budget_month','reserved_twd_micros','state','updated_at'])
      OR NOT EXISTS(SELECT 1 FROM projed_core.meeting_capture_sessions capture
        WHERE capture.id=NEW.capture_id AND capture.source_version=NEW.source_version
          AND capture.state IN('queued','awaiting_budget') AND capture.source_frozen_at IS NOT NULL
          AND capture.source_completeness='complete' AND capture.audio_expires_at>clock_timestamp()
          AND NEW.deadline_at>clock_timestamp())
      OR NOT EXISTS(SELECT 1 FROM projed_core.app_sessions session
        WHERE session.context_id=NEW.authorization_context_id AND session.entry='main'
          AND session.local_user_id=projed_core.current_actor_user_id_v1()
          AND session.identity->>'principalId'=current_setting('projed.actor_principal_id',true)
          AND session.account_guard_revision::text=current_setting('projed.actor_guard_revision',true)
          AND session.revoked_at_ms IS NULL
          AND session.expires_at_ms>extract(epoch FROM clock_timestamp())*1000)
    THEN RAISE EXCEPTION 'MEETING_ASR_PREPARATION_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND(to_jsonb(NEW)-ARRAY['state','error_code','lease_token','lease_expires_at','updated_at'])
      IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','error_code','lease_token','lease_expires_at','updated_at'])
  THEN RAISE EXCEPTION 'MEETING_RUN_CANCELLATION_INVALID' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_asr_prepare_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_prepare_run_guard_v1();

CREATE POLICY meeting_asr_prepare_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_asr_prepare_scope_v1(run_id,capture_id));
GRANT SELECT(actual_twd_micros) ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
CREATE POLICY meeting_asr_prepare_legacy_usage_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_prepare_scope_v1(run_id,capture_id)
    AND attempt_id=run_id::text||':0' AND provider='gemini' AND model='gemini-3.5-transcribe'
    AND price_version='dev-123.v1' AND reserved_twd_micros=10000000
    AND usage_state='reserved' AND dispatch_state='pending' AND actual_twd_micros IS NULL)
  WITH CHECK(projed_core.meeting_asr_prepare_scope_v1(run_id,capture_id)
    AND actual_twd_micros=0 AND usage_state='known' AND outcome='superseded_before_dispatch');
CREATE POLICY meeting_asr_prepare_pool_v1 ON projed_core.meeting_ai_usage_attempts
  FOR INSERT TO projed_runtime_disposable WITH CHECK(
    projed_core.meeting_asr_prepare_scope_v1(run_id,capture_id)
    AND attempt_id=run_id::text||':cloud-speech:pool' AND unit_identity=run_id::text||':asr-reservation'
    AND provider='google-cloud-speech' AND model='default'
    AND price_version='google-cloud-speech-v1-standard-no-data-logging-2026-10-29'
    AND reserved_twd_micros=projed_core.meeting_cloud_speech_reservation_v1(capture_id)
    AND actual_twd_micros IS NULL AND usage_state='reserved' AND dispatch_state='pending' AND outcome='reserved'
    AND EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run WHERE run.id=run_id
      AND run.capture_id=meeting_ai_usage_attempts.capture_id AND run.state='queued'
      AND run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
      AND run.budget_month=dispatch_month AND run.reserved_twd_micros=meeting_ai_usage_attempts.reserved_twd_micros));

CREATE FUNCTION projed_core.meeting_asr_prepare_budget_scope_v1(target_month date)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
  SELECT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
    WHERE projed_core.meeting_asr_prepare_scope_v1(run.id,run.capture_id)
      AND(target_month=run.budget_month OR target_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date));
$$;
CREATE POLICY meeting_asr_prepare_budget_read_v1 ON projed_core.meeting_ai_budget_months
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_asr_prepare_budget_scope_v1(budget_month));
CREATE POLICY meeting_asr_prepare_budget_insert_v1 ON projed_core.meeting_ai_budget_months
  FOR INSERT TO projed_runtime_disposable WITH CHECK(
    projed_core.meeting_asr_prepare_budget_scope_v1(budget_month)
    AND budget_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
    AND limit_twd_micros=1000000000 AND reserved_twd_micros=0 AND spent_twd_micros=0);
CREATE POLICY meeting_asr_prepare_budget_update_v1 ON projed_core.meeting_ai_budget_months
  FOR UPDATE TO projed_runtime_disposable
  USING(projed_core.meeting_asr_prepare_budget_scope_v1(budget_month))
  WITH CHECK(projed_core.meeting_asr_prepare_budget_scope_v1(budget_month));
CREATE FUNCTION projed_core.meeting_asr_prepare_budget_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
DECLARE delta bigint;
BEGIN
  IF current_user='projed_runtime_disposable' AND current_setting('projed.meeting_asr_phase',true)='prepare' THEN
    IF NOT projed_core.meeting_asr_prepare_budget_scope_v1(NEW.budget_month)
      OR NEW.limit_twd_micros<0 OR NEW.spent_twd_micros<0 OR NEW.reserved_twd_micros<0
      OR NEW.spent_twd_micros::numeric+NEW.reserved_twd_micros::numeric>NEW.limit_twd_micros::numeric
    THEN RAISE EXCEPTION 'MEETING_BUDGET_INTEGRITY_INVALID' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' THEN
      IF current_setting('projed.meeting_asr_budget_action',true)='release-legacy' THEN
        SELECT -usage.reserved_twd_micros INTO delta FROM projed_core.meeting_ai_usage_attempts usage
          WHERE usage.run_id::text=current_setting('projed.meeting_asr_run_id',true)
            AND usage.attempt_id=usage.run_id::text||':0' AND usage.dispatch_month=NEW.budget_month
            AND usage.usage_state='reserved' AND usage.dispatch_state='pending'
            AND usage.actual_twd_micros IS NULL AND usage.reserved_twd_micros=10000000
            AND usage.provider='gemini' AND usage.model='gemini-3.5-transcribe' AND usage.price_version='dev-123.v1';
      ELSIF current_setting('projed.meeting_asr_budget_action',true)='reserve-pool' THEN
        SELECT run.reserved_twd_micros INTO delta FROM projed_core.meeting_analysis_runs run
          WHERE run.id::text=current_setting('projed.meeting_asr_run_id',true)
            AND run.budget_month=NEW.budget_month AND run.state='queued'
            AND run.provider_mode='cloud-speech-v1'
            AND run.reserved_twd_micros=projed_core.meeting_cloud_speech_reservation_v1(run.capture_id)
            AND NOT EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts usage
              WHERE usage.attempt_id=run.id::text||':cloud-speech:pool');
      END IF;
      IF delta IS NULL OR NEW.budget_month IS DISTINCT FROM OLD.budget_month
        OR OLD.limit_twd_micros<0 OR OLD.spent_twd_micros<0 OR OLD.reserved_twd_micros<0
        OR OLD.spent_twd_micros::numeric+OLD.reserved_twd_micros::numeric>OLD.limit_twd_micros::numeric
        OR NEW.limit_twd_micros IS DISTINCT FROM OLD.limit_twd_micros
        OR NEW.spent_twd_micros IS DISTINCT FROM OLD.spent_twd_micros
        OR NEW.reserved_twd_micros::numeric<>OLD.reserved_twd_micros::numeric+delta
      THEN RAISE EXCEPTION 'MEETING_BUDGET_RESERVATION_INVALID' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_asr_prepare_budget_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_budget_months
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_prepare_budget_guard_v1();

CREATE FUNCTION projed_core.prepare_meeting_cloud_speech_v1(target_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs; legacy record;
  prior_phase text;prior_run text;prior_action text;month_value date;budget record;amount bigint;allowed boolean;next_state text;
BEGIN
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id;
  IF NOT FOUND OR NOT projed_core.meeting_capture_mutable_v1(run.capture_id)
    OR run.state NOT IN('queued','awaiting_budget') OR run.deadline_at IS NULL OR run.deadline_at<=clock_timestamp()
    OR run.budget_month IS NULL
  THEN RAISE EXCEPTION 'MEETING_ASR_PREPARATION_INVALID' USING ERRCODE='42501'; END IF;
  IF run.authorization_context_id IS NULL THEN
    PERFORM projed_core.bind_meeting_asr_session_v1(target_run_id);
  ELSIF run.authorization_context_id::text IS DISTINCT FROM current_setting('projed.actor_context_id',true) THEN
    RAISE EXCEPTION 'MEETING_ASR_AUTHORIZATION_INVALID' USING ERRCODE='42501';
  END IF;
  prior_phase:=current_setting('projed.meeting_asr_phase',true);prior_run:=current_setting('projed.meeting_asr_run_id',true);
  prior_action:=current_setting('projed.meeting_asr_budget_action',true);
  PERFORM set_config('projed.meeting_asr_phase','prepare',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true);
  SELECT * INTO STRICT run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
  IF run.provider_mode='cloud-speech-v1' AND run.state='queued' THEN
    -- No second reservation on an acknowledged or lost-ack replay.
    IF run.config_version<>'dev139.cloud-speech.v1' OR run.reserved_twd_micros<=0
      OR NOT EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts usage
        WHERE usage.attempt_id=run.id::text||':cloud-speech:pool' AND usage.run_id=run.id
          AND usage.capture_id=run.capture_id AND usage.dispatch_month=run.budget_month
          AND usage.provider='google-cloud-speech' AND usage.model='default'
          AND usage.price_version='google-cloud-speech-v1-standard-no-data-logging-2026-10-29'
          AND usage.usage_state='reserved' AND usage.dispatch_state IN('pending','dispatched')
          AND usage.reserved_twd_micros>=run.reserved_twd_micros)
    THEN RAISE EXCEPTION 'MEETING_BUDGET_INTEGRITY_INVALID'; END IF;
    PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true),
      set_config('projed.meeting_asr_run_id',coalesce(prior_run,''),true),
      set_config('projed.meeting_asr_budget_action',coalesce(prior_action,''),true);
    RETURN jsonb_build_object('state',run.state,'runId',run.id,'sourceVersion',run.source_version,
      'reservedTwdMicros',run.reserved_twd_micros::text,'idempotent',true);
  END IF;
  amount:=projed_core.meeting_cloud_speech_reservation_v1(run.capture_id);
  month_value:=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date;
  INSERT INTO projed_core.meeting_ai_budget_months(budget_month) VALUES(month_value) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM projed_core.meeting_ai_budget_months WHERE budget_month IN(run.budget_month,month_value)
    ORDER BY budget_month FOR UPDATE;
  IF run.provider_mode='gemini' THEN
    IF run.config_version<>'dev-123.v1' OR run.reserved_twd_micros NOT IN(0,10000000) THEN
      RAISE EXCEPTION 'MEETING_ASR_PREPARATION_INVALID' USING ERRCODE='42501'; END IF;
    IF run.reserved_twd_micros=10000000 THEN
      SELECT attempt_id,run_id,capture_id,dispatch_month,reserved_twd_micros,usage_state,dispatch_state,actual_twd_micros
        INTO legacy FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=run.id::text||':0' FOR UPDATE;
      IF NOT FOUND OR legacy.run_id<>run.id OR legacy.capture_id<>run.capture_id
        OR legacy.dispatch_month<>run.budget_month OR legacy.dispatch_state IS DISTINCT FROM 'pending'
        OR legacy.usage_state<>'reserved' OR legacy.actual_twd_micros IS NOT NULL
      THEN RAISE EXCEPTION 'MEETING_ASR_LEGACY_USAGE_UNPROVEN' USING ERRCODE='42501'; END IF;
      PERFORM set_config('projed.meeting_asr_budget_action','release-legacy',true);
      UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros-10000000,updated_at=now()
        WHERE budget_month=legacy.dispatch_month AND reserved_twd_micros>=10000000;
      IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_BUDGET_INTEGRITY_INVALID'; END IF;
      UPDATE projed_core.meeting_ai_usage_attempts SET usage_state='known',actual_twd_micros=0,
        outcome='superseded_before_dispatch',updated_at=now() WHERE attempt_id=legacy.attempt_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_ASR_LEGACY_USAGE_UNPROVEN'; END IF;
    ELSIF EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts WHERE run_id=run.id) THEN
      RAISE EXCEPTION 'MEETING_ASR_LEGACY_USAGE_UNPROVEN' USING ERRCODE='42501';
    END IF;
  END IF;
  SELECT budget_month,limit_twd_micros,reserved_twd_micros,spent_twd_micros INTO STRICT budget
    FROM projed_core.meeting_ai_budget_months WHERE budget_month=month_value;
  IF budget.limit_twd_micros<0 OR budget.reserved_twd_micros<0 OR budget.spent_twd_micros<0
    OR budget.reserved_twd_micros::numeric+budget.spent_twd_micros::numeric>budget.limit_twd_micros::numeric
  THEN RAISE EXCEPTION 'MEETING_BUDGET_INTEGRITY_INVALID'; END IF;
  allowed:=budget.reserved_twd_micros::numeric+budget.spent_twd_micros::numeric+amount<=budget.limit_twd_micros::numeric;
  next_state:=CASE WHEN allowed THEN 'queued' ELSE 'awaiting_budget' END;
  UPDATE projed_core.meeting_analysis_runs SET provider_mode='cloud-speech-v1',config_version='dev139.cloud-speech.v1',
    transcript_revision_id=coalesce(transcript_revision_id,gen_random_uuid()),
    stage_cursor=jsonb_build_object('asr',jsonb_build_object('segmentIndex',0,'chunkIndex',0,'unitIndex',0,'attempt',0)),
    state=next_state,budget_month=month_value,reserved_twd_micros=CASE WHEN allowed THEN amount ELSE 0 END,updated_at=now()
    WHERE id=run.id;
  IF allowed THEN
    PERFORM set_config('projed.meeting_asr_budget_action','reserve-pool',true);
    UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros+amount,updated_at=now()
      WHERE budget_month=month_value;
    INSERT INTO projed_core.meeting_ai_usage_attempts(attempt_id,capture_id,run_id,unit_identity,dispatch_month,
      provider,model,price_version,reserved_twd_micros,usage_state,outcome,dispatch_state)
    VALUES(run.id::text||':cloud-speech:pool',run.capture_id,run.id,run.id::text||':asr-reservation',month_value,
      'google-cloud-speech','default','google-cloud-speech-v1-standard-no-data-logging-2026-10-29',
      amount,'reserved','reserved','pending');
  END IF;
  UPDATE projed_core.meeting_capture_sessions SET state=next_state,updated_at=now() WHERE id=run.capture_id;
  PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true),
    set_config('projed.meeting_asr_run_id',coalesce(prior_run,''),true),
    set_config('projed.meeting_asr_budget_action',coalesce(prior_action,''),true);
  RETURN jsonb_build_object('state',next_state,'runId',run.id,'sourceVersion',run.source_version,
    'reservedTwdMicros',CASE WHEN allowed THEN amount ELSE 0 END::text,'idempotent',false);
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_cloud_speech_reservation_v1(uuid),
  projed_core.meeting_asr_prepare_scope_v1(uuid,uuid),projed_core.meeting_asr_prepare_run_guard_v1(),
  projed_core.meeting_asr_prepare_budget_scope_v1(date),projed_core.meeting_asr_prepare_budget_guard_v1(),
  projed_core.prepare_meeting_cloud_speech_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_cloud_speech_reservation_v1(uuid),
  projed_core.meeting_asr_prepare_scope_v1(uuid,uuid),projed_core.meeting_asr_prepare_run_guard_v1(),
  projed_core.meeting_asr_prepare_budget_scope_v1(date),projed_core.meeting_asr_prepare_budget_guard_v1(),
  projed_core.prepare_meeting_cloud_speech_v1(uuid) TO projed_runtime_disposable;
