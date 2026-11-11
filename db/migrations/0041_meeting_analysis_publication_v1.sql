-- Preserve 0040 settlement behavior while using PostgreSQL-safe 1..256 length validation.

CREATE OR REPLACE FUNCTION projed_core.settle_meeting_llm_unit_v1(target_run uuid,token uuid,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE usage record;run projed_core.meeting_analysis_runs;budget record;
  checkpoint projed_core.meeting_llm_unit_checkpoints;kind_value text;code_value text;wire text;result_hash text;request_hash text;
  charge bigint;released bigint;receipt jsonb;expected jsonb;published boolean:=false;can_publish boolean:=false;actor_live boolean:=false;
  next_state text;next_error text;next_time timestamptz;next_actual bigint;checkpoint_id uuid;result jsonb;
  prior jsonb;key_name text;
  keys text[]:=ARRAY['projed.llm_phase','projed.llm_run_id','projed.llm_token','projed.llm_verified_token','projed.llm_month',
    'projed.llm_expected_run','projed.llm_expected_usage','projed.llm_expected_budget','projed.llm_expected_checkpoint','projed.llm_receipt'];
BEGIN
  IF target_run IS NULL OR token IS NULL OR payload IS NULL OR jsonb_typeof(payload)<>'object'
    OR payload-ARRAY['kind','code','usage','resultText','modelVersion','responseId']<>'{}'::jsonb
  THEN RAISE EXCEPTION 'MEETING_LLM_SETTLEMENT_INVALID' USING ERRCODE='42501';END IF;
  kind_value:=payload->>'kind';code_value:=payload->>'code';
  IF kind_value IS NULL OR kind_value NOT IN('completed','unusable','not_sent','usage_unknown')
    OR(kind_value<>'completed' AND(code_value IS NULL OR code_value !~ '^LLM_[A-Z0-9_]{1,80}$'))
    OR(kind_value<>'completed' AND payload ? 'resultText')
    OR(kind_value='completed' AND payload ? 'code')
    OR(kind_value IN('not_sent','usage_unknown') AND(payload ? 'usage' OR payload ? 'modelVersion' OR payload ? 'responseId'))
    OR(payload ? 'responseId' AND(coalesce(char_length(payload->>'responseId'),0) NOT BETWEEN 1 AND 256
      OR coalesce(payload->>'responseId','') !~ '^[a-zA-Z0-9._:/=-]+$'))
  THEN RAISE EXCEPTION 'MEETING_LLM_SETTLEMENT_INVALID' USING ERRCODE='42501';END IF;
  request_hash:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.llm_phase','settle',true),set_config('projed.llm_run_id',target_run::text,true),
    set_config('projed.llm_token',token::text,true),set_config('projed.llm_verified_token','',true);
  SELECT attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
      reserved_twd_micros,actual_twd_micros,usage_state,outcome,created_at,dispatch_state,asr_remaining_twd_micros,
      asr_operation_token,asr_manifest,llm_operation_token,llm_manifest INTO usage FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run AND llm_operation_token=token FOR UPDATE;
  IF FOUND THEN
    PERFORM set_config('projed.llm_verified_token',token::text,true),set_config('projed.llm_month',usage.dispatch_month::text,true);
    IF usage.usage_state IN('known','unknown') THEN
      IF usage.llm_manifest->'settlement' IS NOT NULL THEN
        IF usage.llm_manifest#>>'{settlement,requestHash}' IS DISTINCT FROM request_hash THEN
          RAISE EXCEPTION 'MEETING_LLM_SETTLEMENT_CONFLICT' USING ERRCODE='42501';END IF;
        result:=usage.llm_manifest->'settlement';
      ELSIF usage.usage_state='known' AND usage.actual_twd_micros=0 AND usage.outcome='cancelled_before_dispatch' AND kind_value='not_sent' THEN
        result:=jsonb_build_object('kind','not_sent','published',false,'chargeMicros',0,'requestHash',request_hash,'costBasis','budget_estimate_not_invoice');
      ELSE RAISE EXCEPTION 'MEETING_LLM_SETTLEMENT_CONFLICT' USING ERRCODE='42501';END IF;
    ELSIF usage.usage_state='reserved' THEN
      IF kind_value IN('completed','unusable') THEN
        IF jsonb_typeof(payload->'usage') IS DISTINCT FROM 'object'
          OR((usage.llm_manifest->>'stage'='retrieve') AND(payload->'usage')-ARRAY['tokenCount','billableCharacterCount']<>'{}'::jsonb)
          OR((usage.llm_manifest->>'stage'<>'retrieve') AND(payload->'usage')-ARRAY['promptTokens','candidateTokens','thoughtTokens','totalTokens','cachedTokens']<>'{}'::jsonb)
          OR((usage.llm_manifest->>'stage'<>'retrieve') AND coalesce(payload->>'modelVersion','') !~ '^gemini-3\.5-flash(-[0-9]{3})?$')
          OR((usage.llm_manifest->>'stage'='retrieve') AND payload ? 'modelVersion'
            AND payload->>'modelVersion' IS DISTINCT FROM 'gemini-embedding-001')
          OR(kind_value='completed' AND coalesce(payload#>>'{usage,cachedTokens}','0')::numeric<>0)
        THEN RAISE EXCEPTION 'MEETING_LLM_USAGE_INVALID' USING ERRCODE='42501';END IF;
      END IF;
      IF kind_value<>'not_sent' AND usage.dispatch_state IS DISTINCT FROM 'dispatched'
      THEN RAISE EXCEPTION 'MEETING_LLM_RESPONSE_BEFORE_DISPATCH' USING ERRCODE='42501';END IF;
      charge:=CASE WHEN kind_value='not_sent' THEN 0 WHEN kind_value='usage_unknown' THEN NULL
        ELSE projed_core.meeting_llm_charge_v1(usage.llm_manifest->>'stage',payload->'usage',(usage.llm_manifest->>'queryUtf8Bytes')::integer) END;
      IF kind_value IN('completed','unusable') AND charge IS NULL THEN
        RAISE EXCEPTION 'MEETING_LLM_USAGE_INVALID' USING ERRCODE='42501';END IF;
      IF charge<0 OR charge>usage.reserved_twd_micros THEN RAISE EXCEPTION 'MEETING_LLM_USAGE_INVALID' USING ERRCODE='42501';END IF;
      SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run FOR UPDATE;
      actor_live:=FOUND AND run.state='running' AND run.lease_token=token AND projed_core.meeting_llm_live_v1(target_run);
      can_publish:=actor_live AND run.lease_expires_at>clock_timestamp();
      IF kind_value='completed' THEN
        wire:=payload->>'resultText';
        IF wire IS NULL OR octet_length(wire) NOT BETWEEN 2 AND 1048576 OR jsonb_typeof(wire::jsonb)<>'object'
        THEN RAISE EXCEPTION 'MEETING_LLM_RESULT_INVALID' USING ERRCODE='42501';END IF;
        result_hash:=encode(sha256(convert_to(wire,'UTF8')),'hex');
        IF can_publish THEN
          SELECT * INTO checkpoint FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id
            AND stage=usage.llm_manifest->>'stage' AND unit_key=usage.llm_manifest->>'unitKey'
            AND input_hash=usage.llm_manifest->>'inputHash' AND slot='result';
          IF FOUND THEN
            IF checkpoint.payload_text<>wire OR checkpoint.attempt_id<>usage.attempt_id THEN
              RAISE EXCEPTION 'MEETING_LLM_RESULT_CONFLICT' USING ERRCODE='42501';END IF;
          ELSE
            checkpoint_id:=gen_random_uuid();
            expected:=jsonb_build_object('id',checkpoint_id,'capture_id',run.capture_id,'run_id',run.id,'source_version',run.source_version,
              'transcript_revision_id',run.transcript_revision_id,'stage',usage.llm_manifest->>'stage','unit_key',usage.llm_manifest->>'unitKey',
              'input_hash',usage.llm_manifest->>'inputHash','slot','result','attempt_id',usage.attempt_id,'payload_text',wire,'payload_hash',result_hash);
            PERFORM set_config('projed.llm_expected_checkpoint',expected::text,true);
            INSERT INTO projed_core.meeting_llm_unit_checkpoints(id,capture_id,run_id,source_version,transcript_revision_id,stage,unit_key,
              input_hash,slot,attempt_id,payload_text,payload_hash)
              VALUES(checkpoint_id,run.capture_id,run.id,run.source_version,run.transcript_revision_id,usage.llm_manifest->>'stage',
                usage.llm_manifest->>'unitKey',usage.llm_manifest->>'inputHash','result',usage.attempt_id,wire,result_hash);
          END IF;
          published:=true;
        END IF;
      END IF;
      receipt:=jsonb_build_object('kind',kind_value,'published',published,'chargeMicros',charge,'requestHash',request_hash,
        'resultHash',result_hash,'costBasis','budget_estimate_not_invoice','usage',payload->'usage',
        'modelVersion',payload->>'modelVersion','responseId',payload->>'responseId');
      PERFORM set_config('projed.llm_receipt',receipt::text,true);
      SELECT budget_month,limit_twd_micros,reserved_twd_micros,spent_twd_micros
          INTO STRICT budget FROM projed_core.meeting_ai_budget_months WHERE budget_month=usage.dispatch_month FOR UPDATE;
      released:=CASE WHEN kind_value='usage_unknown' THEN 0 ELSE usage.reserved_twd_micros END;
      IF budget.reserved_twd_micros<released OR budget.spent_twd_micros<0
      THEN RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501';END IF;
      expected:=(to_jsonb(budget)-'updated_at')||jsonb_build_object('reserved_twd_micros',budget.reserved_twd_micros-released,
        'spent_twd_micros',budget.spent_twd_micros+coalesce(charge,0));
      PERFORM set_config('projed.llm_expected_budget',expected::text,true);
      UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros-released,
        spent_twd_micros=spent_twd_micros+coalesce(charge,0),updated_at=now() WHERE budget_month=usage.dispatch_month;
      expected:=(to_jsonb(usage)-ARRAY['created_at','updated_at'])||jsonb_build_object('actual_twd_micros',charge,
        'usage_state',CASE WHEN kind_value='usage_unknown' THEN 'unknown' ELSE 'known' END,
        'outcome',coalesce(code_value,kind_value),'llm_manifest',usage.llm_manifest||jsonb_build_object('settlement',receipt));
      PERFORM set_config('projed.llm_expected_usage',expected::text,true);
      UPDATE projed_core.meeting_ai_usage_attempts SET actual_twd_micros=charge,
        usage_state=CASE WHEN kind_value='usage_unknown' THEN 'unknown' ELSE 'known' END,outcome=coalesce(code_value,kind_value),
        llm_manifest=usage.llm_manifest||jsonb_build_object('settlement',receipt),updated_at=now() WHERE attempt_id=usage.attempt_id;
      -- A stale token can settle only its own ledger row, never a newer lease.
      IF run.id IS NOT NULL AND run.state='running' AND run.lease_token=token THEN
        next_state:=CASE WHEN published THEN 'queued'
          WHEN kind_value='not_sent' AND actor_live AND(usage.llm_manifest->>'attempt')::integer<2 THEN 'queued'
          ELSE 'failed_terminal' END;
        next_error:=CASE WHEN published THEN NULL ELSE coalesce(code_value,'LLM_RESULT_NOT_COMMITTED') END;
        next_time:=CASE WHEN next_state='queued' THEN clock_timestamp() ELSE run.next_attempt_at END;
        next_actual:=CASE WHEN charge IS NULL THEN run.actual_twd_micros ELSE coalesce(run.actual_twd_micros,0)+charge END;
        expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('state',next_state,'lease_token',NULL,'lease_expires_at',NULL,
          'next_attempt_at',next_time,'actual_twd_micros',next_actual,'error_code',next_error);
        PERFORM set_config('projed.llm_expected_run',expected::text,true);
        UPDATE projed_core.meeting_analysis_runs SET state=next_state,lease_token=NULL,lease_expires_at=NULL,
          next_attempt_at=next_time,actual_twd_micros=next_actual,error_code=next_error,updated_at=now() WHERE id=run.id;
      END IF;
      result:=receipt;
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN result;
END;
$$;

-- No-provider progress and the final atomic handoff to existing human review.
-- Provider payloads/summary remain private checkpoints, never run/scan metadata.
CREATE FUNCTION projed_core.meeting_analysis_write_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE phase text:=current_setting('projed.analysis_phase',true);expected jsonb;
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW;END IF;
  IF coalesce(phase,'') NOT IN('local','publish') THEN
    IF TG_TABLE_NAME='meeting_capture_sessions' THEN
      IF NEW.active_transcript_revision_id IS DISTINCT FROM OLD.active_transcript_revision_id
      THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SCOPE_INVALID' USING ERRCODE='42501';END IF;
    ELSIF TG_TABLE_NAME='meeting_task_match_results' THEN
      IF TG_OP='INSERT' AND(NEW.quote_range IS NOT NULL OR NEW.semantic_score IS NOT NULL OR NEW.pointer_feature IS NOT NULL)
      THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SCOPE_INVALID' USING ERRCODE='42501';END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('projed.llm_phase',true),'')<>''
    OR coalesce(current_setting('projed.meeting_asr_phase',true),'')<>''
    OR coalesce(current_setting('projed.discussion_phase',true),'')<>''
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SCOPE_INVALID' USING ERRCODE='42501';END IF;
  expected:=nullif(current_setting('projed.analysis_expected_row',true),'')::jsonb;
  IF expected IS NULL OR(to_jsonb(NEW)-ARRAY['created_at','updated_at']) IS DISTINCT FROM expected
    OR current_setting('projed.analysis_table',true) IS DISTINCT FROM TG_TABLE_NAME
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_WRITE_INVALID' USING ERRCODE='42501';END IF;
  IF TG_TABLE_NAME='meeting_llm_unit_checkpoints' THEN
    IF TG_OP<>'INSERT' OR NEW.run_id::text IS DISTINCT FROM current_setting('projed.analysis_run_id',true)
      OR NEW.capture_id::text IS DISTINCT FROM current_setting('projed.analysis_capture_id',true)
      OR NOT projed_core.meeting_llm_live_v1(NEW.run_id)
      OR(phase='local' AND(NEW.stage<>'match' OR NEW.slot='result' AND NEW.payload_text<>'{"matches":[]}'))
      OR(phase='publish' AND(NEW.stage<>'compose' OR NEW.unit_key<>'final'))
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_CHECKPOINT_INVALID' USING ERRCODE='42501';END IF;
  ELSIF TG_TABLE_NAME='meeting_analysis_runs' THEN
    IF phase<>'publish' OR TG_OP<>'UPDATE' OR OLD.id::text IS DISTINCT FROM current_setting('projed.analysis_run_id',true)
      OR OLD.state NOT IN('queued','awaiting_budget') OR OLD.lease_token IS NOT NULL OR OLD.lease_expires_at IS NOT NULL
      OR NEW.state<>'ready' OR NEW.resume_stage<>'complete' OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR OLD.deadline_at<=clock_timestamp() OR NOT projed_core.meeting_llm_private_scope_v1(OLD.id,OLD.capture_id)
      OR(to_jsonb(NEW)-ARRAY['state','resume_stage','error_code','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','resume_stage','error_code','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_RUN_INVALID' USING ERRCODE='42501';END IF;
  ELSIF TG_TABLE_NAME='meeting_capture_sessions' THEN
    IF phase<>'publish' OR TG_OP<>'UPDATE' OR OLD.id::text IS DISTINCT FROM current_setting('projed.analysis_capture_id',true)
      OR OLD.state NOT IN('queued','running') OR NEW.state<>'ready'
      OR NOT projed_core.meeting_llm_live_v1(nullif(current_setting('projed.analysis_run_id',true),'')::uuid)
      OR(to_jsonb(NEW)-ARRAY['state','active_transcript_revision_id','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','active_transcript_revision_id','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_CAPTURE_INVALID' USING ERRCODE='42501';END IF;
  ELSIF phase<>'publish' OR TG_OP<>'INSERT' OR NEW.capture_id::text IS DISTINCT FROM current_setting('projed.analysis_capture_id',true) THEN
    RAISE EXCEPTION 'MEETING_PUBLICATION_REVIEW_INVALID' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_analysis_checkpoint_guard_v1 BEFORE INSERT ON projed_core.meeting_llm_unit_checkpoints
  FOR EACH ROW WHEN(current_setting('projed.analysis_phase',true) IN('local','publish'))
  EXECUTE FUNCTION projed_core.meeting_analysis_write_guard_v1();
CREATE TRIGGER meeting_analysis_capture_guard_v1 BEFORE UPDATE ON projed_core.meeting_capture_sessions
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_analysis_write_guard_v1();
CREATE TRIGGER meeting_analysis_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.analysis_phase',true)='publish')
  EXECUTE FUNCTION projed_core.meeting_analysis_write_guard_v1();
CREATE TRIGGER meeting_analysis_resolution_guard_v1 BEFORE INSERT ON projed_core.meeting_segment_resolutions
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_analysis_write_guard_v1();
CREATE TRIGGER meeting_analysis_match_guard_v1 BEFORE INSERT ON projed_core.meeting_task_match_results
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_analysis_write_guard_v1();
DROP TRIGGER meeting_run_cancel_guard_v1 ON projed_core.meeting_analysis_runs;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'prepare'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'abandon'
    AND current_setting('projed.discussion_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.discussion_phase',true) IS DISTINCT FROM 'append'
    AND current_setting('projed.discussion_phase',true) IS DISTINCT FROM 'finish'
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'settle'
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'finish'
    AND current_setting('projed.analysis_phase',true) IS DISTINCT FROM 'publish')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();

CREATE POLICY meeting_analysis_local_insert_v1 ON projed_core.meeting_llm_unit_checkpoints
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.analysis_phase',true)='local'
    AND run_id::text=current_setting('projed.analysis_run_id',true) AND stage='match'
    AND projed_core.meeting_llm_live_v1(run_id));
CREATE POLICY meeting_analysis_final_insert_v1 ON projed_core.meeting_llm_unit_checkpoints
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.analysis_phase',true)='publish'
    AND run_id::text=current_setting('projed.analysis_run_id',true) AND stage='compose' AND unit_key='final'
    AND projed_core.meeting_llm_live_v1(run_id));
CREATE POLICY meeting_published_summary_read_v1 ON projed_core.meeting_llm_unit_checkpoints
  FOR SELECT TO projed_runtime_disposable USING(stage='compose' AND unit_key='final' AND slot='result'
    AND projed_core.meeting_capture_visible_v1(capture_id)
    AND EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
      WHERE run.id=meeting_llm_unit_checkpoints.run_id AND run.capture_id=meeting_llm_unit_checkpoints.capture_id AND run.state='ready'
        AND capture.active_transcript_revision_id=meeting_llm_unit_checkpoints.transcript_revision_id
        AND capture.source_version=meeting_llm_unit_checkpoints.source_version));
CREATE POLICY meeting_analysis_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING(current_setting('projed.analysis_phase',true)='publish'
    AND run_id::text=current_setting('projed.analysis_run_id',true)
    AND projed_core.meeting_llm_private_scope_v1(run_id,capture_id));
CREATE POLICY meeting_analysis_run_update_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.analysis_phase',true)='publish'
    AND id::text=current_setting('projed.analysis_run_id',true) AND projed_core.meeting_llm_private_scope_v1(id,capture_id))
  WITH CHECK(state='ready' AND projed_core.meeting_llm_private_scope_v1(id,capture_id));
CREATE POLICY meeting_analysis_resolution_insert_v1 ON projed_core.meeting_segment_resolutions
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.analysis_phase',true)='publish'
    AND capture_id::text=current_setting('projed.analysis_capture_id',true)
    AND latest_run_id::text=current_setting('projed.analysis_run_id',true)
    AND NOT human_reviewed AND NOT human_empty_decision AND revision=0 AND protected_source_ranges='[]'::jsonb
    AND resolution_state='needs_review');
CREATE POLICY meeting_analysis_match_insert_v1 ON projed_core.meeting_task_match_results
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.analysis_phase',true)='publish'
    AND capture_id::text=current_setting('projed.analysis_capture_id',true) AND decision='suggested' AND decision_source='ai'
    AND corrected_by IS NULL AND corrected_at IS NULL
    AND EXISTS(SELECT 1 FROM projed_core.meeting_segment_resolutions resolution WHERE resolution.id=resolution_id
      AND resolution.capture_id=meeting_task_match_results.capture_id
      AND resolution.latest_run_id::text=current_setting('projed.analysis_run_id',true)
      AND NOT resolution.human_reviewed AND NOT resolution.human_empty_decision AND resolution.protected_source_ranges='[]'::jsonb));
