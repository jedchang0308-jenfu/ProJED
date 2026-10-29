-- Meeting-only downstream attempts share the existing month ledger, never the
-- Speech pool. Private inputs/results are append-only and unavailable to the
-- metadata scanner or accounting-only session. No provider is enabled here.
ALTER TABLE projed_core.meeting_ai_usage_attempts
  ADD COLUMN llm_operation_token uuid,
  ADD COLUMN llm_manifest jsonb,
  ADD CONSTRAINT meeting_llm_manifest_pair_v1 CHECK(
    (llm_operation_token IS NULL AND llm_manifest IS NULL)
    OR(llm_operation_token IS NOT NULL AND llm_manifest IS NOT NULL AND jsonb_typeof(llm_manifest)='object'
      AND asr_operation_token IS NULL AND asr_manifest IS NULL AND asr_remaining_twd_micros IS NULL));
CREATE UNIQUE INDEX meeting_usage_llm_token_v1 ON projed_core.meeting_ai_usage_attempts(llm_operation_token)
  WHERE llm_operation_token IS NOT NULL;

CREATE TABLE projed_core.meeting_llm_unit_checkpoints(
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL,
  run_id uuid NOT NULL,
  source_version integer NOT NULL CHECK(source_version>0),
  transcript_revision_id uuid NOT NULL,
  stage text NOT NULL CHECK(stage IN('retrieve','match','compose')),
  unit_key text NOT NULL CHECK(unit_key ~ '^[a-z0-9:-]{1,96}$'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  slot text NOT NULL CHECK(slot IN('input','result')),
  attempt_id text,
  payload_text text NOT NULL CHECK(octet_length(payload_text) BETWEEN 2 AND 1048576
    AND jsonb_typeof(payload_text::jsonb)='object'),
  payload_hash text NOT NULL CHECK(payload_hash=encode(sha256(convert_to(payload_text,'UTF8')),'hex')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(capture_id,run_id) REFERENCES projed_core.meeting_analysis_runs(capture_id,id) ON DELETE CASCADE,
  UNIQUE(run_id,stage,unit_key,input_hash,slot),
  CHECK((slot='input' AND attempt_id IS NULL AND payload_hash=input_hash)
    OR(slot='result' AND attempt_id IS NOT NULL))
);
ALTER TABLE projed_core.meeting_llm_unit_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE projed_core.meeting_llm_unit_checkpoints FORCE ROW LEVEL SECURITY;
REVOKE ALL ON projed_core.meeting_llm_unit_checkpoints FROM PUBLIC;

CREATE FUNCTION projed_core.meeting_llm_private_scope_v1(target_run uuid,target_capture uuid)
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
        AND(session.identity->>'sourceSessionExpiresAtMs')::numeric>extract(epoch FROM clock_timestamp())*1000);
$$;
CREATE FUNCTION projed_core.meeting_llm_live_v1(target_run uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
    WHERE run.id=target_run AND projed_core.meeting_llm_private_scope_v1(run.id,run.capture_id)
      AND run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
      AND run.resume_stage='retrieve' AND run.state IN('queued','running','awaiting_budget') AND run.deadline_at>clock_timestamp()
      AND run.stage_cursor#>'{asr,done}'='true'::jsonb AND run.stage_cursor#>'{assembly,done}'='true'::jsonb
      AND run.transcript_revision_id IS NOT NULL AND run.source_version=capture.source_version
      AND capture.state IN('queued','running') AND capture.source_completeness='complete'
      AND capture.source_frozen_at IS NOT NULL AND capture.audio_expires_at>clock_timestamp()
      AND capture.active_transcript_revision_id IS DISTINCT FROM run.transcript_revision_id);
$$;
CREATE POLICY meeting_llm_private_read_v1 ON projed_core.meeting_llm_unit_checkpoints
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_llm_private_scope_v1(run_id,capture_id));
CREATE POLICY meeting_llm_private_insert_v1 ON projed_core.meeting_llm_unit_checkpoints
  FOR INSERT TO projed_runtime_disposable WITH CHECK(
    current_setting('projed.llm_phase',true) IN('claim','settle')
    AND run_id::text=current_setting('projed.llm_run_id',true)
    AND current_setting('projed.llm_verified_token',true)=current_setting('projed.llm_token',true)
    AND projed_core.meeting_llm_live_v1(run_id));
GRANT SELECT ON projed_core.meeting_llm_unit_checkpoints TO projed_runtime_disposable;
GRANT INSERT(id,capture_id,run_id,source_version,transcript_revision_id,stage,unit_key,input_hash,slot,attempt_id,payload_text,payload_hash)
  ON projed_core.meeting_llm_unit_checkpoints TO projed_runtime_disposable;
GRANT SELECT(llm_operation_token,llm_manifest),INSERT(llm_operation_token,llm_manifest),UPDATE(llm_manifest)
  ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;

-- Policies deliberately do not follow run -> usage -> run. Every bookkeeping
-- scope is exact-run/token GUC metadata; private access separately checks actor.
CREATE POLICY meeting_llm_run_read_v1 ON projed_core.meeting_analysis_runs
  FOR SELECT TO projed_runtime_disposable USING(
    provider_mode='cloud-speech-v1' AND config_version='dev139.cloud-speech.v1'
    AND stage_cursor#>'{asr,done}'='true'::jsonb AND stage_cursor#>'{assembly,done}'='true'::jsonb
    AND(current_setting('projed.llm_phase',true)='scan'
      OR(id::text=current_setting('projed.llm_run_id',true) AND current_setting('projed.llm_phase',true) IN('claim','dispatch','settle','read','finish'))));
CREATE POLICY meeting_llm_run_update_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable
  USING(id::text=current_setting('projed.llm_run_id',true) AND current_setting('projed.llm_phase',true) IN('claim','settle','finish'))
  WITH CHECK(id::text=current_setting('projed.llm_run_id',true)
    AND current_setting('projed.llm_verified_token',true)=current_setting('projed.llm_token',true));
