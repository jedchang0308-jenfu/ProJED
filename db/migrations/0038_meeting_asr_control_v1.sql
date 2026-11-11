-- A bounded metadata-only view over the existing ASR queue. No content, source
-- paths or user identity is returned, and scans acquire no row locks.
GRANT SELECT(created_at) ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
CREATE FUNCTION projed_core.meeting_asr_control_scope_v1(target_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
  SELECT current_setting('projed.meeting_asr_phase',true)='scan'
    OR(target_run_id::text=current_setting('projed.meeting_asr_run_id',true)
      AND((current_setting('projed.meeting_asr_phase',true)='recover'
        AND nullif(current_setting('projed.meeting_asr_token',true),'') IS NOT NULL
        AND current_setting('projed.meeting_asr_verified_token',true)=current_setting('projed.meeting_asr_token',true))
      OR(current_setting('projed.meeting_asr_phase',true)='abandon'
        AND target_run_id::text=current_setting('projed.meeting_asr_verified_pool_run',true))));
$$;
CREATE POLICY meeting_asr_control_run_read_v1 ON projed_core.meeting_analysis_runs
  FOR SELECT TO projed_runtime_disposable USING(projed_core.meeting_asr_control_scope_v1(id)
    AND provider_mode='cloud-speech-v1' AND config_version='dev139.cloud-speech.v1');
CREATE POLICY meeting_asr_control_usage_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING(provider='google-cloud-speech' AND model='default'
    AND price_version='google-cloud-speech-v1-standard-no-data-logging-2026-10-29'
    AND(current_setting('projed.meeting_asr_phase',true)='scan'
      OR(run_id::text=current_setting('projed.meeting_asr_run_id',true)
        AND(current_setting('projed.meeting_asr_phase',true)='abandon'
          OR(current_setting('projed.meeting_asr_phase',true)='recover'
            AND asr_operation_token::text=current_setting('projed.meeting_asr_token',true))))));
-- SELECT FOR UPDATE needs a matching UPDATE policy. These are lock-only:
-- no new row version can pass their WITH CHECK.
CREATE POLICY meeting_asr_recover_run_lock_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='recover'
    AND projed_core.meeting_asr_control_scope_v1(id)) WITH CHECK(false);
CREATE POLICY meeting_asr_recover_unit_lock_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='recover'
    AND run_id::text=current_setting('projed.meeting_asr_run_id',true)
    AND asr_operation_token::text=current_setting('projed.meeting_asr_token',true)) WITH CHECK(false);
CREATE POLICY meeting_asr_abandon_unit_lock_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='abandon'
    AND run_id::text=current_setting('projed.meeting_asr_verified_pool_run',true)
    AND run_id::text=current_setting('projed.meeting_asr_run_id',true) AND asr_operation_token IS NOT NULL) WITH CHECK(false);
CREATE POLICY meeting_asr_abandon_run_lock_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='abandon'
    AND projed_core.meeting_asr_control_scope_v1(id)) WITH CHECK(false);