GRANT UPDATE(active_transcript_revision_id) ON projed_core.meeting_capture_sessions TO projed_runtime_disposable;
GRANT INSERT(id,capture_id,transcript_segment_id,candidate_snapshot,latest_run_id,resolution_state,config_version)
  ON projed_core.meeting_segment_resolutions TO projed_runtime_disposable;
GRANT INSERT(quote_range,semantic_score,pointer_feature) ON projed_core.meeting_task_match_results TO projed_runtime_disposable;

CREATE FUNCTION projed_core.commit_meeting_local_match_v1(target_run uuid,unit jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;source projed_core.meeting_transcript_segments;item projed_core.meeting_llm_unit_checkpoints;
  wire text;input jsonb;input_hash_value text;key_value text;prior jsonb;key_name text;slot_value text;payload text;expected jsonb;
  keys text[]:=ARRAY['projed.analysis_phase','projed.analysis_run_id','projed.analysis_capture_id','projed.analysis_table','projed.analysis_expected_row'];
BEGIN
  IF target_run IS NULL OR unit IS NULL OR jsonb_typeof(unit)<>'object' OR unit->>'stage' IS DISTINCT FROM 'match'
    OR unit-ARRAY['stage','unitKey','inputHash','inputText']<>'{}'::jsonb
  THEN RAISE EXCEPTION 'MEETING_LOCAL_UNIT_INVALID' USING ERRCODE='42501';END IF;
  wire:=unit->>'inputText';input_hash_value:=unit->>'inputHash';key_value:=unit->>'unitKey';
  IF wire IS NULL OR octet_length(wire) NOT BETWEEN 2 AND 1048576 OR input_hash_value IS DISTINCT FROM encode(sha256(convert_to(wire,'UTF8')),'hex')
    OR key_value IS NULL OR key_value !~ '^[0-9a-f-]{36}$'
  THEN RAISE EXCEPTION 'MEETING_LOCAL_UNIT_INVALID' USING ERRCODE='42501';END IF;
  input:=wire::jsonb;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  -- All runtime mutations share the app transaction lock above. This local
  -- operation never updates the run; FOR UPDATE would incorrectly require an
  -- unrelated UPDATE policy and hide an otherwise readable live source.
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run;
  IF NOT FOUND OR NOT projed_core.meeting_llm_live_v1(target_run) OR run.state NOT IN('queued','awaiting_budget')
    OR run.lease_token IS NOT NULL OR run.lease_expires_at IS NOT NULL
  THEN RETURN false;END IF;
  SELECT * INTO source FROM projed_core.meeting_transcript_segments WHERE id=key_value::uuid AND producer_run_id=run.id
    AND transcript_revision_id=run.transcript_revision_id AND capture_id=run.capture_id;
  IF NOT FOUND OR input->>'configVersion' IS DISTINCT FROM 'dev139.meeting-llm.v1'
    OR input->>'sourceVersion' IS DISTINCT FROM run.source_version::text
    OR input->>'transcriptRevisionId' IS DISTINCT FROM run.transcript_revision_id::text
    OR input#>'{body,candidates}' IS DISTINCT FROM '[]'::jsonb
    OR input#>'{body,discussion}' IS DISTINCT FROM jsonb_build_object('segmentIndex',source.segment_index,'rawText',source.raw_text,
      'normalizedText',source.normalized_text,'startOffsetMs',source.start_offset_ms,'endOffsetMs',source.end_offset_ms,
      'wordOffsets',source.word_offsets,'sourceAudioRanges',source.source_audio_ranges,'sourceHash',source.source_hash)
  THEN RAISE EXCEPTION 'MEETING_LOCAL_SOURCE_INVALID' USING ERRCODE='42501';END IF;
  PERFORM set_config('projed.analysis_phase','local',true),set_config('projed.analysis_run_id',run.id::text,true),
    set_config('projed.analysis_capture_id',run.capture_id::text,true),set_config('projed.analysis_table','meeting_llm_unit_checkpoints',true);
  FOREACH slot_value IN ARRAY ARRAY['input','result'] LOOP
    payload:=CASE WHEN slot_value='input' THEN wire ELSE '{"matches":[]}' END;
    SELECT * INTO item FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id AND stage='match'
      AND unit_key=key_value AND input_hash=input_hash_value AND slot=slot_value;
    IF FOUND THEN
      IF item.payload_text<>payload OR(slot_value='result' AND item.attempt_id IS DISTINCT FROM 'local:'||run.id::text||':'||input_hash_value)
      THEN RAISE EXCEPTION 'MEETING_LOCAL_RESULT_CONFLICT' USING ERRCODE='42501';END IF;
    ELSE
      expected:=jsonb_build_object('id',gen_random_uuid(),'capture_id',run.capture_id,'run_id',run.id,'source_version',run.source_version,
        'transcript_revision_id',run.transcript_revision_id,'stage','match','unit_key',key_value,'input_hash',input_hash_value,'slot',slot_value,
        'attempt_id',CASE WHEN slot_value='result' THEN 'local:'||run.id::text||':'||input_hash_value ELSE NULL END,
        'payload_text',payload,'payload_hash',encode(sha256(convert_to(payload,'UTF8')),'hex'));
      PERFORM set_config('projed.analysis_expected_row',expected::text,true);
      INSERT INTO projed_core.meeting_llm_unit_checkpoints(id,capture_id,run_id,source_version,transcript_revision_id,stage,unit_key,input_hash,
        slot,attempt_id,payload_text,payload_hash) VALUES((expected->>'id')::uuid,run.capture_id,run.id,run.source_version,run.transcript_revision_id,
          'match',key_value,input_hash_value,slot_value,expected->>'attempt_id',payload,expected->>'payload_hash');
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION projed_core.publish_meeting_analysis_v1(target_run uuid,payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;capture projed_core.meeting_capture_sessions;source projed_core.meeting_transcript_segments;
  checkpoint projed_core.meeting_llm_unit_checkpoints;resolution projed_core.meeting_segment_resolutions;
  proof jsonb;discussion jsonb;candidate jsonb;model_match jsonb;expected jsonb;prior jsonb;key_name text;summary_value text;
  source_ids jsonb;publication_hash text;wire text;input_hash_value text;slot_value text;body text;resolution_id uuid;match_id uuid;
  match_quote jsonb;semantic numeric;pointer numeric;source_count integer;proof_count integer;match_proof jsonb;
  selected_snapshots jsonb;expected_snapshots jsonb;review_candidates jsonb;
  keys text[]:=ARRAY['projed.analysis_phase','projed.analysis_run_id','projed.analysis_capture_id','projed.analysis_table','projed.analysis_expected_row'];
BEGIN
  IF target_run IS NULL OR payload IS NULL OR jsonb_typeof(payload)<>'object'
    OR payload-ARRAY['sourceVersion','transcriptRevisionId','summary','discussions','proofs']<>'{}'::jsonb
    OR jsonb_typeof(payload->'discussions') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'proofs') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_INVALID' USING ERRCODE='42501';END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  -- Serialize through the existing app lock without requiring UPDATE authority
  -- before this function establishes its exact publication phase below.
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run;
  IF NOT FOUND OR NOT projed_core.meeting_llm_live_v1(target_run) OR run.state NOT IN('queued','awaiting_budget')
    OR run.lease_token IS NOT NULL OR run.lease_expires_at IS NOT NULL OR run.cleanup_pending
  THEN RETURN false;END IF;
  SELECT * INTO capture FROM projed_core.meeting_capture_sessions WHERE id=run.capture_id FOR UPDATE;
  IF payload->>'sourceVersion' IS DISTINCT FROM run.source_version::text
    OR payload->>'transcriptRevisionId' IS DISTINCT FROM run.transcript_revision_id::text
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SOURCE_INVALID' USING ERRCODE='42501';END IF;
  PERFORM set_config('projed.analysis_phase','publish',true),set_config('projed.analysis_run_id',run.id::text,true),
    set_config('projed.analysis_capture_id',run.capture_id::text,true);
  IF EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts WHERE run_id=run.id AND usage_state NOT IN('known','reconciled'))
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_USAGE_UNRESOLVED' USING ERRCODE='42501';END IF;
  SELECT count(*)::integer,coalesce(jsonb_agg(id::text ORDER BY segment_index),'[]'::jsonb) INTO source_count,source_ids
    FROM projed_core.meeting_transcript_segments WHERE producer_run_id=run.id AND transcript_revision_id=run.transcript_revision_id;
  IF jsonb_array_length(payload->'discussions')<>source_count OR(SELECT count(DISTINCT value->>'segmentId') FROM jsonb_array_elements(payload->'discussions'))<>source_count
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_COVERAGE_INVALID' USING ERRCODE='42501';END IF;
  FOR proof IN SELECT value FROM jsonb_array_elements(payload->'proofs') LOOP
    IF jsonb_typeof(proof)<>'object' OR proof-ARRAY['stage','unitKey','inputHash','resultHash']<>'{}'::jsonb
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_PROOF_INVALID' USING ERRCODE='42501';END IF;
    SELECT * INTO checkpoint FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id AND source_version=run.source_version
      AND transcript_revision_id=run.transcript_revision_id AND stage=proof->>'stage' AND unit_key=proof->>'unitKey'
      AND input_hash=proof->>'inputHash' AND slot='result' AND payload_hash=proof->>'resultHash';
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM projed_core.meeting_llm_unit_checkpoints input_row WHERE input_row.run_id=run.id
      AND input_row.stage=checkpoint.stage AND input_row.unit_key=checkpoint.unit_key AND input_row.input_hash=checkpoint.input_hash AND input_row.slot='input')
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_PROOF_INVALID' USING ERRCODE='42501';END IF;
    IF checkpoint.attempt_id IS DISTINCT FROM 'local:'||run.id::text||':'||checkpoint.input_hash
      AND NOT EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts usage WHERE usage.attempt_id=checkpoint.attempt_id
        AND usage.run_id=run.id AND usage.usage_state='known' AND usage.llm_manifest#>'{settlement,published}'='true'::jsonb
        AND usage.llm_manifest#>>'{settlement,resultHash}'=checkpoint.payload_hash
        AND usage.llm_manifest->>'stage'=checkpoint.stage AND usage.llm_manifest->>'unitKey'=checkpoint.unit_key
        AND usage.llm_manifest->>'inputHash'=checkpoint.input_hash)
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_USAGE_INVALID' USING ERRCODE='42501';END IF;
    IF checkpoint.attempt_id='local:'||run.id::text||':'||checkpoint.input_hash
      AND(checkpoint.stage<>'match' OR checkpoint.payload_text<>'{"matches":[]}')
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_LOCAL_INVALID' USING ERRCODE='42501';END IF;
  END LOOP;
  summary_value:=payload->>'summary';
  IF(source_count=0 AND summary_value IS NOT NULL) OR(source_count>0 AND(summary_value IS NULL OR char_length(summary_value) NOT BETWEEN 1 AND 2000))
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SUMMARY_INVALID' USING ERRCODE='42501';END IF;
  IF source_count=1 AND summary_value IS DISTINCT FROM(SELECT raw_text FROM projed_core.meeting_transcript_segments WHERE producer_run_id=run.id
    AND transcript_revision_id=run.transcript_revision_id) THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SUMMARY_INVALID' USING ERRCODE='42501';END IF;
  IF source_count>1 AND NOT EXISTS(SELECT 1 FROM projed_core.meeting_llm_unit_checkpoints summary_checkpoint,
    LATERAL jsonb_array_elements(payload->'proofs') proof_row(value) WHERE summary_checkpoint.run_id=run.id AND summary_checkpoint.stage='compose'
      AND summary_checkpoint.unit_key=proof_row.value->>'unitKey' AND summary_checkpoint.input_hash=proof_row.value->>'inputHash'
      AND summary_checkpoint.payload_hash=proof_row.value->>'resultHash' AND proof_row.value->>'stage'='compose' AND summary_checkpoint.slot='result'
      AND summary_checkpoint.payload_text::jsonb#>>'{result,summary}'=summary_value AND summary_checkpoint.payload_text::jsonb#>'{result,sourceIds}'=source_ids)
  THEN RAISE EXCEPTION 'MEETING_PUBLICATION_SUMMARY_INVALID' USING ERRCODE='42501';END IF;
  FOR discussion IN SELECT value FROM jsonb_array_elements(payload->'discussions') LOOP
    SELECT * INTO source FROM projed_core.meeting_transcript_segments WHERE id=(discussion->>'segmentId')::uuid
      AND producer_run_id=run.id AND transcript_revision_id=run.transcript_revision_id;
    IF NOT FOUND OR jsonb_typeof(discussion->'candidates') IS DISTINCT FROM 'array'
      OR jsonb_array_length(discussion->'candidates')>12 OR jsonb_typeof(discussion->'matches') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_DISCUSSION_INVALID' USING ERRCODE='42501';END IF;
    SELECT count(*)::integer INTO proof_count FROM jsonb_array_elements(payload->'proofs') proof_row(value)
      WHERE proof_row.value->>'stage'='match' AND proof_row.value->>'unitKey'=source.id::text;
    IF proof_count<>1 THEN RAISE EXCEPTION 'MEETING_PUBLICATION_COVERAGE_INVALID' USING ERRCODE='42501';END IF;
    SELECT proof_row.value INTO match_proof FROM jsonb_array_elements(payload->'proofs') proof_row(value)
      WHERE proof_row.value->>'stage'='match' AND proof_row.value->>'unitKey'=source.id::text;
    SELECT * INTO checkpoint FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id AND stage='match' AND unit_key=source.id::text
      AND input_hash=match_proof->>'inputHash' AND slot='result';
    IF checkpoint.payload_text::jsonb->'matches' IS DISTINCT FROM discussion->'matches'
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_MATCH_INVALID' USING ERRCODE='42501';END IF;
    SELECT payload_text::jsonb#>'{body,candidates}' INTO expected_snapshots FROM projed_core.meeting_llm_unit_checkpoints
      WHERE run_id=run.id AND stage='match' AND unit_key=source.id::text AND input_hash=match_proof->>'inputHash' AND slot='input';
    SELECT coalesce(jsonb_agg(value-ARRAY['lexicalScore','ragScore','pointerFeature']),'[]'::jsonb) INTO selected_snapshots
      FROM jsonb_array_elements(discussion->'candidates');
    IF expected_snapshots IS DISTINCT FROM selected_snapshots
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_CANDIDATES_INVALID' USING ERRCODE='42501';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(discussion->'matches') match(value)
      WHERE match.value->>'relation' IS NULL OR match.value->>'relation' NOT IN('related','decision','action'))
    THEN RAISE EXCEPTION 'MEETING_PUBLICATION_MATCH_INVALID' USING ERRCODE='42501';END IF;
    SELECT coalesce(jsonb_agg(candidate_row.value||coalesce((SELECT jsonb_build_object('modelRelation',match.value->'relation')
      FROM jsonb_array_elements(discussion->'matches') match(value)
      WHERE match.value->>'candidateTaskId'=candidate_row.value->>'taskId'),'{}'::jsonb)),'[]'::jsonb)
      INTO review_candidates FROM jsonb_array_elements(discussion->'candidates') candidate_row(value);
    SELECT * INTO resolution FROM projed_core.meeting_segment_resolutions WHERE capture_id=run.capture_id AND transcript_segment_id=source.id;
    IF FOUND THEN
      IF resolution.human_reviewed OR resolution.human_empty_decision OR resolution.protected_source_ranges<>'[]'::jsonb THEN CONTINUE;END IF;
      RAISE EXCEPTION 'MEETING_PUBLICATION_EXISTING_RESULTS' USING ERRCODE='42501';
    END IF;
    resolution_id:=gen_random_uuid();
    expected:=to_jsonb(jsonb_populate_record(NULL::projed_core.meeting_segment_resolutions,jsonb_build_object('id',resolution_id,
      'capture_id',run.capture_id,'transcript_segment_id',source.id,'candidate_snapshot',review_candidates,'latest_run_id',run.id,
      'resolution_state','needs_review','revision',0,'human_reviewed',false,'human_empty_decision',false,'protected_source_ranges','[]'::jsonb,
      'config_version','dev139.meeting-llm.v1')))-ARRAY['created_at','updated_at'];
    PERFORM set_config('projed.analysis_table','meeting_segment_resolutions',true),set_config('projed.analysis_expected_row',expected::text,true);
    INSERT INTO projed_core.meeting_segment_resolutions(id,capture_id,transcript_segment_id,candidate_snapshot,latest_run_id,resolution_state,config_version)
      VALUES(resolution_id,run.capture_id,source.id,review_candidates,run.id,'needs_review','dev139.meeting-llm.v1');
    FOR candidate IN SELECT value FROM jsonb_array_elements(discussion->'candidates') LOOP
      IF NOT EXISTS(SELECT 1 FROM projed_core.wbs_items task WHERE task.id=(candidate->>'taskId')::uuid AND task.tenant_id=capture.tenant_id
        AND task.project_id=capture.project_id AND NOT task.archived AND(task.node_type IS NULL OR task.node_type IN('task','milestone')))
      THEN RAISE EXCEPTION 'MEETING_PUBLICATION_TASK_INVALID' USING ERRCODE='42501';END IF;
      SELECT value INTO model_match FROM jsonb_array_elements(discussion->'matches') WHERE value->>'candidateTaskId'=candidate->>'taskId';
      pointer:=(candidate->>'pointerFeature')::numeric;semantic:=CASE WHEN model_match IS NULL THEN 0 ELSE(model_match->>'evidenceScore')::numeric END;
      IF pointer IS NULL OR pointer NOT BETWEEN 0 AND 1 OR semantic IS NULL OR semantic NOT BETWEEN 0 AND 1
      THEN RAISE EXCEPTION 'MEETING_PUBLICATION_MATCH_INVALID' USING ERRCODE='42501';END IF;
      IF model_match IS NULL AND pointer=0 THEN CONTINUE;END IF;
      match_quote:=model_match->'quote';
      IF model_match IS NOT NULL AND(jsonb_typeof(match_quote) IS DISTINCT FROM 'object'
        OR match_quote-ARRAY['fromWord','toWord']<>'{}'::jsonb
        OR jsonb_typeof(match_quote->'fromWord') IS DISTINCT FROM 'number' OR jsonb_typeof(match_quote->'toWord') IS DISTINCT FROM 'number'
        OR trunc((match_quote->>'fromWord')::numeric)<>(match_quote->>'fromWord')::numeric
        OR trunc((match_quote->>'toWord')::numeric)<>(match_quote->>'toWord')::numeric
        OR(match_quote->>'fromWord')::integer<0 OR(match_quote->>'toWord')::integer<(match_quote->>'fromWord')::integer
        OR(match_quote->>'toWord')::integer>=jsonb_array_length(source.word_offsets))
      THEN RAISE EXCEPTION 'MEETING_PUBLICATION_QUOTE_INVALID' USING ERRCODE='42501';END IF;
      match_id:=gen_random_uuid();
      expected:=to_jsonb(jsonb_populate_record(NULL::projed_core.meeting_task_match_results,jsonb_build_object('id',match_id,'resolution_id',resolution_id,
        'task_id',candidate->>'taskId','quote_range',match_quote,'semantic_score',semantic,'pointer_feature',pointer,
        'ai_suggestion_version',candidate->>'snapshotHash','decision','suggested','decision_source','ai','capture_id',run.capture_id,
        'tenant_id',capture.tenant_id,'project_id',capture.project_id)))-ARRAY['created_at','updated_at'];
      PERFORM set_config('projed.analysis_table','meeting_task_match_results',true),set_config('projed.analysis_expected_row',expected::text,true);
      INSERT INTO projed_core.meeting_task_match_results(id,resolution_id,task_id,quote_range,semantic_score,pointer_feature,ai_suggestion_version,
        decision,decision_source,capture_id,tenant_id,project_id) VALUES(match_id,resolution_id,(candidate->>'taskId')::uuid,match_quote,semantic,pointer,
          candidate->>'snapshotHash','suggested','ai',run.capture_id,capture.tenant_id,capture.project_id);
    END LOOP;
  END LOOP;
  publication_hash:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  wire:=jsonb_build_object('configVersion','dev139.meeting-llm.v1','sourceVersion',run.source_version,
    'transcriptRevisionId',run.transcript_revision_id,'body',jsonb_build_object('publicationHash',publication_hash))::text;
  input_hash_value:=encode(sha256(convert_to(wire,'UTF8')),'hex');
  FOREACH slot_value IN ARRAY ARRAY['input','result'] LOOP
    body:=CASE WHEN slot_value='input' THEN wire ELSE jsonb_build_object('summary',summary_value)::text END;
    expected:=jsonb_build_object('id',gen_random_uuid(),'capture_id',run.capture_id,'run_id',run.id,'source_version',run.source_version,
      'transcript_revision_id',run.transcript_revision_id,'stage','compose','unit_key','final','input_hash',input_hash_value,'slot',slot_value,
      'attempt_id',CASE WHEN slot_value='result' THEN 'publication:'||run.id::text ELSE NULL END,'payload_text',body,
      'payload_hash',encode(sha256(convert_to(body,'UTF8')),'hex'));
    PERFORM set_config('projed.analysis_table','meeting_llm_unit_checkpoints',true),set_config('projed.analysis_expected_row',expected::text,true);
    INSERT INTO projed_core.meeting_llm_unit_checkpoints(id,capture_id,run_id,source_version,transcript_revision_id,stage,unit_key,input_hash,
      slot,attempt_id,payload_text,payload_hash) VALUES((expected->>'id')::uuid,run.capture_id,run.id,run.source_version,run.transcript_revision_id,
        'compose','final',input_hash_value,slot_value,expected->>'attempt_id',body,expected->>'payload_hash');
  END LOOP;
  expected:=(to_jsonb(capture)-ARRAY['created_at','updated_at'])||jsonb_build_object('state','ready','active_transcript_revision_id',run.transcript_revision_id);
  PERFORM set_config('projed.analysis_table','meeting_capture_sessions',true),set_config('projed.analysis_expected_row',expected::text,true);
  UPDATE projed_core.meeting_capture_sessions SET state='ready',active_transcript_revision_id=run.transcript_revision_id,updated_at=now() WHERE id=capture.id;
  expected:=(to_jsonb(run)-ARRAY['created_at','updated_at'])||jsonb_build_object('state','ready','resume_stage','complete','error_code',NULL);
  PERFORM set_config('projed.analysis_table','meeting_analysis_runs',true),set_config('projed.analysis_expected_row',expected::text,true);
  UPDATE projed_core.meeting_analysis_runs SET state='ready',resume_stage='complete',error_code=NULL,updated_at=now() WHERE id=run.id;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_analysis_write_guard_v1(),projed_core.commit_meeting_local_match_v1(uuid,jsonb),
  projed_core.publish_meeting_analysis_v1(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_analysis_write_guard_v1(),projed_core.commit_meeting_local_match_v1(uuid,jsonb),
  projed_core.publish_meeting_analysis_v1(uuid,jsonb) TO projed_runtime_disposable;