CREATE POLICY meeting_llm_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING(provider='google-cloud-meeting'
    AND price_version='google-cloud-meeting-standard-buffered-2026-10-30-v1' AND llm_operation_token IS NOT NULL
    AND(current_setting('projed.llm_phase',true)='scan'
      OR(run_id::text=current_setting('projed.llm_run_id',true)
        AND(current_setting('projed.llm_phase',true)='claim'
          OR(current_setting('projed.llm_phase',true) IN('dispatch','settle','read')
            AND llm_operation_token::text=current_setting('projed.llm_token',true))))));
CREATE POLICY meeting_llm_usage_insert_v1 ON projed_core.meeting_ai_usage_attempts
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.llm_phase',true)='claim'
    AND run_id::text=current_setting('projed.llm_run_id',true)
    AND llm_operation_token::text=current_setting('projed.llm_verified_token',true)
    AND projed_core.meeting_llm_live_v1(run_id));
CREATE POLICY meeting_llm_usage_update_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable
  USING(run_id::text=current_setting('projed.llm_run_id',true) AND llm_operation_token::text=current_setting('projed.llm_token',true)
    AND current_setting('projed.llm_phase',true) IN('dispatch','settle'))
  WITH CHECK(llm_operation_token::text=current_setting('projed.llm_verified_token',true));
CREATE POLICY meeting_llm_budget_read_v1 ON projed_core.meeting_ai_budget_months
  FOR SELECT TO projed_runtime_disposable USING(budget_month::text=current_setting('projed.llm_month',true)
    AND current_setting('projed.llm_phase',true) IN('claim','settle')
    AND current_setting('projed.llm_verified_token',true)=current_setting('projed.llm_token',true));
CREATE POLICY meeting_llm_budget_insert_v1 ON projed_core.meeting_ai_budget_months
  FOR INSERT TO projed_runtime_disposable WITH CHECK(current_setting('projed.llm_phase',true)='claim'
    AND budget_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date
    AND budget_month::text=current_setting('projed.llm_month',true)
    AND limit_twd_micros=1000000000 AND reserved_twd_micros=0 AND spent_twd_micros=0
    AND projed_core.meeting_llm_live_v1(nullif(current_setting('projed.llm_run_id',true),'')::uuid));
CREATE POLICY meeting_llm_budget_update_v1 ON projed_core.meeting_ai_budget_months
  FOR UPDATE TO projed_runtime_disposable
  USING(budget_month::text=current_setting('projed.llm_month',true) AND current_setting('projed.llm_phase',true) IN('claim','settle'))
  WITH CHECK(current_setting('projed.llm_verified_token',true)=current_setting('projed.llm_token',true));

CREATE FUNCTION projed_core.meeting_llm_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE phase text:=current_setting('projed.llm_phase',true);expected jsonb;delta bigint;usage record;
  receipt jsonb;stage_value text;amount bigint;