CREATE FUNCTION projed_core.scan_meeting_asr_work_v1(max_items integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE result jsonb;prior_phase text;
BEGIN
  IF max_items IS NULL OR max_items NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'MEETING_ASR_SCAN_INVALID' USING ERRCODE='42501'; END IF;
  prior_phase:=current_setting('projed.meeting_asr_phase',true);
  PERFORM set_config('projed.meeting_asr_phase','scan',true);
  WITH candidates AS (
    SELECT usage.run_id,0 AS priority,usage.created_at,
      jsonb_build_object('kind','recover_unit','runId',usage.run_id,'operationToken',usage.asr_operation_token) AS item
      FROM projed_core.meeting_ai_usage_attempts usage LEFT JOIN projed_core.meeting_analysis_runs run ON run.id=usage.run_id
      WHERE usage.run_id IS NOT NULL AND usage.asr_operation_token IS NOT NULL AND usage.usage_state='reserved'
        AND usage.dispatch_state IN('pending','dispatched')
        AND((run.state='running' AND run.lease_token=usage.asr_operation_token AND run.lease_expires_at<=clock_timestamp())
          OR((run.id IS NULL OR run.state IN('cancelled','failed_terminal','ready')
            OR run.lease_token IS DISTINCT FROM usage.asr_operation_token)
            AND usage.created_at<=clock_timestamp()-interval '180 seconds'))
    UNION ALL
    SELECT pool.run_id,1,pool.created_at,jsonb_build_object('kind','recover_pool','runId',pool.run_id)
      FROM projed_core.meeting_ai_usage_attempts pool LEFT JOIN projed_core.meeting_analysis_runs run ON run.id=pool.run_id
      WHERE pool.run_id IS NOT NULL AND pool.attempt_id=pool.run_id::text||':cloud-speech:pool'
        AND pool.unit_identity=pool.run_id::text||':asr-reservation' AND pool.asr_operation_token IS NULL
        AND pool.usage_state='reserved' AND pool.dispatch_state='pending' AND pool.actual_twd_micros IS NULL
        AND(run.id IS NULL OR run.state IN('cancelled','failed_terminal','ready'))
        AND NOT EXISTS(SELECT 1 FROM projed_core.meeting_ai_usage_attempts unit WHERE unit.run_id=pool.run_id
          AND unit.asr_operation_token IS NOT NULL AND unit.usage_state IN('reserved','unknown'))
    UNION ALL
    SELECT run.id,2,run.created_at,jsonb_build_object('kind','queued','runId',run.id,
        'deadlineExpired',run.deadline_at<=clock_timestamp(),
        'budgetMonthCurrent',run.budget_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date)
      FROM projed_core.meeting_analysis_runs run WHERE run.state='queued' AND run.resume_stage='transcribe'
        AND run.authorization_context_id IS NOT NULL AND run.deadline_at IS NOT NULL AND run.budget_month IS NOT NULL
        AND run.lease_token IS NULL AND run.lease_expires_at IS NULL
        AND(run.next_attempt_at<=clock_timestamp() OR run.deadline_at<=clock_timestamp()
          OR run.budget_month<>date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date)
  ), unique_runs AS (
    SELECT DISTINCT ON(run_id) run_id,priority,created_at,item FROM candidates ORDER BY run_id,priority,created_at
  ), ranked AS(
    SELECT *,row_number() OVER(ORDER BY priority,created_at,run_id)-1 AS position,count(*) OVER() AS total FROM unique_runs
  ), rotated AS(
    -- Advance one position per minute. Temporarily unavailable first-page
    -- Sessions cannot permanently hide healthy runs; no cursor table is needed.
    SELECT *,mod(position+total-mod(floor(extract(epoch FROM now())/60)::bigint,total),total) AS scan_order FROM ranked
  ), bounded AS(SELECT * FROM rotated ORDER BY scan_order LIMIT max_items)
  SELECT coalesce(jsonb_agg(item ORDER BY scan_order),'[]'::jsonb) INTO result FROM bounded;
  PERFORM set_config('projed.meeting_asr_phase',coalesce(prior_phase,''),true);
  RETURN result;
END;
$$;

-- This RPC makes the recovery decision under the existing app lock. Callers
-- cannot turn an expired dispatched request into a known-unsent request.
CREATE FUNCTION projed_core.recover_meeting_asr_unit_v1(target_run_id uuid,claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;unit record;receipt jsonb;payload jsonb;prior jsonb;key_name text;
  keys text[]:=ARRAY['projed.meeting_asr_phase','projed.meeting_asr_run_id','projed.meeting_asr_token','projed.meeting_asr_verified_token'];
BEGIN
  IF target_run_id IS NULL OR claim_token IS NULL THEN RAISE EXCEPTION 'MEETING_ASR_RECOVERY_INVALID' USING ERRCODE='42501'; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.meeting_asr_phase','recover',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true),
    set_config('projed.meeting_asr_token',claim_token::text,true),set_config('projed.meeting_asr_verified_token','',true);
  PERFORM 1 FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run_id AND asr_operation_token=claim_token;
  IF FOUND THEN
    PERFORM set_config('projed.meeting_asr_verified_token',claim_token::text,true);
    SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
    SELECT usage_state,dispatch_state,created_at INTO STRICT unit FROM projed_core.meeting_ai_usage_attempts
      WHERE run_id=target_run_id AND asr_operation_token=claim_token FOR UPDATE;
    IF unit.usage_state='reserved' AND unit.dispatch_state IN('pending','dispatched')
      AND((run.state='running' AND run.lease_token=claim_token AND run.lease_expires_at<=clock_timestamp())
        OR((run.id IS NULL OR run.state IN('cancelled','failed_terminal','ready') OR run.lease_token IS DISTINCT FROM claim_token)
          AND unit.created_at<=clock_timestamp()-interval '180 seconds')) THEN
      payload:=jsonb_build_object('kind',CASE WHEN unit.dispatch_state='pending' THEN 'not_sent' ELSE 'usage_unknown' END,
        'code','ASR_LEASE_EXPIRED');
      receipt:=projed_core.settle_meeting_asr_unit_v1(target_run_id,claim_token,payload);
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN jsonb_build_object('recovered',receipt IS NOT NULL,'kind',payload->>'kind',
    'retryScheduled',coalesce(receipt->>'nextState'='queued' AND run.lease_token=claim_token,false));
END;
$$;

CREATE POLICY meeting_asr_abandon_run_update_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='abandon'
    AND projed_core.meeting_asr_control_scope_v1(id) AND state='queued' AND resume_stage='transcribe'
    AND lease_token IS NULL AND lease_expires_at IS NULL)
  WITH CHECK(projed_core.meeting_asr_control_scope_v1(id) AND state='failed_terminal');
CREATE POLICY meeting_asr_abandon_pool_update_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='abandon'
    AND run_id::text=current_setting('projed.meeting_asr_verified_pool_run',true)
    AND attempt_id=run_id::text||':cloud-speech:pool' AND asr_operation_token IS NULL
    AND usage_state='reserved' AND dispatch_state='pending')
  WITH CHECK(attempt_id=run_id::text||':cloud-speech:pool' AND usage_state='known' AND actual_twd_micros=0);
