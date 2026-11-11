-- Persist bounded discussion drafts from existing ASR checkpoints. This stage
-- has no provider calls, budget mutation, active revision or ready transition.
CREATE FUNCTION projed_core.meeting_discussion_scope_v1(target_run_id uuid,target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.discussion_phase',true) IN('claim','read','append')
    AND target_run_id::text=current_setting('projed.discussion_run_id',true)
    AND current_setting('projed.actor_entry',true)='main'
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
$$;
CREATE FUNCTION projed_core.meeting_discussion_live_v1(target_run_id uuid)
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
      AND (session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000);
$$;
CREATE POLICY meeting_discussion_run_update_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable
  USING(current_setting('projed.discussion_phase',true) IN('claim','append') AND projed_core.meeting_discussion_scope_v1(id,capture_id))
  WITH CHECK(current_setting('projed.discussion_phase',true) IN('claim','append') AND projed_core.meeting_discussion_scope_v1(id,capture_id));
CREATE POLICY meeting_discussion_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_discussion_scope_v1(run_id,capture_id)
    AND provider='google-cloud-speech' AND model='default'
    AND price_version='google-cloud-speech-v1-standard-no-data-logging-2026-10-29');
CREATE POLICY meeting_discussion_control_read_v1 ON projed_core.meeting_analysis_runs
  FOR SELECT TO projed_runtime_disposable USING(
    (current_setting('projed.discussion_phase',true)='scan'
    OR(current_setting('projed.discussion_phase',true)='finish'
      AND id::text=current_setting('projed.discussion_run_id',true)))
    AND provider_mode='cloud-speech-v1' AND config_version='dev139.cloud-speech.v1'
    AND resume_stage='retrieve' AND stage_cursor#>'{asr,done}'='true'::jsonb
    AND stage_cursor#>'{assembly,done}' IS DISTINCT FROM 'true'::jsonb);
CREATE POLICY meeting_discussion_finish_update_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.discussion_phase',true)='finish'
    AND id::text=current_setting('projed.discussion_run_id',true)
    AND provider_mode='cloud-speech-v1' AND config_version='dev139.cloud-speech.v1' AND resume_stage='retrieve'
    AND stage_cursor#>'{asr,done}'='true'::jsonb AND stage_cursor#>'{assembly,done}' IS DISTINCT FROM 'true'::jsonb)
  WITH CHECK(current_setting('projed.discussion_phase',true)='finish'
    AND id::text=current_setting('projed.discussion_run_id',true));

GRANT INSERT(id,capture_id,transcript_revision_id,producer_run_id,segment_index,source_audio_ranges,
  start_offset_ms,end_offset_ms,raw_text,normalized_text,word_offsets,source_hash)
  ON projed_core.meeting_transcript_segments TO projed_runtime_disposable;
CREATE POLICY meeting_discussion_draft_insert_v1 ON projed_core.meeting_transcript_segments
  FOR INSERT TO projed_runtime_disposable WITH CHECK(
    current_setting('projed.discussion_phase',true)='append'
    AND projed_core.meeting_discussion_scope_v1(producer_run_id,capture_id)
    AND EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run WHERE run.id=producer_run_id
      AND run.capture_id=meeting_transcript_segments.capture_id
      AND run.transcript_revision_id=meeting_transcript_segments.transcript_revision_id
      AND run.state='running' AND run.lease_token::text=current_setting('projed.discussion_token',true)
      AND run.lease_expires_at>clock_timestamp() AND projed_core.meeting_discussion_live_v1(run.id)));