BEGIN
  IF current_user<>'projed_runtime_disposable' THEN RETURN NEW; END IF;
  IF coalesce(phase,'') NOT IN('claim','dispatch','settle','finish') THEN
    IF TG_TABLE_NAME='meeting_ai_usage_attempts' THEN
      IF(TG_OP='INSERT' AND(NEW.llm_operation_token IS NOT NULL OR NEW.llm_manifest IS NOT NULL))
        OR(TG_OP='UPDATE' AND(NEW.llm_operation_token IS DISTINCT FROM OLD.llm_operation_token OR NEW.llm_manifest IS DISTINCT FROM OLD.llm_manifest))
      THEN RAISE EXCEPTION 'MEETING_LLM_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('projed.meeting_asr_phase',true),'')<>''
    OR coalesce(current_setting('projed.discussion_phase',true),'')<>''
    OR coalesce(current_setting('projed.meeting_ledger_phase',true),'')<>''
    OR nullif(current_setting('projed.llm_token',true),'') IS NULL
    OR current_setting('projed.llm_verified_token',true) IS DISTINCT FROM current_setting('projed.llm_token',true)
  THEN RAISE EXCEPTION 'MEETING_LLM_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='meeting_analysis_runs' THEN
    expected:=nullif(current_setting('projed.llm_expected_run',true),'')::jsonb;
    IF TG_OP<>'UPDATE' OR expected IS NULL OR(to_jsonb(NEW)-'updated_at') IS DISTINCT FROM expected
      OR NEW.id::text IS DISTINCT FROM current_setting('projed.llm_run_id',true)
      OR(to_jsonb(NEW)-ARRAY['state','stage_cursor','lease_token','lease_expires_at','attempt_count','next_attempt_at','actual_twd_micros','error_code','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','stage_cursor','lease_token','lease_expires_at','attempt_count','next_attempt_at','actual_twd_micros','error_code','updated_at'])
      OR NEW.stage_cursor-'llm' IS DISTINCT FROM OLD.stage_cursor-'llm'
      OR NEW.state NOT IN('queued','running','awaiting_budget','failed_terminal')
      OR OLD.provider_mode<>'cloud-speech-v1' OR OLD.config_version<>'dev139.cloud-speech.v1' OR OLD.resume_stage<>'retrieve'
      OR OLD.stage_cursor#>'{asr,done}' IS DISTINCT FROM 'true'::jsonb OR OLD.stage_cursor#>'{assembly,done}' IS DISTINCT FROM 'true'::jsonb
    THEN RAISE EXCEPTION 'MEETING_LLM_RUN_INVALID' USING ERRCODE='42501'; END IF;
    IF phase='claim' AND(NOT projed_core.meeting_llm_live_v1(OLD.id) OR OLD.state NOT IN('queued','awaiting_budget')
      OR OLD.lease_token IS NOT NULL OR OLD.lease_expires_at IS NOT NULL
      OR NOT((NEW.state='running' AND NEW.lease_token::text=current_setting('projed.llm_token',true)
        AND NEW.lease_expires_at>clock_timestamp() AND NEW.lease_expires_at<=clock_timestamp()+interval '150 seconds'
        AND NEW.attempt_count=OLD.attempt_count+1)
        OR(NEW.state='awaiting_budget' AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL
          AND NEW.attempt_count=OLD.attempt_count))) THEN
      RAISE EXCEPTION 'MEETING_LLM_CLAIM_INVALID' USING ERRCODE='42501';
    END IF;
    IF phase='settle' AND(OLD.state<>'running' OR OLD.lease_token::text IS DISTINCT FROM current_setting('projed.llm_token',true)
      OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.attempt_count<>OLD.attempt_count)
    THEN RAISE EXCEPTION 'MEETING_LLM_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    IF phase='finish' AND(OLD.state NOT IN('queued','awaiting_budget') OR OLD.lease_token IS NOT NULL OR OLD.lease_expires_at IS NOT NULL
      OR NEW.state<>'failed_terminal' OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR NEW.stage_cursor IS DISTINCT FROM OLD.stage_cursor OR NEW.attempt_count<>OLD.attempt_count
      OR NEW.actual_twd_micros IS DISTINCT FROM OLD.actual_twd_micros
      OR NEW.error_code IS NULL OR NEW.error_code NOT IN('LLM_DEADLINE_EXPIRED','LLM_SESSION_UNAVAILABLE','LLM_SOURCE_UNAVAILABLE','LLM_CONFIG_CHANGED')
      OR(NEW.error_code='LLM_DEADLINE_EXPIRED' AND OLD.deadline_at>clock_timestamp()))
    THEN RAISE EXCEPTION 'MEETING_LLM_FINISH_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='meeting_ai_usage_attempts' THEN
    expected:=nullif(current_setting('projed.llm_expected_usage',true),'')::jsonb;
    IF expected IS NULL OR(to_jsonb(NEW)-ARRAY['created_at','updated_at']) IS DISTINCT FROM expected
      OR NEW.run_id::text IS DISTINCT FROM current_setting('projed.llm_run_id',true)
      OR NEW.llm_operation_token::text IS DISTINCT FROM current_setting('projed.llm_token',true)
      OR NEW.asr_operation_token IS NOT NULL OR NEW.asr_manifest IS NOT NULL OR NEW.asr_remaining_twd_micros IS NOT NULL
      OR NEW.provider<>'google-cloud-meeting' OR NEW.price_version<>'google-cloud-meeting-standard-buffered-2026-10-30-v1'
    THEN RAISE EXCEPTION 'MEETING_LLM_USAGE_INVALID' USING ERRCODE='42501'; END IF;
    IF TG_OP='INSERT' THEN
      stage_value:=NEW.llm_manifest->>'stage';amount:=CASE WHEN stage_value='retrieve' THEN 30000 ELSE 111000000 END;
      IF phase<>'claim' OR stage_value IS NULL OR stage_value NOT IN('retrieve','match','compose') OR NEW.reserved_twd_micros<>amount
        OR NEW.actual_twd_micros IS NOT NULL OR NEW.usage_state<>'reserved' OR NEW.dispatch_state<>'pending'
        OR NEW.outcome<>'reserved' OR NOT projed_core.meeting_llm_live_v1(NEW.run_id)
        OR NEW.model IS DISTINCT FROM(CASE WHEN stage_value='retrieve' THEN 'gemini-embedding-001' ELSE 'gemini-3.5-flash' END)
      THEN RAISE EXCEPTION 'MEETING_LLM_RESERVATION_INVALID' USING ERRCODE='42501'; END IF;
    ELSE
      IF(to_jsonb(NEW)-ARRAY['dispatch_state','actual_twd_micros','usage_state','outcome','llm_manifest','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['dispatch_state','actual_twd_micros','usage_state','outcome','llm_manifest','updated_at'])
        OR OLD.usage_state<>'reserved' THEN RAISE EXCEPTION 'MEETING_LLM_USAGE_INVALID' USING ERRCODE='42501'; END IF;
      IF phase='dispatch' AND(OLD.dispatch_state<>'pending' OR NEW.dispatch_state<>'dispatched'
        OR NEW.actual_twd_micros IS NOT NULL OR NEW.usage_state<>'reserved'
        OR NEW.llm_manifest IS DISTINCT FROM OLD.llm_manifest OR NOT projed_core.meeting_llm_live_v1(OLD.run_id))
      THEN RAISE EXCEPTION 'MEETING_LLM_DISPATCH_INVALID' USING ERRCODE='42501'; END IF;
      IF phase='settle' AND(NEW.dispatch_state IS DISTINCT FROM OLD.dispatch_state
        OR NEW.llm_manifest-'settlement' IS DISTINCT FROM OLD.llm_manifest
        OR NEW.actual_twd_micros<0 OR NEW.actual_twd_micros>OLD.reserved_twd_micros)
      THEN RAISE EXCEPTION 'MEETING_LLM_SETTLEMENT_INVALID' USING ERRCODE='42501'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='meeting_ai_budget_months' THEN
    IF TG_OP='INSERT' THEN
      IF phase<>'claim' OR NEW.limit_twd_micros<>1000000000 OR NEW.reserved_twd_micros<>0 OR NEW.spent_twd_micros<>0
        OR NEW.budget_month::text IS DISTINCT FROM current_setting('projed.llm_month',true)
      THEN RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501'; END IF;
    ELSE
      expected:=nullif(current_setting('projed.llm_expected_budget',true),'')::jsonb;
      IF expected IS NULL OR(to_jsonb(NEW)-'updated_at') IS DISTINCT FROM expected
        OR NEW.budget_month<>OLD.budget_month OR NEW.limit_twd_micros<>OLD.limit_twd_micros
        OR NEW.reserved_twd_micros<0 OR NEW.spent_twd_micros<0
        OR NEW.reserved_twd_micros::numeric+NEW.spent_twd_micros::numeric>least(NEW.limit_twd_micros,1000000000)
      THEN RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501'; END IF;
      IF phase='claim' THEN
        amount:=CASE WHEN current_setting('projed.llm_stage',true)='retrieve' THEN 30000 ELSE 111000000 END;
        IF NEW.reserved_twd_micros::numeric<>OLD.reserved_twd_micros::numeric+amount OR NEW.spent_twd_micros<>OLD.spent_twd_micros
          OR NOT projed_core.meeting_llm_live_v1(nullif(current_setting('projed.llm_run_id',true),'')::uuid)
        THEN RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501'; END IF;
      ELSIF phase='settle' THEN
        SELECT attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
      reserved_twd_micros,actual_twd_micros,usage_state,outcome,created_at,dispatch_state,asr_remaining_twd_micros,
      asr_operation_token,asr_manifest,llm_operation_token,llm_manifest INTO STRICT usage FROM projed_core.meeting_ai_usage_attempts
          WHERE llm_operation_token::text=current_setting('projed.llm_token',true) AND run_id::text=current_setting('projed.llm_run_id',true);
        receipt:=nullif(current_setting('projed.llm_receipt',true),'')::jsonb;
        delta:=CASE WHEN receipt->>'kind'='usage_unknown' THEN 0 ELSE usage.reserved_twd_micros END;
        IF usage.usage_state<>'reserved' OR OLD.budget_month<>usage.dispatch_month OR receipt IS NULL
          OR NEW.reserved_twd_micros::numeric<>OLD.reserved_twd_micros::numeric-delta
          OR NEW.spent_twd_micros::numeric<>OLD.spent_twd_micros::numeric+coalesce((receipt->>'chargeMicros')::bigint,0)
        THEN RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501'; END IF;
      ELSE RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='meeting_llm_unit_checkpoints' THEN
    expected:=nullif(current_setting('projed.llm_expected_checkpoint',true),'')::jsonb;
    IF expected IS NULL OR(to_jsonb(NEW)-'created_at') IS DISTINCT FROM expected
      OR NEW.run_id::text IS DISTINCT FROM current_setting('projed.llm_run_id',true)
      OR NOT projed_core.meeting_llm_live_v1(NEW.run_id)
      OR NOT EXISTS(SELECT 1 FROM projed_core.meeting_analysis_runs run WHERE run.id=NEW.run_id
        AND run.capture_id=NEW.capture_id AND run.source_version=NEW.source_version
        AND run.transcript_revision_id=NEW.transcript_revision_id
        AND run.state='running' AND run.lease_token::text=current_setting('projed.llm_token',true)
        AND run.lease_expires_at>clock_timestamp())
      OR NOT((phase='claim' AND NEW.slot='input') OR(phase='settle' AND NEW.slot='result'))
    THEN RAISE EXCEPTION 'MEETING_LLM_CHECKPOINT_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_llm_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_llm_guard_v1();
CREATE TRIGGER meeting_llm_usage_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_llm_guard_v1();
CREATE TRIGGER meeting_llm_budget_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_budget_months
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_llm_guard_v1();
CREATE TRIGGER meeting_llm_checkpoint_guard_v1 BEFORE INSERT ON projed_core.meeting_llm_unit_checkpoints
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_llm_guard_v1();

-- Preserve every older guard outside the exact phases covered above.
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
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'finish')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();
DROP TRIGGER meeting_asr_usage_work_guard_v1 ON projed_core.meeting_ai_usage_attempts;
CREATE TRIGGER meeting_asr_usage_work_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'abandon'
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'dispatch'
    AND current_setting('projed.llm_phase',true) IS DISTINCT FROM 'settle')
  EXECUTE FUNCTION projed_core.meeting_asr_usage_work_guard_v1();