CREATE POLICY meeting_asr_abandon_budget_read_v1 ON projed_core.meeting_ai_budget_months
  FOR SELECT TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='abandon'
    AND budget_month::text=current_setting('projed.meeting_asr_abandon_month',true)
    AND current_setting('projed.meeting_asr_run_id',true)=current_setting('projed.meeting_asr_verified_pool_run',true));
CREATE POLICY meeting_asr_abandon_budget_update_v1 ON projed_core.meeting_ai_budget_months
  FOR UPDATE TO projed_runtime_disposable USING(current_setting('projed.meeting_asr_phase',true)='abandon'
    AND budget_month::text=current_setting('projed.meeting_asr_abandon_month',true)
    AND current_setting('projed.meeting_asr_run_id',true)=current_setting('projed.meeting_asr_verified_pool_run',true))
  WITH CHECK(budget_month::text=current_setting('projed.meeting_asr_abandon_month',true));

CREATE FUNCTION projed_core.meeting_asr_abandon_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE pool record;reason text;
BEGIN
  IF current_user<>'projed_runtime_disposable' OR current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'abandon' THEN RETURN NEW; END IF;
  reason:=current_setting('projed.meeting_asr_abandon_reason',true);
  IF nullif(reason,'') IS NULL OR current_setting('projed.meeting_asr_run_id',true)
    IS DISTINCT FROM current_setting('projed.meeting_asr_verified_pool_run',true) THEN
    RAISE EXCEPTION 'MEETING_ASR_ABANDON_INVALID' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='meeting_analysis_runs' THEN
    IF OLD.id::text<>current_setting('projed.meeting_asr_run_id',true) OR OLD.state<>'queued' OR OLD.resume_stage<>'transcribe'
      OR OLD.lease_token IS NOT NULL OR OLD.lease_expires_at IS NOT NULL OR NEW.state<>'failed_terminal' OR NEW.error_code<>reason
      OR(to_jsonb(NEW)-ARRAY['state','error_code','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','error_code','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_ASR_ABANDON_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='meeting_ai_usage_attempts' THEN
    IF OLD.attempt_id<>current_setting('projed.meeting_asr_run_id',true)||':cloud-speech:pool'
      OR OLD.provider<>'google-cloud-speech' OR OLD.model<>'default' OR OLD.price_version<>'google-cloud-speech-v1-standard-no-data-logging-2026-10-29'
      OR OLD.usage_state<>'reserved' OR OLD.dispatch_state IS DISTINCT FROM 'pending' OR OLD.actual_twd_micros IS NOT NULL
      OR NEW.usage_state<>'known' OR NEW.actual_twd_micros IS DISTINCT FROM 0 OR NEW.outcome<>'asr_pool_abandoned'
      OR NEW.asr_remaining_twd_micros IS DISTINCT FROM 0
      OR(to_jsonb(NEW)-ARRAY['actual_twd_micros','usage_state','outcome','asr_remaining_twd_micros','updated_at'])
        IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['actual_twd_micros','usage_state','outcome','asr_remaining_twd_micros','updated_at'])
    THEN RAISE EXCEPTION 'MEETING_ASR_ABANDON_INVALID' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='meeting_ai_budget_months' THEN
    SELECT dispatch_month,reserved_twd_micros,asr_remaining_twd_micros INTO STRICT pool
      FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=current_setting('projed.meeting_asr_run_id',true)||':cloud-speech:pool'
        AND usage_state='reserved' AND dispatch_state='pending' AND actual_twd_micros IS NULL;
    IF OLD.budget_month<>pool.dispatch_month OR OLD.limit_twd_micros<0 OR OLD.spent_twd_micros<0
      OR coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros)<0
      OR OLD.reserved_twd_micros<coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros)
      OR NEW.budget_month IS DISTINCT FROM OLD.budget_month OR NEW.limit_twd_micros IS DISTINCT FROM OLD.limit_twd_micros
      OR NEW.spent_twd_micros IS DISTINCT FROM OLD.spent_twd_micros
      OR NEW.reserved_twd_micros::numeric<>OLD.reserved_twd_micros::numeric-coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros)::numeric
    THEN RAISE EXCEPTION 'MEETING_ASR_ABANDON_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER meeting_asr_usage_work_guard_v1 ON projed_core.meeting_ai_usage_attempts;
