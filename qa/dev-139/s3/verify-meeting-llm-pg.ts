import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import type pg from 'pg';

import {runActorTransaction,type ActorQueryPort,type ServerActorV1} from '../../../server/actorTransaction.js';
import type {RuntimeConfig} from '../../../server/config.js';
import type {RuntimeDatabase} from '../../../server/db.js';
import {KernelError} from '../../../server/errors.js';
import {runMeetingMaintenanceTransaction} from '../../../server/meetingAsrRepository.js';
import {createPostgresMeetingLlmRepository,prepareMeetingLlmUnit,type MeetingLlmClaim,
  type MeetingLlmEnvelope,type MeetingLlmPreparedUnit,type MeetingLlmReceipt,type MeetingLlmSettlement}
  from '../../../server/meetingLlmRepository.js';
import {MEETING_LLM_CONFIG_VERSION,meetingLlmCharge,type MeetingLlmStage,type MeetingLlmUsage}
  from '../../../server/meetingLlmPricing.js';

type DiscussionInput={
  segmentIndex:number;rawText:string;normalizedText:string;startOffsetMs:number;endOffsetMs:number;
  wordOffsets:unknown;sourceAudioRanges:unknown;sourceHash:string;
};
type SourceFixture={
  readonly recordId:string;readonly captureId:string;readonly sourceVersion:number;readonly sourceRunId:string;
  readonly transcriptRevisionId:string;readonly segmentId:string;readonly discussion:DiscussionInput;readonly queryText:string;
};
type CloneFixture=SourceFixture&{readonly runId:string};
type BudgetState={readonly budget_month:string;readonly limit_twd_micros:string;readonly reserved_twd_micros:string;
  readonly spent_twd_micros:string};
type LedgerState={readonly run_state:string;readonly attempt_count:number;readonly usage_count:number;readonly checkpoint_count:number;
  readonly usage_state:string|null;readonly dispatch_state:string|null;readonly actual_twd_micros:string|null;
  readonly reserved_twd_micros:string|null;readonly llm_manifest:unknown};

function object(value:unknown,label:string):Record<string,unknown>{
  assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value),`${label} must be an object`);
  return value as Record<string,unknown>;
}
function isExpectedDenial(error:unknown):boolean{
  if(!(error instanceof KernelError))return false;
  if(['ACCESS_DENIED','IDENTITY_INVALID','ACTOR_CHANGED','ACTOR_INVALID','RESOURCE_NOT_FOUND'].includes(error.code))return true;
  const cause=error.cause;
  return cause!==null&&typeof cause==='object'&&'code' in cause&&cause.code==='42501';
}
function assertClaim(value:MeetingLlmClaim|null|'awaiting_budget',label:string):asserts value is MeetingLlmClaim{
  assert.ok(value&&value!=='awaiting_budget',`${label} should be a live claim`);
}

/** Native SQL qualification uses only synthetic fixture rows from the live
 * success callback. It never calls an LLM provider or publishes a meeting. */