DROP TRIGGER meeting_asr_settlement_budget_guard_v1 ON projed_core.meeting_ai_budget_months;
CREATE TRIGGER meeting_asr_settlement_budget_guard_v1 BEFORE UPDATE ON projed_core.meeting_ai_budget_months
  FOR EACH ROW WHEN(current_setting('projed.llm_phase',true) IS DISTINCT FROM 'settle')
  EXECUTE FUNCTION projed_core.meeting_asr_settlement_guard_v1();

CREATE FUNCTION projed_core.claim_meeting_llm_unit_v1(target_run uuid,proposed_token uuid,unit jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;budget record;usage record;
  checkpoint projed_core.meeting_llm_unit_checkpoints;source projed_core.meeting_transcript_segments;
  stage_value text;unit_key_value text;input_hash_value text;wire text;input jsonb;body jsonb;manifest jsonb;expected jsonb;
  month_value date;amount bigint;attempt_value integer;attempt_key text;identity_value text;expires timestamptz;query_bytes integer:=0;
  source_id text;result jsonb;prior jsonb;key_name text;checkpoint_id uuid;
  keys text[]:=ARRAY['projed.llm_phase','projed.llm_run_id','projed.llm_token','projed.llm_verified_token','projed.llm_month',
    'projed.llm_stage','projed.llm_expected_run','projed.llm_expected_usage','projed.llm_expected_budget','projed.llm_expected_checkpoint'];
BEGIN
  IF target_run IS NULL OR proposed_token IS NULL OR unit IS NULL OR jsonb_typeof(unit)<>'object'
    OR unit-ARRAY['stage','unitKey','inputHash','inputText']<>'{}'::jsonb
  THEN RAISE EXCEPTION 'MEETING_LLM_INPUT_INVALID' USING ERRCODE='42501'; END IF;
  stage_value:=unit->>'stage';unit_key_value:=unit->>'unitKey';input_hash_value:=unit->>'inputHash';wire:=unit->>'inputText';
  IF stage_value IS NULL OR stage_value NOT IN('retrieve','match','compose') OR unit_key_value IS NULL
    OR unit_key_value !~ '^[a-z0-9:-]{1,96}$' OR input_hash_value IS NULL OR input_hash_value !~ '^[a-f0-9]{64}$'
    OR wire IS NULL OR octet_length(wire) NOT BETWEEN 2 AND 1048576
    OR encode(sha256(convert_to(wire,'UTF8')),'hex')<>input_hash_value
  THEN RAISE EXCEPTION 'MEETING_LLM_INPUT_INVALID' USING ERRCODE='42501'; END IF;
  input:=wire::jsonb;body:=input->'body';
  IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'configVersion' IS DISTINCT FROM 'dev139.meeting-llm.v1'
    OR jsonb_typeof(body) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'MEETING_LLM_INPUT_INVALID' USING ERRCODE='42501'; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.llm_phase','claim',true),set_config('projed.llm_run_id',target_run::text,true),
    set_config('projed.llm_token',proposed_token::text,true),set_config('projed.llm_verified_token','',true),
    set_config('projed.llm_stage',stage_value,true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run FOR UPDATE;
  IF FOUND AND projed_core.meeting_llm_live_v1(run.id) THEN
    IF input->>'sourceVersion' IS DISTINCT FROM run.source_version::text
      OR input->>'transcriptRevisionId' IS DISTINCT FROM run.transcript_revision_id::text
    THEN RAISE EXCEPTION 'MEETING_LLM_SOURCE_INVALID' USING ERRCODE='42501'; END IF;
    IF stage_value IN('retrieve','match') THEN
      IF unit_key_value !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      THEN RAISE EXCEPTION 'MEETING_LLM_SOURCE_INVALID' USING ERRCODE='42501'; END IF;
      SELECT * INTO source FROM projed_core.meeting_transcript_segments WHERE id=unit_key_value::uuid
        AND capture_id=run.capture_id AND producer_run_id=run.id AND transcript_revision_id=run.transcript_revision_id;
      IF NOT FOUND OR body->'discussion' IS DISTINCT FROM jsonb_build_object('segmentIndex',source.segment_index,
        'rawText',source.raw_text,'normalizedText',source.normalized_text,'startOffsetMs',source.start_offset_ms,
        'endOffsetMs',source.end_offset_ms,'wordOffsets',source.word_offsets,'sourceAudioRanges',source.source_audio_ranges,'sourceHash',source.source_hash)
      THEN RAISE EXCEPTION 'MEETING_LLM_SOURCE_INVALID' USING ERRCODE='42501'; END IF;
      IF stage_value='retrieve' THEN
        query_bytes:=octet_length(source.raw_text);
        IF body->>'queryText' IS DISTINCT FROM source.raw_text OR char_length(source.raw_text)>800 OR query_bytes>3200 OR query_bytes<1
        THEN RAISE EXCEPTION 'MEETING_LLM_INPUT_INVALID' USING ERRCODE='42501'; END IF;
      END IF;
    ELSE
      IF body#>>'{request,nodeId}' IS DISTINCT FROM unit_key_value OR jsonb_typeof(body#>'{request,sourceIds}') IS DISTINCT FROM 'array'
        OR jsonb_array_length(body#>'{request,sourceIds}')<2
        OR jsonb_typeof(body#>'{request,childIds}') IS DISTINCT FROM 'array'
        OR jsonb_array_length(body#>'{request,childIds}') NOT BETWEEN 2 AND 8
      THEN RAISE EXCEPTION 'MEETING_LLM_SOURCE_INVALID' USING ERRCODE='42501'; END IF;
      FOR source_id IN SELECT jsonb_array_elements_text(body#>'{request,sourceIds}') LOOP
        IF source_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
          OR NOT EXISTS(SELECT 1 FROM projed_core.meeting_transcript_segments segment WHERE segment.id=source_id::uuid
            AND segment.capture_id=run.capture_id AND segment.producer_run_id=run.id AND segment.transcript_revision_id=run.transcript_revision_id)
        THEN RAISE EXCEPTION 'MEETING_LLM_SOURCE_INVALID' USING ERRCODE='42501'; END IF;
      END LOOP;
    END IF;
    IF stage_value<>'retrieve' AND(jsonb_typeof(body->'prompt') IS DISTINCT FROM 'string'
      OR octet_length(body->>'prompt') NOT BETWEEN 1 AND 131072)
    THEN RAISE EXCEPTION 'MEETING_LLM_INPUT_INVALID' USING ERRCODE='42501'; END IF;
    IF run.state='running' AND run.lease_token=proposed_token AND run.lease_expires_at>clock_timestamp() THEN
      SELECT attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
      reserved_twd_micros,actual_twd_micros,usage_state,outcome,created_at,dispatch_state,asr_remaining_twd_micros,
      asr_operation_token,asr_manifest,llm_operation_token,llm_manifest INTO usage FROM projed_core.meeting_ai_usage_attempts WHERE run_id=run.id AND llm_operation_token=proposed_token
        AND usage_state='reserved' AND llm_manifest->>'inputHash'=input_hash_value AND llm_manifest->>'stage'=stage_value
        AND llm_manifest->>'unitKey'=unit_key_value;
      IF FOUND AND EXISTS(SELECT 1 FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id AND stage=stage_value
        AND unit_key=unit_key_value AND input_hash=input_hash_value AND slot='input' AND payload_text=wire) THEN
        result:=jsonb_build_object('status','claimed','runId',run.id,'captureId',run.capture_id,
        'sourceVersion',run.source_version,'transcriptRevisionId',run.transcript_revision_id,'leaseToken',proposed_token,
        'leaseExpiresAtMs',floor(extract(epoch FROM run.lease_expires_at)*1000)::bigint,'attemptId',usage.attempt_id,
        'stage',stage_value,'unitKey',unit_key_value,'inputHash',input_hash_value,'inputText',wire);END IF;
    ELSIF run.state IN('queued','awaiting_budget') AND run.lease_token IS NULL AND run.lease_expires_at IS NULL
      AND run.next_attempt_at<=clock_timestamp() THEN
      identity_value:=run.id::text||':llm:'||stage_value||':'||unit_key_value;
      IF EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts WHERE run_id=run.id AND usage_state IN('reserved','unknown')) THEN
        RAISE EXCEPTION 'MEETING_LLM_PRIOR_USAGE_UNRESOLVED' USING ERRCODE='42501';
      END IF;
      SELECT count(*)::integer+1 INTO attempt_value FROM projed_core.meeting_ai_usage_attempts WHERE run_id=run.id AND unit_identity=identity_value;
      SELECT * INTO checkpoint FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id AND stage=stage_value
        AND unit_key=unit_key_value AND input_hash=input_hash_value AND slot='input';
      IF FOUND AND checkpoint.payload_text<>wire THEN RAISE EXCEPTION 'MEETING_LLM_INPUT_CONFLICT' USING ERRCODE='42501'; END IF;
      IF attempt_value<=2 AND NOT EXISTS(SELECT 1 FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=run.id AND stage=stage_value
        AND unit_key=unit_key_value AND input_hash=input_hash_value AND slot='result') THEN
        month_value:=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date;
        amount:=CASE WHEN stage_value='retrieve' THEN 30000 ELSE 111000000 END;
        PERFORM set_config('projed.llm_verified_token',proposed_token::text,true),set_config('projed.llm_month',month_value::text,true);
        INSERT INTO projed_core.meeting_ai_budget_months(budget_month) VALUES(month_value) ON CONFLICT(budget_month) DO NOTHING;
        SELECT budget_month,limit_twd_micros,reserved_twd_micros,spent_twd_micros
          INTO STRICT budget FROM projed_core.meeting_ai_budget_months WHERE budget_month=month_value FOR UPDATE;
        IF budget.reserved_twd_micros<0 OR budget.spent_twd_micros<0 OR budget.limit_twd_micros<0
        THEN RAISE EXCEPTION 'MEETING_LLM_BUDGET_INVALID' USING ERRCODE='42501'; END IF;
        IF budget.reserved_twd_micros::numeric+budget.spent_twd_micros::numeric+amount>least(budget.limit_twd_micros,1000000000) THEN
          expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('state','awaiting_budget','error_code','LLM_BUDGET_UNAVAILABLE');
          PERFORM set_config('projed.llm_expected_run',expected::text,true);
          UPDATE projed_core.meeting_analysis_runs SET state='awaiting_budget',error_code='LLM_BUDGET_UNAVAILABLE',updated_at=now() WHERE id=run.id;
          result:=jsonb_build_object('status','awaiting_budget');
        ELSE
          expected:=(to_jsonb(budget)-'updated_at')||jsonb_build_object('reserved_twd_micros',budget.reserved_twd_micros+amount);
          PERFORM set_config('projed.llm_expected_budget',expected::text,true);
          UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros+amount,updated_at=now() WHERE budget_month=month_value;
          expires:=clock_timestamp()+interval '150 seconds';attempt_key:=identity_value||':'||attempt_value::text;
          manifest:=jsonb_build_object('configVersion','dev139.meeting-llm.v1','stage',stage_value,'unitKey',unit_key_value,
            'inputHash',input_hash_value,'sourceVersion',run.source_version,'transcriptRevisionId',run.transcript_revision_id,
            'attempt',attempt_value,'queryUtf8Bytes',query_bytes,'leaseExpiresAtMs',floor(extract(epoch FROM expires)*1000)::bigint,
            'costBasis','budget_estimate_not_invoice');
          expected:=to_jsonb(jsonb_populate_record(NULL::projed_core.meeting_ai_usage_attempts,jsonb_build_object(
            'attempt_id',attempt_key,'capture_id',run.capture_id,'run_id',run.id,'unit_identity',identity_value,'dispatch_month',month_value,
            'provider','google-cloud-meeting','model',CASE WHEN stage_value='retrieve' THEN 'gemini-embedding-001' ELSE 'gemini-3.5-flash' END,
            'price_version','google-cloud-meeting-standard-buffered-2026-10-30-v1','reserved_twd_micros',amount,
            'usage_state','reserved','outcome','reserved','dispatch_state','pending','llm_operation_token',proposed_token,'llm_manifest',manifest)))-ARRAY['created_at','updated_at'];
          PERFORM set_config('projed.llm_expected_usage',expected::text,true);
          INSERT INTO projed_core.meeting_ai_usage_attempts(attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,
            price_version,reserved_twd_micros,usage_state,outcome,dispatch_state,llm_operation_token,llm_manifest)
          VALUES(attempt_key,run.capture_id,run.id,identity_value,month_value,'google-cloud-meeting',
            CASE WHEN stage_value='retrieve' THEN 'gemini-embedding-001' ELSE 'gemini-3.5-flash' END,
            'google-cloud-meeting-standard-buffered-2026-10-30-v1',amount,'reserved','reserved','pending',proposed_token,manifest);
          expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('state','running','lease_token',proposed_token,
            'lease_expires_at',expires,'attempt_count',run.attempt_count+1,'error_code',NULL,
            'stage_cursor',run.stage_cursor||jsonb_build_object('llm',jsonb_build_object('stage',stage_value,'unitKey',unit_key_value,
              'inputHash',input_hash_value,'attemptId',attempt_key,'configVersion','dev139.meeting-llm.v1')));
          PERFORM set_config('projed.llm_expected_run',expected::text,true);
          UPDATE projed_core.meeting_analysis_runs SET state='running',lease_token=proposed_token,lease_expires_at=expires,
            attempt_count=attempt_count+1,error_code=NULL,stage_cursor=run.stage_cursor||jsonb_build_object('llm',jsonb_build_object(
              'stage',stage_value,'unitKey',unit_key_value,'inputHash',input_hash_value,'attemptId',attempt_key,'configVersion','dev139.meeting-llm.v1')),
            updated_at=now() WHERE id=run.id;
          IF checkpoint.id IS NULL THEN
            checkpoint_id:=gen_random_uuid();
            expected:=jsonb_build_object('id',checkpoint_id,'capture_id',run.capture_id,'run_id',run.id,'source_version',run.source_version,
              'transcript_revision_id',run.transcript_revision_id,'stage',stage_value,'unit_key',unit_key_value,'input_hash',input_hash_value,
              'slot','input','attempt_id',NULL,'payload_text',wire,'payload_hash',input_hash_value);
            PERFORM set_config('projed.llm_expected_checkpoint',expected::text,true);
            INSERT INTO projed_core.meeting_llm_unit_checkpoints(id,capture_id,run_id,source_version,transcript_revision_id,stage,unit_key,input_hash,slot,payload_text,payload_hash)
              VALUES(checkpoint_id,run.capture_id,run.id,run.source_version,run.transcript_revision_id,stage_value,unit_key_value,input_hash_value,'input',wire,input_hash_value);
          END IF;
          result:=jsonb_build_object('status','claimed','runId',run.id,'captureId',run.capture_id,'sourceVersion',run.source_version,
            'transcriptRevisionId',run.transcript_revision_id,'leaseToken',proposed_token,'leaseExpiresAtMs',floor(extract(epoch FROM expires)*1000)::bigint,
            'attemptId',attempt_key,'stage',stage_value,'unitKey',unit_key_value,'inputHash',input_hash_value,'inputText',wire);
        END IF;
      END IF;
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION projed_core.mark_meeting_llm_dispatch_v1(target_run uuid,token uuid,input_hash_value text,read_only boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;usage record;result boolean:=false;prior jsonb;key_name text;
  keys text[]:=ARRAY['projed.llm_phase','projed.llm_run_id','projed.llm_token','projed.llm_verified_token','projed.llm_expected_usage'];
BEGIN
  IF target_run IS NULL OR token IS NULL OR input_hash_value IS NULL OR input_hash_value !~ '^[a-f0-9]{64}$' OR read_only IS NULL THEN RETURN false;END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.llm_phase','dispatch',true),set_config('projed.llm_run_id',target_run::text,true),
    set_config('projed.llm_token',token::text,true),set_config('projed.llm_verified_token','',true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run;
  IF FOUND AND projed_core.meeting_llm_live_v1(run.id) AND run.state='running' AND run.lease_token=token AND run.lease_expires_at>clock_timestamp() THEN
    SELECT attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
      reserved_twd_micros,actual_twd_micros,usage_state,outcome,created_at,dispatch_state,asr_remaining_twd_micros,
      asr_operation_token,asr_manifest,llm_operation_token,llm_manifest INTO usage FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run AND llm_operation_token=token;
    IF FOUND AND usage.usage_state='reserved' AND usage.llm_manifest->>'inputHash'=input_hash_value
      AND usage.dispatch_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date THEN
      PERFORM set_config('projed.llm_verified_token',token::text,true);
      IF usage.dispatch_state='dispatched' THEN result:=true;
      ELSIF usage.dispatch_state='pending' AND NOT read_only THEN
        PERFORM set_config('projed.llm_expected_usage',((to_jsonb(usage)-ARRAY['created_at','updated_at'])||jsonb_build_object('dispatch_state','dispatched'))::text,true);
        UPDATE projed_core.meeting_ai_usage_attempts SET dispatch_state='dispatched',updated_at=now() WHERE attempt_id=usage.attempt_id;
        result:=FOUND;
      END IF;
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION projed_core.meeting_llm_charge_v1(stage_value text,usage jsonb,query_bytes integer)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE key_name text;value numeric;values_map jsonb:='{}'::jsonb;prompt_value bigint;candidate_value bigint;thought_value bigint;total_value bigint;
BEGIN
  IF usage IS NULL OR jsonb_typeof(usage)<>'object' THEN RETURN NULL;END IF;
  IF stage_value='retrieve' THEN
    IF query_bytes IS NULL OR query_bytes NOT BETWEEN 1 AND 3200
      OR jsonb_typeof(usage->'tokenCount') IS DISTINCT FROM 'number' THEN RETURN NULL;END IF;
    value:=(usage->>'tokenCount')::numeric;
    IF value<1 OR value>2048 OR trunc(value)<>value THEN RETURN NULL;END IF;
    total_value:=greatest(query_bytes,value::bigint);
    IF usage->'billableCharacterCount' IS NOT NULL AND usage->'billableCharacterCount'<>'null'::jsonb THEN
      IF jsonb_typeof(usage->'billableCharacterCount')<>'number' THEN RETURN NULL;END IF;
      value:=(usage->>'billableCharacterCount')::numeric;
      IF value<0 OR value>4096 OR trunc(value)<>value THEN RETURN NULL;END IF;
      total_value:=greatest(total_value,value::bigint);
    END IF;
    RETURN total_value*6;
  ELSIF stage_value IN('match','compose') THEN
    FOREACH key_name IN ARRAY ARRAY['promptTokens','candidateTokens','thoughtTokens','totalTokens'] LOOP
      IF NOT(usage ? key_name) AND key_name IN('candidateTokens','thoughtTokens') THEN value:=0;
      ELSIF jsonb_typeof(usage->key_name) IS DISTINCT FROM 'number' THEN RETURN NULL;
      ELSE value:=(usage->>key_name)::numeric;END IF;
      IF value<0 OR trunc(value)<>value OR value>(CASE WHEN key_name='promptTokens' THEN 1048576
        WHEN key_name='totalTokens' THEN 1179648 ELSE 65536 END) THEN RETURN NULL;END IF;
      values_map:=values_map||jsonb_build_object(key_name,value::bigint);
    END LOOP;
    prompt_value:=(values_map->>'promptTokens')::bigint;candidate_value:=(values_map->>'candidateTokens')::bigint;
    thought_value:=(values_map->>'thoughtTokens')::bigint;total_value:=(values_map->>'totalTokens')::bigint;
    IF total_value<>prompt_value+candidate_value+thought_value THEN RETURN NULL;END IF;
    IF usage ? 'cachedTokens' THEN
      IF jsonb_typeof(usage->'cachedTokens') IS DISTINCT FROM 'number' THEN RETURN NULL;END IF;
      value:=(usage->>'cachedTokens')::numeric;
      IF value<0 OR value>prompt_value OR trunc(value)<>value THEN RETURN NULL;END IF;
    END IF;
    RETURN prompt_value*60+(candidate_value+thought_value)*360;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION projed_core.settle_meeting_llm_unit_v1(target_run uuid,token uuid,payload jsonb)
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
    OR(payload ? 'responseId' AND(coalesce(payload->>'responseId','') !~ '^[a-zA-Z0-9._:/=-]{1,256}$'))
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

CREATE FUNCTION projed_core.scan_meeting_llm_work_v1(max_items integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE prior text;result jsonb;
BEGIN
  IF max_items IS NULL OR max_items NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'MEETING_LLM_SCAN_INVALID' USING ERRCODE='42501';END IF;
  prior:=current_setting('projed.llm_phase',true);PERFORM set_config('projed.llm_phase','scan',true);
  WITH candidates AS(
    SELECT usage.run_id,usage.created_at,0 AS priority,
      jsonb_build_object('kind','recover','runId',usage.run_id,'operationToken',usage.llm_operation_token) AS item
      FROM projed_core.meeting_ai_usage_attempts usage LEFT JOIN projed_core.meeting_analysis_runs run ON run.id=usage.run_id
      WHERE usage.llm_operation_token IS NOT NULL AND usage.usage_state='reserved'
        AND((run.state='running' AND run.lease_token=usage.llm_operation_token AND run.lease_expires_at<=clock_timestamp())
          OR((run.id IS NULL OR run.state IN('cancelled','failed_terminal','ready') OR run.lease_token IS DISTINCT FROM usage.llm_operation_token)
            AND usage.created_at<=clock_timestamp()-interval '180 seconds'))
    UNION ALL
    SELECT run.id,run.created_at,1,jsonb_build_object('kind','queued','runId',run.id,'operationToken',NULL,'deadlineExpired',run.deadline_at<=clock_timestamp())
      FROM projed_core.meeting_analysis_runs run WHERE run.provider_mode='cloud-speech-v1' AND run.config_version='dev139.cloud-speech.v1'
        AND run.resume_stage='retrieve' AND run.stage_cursor#>'{asr,done}'='true'::jsonb AND run.stage_cursor#>'{assembly,done}'='true'::jsonb
        AND run.state IN('queued','awaiting_budget') AND run.lease_token IS NULL AND run.lease_expires_at IS NULL
        AND run.next_attempt_at<=clock_timestamp()
  ), ranked AS(SELECT *,row_number() OVER(ORDER BY priority,created_at,run_id)-1 AS position,count(*) OVER() AS total FROM candidates),
  rotated AS(SELECT *,mod(position+total-mod(floor(extract(epoch FROM now())/60)::bigint,total),total) AS scan_order FROM ranked),
  bounded AS(SELECT * FROM rotated ORDER BY scan_order LIMIT max_items)
  SELECT coalesce(jsonb_agg(item ORDER BY scan_order),'[]'::jsonb) INTO result FROM bounded;
  PERFORM set_config('projed.llm_phase',coalesce(prior,''),true);RETURN result;
END;
$$;

CREATE FUNCTION projed_core.recover_meeting_llm_unit_v1(target_run uuid,token uuid,read_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE prior jsonb;key_name text;usage record;run projed_core.meeting_analysis_runs;kind_value text;receipt jsonb;
  keys text[]:=ARRAY['projed.llm_phase','projed.llm_run_id','projed.llm_token'];
BEGIN
  IF target_run IS NULL OR token IS NULL OR read_only IS NULL THEN RETURN NULL;END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.llm_phase','read',true),set_config('projed.llm_run_id',target_run::text,true),set_config('projed.llm_token',token::text,true);
  SELECT attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
      reserved_twd_micros,actual_twd_micros,usage_state,outcome,created_at,dispatch_state,asr_remaining_twd_micros,
      asr_operation_token,asr_manifest,llm_operation_token,llm_manifest INTO usage FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run AND llm_operation_token=token;
  IF FOUND AND usage.usage_state IN('known','unknown') THEN receipt:=usage.llm_manifest->'settlement';
  ELSIF FOUND AND NOT read_only AND usage.usage_state='reserved' THEN
    SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run;
    IF(run.state='running' AND run.lease_token=token AND run.lease_expires_at<=clock_timestamp())
      OR((run.id IS NULL OR run.state IN('cancelled','failed_terminal','ready') OR run.lease_token IS DISTINCT FROM token)
        AND usage.created_at<=clock_timestamp()-interval '180 seconds') THEN
      kind_value:=CASE WHEN usage.dispatch_state='pending' THEN 'not_sent' ELSE 'usage_unknown' END;
      receipt:=projed_core.settle_meeting_llm_unit_v1(target_run,token,jsonb_build_object('kind',kind_value,'code','LLM_LEASE_EXPIRED'));
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN receipt;
END;
$$;

REVOKE ALL ON FUNCTION projed_core.meeting_llm_private_scope_v1(uuid,uuid),projed_core.meeting_llm_live_v1(uuid),
  projed_core.meeting_llm_guard_v1(),projed_core.claim_meeting_llm_unit_v1(uuid,uuid,jsonb),
  projed_core.mark_meeting_llm_dispatch_v1(uuid,uuid,text,boolean),projed_core.meeting_llm_charge_v1(text,jsonb,integer),
  projed_core.settle_meeting_llm_unit_v1(uuid,uuid,jsonb),projed_core.scan_meeting_llm_work_v1(integer),
  projed_core.recover_meeting_llm_unit_v1(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_llm_private_scope_v1(uuid,uuid),projed_core.meeting_llm_live_v1(uuid),
  projed_core.meeting_llm_guard_v1(),projed_core.claim_meeting_llm_unit_v1(uuid,uuid,jsonb),
  projed_core.mark_meeting_llm_dispatch_v1(uuid,uuid,text,boolean),projed_core.meeting_llm_charge_v1(text,jsonb,integer),
  projed_core.settle_meeting_llm_unit_v1(uuid,uuid,jsonb),projed_core.scan_meeting_llm_work_v1(integer),
  projed_core.recover_meeting_llm_unit_v1(uuid,uuid,boolean) TO projed_runtime_disposable;

CREATE FUNCTION projed_core.finish_meeting_llm_work_v1(target_run uuid,reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;token uuid:=gen_random_uuid();expected jsonb;result boolean:=false;prior jsonb;key_name text;
  keys text[]:=ARRAY['projed.llm_phase','projed.llm_run_id','projed.llm_token','projed.llm_verified_token','projed.llm_expected_run'];
BEGIN
  IF target_run IS NULL OR reason IS NULL OR reason NOT IN('LLM_DEADLINE_EXPIRED','LLM_SESSION_UNAVAILABLE','LLM_SOURCE_UNAVAILABLE','LLM_CONFIG_CHANGED')
  THEN RAISE EXCEPTION 'MEETING_LLM_FINISH_INVALID' USING ERRCODE='42501';END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.llm_phase','finish',true),set_config('projed.llm_run_id',target_run::text,true),
    set_config('projed.llm_token',token::text,true),set_config('projed.llm_verified_token',token::text,true);
  SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run FOR UPDATE;
  IF FOUND AND run.state IN('queued','awaiting_budget') AND run.lease_token IS NULL AND run.lease_expires_at IS NULL
    AND(reason<>'LLM_DEADLINE_EXPIRED' OR run.deadline_at<=clock_timestamp()) THEN
    expected:=(to_jsonb(run)-'updated_at')||jsonb_build_object('state','failed_terminal','error_code',reason);
    PERFORM set_config('projed.llm_expected_run',expected::text,true);
    UPDATE projed_core.meeting_analysis_runs SET state='failed_terminal',error_code=reason,updated_at=now() WHERE id=run.id;
    result:=FOUND;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true);END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.finish_meeting_llm_work_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.finish_meeting_llm_work_v1(uuid,text) TO projed_runtime_disposable;