CREATE TRIGGER meeting_asr_usage_work_guard_v1 BEFORE INSERT OR UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'abandon')
  EXECUTE FUNCTION projed_core.meeting_asr_usage_work_guard_v1();
DROP TRIGGER meeting_run_cancel_guard_v1 ON projed_core.meeting_analysis_runs;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW WHEN(current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'prepare'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'claim'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'settle'
    AND current_setting('projed.meeting_asr_phase',true) IS DISTINCT FROM 'abandon')
  EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();
CREATE TRIGGER meeting_asr_abandon_run_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_abandon_guard_v1();
CREATE TRIGGER meeting_asr_abandon_pool_guard_v1 BEFORE UPDATE ON projed_core.meeting_ai_usage_attempts
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_abandon_guard_v1();
CREATE TRIGGER meeting_asr_abandon_budget_guard_v1 BEFORE UPDATE ON projed_core.meeting_ai_budget_months
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_asr_abandon_guard_v1();

-- Only tokenless pool remainder can be abandoned. Existing unit reservations,
-- including unknown charges, require their own exact-token recovery first.
CREATE FUNCTION projed_core.abandon_meeting_asr_run_v1(target_run_id uuid,reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,projed_core AS $$
DECLARE run projed_core.meeting_analysis_runs;pool record;prior jsonb;key_name text;result boolean:=false;
  keys text[]:=ARRAY['projed.meeting_asr_phase','projed.meeting_asr_run_id','projed.meeting_asr_verified_pool_run',
    'projed.meeting_asr_abandon_reason','projed.meeting_asr_abandon_month'];
BEGIN
  IF target_run_id IS NULL OR reason NOT IN('ASR_SESSION_UNAVAILABLE','ASR_SOURCE_UNAVAILABLE','ASR_DEADLINE_EXPIRED','ASR_BUDGET_MONTH_CHANGED')
    OR reason IS NULL THEN RAISE EXCEPTION 'MEETING_ASR_ABANDON_INVALID' USING ERRCODE='42501'; END IF;
  SELECT jsonb_object_agg(settings.key_name,current_setting(settings.key_name,true)) INTO prior FROM unnest(keys) settings(key_name);
  PERFORM pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0));
  PERFORM set_config('projed.meeting_asr_phase','abandon',true),set_config('projed.meeting_asr_run_id',target_run_id::text,true),
    set_config('projed.meeting_asr_verified_pool_run','',true),set_config('projed.meeting_asr_abandon_reason',reason,true);
  PERFORM 1 FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=target_run_id::text||':cloud-speech:pool'
    AND unit_identity=target_run_id::text||':asr-reservation' AND usage_state='reserved'
    AND dispatch_state='pending' AND actual_twd_micros IS NULL AND asr_operation_token IS NULL;
  IF FOUND THEN
    PERFORM set_config('projed.meeting_asr_verified_pool_run',target_run_id::text,true);
    SELECT * INTO run FROM projed_core.meeting_analysis_runs WHERE id=target_run_id FOR UPDATE;
    -- An active unit owns its own result. Never release its pool on a stale scan.
    IF run.id IS NULL OR(run.state='queued' AND run.resume_stage='transcribe' AND run.lease_token IS NULL AND run.lease_expires_at IS NULL)
      OR run.state IN('cancelled','failed_terminal','ready') THEN
      PERFORM 1 FROM projed_core.meeting_ai_usage_attempts WHERE run_id=target_run_id AND asr_operation_token IS NOT NULL
        AND usage_state IN('reserved','unknown') ORDER BY attempt_id FOR UPDATE;
      IF NOT FOUND THEN
        SELECT attempt_id,dispatch_month,reserved_twd_micros,asr_remaining_twd_micros INTO STRICT pool
          FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=target_run_id::text||':cloud-speech:pool' FOR UPDATE;
        PERFORM set_config('projed.meeting_asr_abandon_month',pool.dispatch_month::text,true);
        UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=reserved_twd_micros-coalesce(pool.asr_remaining_twd_micros,pool.reserved_twd_micros),updated_at=now()
          WHERE budget_month=pool.dispatch_month;
        IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_ASR_BUDGET_UNAVAILABLE' USING ERRCODE='42501'; END IF;
        UPDATE projed_core.meeting_ai_usage_attempts SET actual_twd_micros=0,usage_state='known',outcome='asr_pool_abandoned',
          asr_remaining_twd_micros=0,updated_at=now()
          WHERE attempt_id=pool.attempt_id;
        IF run.id IS NOT NULL AND run.state='queued' THEN
          UPDATE projed_core.meeting_analysis_runs SET state='failed_terminal',error_code=reason,updated_at=now() WHERE id=run.id;
        END IF;
        result:=true;
      END IF;
    END IF;
  END IF;
  FOREACH key_name IN ARRAY keys LOOP PERFORM set_config(key_name,coalesce(prior->>key_name,''),true); END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION projed_core.meeting_asr_control_scope_v1(uuid),projed_core.scan_meeting_asr_work_v1(integer),
  projed_core.recover_meeting_asr_unit_v1(uuid,uuid),projed_core.meeting_asr_abandon_guard_v1(),
  projed_core.abandon_meeting_asr_run_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_asr_control_scope_v1(uuid),projed_core.scan_meeting_asr_work_v1(integer),
  projed_core.recover_meeting_asr_unit_v1(uuid,uuid),projed_core.meeting_asr_abandon_guard_v1(),
  projed_core.abandon_meeting_asr_run_v1(uuid,text) TO projed_runtime_disposable;