CREATE FUNCTION projed_core.meeting_discussion_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE phase text;expected jsonb;
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW; END IF;
  phase:=current_setting('projed.discussion_phase',true);
  IF TG_TABLE_NAME='meeting_transcript_segments' THEN
    expected:=nullif(current_setting('projed.discussion_expected_segment',true),'')::jsonb;
    IF phase IS DISTINCT FROM 'append' OR expected IS NULL OR(to_jsonb(NEW)-'created_at') IS DISTINCT FROM expected
      OR NOT projed_core.meeting_discussion_live_v1(NEW.producer_run_id)
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_INSERT_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF phase IN('claim','append','finish') THEN
    expected:=nullif(current_setting('projed.discussion_expected_run',true),'')::jsonb;
    IF expected IS NULL OR NEW.id::text IS DISTINCT FROM current_setting('projed.discussion_run_id',true)
      OR(to_jsonb(NEW)-'updated_at') IS DISTINCT FROM expected
      OR(to_jsonb(NEW)-ARRAY['state','stage_cursor','lease_token','lease_expires_at','error_code','next_attempt_at','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','stage_cursor','lease_token','lease_expires_at','error_code','next_attempt_at','updated_at'])
      OR NEW.stage_cursor-'assembly' IS DISTINCT FROM OLD.stage_cursor-'assembly'
      OR NEW.state NOT IN('queued','running','failed_terminal')
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_TRANSITION_INVALID' USING ERRCODE='42501'; END IF;
    IF phase IN('claim','append') AND NOT projed_core.meeting_discussion_live_v1(OLD.id) THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    IF phase='claim' AND(NEW.state<>'running' OR NEW.lease_token IS NULL
      OR NEW.lease_token::text IS DISTINCT FROM current_setting('projed.discussion_token',true)
      OR NEW.lease_expires_at<=clock_timestamp() OR NEW.lease_expires_at>clock_timestamp()+interval '150 seconds'
      OR NOT((OLD.state='queued' AND OLD.lease_token IS NULL AND OLD.lease_expires_at IS NULL)
        OR(OLD.state='running' AND(OLD.lease_expires_at<=clock_timestamp() OR OLD.lease_token=NEW.lease_token))))
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
    IF phase='append' AND(OLD.state<>'running' OR OLD.lease_token::text IS DISTINCT FROM current_setting('projed.discussion_token',true)
      OR OLD.lease_expires_at<=clock_timestamp()
      OR NOT((NEW.state='running' AND NEW.lease_token=OLD.lease_token AND NEW.lease_expires_at=OLD.lease_expires_at)
        OR(NEW.state='queued' AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL)))
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_APPEND_INVALID' USING ERRCODE='42501'; END IF;
    IF phase='finish' AND(NEW.stage_cursor IS DISTINCT FROM OLD.stage_cursor OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR NOT((OLD.state='running' AND OLD.lease_token::text=current_setting('projed.discussion_token',true))
        OR(OLD.state='queued' AND OLD.lease_token IS NULL AND nullif(current_setting('projed.discussion_token',true),'') IS NULL))
      OR NOT((current_setting('projed.discussion_finish_reason',true)='yield' AND OLD.state='running' AND NEW.state='queued' AND NEW.error_code IS NULL)
        OR(current_setting('projed.discussion_finish_reason',true) IN('DISCUSSION_SESSION_UNAVAILABLE','DISCUSSION_SOURCE_UNAVAILABLE',
          'DISCUSSION_DEADLINE_EXPIRED','DISCUSSION_ASSEMBLY_INVALID','DISCUSSION_CONFIG_CHANGED') AND NEW.state='failed_terminal'
          AND NEW.error_code=current_setting('projed.discussion_finish_reason',true))))
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_FINISH_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION projed_core.read_meeting_discussion_source_v1(target_run_id uuid,claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;source projed_core.meeting_capture_segments;previous_source projed_core.meeting_capture_segments;
  cursor jsonb;checkpoints jsonb;tail_words jsonb;input jsonb;result jsonb;first_unit integer;word_count integer;last_hash text;
  key_name text;prior jsonb;keys text[]:=ARRAY['projed.discussion_phase','projed.discussion_run_id','projed.discussion_token'];
BEGIN
  IF target_run_id IS NULL OR claim_token IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM set_config('projed.discussion_phase','read',true),set_config('projed.discussion_run_id',target_run_id::text,true),
    set_config('projed.discussion_token',claim_token::text,true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id;
  IF FOUND AND run.state='running' AND run.lease_token=claim_token AND run.lease_expires_at>clock_timestamp()
    AND projed_core.meeting_discussion_live_v1(run.id) THEN
    cursor:=run.stage_cursor->'assembly';
    IF cursor->>'configVersion' IS DISTINCT FROM 'dev139.discussion.v1' OR cursor->'done' IS DISTINCT FROM 'false'::jsonb THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_CURSOR_INVALID' USING ERRCODE='42501'; END IF;
    SELECT * INTO source FROM projed_core.meeting_capture_segments WHERE capture_id=run.capture_id
      AND source_version=run.source_version AND segment_index=(cursor->>'sourceIndex')::integer
      AND upload_state='verified' AND storage_backend='gcs' AND sha256 IS NOT NULL AND storage_generation IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    SELECT min(unit.unit_index),coalesce(sum(jsonb_array_length(unit.result->'wordOffsets')),0)::integer,
      jsonb_agg(jsonb_build_object('unitIndex',unit.unit_index,'captureId',unit.capture_id,'sourceVersion',unit.source_version,
        'sourceSegmentId',unit.source_segment_id,'sourceSha256',usage.asr_manifest#>>'{source,sha256}',
        'sourceGeneration',usage.asr_manifest#>>'{source,generation}','result',unit.result) ORDER BY unit.unit_index)
      INTO first_unit,word_count,checkpoints
      FROM projed_core.meeting_asr_unit_results unit JOIN projed_core.meeting_ai_usage_attempts usage ON usage.attempt_id=unit.attempt_id
      WHERE unit.run_id=run.id AND unit.capture_id=run.capture_id AND unit.source_version=run.source_version
        AND unit.source_segment_id=source.id AND usage.run_id=run.id AND usage.capture_id=run.capture_id
        AND usage.usage_state='known' AND usage.asr_manifest#>'{settlement,published}'='true'::jsonb
        AND usage.asr_manifest#>>'{source,id}'=source.id::text AND usage.asr_manifest#>>'{source,sha256}'=source.sha256
        AND usage.asr_manifest#>>'{source,generation}'=source.storage_generation;
    IF checkpoints IS NULL OR jsonb_array_length(checkpoints) NOT BETWEEN 1 AND 7 OR word_count>350000 THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    input:=jsonb_build_object('source',jsonb_build_object('id',source.id,'captureId',source.capture_id,'sourceVersion',source.source_version,
      'segmentIndex',source.segment_index,'startOffsetMs',source.start_offset_ms,'endOffsetMs',source.end_offset_ms,
      'overlapMs',source.overlap_ms,'gapBeforeMs',source.gap_before_ms,'sha256',source.sha256,'generation',source.storage_generation),
      'checkpoints',checkpoints,'firstUnitIndex',first_unit,'firstSegmentIndex',(cursor->>'sourceFirstSegmentIndex')::integer);
    IF source.segment_index>0 THEN
      SELECT * INTO previous_source FROM projed_core.meeting_capture_segments WHERE capture_id=run.capture_id
        AND source_version=run.source_version AND segment_index=source.segment_index-1
        AND upload_state='verified' AND storage_backend='gcs' AND sha256 IS NOT NULL AND storage_generation IS NOT NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
      WITH units AS(
        SELECT unit.unit_index,unit.result,coalesce(sum(jsonb_array_length(unit.result->'wordOffsets')) OVER(
          ORDER BY unit.unit_index ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS word_base
          FROM projed_core.meeting_asr_unit_results unit JOIN projed_core.meeting_ai_usage_attempts usage ON usage.attempt_id=unit.attempt_id
          WHERE unit.run_id=run.id AND unit.capture_id=run.capture_id AND unit.source_version=run.source_version
            AND unit.source_segment_id=previous_source.id AND usage.run_id=run.id AND usage.capture_id=run.capture_id
            AND usage.usage_state='known' AND usage.asr_manifest#>'{settlement,published}'='true'::jsonb
            AND usage.asr_manifest#>>'{source,id}'=previous_source.id::text
            AND usage.asr_manifest#>>'{source,sha256}'=previous_source.sha256
            AND usage.asr_manifest#>>'{source,generation}'=previous_source.storage_generation
      )
      SELECT coalesce(jsonb_agg(word.value||jsonb_build_object('source_word_index',unit.word_base+word.ordinality-1)
        ORDER BY unit.unit_index,word.ordinality),'[]'::jsonb) INTO tail_words FROM units unit,
        LATERAL jsonb_array_elements(unit.result->'wordOffsets') WITH ORDINALITY word(value,ordinality)
        WHERE (word.value->>'start_ms')::numeric>=greatest(source.start_offset_ms,previous_source.start_offset_ms)
          AND(word.value->>'end_ms')::numeric<=least(source.end_offset_ms,previous_source.end_offset_ms);
      input:=input||jsonb_build_object('previous',jsonb_build_object('source',jsonb_build_object('id',previous_source.id,
        'captureId',previous_source.capture_id,'sourceVersion',previous_source.source_version,'segmentIndex',previous_source.segment_index,
        'startOffsetMs',previous_source.start_offset_ms,'endOffsetMs',previous_source.end_offset_ms,
        'overlapMs',previous_source.overlap_ms,'gapBeforeMs',previous_source.gap_before_ms,
        'sha256',previous_source.sha256,'generation',previous_source.storage_generation),'tailWords',tail_words));
    END IF;
    IF (cursor->>'nextSegmentIndex')::integer>(cursor->>'sourceFirstSegmentIndex')::integer THEN
      SELECT source_hash INTO last_hash FROM projed_core.meeting_transcript_segments
        WHERE capture_id=run.capture_id AND transcript_revision_id=run.transcript_revision_id
          AND segment_index=(cursor->>'nextSegmentIndex')::integer-1
          AND source_audio_ranges#>>'{0,source_audio_segment_id}'=source.id::text;
    END IF;
    result:=jsonb_build_object('input',input,'totalSourceWords',word_count,'lastSegmentHash',last_hash);
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN result;
END;
$$;
CREATE TRIGGER meeting_discussion_draft_guard_v1 BEFORE INSERT ON projed_core.meeting_transcript_segments
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_discussion_guard_v1();
CREATE TRIGGER meeting_discussion_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_discussion_guard_v1();
DROP TRIGGER meeting_run_cancel_guard_v1 ON projed_core.meeting_analysis_runs;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'prepare'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'abandon'
    AND current_setting('projed.discussion_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.discussion_phase',true) IS DISTINCT FROM 'append'
    AND current_setting('projed.discussion_phase',true) IS DISTINCT FROM 'finish')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();

CREATE FUNCTION projed_core.claim_meeting_discussion_source_v1(target_run_id uuid,proposed_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;cursor jsonb;receipt jsonb;expires timestamptz;expected jsonb;key_name text;prior jsonb;
  keys text[]:=ARRAY['projed.discussion_phase','projed.discussion_run_id','projed.discussion_token','projed.discussion_expected_run'];
BEGIN
  IF target_run_id IS NULL OR proposed_token IS NULL THEN RAISE EXCEPTION 'MEETING_DISCUSSION_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM set_config('projed.discussion_phase','claim',true),set_config('projed.discussion_run_id',target_run_id::text,true),
    set_config('projed.discussion_token',proposed_token::text,true),set_config('projed.discussion_expected_run','',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
  IF FOUND AND run.state IN('queued','running') AND run.resume_stage='retrieve' AND run.stage_cursor#>'{asr,done}'='true'::jsonb
    AND run.stage_cursor#>'{assembly,done}' IS DISTINCT FROM 'true'::jsonb THEN
    IF NOT projed_core.meeting_discussion_live_v1(run.id) THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    cursor:=run.stage_cursor->'assembly';
    IF cursor IS NULL THEN
      cursor:=jsonb_build_object('configVersion','dev139.discussion.v1','sourceIndex',0,'sourceFirstSegmentIndex',0,
        'nextSegmentIndex',0,'nextWordIndex',0,'deduplicatedPrefixWords',NULL,'done',false,'lastLeaseToken',NULL);
    ELSIF jsonb_typeof(cursor)<>'object' OR cursor->>'configVersion' IS DISTINCT FROM 'dev139.discussion.v1'
      OR cursor->'done' IS DISTINCT FROM 'false'::jsonb
      OR coalesce(cursor->>'sourceIndex','') !~ '^[0-9]{1,4}$'
      OR coalesce(cursor->>'sourceFirstSegmentIndex','') !~ '^[0-9]{1,10}$'
      OR coalesce(cursor->>'nextSegmentIndex','') !~ '^[0-9]{1,10}$'
      OR coalesce(cursor->>'nextWordIndex','') !~ '^[0-9]{1,6}$'
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_CURSOR_INVALID' USING ERRCODE='42501'; END IF;
    IF (cursor->>'sourceIndex')::integer>4095 OR (cursor->>'nextSegmentIndex')::bigint>2147483647
      OR (cursor->>'sourceFirstSegmentIndex')::bigint>(cursor->>'nextSegmentIndex')::bigint
      OR (cursor->>'nextWordIndex')::integer>350000
      OR cursor-'configVersion'-'sourceIndex'-'sourceFirstSegmentIndex'-'nextSegmentIndex'-'nextWordIndex'
        -'deduplicatedPrefixWords'-'done'-'lastLeaseToken'<>'{}'::jsonb
      OR jsonb_typeof(cursor->'sourceIndex') IS DISTINCT FROM 'number'
      OR jsonb_typeof(cursor->'sourceFirstSegmentIndex') IS DISTINCT FROM 'number'
      OR jsonb_typeof(cursor->'nextSegmentIndex') IS DISTINCT FROM 'number'
      OR jsonb_typeof(cursor->'nextWordIndex') IS DISTINCT FROM 'number'
      OR cursor->'deduplicatedPrefixWords' IS NULL
      OR(cursor->'deduplicatedPrefixWords'<>'null'::jsonb AND(
        jsonb_typeof(cursor->'deduplicatedPrefixWords') IS DISTINCT FROM 'number'
        OR coalesce(cursor->>'deduplicatedPrefixWords','') !~ '^[0-9]{1,6}$'
        OR(cursor->>'deduplicatedPrefixWords')::integer>(cursor->>'nextWordIndex')::integer))
      OR(cursor->'deduplicatedPrefixWords'='null'::jsonb AND(
        cursor->'nextSegmentIndex' IS DISTINCT FROM cursor->'sourceFirstSegmentIndex' OR cursor->'nextWordIndex'<>'0'::jsonb))
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_CURSOR_INVALID' USING ERRCODE='42501'; END IF;
    IF (run.state='queued' AND run.lease_token IS NULL AND run.lease_expires_at IS NULL AND run.next_attempt_at<=clock_timestamp())
      OR(run.state='running' AND(run.lease_expires_at<=clock_timestamp() OR run.lease_token=proposed_token)) THEN
      expires:=CASE WHEN run.state='running' AND run.lease_token=proposed_token AND run.lease_expires_at>clock_timestamp()
        THEN run.lease_expires_at ELSE clock_timestamp()+interval '150 seconds' END;
      expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('state','running','stage_cursor',run.stage_cursor||jsonb_build_object('assembly',cursor),
        'lease_token',proposed_token,'lease_expires_at',expires);
      PERFORM set_config('projed.discussion_expected_run',expected::text,true);
      UPDATE projed_core.meeting_analysis_runs SET state='running',stage_cursor=run.stage_cursor||jsonb_build_object('assembly',cursor),
        lease_token=proposed_token,lease_expires_at=expires,updated_at=now() WHERE id=run.id RETURNING * INTO run;
      receipt:=cursor||jsonb_build_object('runId',run.id,'captureId',run.capture_id,'transcriptRevisionId',run.transcript_revision_id,
        'sourceVersion',run.source_version,'leaseToken',run.lease_token,'leaseExpiresAtMs',floor(extract(epoch FROM expires)*1000)::bigint);
      receipt:=receipt-ARRAY['configVersion','lastLeaseToken'];
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN receipt;
END;
$$;

-- Resolve a lost acknowledgement by reading the exact immutable batch under
-- the existing app lock. Never infer success from cursor movement alone.
CREATE FUNCTION projed_core.read_meeting_discussion_batch_v1(target_run_id uuid,claim_token uuid,batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;cursor jsonb;result jsonb:='"stale"'::jsonb;item record;stored record;
  expected_index integer;source_index integer;first_index integer;prefix_count integer;total_words integer;
  matches boolean:=true;key_name text;prior jsonb;
  keys text[]:=ARRAY['projed.discussion_phase','projed.discussion_run_id','projed.discussion_token'];
BEGIN
  IF target_run_id IS NULL OR claim_token IS NULL OR batch IS NULL OR jsonb_typeof(batch)<>'object'
    OR jsonb_typeof(batch->'segments') IS DISTINCT FROM 'array' OR jsonb_array_length(batch->'segments')>16
    OR coalesce(batch->>'expectedNextSegmentIndex','') !~ '^[0-9]{1,10}$'
    OR coalesce(batch->>'sourceIndex','') !~ '^[0-9]{1,4}$'
    OR coalesce(batch->>'sourceFirstSegmentIndex','') !~ '^[0-9]{1,10}$'
    OR coalesce(batch->>'deduplicatedPrefixWords','') !~ '^[0-9]{1,6}$'
    OR jsonb_typeof(batch->'sourceDone') IS DISTINCT FROM 'boolean'
    OR (batch->>'expectedNextSegmentIndex')::bigint>2147483647 OR (batch->>'sourceIndex')::integer>4095
  THEN RAISE EXCEPTION 'MEETING_DISCUSSION_BATCH_INVALID' USING ERRCODE='42501'; END IF;
  expected_index:=(batch->>'expectedNextSegmentIndex')::integer;source_index:=(batch->>'sourceIndex')::integer;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.discussion_phase','read',true),set_config('projed.discussion_run_id',target_run_id::text,true),
    set_config('projed.discussion_token',claim_token::text,true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id;
  IF FOUND AND projed_core.meeting_discussion_live_v1(run.id)
    AND((run.state='running' AND run.lease_token=claim_token AND run.lease_expires_at>clock_timestamp())
      OR(run.state='queued' AND run.lease_token IS NULL AND run.stage_cursor#>>'{assembly,lastLeaseToken}'=claim_token::text))
    AND EXISTS(SELECT 1 FROM projed_core.meeting_capture_segments source WHERE source.capture_id=run.capture_id
      AND source.source_version=run.source_version AND source.id::text=batch->>'sourceId'
      AND source.segment_index=source_index AND source.upload_state='verified' AND source.storage_backend='gcs'
      AND EXISTS(SELECT 1 FROM projed_core.meeting_asr_unit_results unit
        JOIN projed_core.meeting_ai_usage_attempts usage ON usage.attempt_id=unit.attempt_id
        WHERE unit.run_id=run.id AND unit.capture_id=run.capture_id AND unit.source_version=run.source_version
          AND unit.source_segment_id=source.id AND usage.run_id=run.id AND usage.capture_id=run.capture_id
          AND usage.usage_state='known' AND usage.asr_manifest#>'{settlement,published}'='true'::jsonb
          AND usage.asr_manifest#>>'{source,id}'=source.id::text AND usage.asr_manifest#>>'{source,sha256}'=source.sha256
          AND usage.asr_manifest#>>'{source,generation}'=source.storage_generation)) THEN
    cursor:=run.stage_cursor->'assembly';
    IF cursor->>'configVersion' IS DISTINCT FROM 'dev139.discussion.v1' THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_CURSOR_INVALID' USING ERRCODE='42501'; END IF;
    IF (cursor->>'sourceIndex')::integer=source_index AND(cursor->>'nextSegmentIndex')::integer=expected_index THEN
      result:='"not_committed"'::jsonb;
    ELSIF ((batch->'sourceDone'='true'::jsonb AND(cursor->>'sourceIndex')::integer=source_index+1)
      OR(batch->'sourceDone'='false'::jsonb AND(cursor->>'sourceIndex')::integer=source_index))
      AND(cursor->>'nextSegmentIndex')::integer=expected_index+jsonb_array_length(batch->'segments') THEN
      SELECT transcript.segment_index,(transcript.word_offsets#>>'{0,source_word_index}')::integer INTO first_index,prefix_count
        FROM projed_core.meeting_transcript_segments transcript WHERE transcript.capture_id=run.capture_id
          AND transcript.transcript_revision_id=run.transcript_revision_id AND transcript.producer_run_id=run.id
          AND transcript.source_audio_ranges#>>'{0,source_audio_segment_id}'=batch->>'sourceId'
          ORDER BY transcript.segment_index LIMIT 1;
      IF NOT FOUND THEN
        -- Empty speech / fully duplicated overlap has no transcript row. Its
        -- immutable checkpoint word count is the exact skipped-prefix proof.
        SELECT coalesce(sum(jsonb_array_length(unit.result->'wordOffsets')),0)::integer INTO total_words
          FROM projed_core.meeting_asr_unit_results unit WHERE unit.run_id=run.id AND unit.capture_id=run.capture_id
            AND unit.source_version=run.source_version AND unit.source_segment_id::text=batch->>'sourceId';
        first_index:=expected_index;prefix_count:=total_words;
      END IF;
      matches:=first_index::text=batch->>'sourceFirstSegmentIndex' AND prefix_count::text=batch->>'deduplicatedPrefixWords';
      FOR item IN SELECT value,ordinality FROM jsonb_array_elements(batch->'segments') WITH ORDINALITY LOOP
        SELECT transcript.* INTO stored FROM projed_core.meeting_transcript_segments transcript
          JOIN projed_core.meeting_analysis_runs producer ON producer.id=transcript.producer_run_id
          WHERE transcript.capture_id=run.capture_id AND transcript.transcript_revision_id=run.transcript_revision_id
            AND producer.id=run.id AND producer.capture_id=run.capture_id AND producer.source_version=run.source_version
            AND producer.transcript_revision_id=run.transcript_revision_id
            AND transcript.segment_index=expected_index+item.ordinality-1;
        IF NOT FOUND OR item.value->'segmentIndex' IS DISTINCT FROM to_jsonb(stored.segment_index)
          OR stored.raw_text IS DISTINCT FROM item.value->>'rawText'
          OR stored.normalized_text IS DISTINCT FROM item.value->>'normalizedText'
          OR stored.source_hash IS DISTINCT FROM item.value->>'sourceHash'
          OR stored.start_offset_ms::text IS DISTINCT FROM item.value->>'startOffsetMs'
          OR stored.end_offset_ms::text IS DISTINCT FROM item.value->>'endOffsetMs'
          OR stored.word_offsets IS DISTINCT FROM item.value->'wordOffsets'
          OR stored.source_audio_ranges IS DISTINCT FROM item.value->'sourceAudioRanges' THEN matches:=false;EXIT;END IF;
      END LOOP;
      IF matches THEN result:=cursor-ARRAY['configVersion','lastLeaseToken']; END IF;
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN result;
END;
$$;

-- One source and at most sixteen immutable draft segments per transaction.
-- Canonical checkpoint words prove coverage; segmentation itself remains in the
-- pure assembler. No SQL copy of its Unicode alignment or sentence algorithm.
CREATE FUNCTION projed_core.append_meeting_discussion_batch_v1(target_run_id uuid,claim_token uuid,batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;cursor jsonb;receipt jsonb;source_input jsonb;source jsonb;source_words jsonb;
  item record;word_item record;stored projed_core.meeting_transcript_segments;segment jsonb;canonical jsonb;first_word jsonb;last_word jsonb;
  expected jsonb;ranges jsonb;next_cursor jsonb;tail jsonb;left_word jsonb;right_word jsonb;raw_chunk text;
  total_words integer;prefix_count integer;next_word integer;source_index integer;first_index integer;next_index integer;
  chunk_index integer;word_chunk integer;source_count integer;source_max integer;position integer;
  start_value bigint;end_value bigint;max_end numeric;overlap_start numeric;overlap_end numeric;tail_count integer;
  source_done boolean;assembly_done boolean;next_state text;next_time timestamptz;key_name text;prior jsonb;
  keys text[]:=ARRAY['projed.discussion_phase','projed.discussion_run_id','projed.discussion_token',
    'projed.discussion_expected_run','projed.discussion_expected_segment'];
BEGIN
  IF target_run_id IS NULL OR claim_token IS NULL OR batch IS NULL OR jsonb_typeof(batch)<>'object'
    OR batch-ARRAY['sourceId','sourceIndex','sourceFirstSegmentIndex','expectedNextSegmentIndex',
      'deduplicatedPrefixWords','sourceDone','segments']<>'{}'::jsonb
    OR jsonb_typeof(batch->'segments') IS DISTINCT FROM 'array' OR jsonb_array_length(batch->'segments')>16
    OR jsonb_typeof(batch->'sourceId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(batch->'sourceDone') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(batch->'sourceIndex') IS DISTINCT FROM 'number' OR coalesce(batch->>'sourceIndex','') !~ '^[0-9]{1,4}$'
    OR jsonb_typeof(batch->'sourceFirstSegmentIndex') IS DISTINCT FROM 'number'
    OR coalesce(batch->>'sourceFirstSegmentIndex','') !~ '^[0-9]{1,10}$'
    OR jsonb_typeof(batch->'expectedNextSegmentIndex') IS DISTINCT FROM 'number'
    OR coalesce(batch->>'expectedNextSegmentIndex','') !~ '^[0-9]{1,10}$'
    OR jsonb_typeof(batch->'deduplicatedPrefixWords') IS DISTINCT FROM 'number'
    OR coalesce(batch->>'deduplicatedPrefixWords','') !~ '^[0-9]{1,6}$'
  THEN RAISE EXCEPTION 'MEETING_DISCUSSION_BATCH_INVALID' USING ERRCODE='42501'; END IF;
  source_index:=(batch->>'sourceIndex')::integer;first_index:=(batch->>'sourceFirstSegmentIndex')::bigint;
  next_index:=(batch->>'expectedNextSegmentIndex')::bigint;prefix_count:=(batch->>'deduplicatedPrefixWords')::integer;
  source_done:=(batch->>'sourceDone')::boolean;
  IF source_index>4095 OR first_index>next_index OR next_index>2147483631 OR prefix_count>350000
    OR(jsonb_array_length(batch->'segments')=0 AND NOT source_done)
  THEN RAISE EXCEPTION 'MEETING_DISCUSSION_BATCH_INVALID' USING ERRCODE='42501'; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.discussion_phase','append',true),set_config('projed.discussion_run_id',target_run_id::text,true),
    set_config('projed.discussion_token',claim_token::text,true),set_config('projed.discussion_expected_run','',true),
    set_config('projed.discussion_expected_segment','',true);
  receipt:=projed_core.read_meeting_discussion_batch_v1(target_run_id,claim_token,batch);
  IF receipt='"stale"'::jsonb THEN receipt:=NULL;
  ELSIF receipt='"not_committed"'::jsonb THEN
    SELECT * INTO STRICT run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
    cursor:=run.stage_cursor->'assembly';
    IF run.state<>'running' OR run.lease_token IS DISTINCT FROM claim_token OR run.lease_expires_at<=clock_timestamp()
      OR NOT projed_core.meeting_discussion_live_v1(run.id)
      OR cursor->'done' IS DISTINCT FROM 'false'::jsonb
      OR(cursor->>'sourceIndex')::integer<>source_index OR(cursor->>'sourceFirstSegmentIndex')::integer<>first_index
      OR(cursor->>'nextSegmentIndex')::integer<>next_index
      OR(cursor->'deduplicatedPrefixWords'<>'null'::jsonb AND cursor->'deduplicatedPrefixWords' IS DISTINCT FROM batch->'deduplicatedPrefixWords')
    THEN RAISE EXCEPTION 'MEETING_DISCUSSION_BATCH_INVALID' USING ERRCODE='42501'; END IF;
    source_input:=projed_core.read_meeting_discussion_source_v1(target_run_id,claim_token);
    IF source_input IS NULL THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    source:=source_input#>'{input,source}';total_words:=(source_input->>'totalSourceWords')::integer;
    IF source->>'id' IS DISTINCT FROM batch->>'sourceId' OR prefix_count>total_words THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_BATCH_INVALID' USING ERRCODE='42501'; END IF;
    WITH units AS(
      SELECT value->'result' AS result,ordinality,coalesce(sum(jsonb_array_length(value#>'{result,wordOffsets}')) OVER(
        ORDER BY ordinality ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS word_base
        FROM jsonb_array_elements(source_input#>'{input,checkpoints}') WITH ORDINALITY
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('word',word.value||jsonb_build_object('source_word_index',unit.word_base+word.ordinality-1),
      'chunkIndex',(unit.result->>'chunkIndex')::integer) ORDER BY unit.ordinality,word.ordinality),'[]'::jsonb)
      INTO source_words FROM units unit,LATERAL jsonb_array_elements(unit.result->'wordOffsets') WITH ORDINALITY word(value,ordinality);
    IF jsonb_array_length(source_words)<>total_words THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    -- A deleted prefix must be a literal timed suffix of the adjacent upload.
    -- Case/width differences retain both words, never authorize deletion.
    IF prefix_count>0 THEN
      tail:=source_input#>'{input,previous,tailWords}';
      overlap_start:=greatest((source->>'startOffsetMs')::numeric,(source_input#>>'{input,previous,source,startOffsetMs}')::numeric);
      overlap_end:=least((source->>'endOffsetMs')::numeric,(source_input#>>'{input,previous,source,endOffsetMs}')::numeric);
      IF tail IS NULL OR jsonb_typeof(tail)<>'array' OR jsonb_array_length(tail)<prefix_count
        OR overlap_end<=overlap_start OR overlap_end-overlap_start IS DISTINCT FROM(source->>'overlapMs')::numeric
        OR source->'gapBeforeMs' IS DISTINCT FROM '0'::jsonb
      THEN RAISE EXCEPTION 'MEETING_DISCUSSION_OVERLAP_INVALID' USING ERRCODE='42501'; END IF;
      tail_count:=jsonb_array_length(tail);
      FOR position IN 0..prefix_count-1 LOOP
        left_word:=tail->(tail_count-prefix_count+position);right_word:=source_words#>ARRAY[position::text,'word'];
        IF left_word->>'text' IS DISTINCT FROM right_word->>'text'
          OR(left_word->>'start_ms')::numeric<overlap_start OR(left_word->>'end_ms')::numeric>overlap_end
          OR(right_word->>'start_ms')::numeric<overlap_start OR(right_word->>'end_ms')::numeric>overlap_end
          OR NOT(greatest((left_word->>'start_ms')::numeric,(right_word->>'start_ms')::numeric)
              <least((left_word->>'end_ms')::numeric,(right_word->>'end_ms')::numeric)
            OR(left_word->'start_ms'=right_word->'start_ms' AND left_word->'end_ms'=right_word->'end_ms'))
        THEN RAISE EXCEPTION 'MEETING_DISCUSSION_OVERLAP_INVALID' USING ERRCODE='42501'; END IF;
      END LOOP;
    END IF;
    next_word:=CASE WHEN cursor->'deduplicatedPrefixWords'='null'::jsonb THEN prefix_count ELSE(cursor->>'nextWordIndex')::integer END;
    IF next_word<prefix_count OR next_word>total_words THEN RAISE EXCEPTION 'MEETING_DISCUSSION_CURSOR_INVALID' USING ERRCODE='42501'; END IF;
    FOR item IN SELECT value,ordinality FROM jsonb_array_elements(batch->'segments') WITH ORDINALITY ORDER BY ordinality LOOP
      segment:=item.value;chunk_index:=NULL;max_end:=0;
      IF jsonb_typeof(segment) IS DISTINCT FROM 'object'
        OR segment-ARRAY['segmentIndex','rawText','normalizedText','startOffsetMs','endOffsetMs','wordOffsets','sourceAudioRanges','sourceHash']<>'{}'::jsonb
        OR segment->'segmentIndex' IS DISTINCT FROM to_jsonb(next_index)
        OR jsonb_typeof(segment->'rawText') IS DISTINCT FROM 'string' OR length(segment->>'rawText') NOT BETWEEN 1 AND 800
        OR segment->'normalizedText' IS DISTINCT FROM segment->'rawText'
        OR jsonb_typeof(segment->'sourceHash') IS DISTINCT FROM 'string' OR coalesce(segment->>'sourceHash','') !~ '^[a-f0-9]{64}$'
        OR jsonb_typeof(segment->'wordOffsets') IS DISTINCT FROM 'array' OR jsonb_array_length(segment->'wordOffsets') NOT BETWEEN 1 AND 800
        OR jsonb_typeof(segment->'sourceAudioRanges') IS DISTINCT FROM 'array' OR jsonb_array_length(segment->'sourceAudioRanges')<>1
        OR jsonb_typeof(segment->'startOffsetMs') IS DISTINCT FROM 'number' OR coalesce(segment->>'startOffsetMs','') !~ '^[0-9]{1,16}$'
        OR jsonb_typeof(segment->'endOffsetMs') IS DISTINCT FROM 'number' OR coalesce(segment->>'endOffsetMs','') !~ '^[0-9]{1,16}$'
      THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SEGMENT_INVALID' USING ERRCODE='42501'; END IF;
      start_value:=(segment->>'startOffsetMs')::bigint;end_value:=(segment->>'endOffsetMs')::bigint;
      IF end_value<=start_value OR end_value>9007199254740991 OR end_value-start_value>30000 THEN
        RAISE EXCEPTION 'MEETING_DISCUSSION_SEGMENT_INVALID' USING ERRCODE='42501'; END IF;
      first_word:=NULL;last_word:=NULL;
      FOR word_item IN SELECT value FROM jsonb_array_elements(segment->'wordOffsets') WITH ORDINALITY ORDER BY ordinality LOOP
        canonical:=source_words->next_word;word_chunk:=(canonical->>'chunkIndex')::integer;
        IF canonical IS NULL OR word_item.value IS DISTINCT FROM canonical->'word' OR(chunk_index IS NOT NULL AND chunk_index<>word_chunk) THEN
          RAISE EXCEPTION 'MEETING_DISCUSSION_WORD_COVERAGE_INVALID' USING ERRCODE='42501'; END IF;
        chunk_index:=word_chunk;first_word:=coalesce(first_word,word_item.value);last_word:=word_item.value;
        max_end:=greatest(max_end,(word_item.value->>'end_ms')::numeric);next_word:=next_word+1;
      END LOOP;
      IF start_value<>floor((first_word->>'start_ms')::numeric)
        OR end_value<>greatest(start_value+1,ceil(max_end)) THEN
        RAISE EXCEPTION 'MEETING_DISCUSSION_SEGMENT_INVALID' USING ERRCODE='42501'; END IF;
      SELECT value#>>'{result,rawText}' INTO STRICT raw_chunk FROM jsonb_array_elements(source_input#>'{input,checkpoints}')
        WHERE(value#>>'{result,chunkIndex}')::integer=chunk_index;
      IF strpos(raw_chunk,segment->>'rawText')=0 THEN RAISE EXCEPTION 'MEETING_DISCUSSION_RAW_TEXT_INVALID' USING ERRCODE='42501'; END IF;
      ranges:=jsonb_build_array(jsonb_build_object('source_audio_segment_id',source->>'id','from_word',first_word->'source_word_index',
        'to_word',last_word->'source_word_index','start_ms',first_word->'start_ms','end_ms',max_end));
      IF segment->'sourceAudioRanges' IS DISTINCT FROM ranges THEN RAISE EXCEPTION 'MEETING_DISCUSSION_RANGE_INVALID' USING ERRCODE='42501'; END IF;
      SELECT * INTO stored FROM projed_core.meeting_transcript_segments WHERE transcript_revision_id=run.transcript_revision_id AND segment_index=next_index;
      expected:=jsonb_build_object('id',CASE WHEN FOUND THEN stored.id ELSE gen_random_uuid() END,'capture_id',run.capture_id,
        'transcript_revision_id',run.transcript_revision_id,'producer_run_id',run.id,'segment_index',next_index,'source_audio_ranges',ranges,
        'start_offset_ms',start_value,'end_offset_ms',end_value,'raw_text',segment->>'rawText','normalized_text',segment->>'normalizedText',
        'word_offsets',segment->'wordOffsets','source_hash',segment->>'sourceHash');
      IF FOUND THEN
        IF to_jsonb(stored)-'created_at' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SEGMENT_CONFLICT' USING ERRCODE='42501'; END IF;
      ELSE
        PERFORM set_config('projed.discussion_expected_segment',expected::text,true);
        INSERT INTO projed_core.meeting_transcript_segments(id,capture_id,transcript_revision_id,producer_run_id,segment_index,
          source_audio_ranges,start_offset_ms,end_offset_ms,raw_text,normalized_text,word_offsets,source_hash)
          VALUES((expected->>'id')::uuid,run.capture_id,run.transcript_revision_id,run.id,next_index,ranges,start_value,end_value,
            segment->>'rawText',segment->>'normalizedText',segment->'wordOffsets',segment->>'sourceHash');
      END IF;
      next_index:=next_index+1;
    END LOOP;
    IF source_done IS DISTINCT FROM(next_word=total_words) THEN RAISE EXCEPTION 'MEETING_DISCUSSION_WORD_COVERAGE_INVALID' USING ERRCODE='42501'; END IF;
    SELECT count(*)::integer,max(segment_index) INTO source_count,source_max FROM projed_core.meeting_capture_segments
      WHERE capture_id=run.capture_id AND source_version=run.source_version AND upload_state='verified' AND storage_backend='gcs';
    IF source_count<1 OR source_max<>source_count-1 OR source_index>=source_count THEN
      RAISE EXCEPTION 'MEETING_DISCUSSION_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
    assembly_done:=source_done AND source_index+1=source_count;
    next_cursor:=jsonb_build_object('configVersion','dev139.discussion.v1','sourceIndex',source_index+CASE WHEN source_done THEN 1 ELSE 0 END,
      'sourceFirstSegmentIndex',CASE WHEN source_done THEN next_index ELSE first_index END,'nextSegmentIndex',next_index,
      'nextWordIndex',CASE WHEN source_done THEN 0 ELSE next_word END,
      'deduplicatedPrefixWords',CASE WHEN source_done THEN NULL ELSE prefix_count END,'done',assembly_done,'lastLeaseToken',claim_token);
    next_state:=CASE WHEN source_done THEN 'queued' ELSE 'running' END;
    next_time:=CASE WHEN source_done THEN clock_timestamp() ELSE run.next_attempt_at END;
    expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('stage_cursor',run.stage_cursor||jsonb_build_object('assembly',next_cursor),
      'state',next_state,'lease_token',CASE WHEN source_done THEN NULL ELSE claim_token END,
      'lease_expires_at',CASE WHEN source_done THEN NULL ELSE run.lease_expires_at END,'next_attempt_at',next_time);
    PERFORM set_config('projed.discussion_expected_run',expected::text,true);
    UPDATE projed_core.meeting_analysis_runs SET stage_cursor=run.stage_cursor||jsonb_build_object('assembly',next_cursor),state=next_state,
      lease_token=CASE WHEN source_done THEN NULL ELSE claim_token END,lease_expires_at=CASE WHEN source_done THEN NULL ELSE run.lease_expires_at END,
      next_attempt_at=next_time,updated_at=now() WHERE id=run.id;
    receipt:=next_cursor-ARRAY['configVersion','lastLeaseToken'];
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN receipt;
END;
$$;

CREATE FUNCTION projed_core.finish_meeting_discussion_work_v1(target_run_id uuid,claim_token uuid,reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;expected jsonb;next_state text;next_time timestamptz;result boolean:=false;prior jsonb;key_name text;
  keys text[]:=ARRAY['projed.discussion_phase','projed.discussion_run_id','projed.discussion_token',
    'projed.discussion_expected_run','projed.discussion_finish_reason'];
BEGIN
  IF target_run_id IS NULL OR reason IS NULL OR reason NOT IN('yield','DISCUSSION_SESSION_UNAVAILABLE','DISCUSSION_SOURCE_UNAVAILABLE',
    'DISCUSSION_DEADLINE_EXPIRED','DISCUSSION_ASSEMBLY_INVALID','DISCUSSION_CONFIG_CHANGED')
  THEN RAISE EXCEPTION 'MEETING_DISCUSSION_FINISH_INVALID' USING ERRCODE='42501'; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.discussion_phase','finish',true),set_config('projed.discussion_run_id',target_run_id::text,true),
    set_config('projed.discussion_token',coalesce(claim_token::text,''),true),set_config('projed.discussion_finish_reason',reason,true),
    set_config('projed.discussion_expected_run','',true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
  IF FOUND AND run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
    AND run.resume_stage='retrieve' AND run.stage_cursor#>'{asr,done}'='true'::jsonb
    AND run.stage_cursor#>'{assembly,done}' IS DISTINCT FROM 'true'::jsonb
    AND((run.state='running' AND claim_token IS NOT NULL AND run.lease_token=claim_token)
      OR(run.state='queued' AND run.lease_token IS NULL AND claim_token IS NULL AND reason<>'yield')) THEN
    next_state:=CASE WHEN reason='yield' THEN 'queued' ELSE 'failed_terminal' END;
    next_time:=CASE WHEN reason='yield' THEN clock_timestamp() ELSE run.next_attempt_at END;
    expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('state',next_state,'lease_token',NULL,'lease_expires_at',NULL,
      'next_attempt_at',next_time,'error_code',CASE WHEN reason='yield' THEN NULL ELSE reason END);
    PERFORM set_config('projed.discussion_expected_run',expected::text,true);
    UPDATE projed_core.meeting_analysis_runs SET state=next_state,lease_token=NULL,lease_expires_at=NULL,next_attempt_at=next_time,
      error_code=CASE WHEN reason='yield' THEN NULL ELSE reason END,updated_at=now() WHERE id=run.id;
    result:=FOUND;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION projed_core.meeting_discussion_scope_v1(uuid,uuid),projed_core.meeting_discussion_live_v1(uuid),
  projed_core.meeting_discussion_guard_v1(),projed_core.claim_meeting_discussion_source_v1(uuid,uuid),
  projed_core.read_meeting_discussion_source_v1(uuid,uuid),projed_core.read_meeting_discussion_batch_v1(uuid,uuid,jsonb),
  projed_core.append_meeting_discussion_batch_v1(uuid,uuid,jsonb),projed_core.finish_meeting_discussion_work_v1(uuid,uuid,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_discussion_scope_v1(uuid,uuid),projed_core.meeting_discussion_live_v1(uuid),
  projed_core.meeting_discussion_guard_v1(),projed_core.claim_meeting_discussion_source_v1(uuid,uuid),
  projed_core.read_meeting_discussion_source_v1(uuid,uuid),projed_core.read_meeting_discussion_batch_v1(uuid,uuid,jsonb),
  projed_core.append_meeting_discussion_batch_v1(uuid,uuid,jsonb),projed_core.finish_meeting_discussion_work_v1(uuid,uuid,text)
  TO projed_runtime_disposable;

CREATE FUNCTION projed_core.scan_meeting_discussion_work_v1(max_items integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE result jsonb;prior_phase text;
BEGIN
  IF max_items IS NULL OR max_items NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'MEETING_DISCUSSION_SCAN_INVALID' USING ERRCODE='42501'; END IF;
  prior_phase:=current_setting('projed.discussion_phase',true);
  PERFORM set_config('projed.discussion_phase','scan',true);
  WITH candidates AS(
    SELECT id,created_at,jsonb_build_object('runId',id,'operationToken',CASE WHEN state='running' THEN lease_token ELSE NULL END,
      'deadlineExpired',deadline_at<=clock_timestamp()) AS item FROM projed_core.meeting_analysis_runs
      WHERE provider_mode='cloud-speech-v1' AND config_version='dev139.cloud-speech.v1' AND resume_stage='retrieve'
        AND stage_cursor#>'{asr,done}'='true'::jsonb AND stage_cursor#>'{assembly,done}' IS DISTINCT FROM 'true'::jsonb
        AND authorization_context_id IS NOT NULL AND deadline_at IS NOT NULL
        AND((state='queued' AND lease_token IS NULL AND lease_expires_at IS NULL AND next_attempt_at<=clock_timestamp())
          OR(state='running' AND lease_token IS NOT NULL AND lease_expires_at<=clock_timestamp()))
  ), ranked AS(SELECT *,row_number() OVER(ORDER BY created_at,id)-1 AS position,count(*) OVER() AS total FROM candidates),
  rotated AS(SELECT *,mod(position+total-mod(floor(extract(epoch FROM now())/60)::bigint,total),total) AS scan_order FROM ranked),
  bounded AS(SELECT * FROM rotated ORDER BY scan_order LIMIT max_items)
  SELECT coalesce(jsonb_agg(item ORDER BY scan_order),'[]'::jsonb) INTO result FROM bounded;
  PERFORM set_config('projed.discussion_phase',coalesce(prior_phase,''),true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.scan_meeting_discussion_work_v1(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.scan_meeting_discussion_work_v1(integer) TO projed_runtime_disposable;