export async function verifyMeetingLlmPostgres(database:RuntimeDatabase,config:RuntimeConfig,admin:pg.Client,
  actor:ServerActorV1,outsider:ServerActorV1,sourceRunId:string,captureId:string):Promise<void>{
  const sourceResult=await admin.query<{
    record_id:string;source_version:number;transcript_revision_id:string;segment_id:string;
    discussion:DiscussionInput;query_text:string;
  }>(`
    SELECT capture.record_id::text,run.source_version,segment.transcript_revision_id::text,segment.id::text AS segment_id,
      jsonb_build_object('segmentIndex',segment.segment_index,'rawText',segment.raw_text,'normalizedText',segment.normalized_text,
        'startOffsetMs',segment.start_offset_ms,'endOffsetMs',segment.end_offset_ms,'wordOffsets',segment.word_offsets,
        'sourceAudioRanges',segment.source_audio_ranges,'sourceHash',segment.source_hash) AS discussion,
      segment.raw_text AS query_text
    FROM projed_core.meeting_analysis_runs run
    JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
    JOIN projed_core.meeting_transcript_segments segment ON segment.producer_run_id=run.id
      AND segment.capture_id=run.capture_id AND segment.transcript_revision_id=run.transcript_revision_id
    WHERE run.id=$1::uuid AND capture.id=$2::uuid
      AND run.state='queued' AND run.resume_stage='retrieve'
      AND run.stage_cursor#>'{asr,done}'='true'::jsonb AND run.stage_cursor#>'{assembly,done}'='true'::jsonb
      AND run.deadline_at>clock_timestamp()
      AND capture.state='queued' AND capture.source_frozen_at IS NOT NULL
      AND capture.active_transcript_revision_id IS DISTINCT FROM run.transcript_revision_id
    ORDER BY segment.segment_index
  `,[sourceRunId,captureId]);
  assert.equal(sourceResult.rowCount,1,'the live callback owns the complete one-segment synthetic discussion source');
  const sourceRow=sourceResult.rows[0]!;
  const source:SourceFixture={recordId:sourceRow.record_id,captureId,sourceVersion:sourceRow.source_version,
    sourceRunId,transcriptRevisionId:sourceRow.transcript_revision_id,segmentId:sourceRow.segment_id,
    discussion:sourceRow.discussion,queryText:sourceRow.query_text};
  assert.ok(source.queryText.length>0&&Buffer.byteLength(source.queryText,'utf8')<=3200,
    'the synthetic discussion is a supported retrieval query');

  async function cloneRun():Promise<CloneFixture>{
    const runId=randomUUID(),transcriptRevisionId=randomUUID(),segmentId=randomUUID();
    const insertedRun=await admin.query<{id:string}>(`
      INSERT INTO projed_core.meeting_analysis_runs(id,capture_id,source_version,request_key,transcript_revision_id,
        config_version,state,resume_stage,stage_cursor,attempt_count,next_attempt_at,deadline_at,budget_month,
        reserved_twd_micros,provider_mode,authorization_context_id)
      SELECT $1::uuid,run.capture_id,run.source_version,'qa-llm-native:'||$1::text,$2::uuid,
        run.config_version,'queued','retrieve',run.stage_cursor-'llm',0,clock_timestamp(),run.deadline_at,
        run.budget_month,0,run.provider_mode,run.authorization_context_id
      FROM projed_core.meeting_analysis_runs run
      WHERE run.id=$3::uuid AND run.capture_id=$4::uuid
        AND run.authorization_context_id IS NOT NULL AND run.deadline_at>clock_timestamp()
      RETURNING id::text
    `,[runId,transcriptRevisionId,sourceRunId,captureId]);
    assert.equal(insertedRun.rowCount,1,'each LLM case owns one queued run bound to the existing Session context');
    const insertedSegment=await admin.query<{id:string}>(`
      INSERT INTO projed_core.meeting_transcript_segments(id,capture_id,transcript_revision_id,producer_run_id,segment_index,
        source_audio_ranges,start_offset_ms,end_offset_ms,raw_text,normalized_text,word_offsets,source_hash)
      SELECT $1::uuid,source.capture_id,$2::uuid,$3::uuid,source.segment_index,source.source_audio_ranges,
        source.start_offset_ms,source.end_offset_ms,source.raw_text,source.normalized_text,source.word_offsets,source.source_hash
      FROM projed_core.meeting_transcript_segments source
      WHERE source.id=$4::uuid AND source.capture_id=$5::uuid AND source.producer_run_id=$6::uuid
      RETURNING id::text
    `,[segmentId,transcriptRevisionId,runId,source.segmentId,captureId,sourceRunId]);
    assert.equal(insertedSegment.rowCount,1,'the clone contains only the exact existing synthetic discussion row');
    return {...source,runId,transcriptRevisionId,segmentId};
  }

  function makeUnit(fixture:SourceFixture,stage:MeetingLlmStage='retrieve',sourceVersion=fixture.sourceVersion,
    retryVariant?:string):MeetingLlmPreparedUnit{
    const input:MeetingLlmEnvelope={configVersion:MEETING_LLM_CONFIG_VERSION,sourceVersion,
      transcriptRevisionId:fixture.transcriptRevisionId,
      body:{discussion:fixture.discussion,queryText:fixture.queryText,...(retryVariant===undefined?{}:{retryVariant})}};
    return prepareMeetingLlmUnit(stage,fixture.segmentId,input);
  }
  function repository(fixture:CloneFixture,resolvedActor:ServerActorV1=actor){
    return createPostgresMeetingLlmRepository({runId:fixture.runId,database,config,
      resolveActor:async runId=>{assert.equal(runId,fixture.runId);return resolvedActor;}});
  }
  async function directActorQuery<T>(resolvedActor:ServerActorV1,operation:(port:ActorQueryPort)=>Promise<T>):Promise<T>{
    return runActorTransaction(database,config,resolvedActor,operation);
  }
  async function budgetState():Promise<BudgetState>{
    const result=await admin.query<BudgetState>(`SELECT budget_month::text,limit_twd_micros::text,
      reserved_twd_micros::text,spent_twd_micros::text FROM projed_core.meeting_ai_budget_months
      WHERE budget_month=date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date`);
    assert.equal(result.rowCount,1,'the parent native fixture owns the current-month budget row');
    return result.rows[0]!;
  }
  async function ledgerState(runId:string,token:string):Promise<LedgerState>{
    const result=await admin.query<LedgerState>(`
      SELECT run.state AS run_state,run.attempt_count,
        (SELECT count(*)::integer FROM projed_core.meeting_ai_usage_attempts usage WHERE usage.run_id=run.id
          AND usage.llm_operation_token=$2::uuid) AS usage_count,
        (SELECT count(*)::integer FROM projed_core.meeting_llm_unit_checkpoints checkpoint WHERE checkpoint.run_id=run.id) AS checkpoint_count,
        usage.usage_state,usage.dispatch_state,usage.actual_twd_micros::text,usage.reserved_twd_micros::text,usage.llm_manifest
      FROM projed_core.meeting_analysis_runs run LEFT JOIN projed_core.meeting_ai_usage_attempts usage
        ON usage.run_id=run.id AND usage.llm_operation_token=$2::uuid WHERE run.id=$1::uuid
    `,[runId,token]);
    assert.equal(result.rowCount,1);return result.rows[0]!;
  }
  async function runAttemptState(runId:string):Promise<{
    readonly run_state:string;readonly attempt_count:number;readonly usage_count:number;readonly checkpoint_count:number;
    readonly reserved_attempt_micros:string;
  }>{
    const result=await admin.query<{
      run_state:string;attempt_count:number;usage_count:number;checkpoint_count:number;reserved_attempt_micros:string;
    }>(`
      SELECT run.state AS run_state,run.attempt_count,
        (SELECT count(*)::integer FROM projed_core.meeting_ai_usage_attempts usage
          WHERE usage.run_id=run.id AND usage.llm_operation_token IS NOT NULL) AS usage_count,
        (SELECT count(*)::integer FROM projed_core.meeting_llm_unit_checkpoints checkpoint WHERE checkpoint.run_id=run.id)
          AS checkpoint_count,
        coalesce((SELECT sum(usage.reserved_twd_micros)::text FROM projed_core.meeting_ai_usage_attempts usage
          WHERE usage.run_id=run.id AND usage.llm_operation_token IS NOT NULL),'0') AS reserved_attempt_micros
      FROM projed_core.meeting_analysis_runs run WHERE run.id=$1::uuid
    `,[runId]);
    assert.equal(result.rowCount,1);return result.rows[0]!;
  }
  async function readCheckpoints(runId:string):Promise<readonly {slot:string;payload_text:string;attempt_id:string|null}[]>{
    const result=await admin.query<{slot:string;payload_text:string;attempt_id:string|null}>(`
      SELECT slot,payload_text,attempt_id FROM projed_core.meeting_llm_unit_checkpoints
      WHERE run_id=$1::uuid ORDER BY slot
    `,[runId]);
    return result.rows;
  }
  async function directClaimReplay(fixture:CloneFixture,claim:MeetingLlmClaim,unit:MeetingLlmPreparedUnit):Promise<unknown>{
    return directActorQuery(actor,async port=>{
      await port.authorizeMeetingCaptureMutation(fixture.recordId,fixture.captureId);
      const result=await port.query<{claim:unknown}>(
        'SELECT projed_core.claim_meeting_llm_unit_v1($1::uuid,$2::uuid,$3::jsonb) AS claim',
        [fixture.runId,claim.leaseToken,JSON.stringify(unit)]);
      assert.equal(result.rowCount,1);return result.rows[0]?.claim;
    });
  }
  async function dispatchFixture(fixture:CloneFixture,claim:MeetingLlmClaim):Promise<boolean>{
    return directActorQuery(actor,async port=>{
      await port.authorizeMeetingCaptureMutation(fixture.recordId,fixture.captureId);
      const result=await port.query<{marked:boolean}>(
        'SELECT projed_core.mark_meeting_llm_dispatch_v1($1::uuid,$2::uuid,$3::text,false) AS marked',
        [fixture.runId,claim.leaseToken,claim.inputHash]);
      assert.equal(result.rowCount,1);return result.rows[0]?.marked===true;
    });
  }
  async function settleCompletion(repositoryValue:ReturnType<typeof repository>,claim:MeetingLlmClaim,
    queryBytes:number):Promise<MeetingLlmReceipt>{
    const usage:MeetingLlmUsage={tokenCount:3,billableCharacterCount:1};
    const expected=meetingLlmCharge('retrieve',usage,queryBytes);
    if(expected===null)throw new Error('MEETING_LLM_NATIVE_FIXTURE_HAS_NO_ESTIMATED_CHARGE');
    const payload:MeetingLlmSettlement={kind:'completed',usage,resultText:JSON.stringify({signals:[],synthetic:true})};
    const receipt=await repositoryValue.settle(claim,payload);
    assert.equal(receipt.kind,'completed');assert.equal(receipt.chargeMicros,Number(expected));
    return receipt;
  }
  async function assertNoMutation(fixture:CloneFixture,token:string,beforeBudget:BudgetState,label:string):Promise<void>{
    const [ledger,budget]=await Promise.all([ledgerState(fixture.runId,token),budgetState()]);
    assert.equal(ledger.usage_count,0,`${label}: no paid attempt was inserted`);
    assert.equal(ledger.checkpoint_count,0,`${label}: no private input/result checkpoint was inserted`);
    assert.equal(ledger.run_state,'queued',`${label}: rejected claim does not change the run`);
    assert.equal(ledger.attempt_count,0,`${label}: rejected claim does not increment attempts`);
    assert.deepEqual(budget,beforeBudget,`${label}: rejection does not reserve or spend budget`);
  }

  // Positive path uses the production repository for claims, dispatch,
  // settlement, and replay while the original synthetic Session is live.
  const positive=await cloneRun(),unit=makeUnit(positive),positiveRepository=repository(positive);
  const budgetBeforePositive=await budgetState();
  const claim=await positiveRepository.claim(unit);assertClaim(claim,'production repository claim');
  assert.equal(claim.stage,'retrieve');assert.equal(claim.unitKey,positive.segmentId);assert.equal(claim.inputHash,unit.inputHash);
  const admitted=object(await directClaimReplay(positive,claim,unit),'same-token claim replay');
  assert.equal(admitted.status,'claimed');assert.equal(admitted.leaseToken,claim.leaseToken);
  assert.equal(admitted.attemptId,claim.attemptId,'same operation token replays the existing reservation');
  assert.equal(await positiveRepository.claim(unit),null,'a competing repository token cannot claim a running unit');
  const reserved=await ledgerState(positive.runId,claim.leaseToken);
  assert.equal(reserved.usage_count,1);assert.equal(reserved.checkpoint_count,1);
  assert.equal(reserved.usage_state,'reserved');assert.equal(reserved.dispatch_state,'pending');
  assert.equal(BigInt((await budgetState()).reserved_twd_micros)-BigInt(budgetBeforePositive.reserved_twd_micros),30000n,
    'one retrieve claim reserves its bounded amount exactly once');

  const budgetBeforeReadonly=await budgetState();
  assert.equal(await positiveRepository.markDispatch(claim,true),false,'read-only dispatch verification cannot authorize a call');
  const afterReadonly=await ledgerState(positive.runId,claim.leaseToken);
  assert.equal(afterReadonly.dispatch_state,'pending');
  assert.deepEqual(await budgetState(),budgetBeforeReadonly,'read-only dispatch leaves the budget ledger stable');
  assert.equal(await positiveRepository.markDispatch(claim),true,'the authorized synthetic dispatch intent can be committed');
  const budgetBeforeCompletion=await budgetState();
  const completed=await settleCompletion(positiveRepository,claim,Buffer.byteLength(positive.queryText,'utf8'));
  assert.equal(completed.published,true,'only this exact live claim publishes its private result checkpoint');
  assert.deepEqual(await positiveRepository.settle(claim,{kind:'completed',usage:{tokenCount:3,billableCharacterCount:1},
    resultText:JSON.stringify({signals:[],synthetic:true})}),completed,'same-token result settlement replays one receipt');
  assert.deepEqual(await positiveRepository.readSettlement(claim),completed,
    'read-only settlement lookup returns the stored known receipt');
  const positiveCheckpoints=await readCheckpoints(positive.runId);
  assert.equal(positiveCheckpoints.length,2,'one immutable input and one result checkpoint exist');
  assert.equal(positiveCheckpoints.find(row=>row.slot==='result')?.payload_text,JSON.stringify({signals:[],synthetic:true}));
  assert.equal(positiveCheckpoints.find(row=>row.slot==='result')?.attempt_id,claim.attemptId);
  const completedLedger=await ledgerState(positive.runId,claim.leaseToken);
  assert.equal(completedLedger.usage_state,'known');assert.equal(completedLedger.dispatch_state,'dispatched');
  if(completed.chargeMicros===null)throw new Error('MEETING_LLM_NATIVE_FIXTURE_HAS_NO_SETTLED_CHARGE');
  assert.equal(completedLedger.actual_twd_micros,String(completed.chargeMicros));
  const budgetAfterCompletion=await budgetState();
  assert.equal(BigInt(budgetAfterCompletion.reserved_twd_micros)-BigInt(budgetBeforeCompletion.reserved_twd_micros),-30000n,
    'known settlement releases exactly this unit reservation');
  assert.equal(BigInt(budgetAfterCompletion.spent_twd_micros)-BigInt(budgetBeforePositive.spent_twd_micros),
    BigInt(completed.chargeMicros),'known replay does not double-spend the ledger');
  await assert.rejects(positiveRepository.settle(claim,{kind:'completed',usage:{tokenCount:3,billableCharacterCount:1},
    resultText:JSON.stringify({signals:['changed'],synthetic:true})}),isExpectedDenial,
  'a different payload cannot overwrite a committed private result');
  assert.deepEqual(await readCheckpoints(positive.runId),positiveCheckpoints,'conflicting replay leaves both checkpoints unchanged');

  // Outsider RLS does not expose even a known private result; work scanning is
  // limited to queue metadata and never returns input/result content.
  const privateRead=await directActorQuery(outsider,port=>port.query<{payload_text:string}>(`
    SELECT payload_text FROM projed_core.meeting_llm_unit_checkpoints WHERE run_id=$1::uuid AND slot='result'
  `,[positive.runId]));
  assert.equal(privateRead.rowCount,0,'an outsider cannot read the stored LLM result through RLS');
  const metadataPrivateRows=await runMeetingMaintenanceTransaction(database,config,async query=>{
    await query("SELECT set_config('projed.llm_phase','scan',true)");
    const result=await query<{payload_text:string}>(`SELECT payload_text FROM projed_core.meeting_llm_unit_checkpoints
      WHERE run_id=$1::uuid`,[positive.runId]);
    return result.rowCount;
  });
  assert.equal(metadataPrivateRows,0,'metadata scan purpose without an actor cannot read private input or result payloads');
  const scan=await directActorQuery(actor,async port=>{
    const result=await port.query<{items:unknown}>('SELECT projed_core.scan_meeting_llm_work_v1(20) AS items');
    assert.equal(result.rowCount,1);return result.rows[0]?.items;
  });
  assert.ok(Array.isArray(scan),'bounded LLM scan returns metadata rows');
  for(const item of scan){
    const metadata=object(item,'bounded LLM scan item');
    const expectedKeys=metadata.kind==='queued'?['deadlineExpired','kind','operationToken','runId']
      :['kind','operationToken','runId'];
    assert.deepEqual(Object.keys(metadata).sort(),expectedKeys,
      'queue scan has no transcript, query, prompt, or result fields');
  }

  // Stale source version and an actor context other than the bound AppSession
  // fail before any budget, usage, or private checkpoint write.
  const wrongSource=await cloneRun(),wrongSourceUnit=makeUnit(wrongSource,'retrieve',wrongSource.sourceVersion+1);
  const wrongSourceToken=randomUUID(),beforeWrongSource=await budgetState();
  await assert.rejects(repository(wrongSource).claim(wrongSourceUnit),isExpectedDenial,
    'a source-version mismatch cannot reserve a paid unit');
  await assertNoMutation(wrongSource,wrongSourceToken,beforeWrongSource,'wrong source version');

  const wrongSession=await cloneRun(),wrongSessionUnit=makeUnit(wrongSession),wrongSessionToken=randomUUID();
  const beforeWrongSession=await budgetState();
  const missingSessionActor:ServerActorV1={...actor,contextId:randomUUID()};
  const wrongContextRepository=repository(wrongSession,missingSessionActor);
  let wrongContextResult:MeetingLlmClaim|null|'awaiting_budget'=null,wrongContextError:unknown;
  try{wrongContextResult=await wrongContextRepository.claim(wrongSessionUnit);}catch(error){wrongContextError=error;}
  if(wrongContextError!==undefined)assert.ok(isExpectedDenial(wrongContextError),'wrong AppSession context is explicitly denied');
  else assert.equal(wrongContextResult,null,'a nonmatching context cannot claim this bound run');
  await assertNoMutation(wrongSession,wrongSessionToken,beforeWrongSession,'wrong AppSession context');

  const outsiderFixture=await cloneRun(),outsiderUnit=makeUnit(outsiderFixture),outsiderToken=randomUUID();
  const beforeOutsider=await budgetState();let outsiderResult:MeetingLlmClaim|null|'awaiting_budget'=null,outsiderError:unknown;
  try{outsiderResult=await repository(outsiderFixture,outsider).claim(outsiderUnit);}catch(error){outsiderError=error;}
  if(outsiderError!==undefined)assert.ok(isExpectedDenial(outsiderError),'an unrelated user is denied by record/session authorization');
  else assert.equal(outsiderResult,null,'an unrelated user cannot claim the private meeting unit');
  await assertNoMutation(outsiderFixture,outsiderToken,beforeOutsider,'outsider actor');

  // A cancellation after dispatch can settle cost but cannot publish private
  // content. The synthetic admin mutation is confined to this cloned run.
  const cancelled=await cloneRun(),cancelledUnit=makeUnit(cancelled),cancelledRepository=repository(cancelled);
  const cancelledClaim=await cancelledRepository.claim(cancelledUnit);assertClaim(cancelledClaim,'cancel settlement claim');
  assert.equal(await dispatchFixture(cancelled,cancelledClaim),true);
  const cancelledRows=await admin.query(`UPDATE projed_core.meeting_analysis_runs SET state='cancelled',
    error_code='CANCELLED_IN_FLIGHT',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
    WHERE id=$1::uuid AND state='running' AND lease_token=$2::uuid`,[cancelled.runId,cancelledClaim.leaseToken]);
  assert.equal(cancelledRows.rowCount,1,'only the nonce-owned cloned run is placed in cancelled state');
  const budgetBeforeCancelledSettlement=await budgetState();
  const cancelledReceipt=await settleCompletion(cancelledRepository,cancelledClaim,
    Buffer.byteLength(cancelled.queryText,'utf8'));
  assert.equal(cancelledReceipt.published,false,'cancellation makes settlement accounting-only');
  if(cancelledReceipt.chargeMicros===null)throw new Error('MEETING_LLM_CANCELLED_SETTLEMENT_HAS_NO_KNOWN_CHARGE');
  assert.equal((await readCheckpoints(cancelled.runId)).filter(row=>row.slot==='result').length,0,
    'cancelled provider output is not persisted as private result content');
  const cancelledLedger=await ledgerState(cancelled.runId,cancelledClaim.leaseToken);
  assert.equal(cancelledLedger.usage_state,'known');assert.equal(cancelledLedger.actual_twd_micros,String(cancelledReceipt.chargeMicros));
  const budgetAfterCancelledSettlement=await budgetState();
  assert.equal(BigInt(budgetAfterCancelledSettlement.reserved_twd_micros)
    -BigInt(budgetBeforeCancelledSettlement.reserved_twd_micros),-30000n,
  'cancelled known settlement releases exactly this unit reservation');
  assert.equal(BigInt(budgetAfterCancelledSettlement.spent_twd_micros)-BigInt(budgetBeforeCancelledSettlement.spent_twd_micros),
    BigInt(cancelledReceipt.chargeMicros),'cancellation retains known usage cost exactly once');

  const expiredLease=await cloneRun(),expiredLeaseUnit=makeUnit(expiredLease),expiredLeaseRepository=repository(expiredLease);
  const expiredLeaseClaim=await expiredLeaseRepository.claim(expiredLeaseUnit);assertClaim(expiredLeaseClaim,'expired lease settlement claim');
  assert.equal(await dispatchFixture(expiredLease,expiredLeaseClaim),true);
  const leaseExpired=await admin.query(`UPDATE projed_core.meeting_analysis_runs
    SET lease_expires_at=clock_timestamp()-interval '1 second',updated_at=clock_timestamp()
    WHERE id=$1::uuid AND state='running' AND lease_token=$2::uuid`,[expiredLease.runId,expiredLeaseClaim.leaseToken]);
  assert.equal(leaseExpired.rowCount,1,'only the cloned dispatch lease is expired');
  const budgetBeforeExpiredLease=await budgetState();
  const expiredLeaseReceipt=await settleCompletion(expiredLeaseRepository,expiredLeaseClaim,
    Buffer.byteLength(expiredLease.queryText,'utf8'));
  assert.equal(expiredLeaseReceipt.published,false,'an expired lease cannot publish a late private result');
  if(expiredLeaseReceipt.chargeMicros===null)throw new Error('MEETING_LLM_EXPIRED_LEASE_HAS_NO_KNOWN_CHARGE');
  assert.equal((await readCheckpoints(expiredLease.runId)).filter(row=>row.slot==='result').length,0,
    'late output after lease expiry creates no private result checkpoint');
  const expiredLeaseLedger=await ledgerState(expiredLease.runId,expiredLeaseClaim.leaseToken);
  assert.equal(expiredLeaseLedger.usage_state,'known');
  assert.equal(expiredLeaseLedger.actual_twd_micros,String(expiredLeaseReceipt.chargeMicros),
    'known usage remains billable after lease expiry');
  const budgetAfterExpiredLease=await budgetState();
  assert.equal(BigInt(budgetAfterExpiredLease.reserved_twd_micros)
    -BigInt(budgetBeforeExpiredLease.reserved_twd_micros),-30000n,
  'expired-lease known settlement releases exactly this unit reservation');
  assert.equal(BigInt(budgetAfterExpiredLease.spent_twd_micros)-BigInt(budgetBeforeExpiredLease.spent_twd_micros),
    BigInt(expiredLeaseReceipt.chargeMicros),'expired-lease settlement charges once and releases its known reservation');

  // A pending operation with both expired leases is settled as not_sent and
  // can resume once. Input variants keep the same logical unit identity, so a
  // third hash cannot reset its two-attempt cap.
  const retry=await cloneRun(),firstRetryUnit=makeUnit(retry),retryRepository=repository(retry);
  const budgetBeforeFirstRetry=await budgetState();
  const firstRetryClaim=await retryRepository.claim(firstRetryUnit);assertClaim(firstRetryClaim,'first bounded retry claim');
  const firstRetryPending=await runAttemptState(retry.runId);
  assert.equal(firstRetryPending.attempt_count,1);assert.equal(firstRetryPending.usage_count,1);
  assert.equal(firstRetryPending.checkpoint_count,1);
  const expiredPending=await admin.query(`UPDATE projed_core.meeting_ai_usage_attempts SET llm_manifest=jsonb_set(
      llm_manifest,'{leaseExpiresAtMs}',to_jsonb((extract(epoch FROM clock_timestamp())*1000)::bigint-1),false)
    WHERE run_id=$1::uuid AND llm_operation_token=$2::uuid AND usage_state='reserved' AND dispatch_state='pending'`,
  [retry.runId,firstRetryClaim.leaseToken]);
  assert.equal(expiredPending.rowCount,1,'the first pending lease is expired without dispatching to a provider');
  const expiredPendingRun=await admin.query(`UPDATE projed_core.meeting_analysis_runs
    SET lease_expires_at=clock_timestamp()-interval '1 second',updated_at=clock_timestamp()
    WHERE id=$1::uuid AND state='running' AND lease_token=$2::uuid AND lease_expires_at>clock_timestamp()`,
  [retry.runId,firstRetryClaim.leaseToken]);
  assert.equal(expiredPendingRun.rowCount,1,'the same pending run lease is expired for recovery');
  const pendingBudgetBeforeRecovery=await budgetState();
  assert.equal(await retryRepository.readSettlement(firstRetryClaim),null,
    'read-only recovery inspection does not settle the pending operation');
  assert.deepEqual(await budgetState(),pendingBudgetBeforeRecovery,'read-only pending recovery leaves its reservation intact');
  const notSentReceipt=await retryRepository.recover(firstRetryClaim.leaseToken);
  assert.ok(notSentReceipt);assert.equal(notSentReceipt.kind,'not_sent');
  assert.equal(notSentReceipt.published,false);assert.equal(notSentReceipt.chargeMicros,0);
  const afterPendingRecovery=await runAttemptState(retry.runId);
  assert.equal(afterPendingRecovery.run_state,'queued');assert.equal(afterPendingRecovery.attempt_count,1);
  assert.equal(afterPendingRecovery.usage_count,1);assert.equal(afterPendingRecovery.checkpoint_count,1);
  const budgetAfterPendingRecovery=await budgetState();
  assert.equal(BigInt(budgetAfterPendingRecovery.reserved_twd_micros)
    -BigInt(pendingBudgetBeforeRecovery.reserved_twd_micros),-30000n,
  'known pending not_sent recovery releases its reservation');
  assert.equal(budgetAfterPendingRecovery.spent_twd_micros,pendingBudgetBeforeRecovery.spent_twd_micros,
    'an operation proven not sent adds no provider charge');

  const secondRetryUnit=makeUnit(retry,'retrieve',retry.sourceVersion,'retry-variant-two');
  assert.notEqual(secondRetryUnit.inputHash,firstRetryUnit.inputHash,'the resumed same unit uses a different input hash');
  const budgetBeforeSecondRetry=await budgetState();
  const secondRetryClaim=await retryRepository.claim(secondRetryUnit);assertClaim(secondRetryClaim,'second bounded retry claim');
  assert.equal(secondRetryClaim.unitKey,firstRetryClaim.unitKey,'input variation preserves the logical unit identity');
  const afterSecondRetryClaim=await runAttemptState(retry.runId);
  assert.equal(afterSecondRetryClaim.run_state,'running');assert.equal(afterSecondRetryClaim.attempt_count,2);
  assert.equal(afterSecondRetryClaim.usage_count,2);assert.equal(afterSecondRetryClaim.checkpoint_count,2);
  assert.equal(BigInt((await budgetState()).reserved_twd_micros)-BigInt(budgetBeforeSecondRetry.reserved_twd_micros),30000n,
    'the second logical attempt reserves once');
  assert.equal(await dispatchFixture(retry,secondRetryClaim),true);
  const budgetBeforeSecondSettlement=await budgetState();
  const secondRetryReceipt=await settleCompletion(retryRepository,secondRetryClaim,Buffer.byteLength(retry.queryText,'utf8'));
  assert.equal(secondRetryReceipt.published,true);
  if(secondRetryReceipt.chargeMicros===null)throw new Error('MEETING_LLM_RETRY_SETTLEMENT_HAS_NO_KNOWN_CHARGE');
  const afterSecondRetrySettlement=await runAttemptState(retry.runId);
  assert.equal(afterSecondRetrySettlement.run_state,'queued');assert.equal(afterSecondRetrySettlement.attempt_count,2);
  assert.equal(afterSecondRetrySettlement.usage_count,2);assert.equal(afterSecondRetrySettlement.checkpoint_count,3);
  const budgetAfterSecondSettlement=await budgetState();
  assert.equal(BigInt(budgetAfterSecondSettlement.reserved_twd_micros)
    -BigInt(budgetBeforeSecondSettlement.reserved_twd_micros),-30000n,
  'second known settlement releases only its reservation');
  assert.equal(BigInt(budgetAfterSecondSettlement.spent_twd_micros)-BigInt(budgetBeforeSecondSettlement.spent_twd_micros),
    BigInt(secondRetryReceipt.chargeMicros),'the second successful operation is charged once');

  const thirdRetryUnit=makeUnit(retry,'retrieve',retry.sourceVersion,'retry-variant-three');
  assert.notEqual(thirdRetryUnit.inputHash,secondRetryUnit.inputHash,'third attempt changes the hash again');
  const beforeThirdRetryState=await runAttemptState(retry.runId),beforeThirdRetryBudget=await budgetState();
  assert.equal(await retryRepository.claim(thirdRetryUnit),null,
    'a third input hash cannot reset the two-attempt cap for this run/stage/unit key');
  assert.deepEqual(await runAttemptState(retry.runId),beforeThirdRetryState,
    'attempt-cap rejection adds no usage, checkpoint, lease, or attempt count');
  assert.deepEqual(await budgetState(),beforeThirdRetryBudget,'attempt-cap rejection reserves and spends nothing');
  assert.equal(BigInt(budgetAfterSecondSettlement.spent_twd_micros)-BigInt(budgetBeforeFirstRetry.spent_twd_micros),
    BigInt(secondRetryReceipt.chargeMicros),'the proven not_sent first attempt costs zero; only the successful retry is charged');

  // Expired dispatched work resolves to usage_unknown, retains its reservation,
  // and cannot acquire another paid attempt. No provider is called here.
  const unknown=await cloneRun(),unknownUnit=makeUnit(unknown),unknownRepository=repository(unknown);
  const unknownClaim=await unknownRepository.claim(unknownUnit);assertClaim(unknownClaim,'unknown recovery claim');
  assert.equal(await dispatchFixture(unknown,unknownClaim),true);
  const beforeReadOnlyRecovery=await budgetState();
  assert.equal(await unknownRepository.readSettlement(unknownClaim),null,
    'read-only recovery inspection does not settle an unexpired provider operation');
  assert.deepEqual(await budgetState(),beforeReadOnlyRecovery,'read-only recovery inspection leaves budget unchanged');
  const expiredManifest=await admin.query(`UPDATE projed_core.meeting_ai_usage_attempts SET llm_manifest=jsonb_set(
      llm_manifest,'{leaseExpiresAtMs}',to_jsonb((extract(epoch FROM clock_timestamp())*1000)::bigint-1),false)
    WHERE run_id=$1::uuid AND llm_operation_token=$2::uuid AND usage_state='reserved' AND dispatch_state='dispatched'`,
  [unknown.runId,unknownClaim.leaseToken]);
  assert.equal(expiredManifest.rowCount,1,'only this synthetic dispatch lease is expired for recovery');
  const budgetBeforeUnknown=await budgetState();
  assert.equal(await unknownRepository.readSettlement(unknownClaim),null,
    'read-only recovery inspection reports expiry without consuming or retrying it');
  assert.deepEqual(await budgetState(),budgetBeforeUnknown,'expired readback still leaves usage and budget unchanged');
  const stillLiveLease=await admin.query<{lease_live:boolean}>(`SELECT lease_expires_at>clock_timestamp() AS lease_live
    FROM projed_core.meeting_analysis_runs WHERE id=$1::uuid AND lease_token=$2::uuid`,
  [unknown.runId,unknownClaim.leaseToken]);
  assert.equal(stillLiveLease.rows[0]?.lease_live,true,'only metadata expiry is insufficient while the run lease is live');
  assert.equal(await unknownRepository.recover(unknownClaim.leaseToken),null,
    'expired manifest alone cannot recover an operation with a still-live run lease');
  assert.deepEqual(await budgetState(),budgetBeforeUnknown,'manifest-only expiry cannot settle or release accounting');
  const expiredRunLease=await admin.query(`UPDATE projed_core.meeting_analysis_runs
    SET lease_expires_at=clock_timestamp()-interval '1 second',updated_at=clock_timestamp()
    WHERE id=$1::uuid AND state='running' AND lease_token=$2::uuid AND lease_expires_at>clock_timestamp()`,
  [unknown.runId,unknownClaim.leaseToken]);
  assert.equal(expiredRunLease.rowCount,1,'the same synthetic run lease is also expired before recovery');
  const unknownReceipt=await unknownRepository.recover(unknownClaim.leaseToken);
  assert.ok(unknownReceipt);assert.equal(unknownReceipt.kind,'usage_unknown');assert.equal(unknownReceipt.published,false);
  assert.equal(unknownReceipt.chargeMicros,null,'unknown usage is not converted to a zero charge');
  const unknownLedger=await ledgerState(unknown.runId,unknownClaim.leaseToken);
  assert.equal(unknownLedger.usage_state,'unknown');assert.equal(unknownLedger.actual_twd_micros,null);
  assert.equal(unknownLedger.reserved_twd_micros,'30000','unknown dispatched usage retains its reservation');
  assert.equal((await readCheckpoints(unknown.runId)).filter(row=>row.slot==='result').length,0,
    'unknown provider outcome has no private result checkpoint');
  assert.equal(await unknownRepository.claim(unknownUnit),null,'unknown usage does not permit a second paid attempt');
  const afterRejectedUnknownRetry=await ledgerState(unknown.runId,unknownClaim.leaseToken);
  assert.equal(afterRejectedUnknownRetry.attempt_count,1);assert.equal(afterRejectedUnknownRetry.usage_count,1);
  assert.equal(afterRejectedUnknownRetry.checkpoint_count,1,'rejected retry preserves only the original input checkpoint');
  assert.deepEqual(await unknownRepository.readSettlement(unknownClaim),unknownReceipt,
    'read-only settlement lookup returns the persisted unknown receipt');
  assert.deepEqual(await unknownRepository.recover(unknownClaim.leaseToken),unknownReceipt,
    'recovery replay reads the existing unknown receipt without changing its reservation');
  const budgetAfterUnknown=await budgetState();
  assert.equal(budgetAfterUnknown.reserved_twd_micros,budgetBeforeUnknown.reserved_twd_micros,
    'unknown recovery keeps the unresolved provider reservation unchanged');
  assert.equal(budgetAfterUnknown.spent_twd_micros,budgetBeforeUnknown.spent_twd_micros,
    'unknown recovery does not invent an actual charge');

  // SQL and TypeScript charging oracles agree at actual stage limits and reject
  // inconsistent provider usage. These SQL calls are pure calculations.
  const chargeCases:readonly {stage:MeetingLlmStage;usage:MeetingLlmUsage;queryBytes:number;expected:bigint|null}[]=[
    {stage:'retrieve',usage:{tokenCount:2048,billableCharacterCount:4096},queryBytes:3200,
      expected:meetingLlmCharge('retrieve',{tokenCount:2048,billableCharacterCount:4096},3200)},
    {stage:'compose',usage:{promptTokens:1_048_576,candidateTokens:65_536,thoughtTokens:65_536,totalTokens:1_179_648},
      queryBytes:0,expected:meetingLlmCharge('compose',{promptTokens:1_048_576,candidateTokens:65_536,
        thoughtTokens:65_536,totalTokens:1_179_648})},
    {stage:'match',usage:{promptTokens:10,candidateTokens:2,thoughtTokens:3,totalTokens:15},queryBytes:0,
      expected:meetingLlmCharge('match',{promptTokens:10,candidateTokens:2,thoughtTokens:3,totalTokens:15})},
  ];
  for(const testCase of chargeCases){
    const result=await directActorQuery(actor,port=>port.query<{charge:string|null}>(
      'SELECT projed_core.meeting_llm_charge_v1($1::text,$2::jsonb,$3::integer)::text AS charge',
      [testCase.stage,JSON.stringify(testCase.usage),testCase.queryBytes]));
    assert.equal(result.rowCount,1);
    assert.equal(result.rows[0]?.charge,testCase.expected?.toString()??null,`${testCase.stage} SQL and TypeScript charge agree`);
  }
  const invalidCharge=await directActorQuery(actor,port=>port.query<{charge:string|null}>(
    'SELECT projed_core.meeting_llm_charge_v1($1::text,$2::jsonb,$3::integer)::text AS charge',
    ['compose',JSON.stringify({promptTokens:10,candidateTokens:2,thoughtTokens:3,totalTokens:14}),0]));
  assert.equal(invalidCharge.rows[0]?.charge,null,'an inconsistent token total is not billable');

  // Expired queue work is surfaced as metadata and finished without reading or
  // writing a private unit. The only mutated row is this synthetic clone.
  const deadlineFixture=await cloneRun();
  const expiredDeadline=await admin.query(`UPDATE projed_core.meeting_analysis_runs
    SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1::uuid AND state='queued'
      AND lease_token IS NULL AND lease_expires_at IS NULL`,[deadlineFixture.runId]);
  assert.equal(expiredDeadline.rowCount,1);
  const deadlineBudgetBefore=await budgetState();
  const deadlineItem=await directActorQuery(actor,async port=>{
    const result=await port.query<{items:unknown}>('SELECT projed_core.scan_meeting_llm_work_v1(20) AS items');
    assert.equal(result.rowCount,1);
    const rows=result.rows[0]?.items;
    assert.ok(Array.isArray(rows));
    const item=rows.map(value=>object(value,'deadline scan item')).find(value=>value.runId===deadlineFixture.runId);
    assert.ok(item,'expired queued work remains visible to metadata control');
    return item;
  });
  assert.deepEqual(deadlineItem,{kind:'queued',runId:deadlineFixture.runId,operationToken:null,deadlineExpired:true},
    'deadline scan returns only the exact run control metadata');
  const finished=await directActorQuery(actor,async port=>{
    await port.authorizeMeetingCaptureMutation(deadlineFixture.recordId,deadlineFixture.captureId);
    const result=await port.query<{finished:boolean}>(
      "SELECT projed_core.finish_meeting_llm_work_v1($1::uuid,'LLM_DEADLINE_EXPIRED') AS finished",[deadlineFixture.runId]);
    assert.equal(result.rowCount,1);return result.rows[0]?.finished===true;
  });
  assert.equal(finished,true,'deadline control closes only an expired, unleased LLM run');
  const deadlineLedger=await ledgerState(deadlineFixture.runId,randomUUID());
  assert.equal(deadlineLedger.run_state,'failed_terminal');assert.equal(deadlineLedger.usage_count,0);
  assert.equal(deadlineLedger.checkpoint_count,0,'deadline control never reads or persists private unit content');
  assert.deepEqual(await budgetState(),deadlineBudgetBefore,'metadata-only deadline cleanup does not mutate budget');

  // Exercise the real shared capture cancellation entrypoint last: it affects
  // the parent's capture and all its active clones, so no later case reuses it.
  const sharedCancel=await cloneRun(),sharedCancelUnit=makeUnit(sharedCancel),sharedCancelRepository=repository(sharedCancel);
  const sharedCancelClaim=await sharedCancelRepository.claim(sharedCancelUnit);
  assertClaim(sharedCancelClaim,'shared-capture cancellation claim');
  assert.equal(await dispatchFixture(sharedCancel,sharedCancelClaim),true);
  const budgetBeforeSharedCancel=await budgetState();
  const cancelledCapture=await directActorQuery(actor,async port=>{
    await port.authorizeMeetingCaptureMutation(sharedCancel.recordId,sharedCancel.captureId);
    const result=await port.query<{result:unknown}>(
      'SELECT projed_core.cancel_meeting_capture_v1($1::uuid,$2::integer,$3::text) AS result',
      [sharedCancel.captureId,sharedCancel.sourceVersion,'qa-llm-native-shared-capture-cancel']);
    assert.equal(result.rowCount,1);return object(result.rows[0]?.result,'shared capture cancellation receipt');
  });
  assert.equal(cancelledCapture.state,'cancelled','normal capture cancellation API cancels the shared source');
  const capturedState=await admin.query<{state:string}>(
    'SELECT state FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid',[sharedCancel.captureId]);
  assert.equal(capturedState.rows[0]?.state,'cancelled');
  const ledgerAfterSharedCancel=await ledgerState(sharedCancel.runId,sharedCancelClaim.leaseToken);
  assert.equal(ledgerAfterSharedCancel.run_state,'cancelled');
  assert.equal(ledgerAfterSharedCancel.usage_state,'reserved');
  assert.equal(ledgerAfterSharedCancel.dispatch_state,'dispatched');
  assert.equal(ledgerAfterSharedCancel.reserved_twd_micros,'30000',
    'shared cancellation preserves an already-dispatched LLM reservation for usage settlement');
  assert.equal(BigInt((await budgetState()).reserved_twd_micros)-BigInt(budgetBeforeSharedCancel.reserved_twd_micros),0n,
    'capture cancellation does not prematurely release the LLM reservation');
  const sharedCancelReceipt=await settleCompletion(sharedCancelRepository,sharedCancelClaim,
    Buffer.byteLength(sharedCancel.queryText,'utf8'));
  assert.equal(sharedCancelReceipt.published,false,'a late known response after capture cancellation is accounting-only');
  if(sharedCancelReceipt.chargeMicros===null)throw new Error('MEETING_LLM_SHARED_CANCEL_HAS_NO_KNOWN_CHARGE');
  const sharedCancelCheckpoints=await readCheckpoints(sharedCancel.runId);
  assert.equal(sharedCancelCheckpoints.filter(row=>row.slot==='input').length,1);
  assert.equal(sharedCancelCheckpoints.filter(row=>row.slot==='result').length,0,
    'the shared cancellation guard prevents private result publication');
  const settledAfterSharedCancel=await ledgerState(sharedCancel.runId,sharedCancelClaim.leaseToken);
  assert.equal(settledAfterSharedCancel.run_state,'cancelled');assert.equal(settledAfterSharedCancel.usage_state,'known');
  assert.equal(settledAfterSharedCancel.actual_twd_micros,String(sharedCancelReceipt.chargeMicros));
  const budgetAfterSharedCancel=await budgetState();
  assert.equal(BigInt(budgetAfterSharedCancel.reserved_twd_micros)-BigInt(budgetBeforeSharedCancel.reserved_twd_micros),-30000n,
    'known shared-cancel settlement releases its reservation');
  assert.equal(BigInt(budgetAfterSharedCancel.spent_twd_micros)-BigInt(budgetBeforeSharedCancel.spent_twd_micros),
    BigInt(sharedCancelReceipt.chargeMicros),'known shared-cancel usage is charged exactly once');
}
