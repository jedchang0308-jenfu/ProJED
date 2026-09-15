import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MEETING_AUDIO_SEGMENT_MS,
  clampPointerInterval,
  createProjectionFromResolutions,
  mergePointerIntervals,
  reconcileMeetingResolutionTaskLinks,
  selectPointerFeaturesForSegment,
  shouldRotateAudioSegment,
} from '../src/features/meetingTaskResolution/meetingAnalysisContract';

const run = () => {
  assert.equal(shouldRotateAudioSegment(0, MEETING_AUDIO_SEGMENT_MS - 1), false);
  assert.equal(shouldRotateAudioSegment(0, MEETING_AUDIO_SEGMENT_MS), true);
  assert.equal(clampPointerInterval({
    captureId: 'capture', clockEpoch: 0, sequence: 1, canonicalTaskId: 'task', surfaceKind: 'primary',
    startedOffsetMs: 100, endedOffsetMs: 50, visible: true, terminationReason: 'pointerout',
  }), null);
  assert.equal(clampPointerInterval({
    captureId: 'capture', clockEpoch: 0, sequence: 2, canonicalTaskId: 'task', surfaceKind: 'primary',
    startedOffsetMs: -100, endedOffsetMs: -50, visible: true, terminationReason: 'pointerout',
  }), null);
  const merged = mergePointerIntervals([
    { captureId: 'capture', clockEpoch: 0, sequence: 1, canonicalTaskId: 'task-a', surfaceKind: 'primary', startedOffsetMs: 0, endedOffsetMs: 1000, visible: true, terminationReason: 'pointerout' },
    { captureId: 'capture', clockEpoch: 0, sequence: 2, canonicalTaskId: 'task-a', surfaceKind: 'primary', startedOffsetMs: 1000, endedOffsetMs: 2100, visible: true, terminationReason: 'surface-change' },
    { captureId: 'capture', clockEpoch: 0, sequence: 3, canonicalTaskId: 'task-b', surfaceKind: 'primary', startedOffsetMs: 1200, endedOffsetMs: 1800, visible: true, terminationReason: 'pointerout' },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].endedOffsetMs, 2100);
  const epochBoundary = mergePointerIntervals([
    { captureId: 'capture', clockEpoch: 0, sequence: 1, canonicalTaskId: 'task-a', surfaceKind: 'primary', startedOffsetMs: 0, endedOffsetMs: 1000, visible: true, terminationReason: 'pause' },
    { captureId: 'capture', clockEpoch: 1, sequence: 2, canonicalTaskId: 'task-a', surfaceKind: 'primary', startedOffsetMs: 1000, endedOffsetMs: 2000, visible: true, terminationReason: 'pointerout' },
  ]);
  assert.equal(epochBoundary.length, 2);
  assert.equal(selectPointerFeaturesForSegment(merged, 500, 1500)[0].overlapMs, 1000);
  const projection = createProjectionFromResolutions('會議摘要', [{
    segmentId: 'segment', text: '確認登入修正', startOffsetMs: 0, endOffsetMs: 3000,
    decision: 'accepted', humanReviewed: true, humanEmptyDecision: false, revision: 2,
    candidates: [{ taskId: 'task-a', title: '登入修正', path: '登入', semanticScore: .9, pointerFeature: 0, source: 'lexical', snapshotHash: 'sha256:a' }],
  }]);
  assert.match(projection.content, /確認登入修正/);
  assert.deepEqual(projection.taskLinks, [{ nodeId: 'task-a', role: 'related' }]);
  assert.deepEqual(projection.resolutionLinkSet, ['task-a']);
  const manualSupport = reconcileMeetingResolutionTaskLinks(
    [{ nodeId: 'task-a', role: 'main' }],
    ['task-a'],
    ['task-a'],
    [],
    [],
    [],
  );
  assert.deepEqual(manualSupport.resolutionLinkSet, []);
  const afterManualDecisionReject = reconcileMeetingResolutionTaskLinks(
    manualSupport.taskLinks,
    [],
    [],
    manualSupport.autoLinkSet,
    manualSupport.resolutionLinkSet,
  );
  assert.deepEqual(afterManualDecisionReject.taskLinks, [{ nodeId: 'task-a', role: 'main' }]);
  const resolverAdded = reconcileMeetingResolutionTaskLinks([], ['task-b'], [], [], [], []);
  const afterResolverReject = reconcileMeetingResolutionTaskLinks(
    resolverAdded.taskLinks,
    [],
    [],
    resolverAdded.autoLinkSet,
    resolverAdded.resolutionLinkSet,
  );
  assert.deepEqual(afterResolverReject.taskLinks, []);
  assert.equal(projection.appliedReviewRevision, 2);
  const migration = readFileSync('supabase/migrations/20260914122616_dev_123_meeting_task_resolution.sql', 'utf8');
  for (const tableName of [
    'meeting_capture_sessions', 'meeting_capture_segments', 'meeting_pointer_intervals',
    'meeting_analysis_runs', 'meeting_transcript_segments', 'meeting_segment_resolutions',
    'meeting_task_match_results',
  ]) assert.match(migration, new RegExp(`create table public\\.${tableName}`));
  for (const privateTable of ['meeting_draft_projections', 'meeting_artifact_cleanup', 'meeting_ai_budget_months', 'meeting_ai_usage_attempts']) {
    assert.match(migration, new RegExp(`create table private\\.${privateTable}`));
  }
  assert.match(migration, /create or replace function public\.save_meeting_projection_v1/);
  const reviewMigration = readFileSync('supabase/migrations/20260914130548_dev_123_review_decisions.sql', 'utf8');
  assert.match(reviewMigration, /create or replace function public\.decide_meeting_match_v1/);
  assert.match(reviewMigration, /state in \('created','recording','paused'/);
  assert.match(migration, /create or replace function public\.save_meeting_projection_v1[\s\S]*?v_record\.visibility = 'private'[\s\S]*?v_record\.created_by <> p_actor_id/);
  const controlMigration = readFileSync('supabase/migrations/20260914133819_dev_123_control_hardening.sql', 'utf8');
  const retryMigration = readFileSync('supabase/migrations/20260914154451_dev_123_retry_atomicity.sql', 'utf8');
  const projectionScopeMigration = readFileSync('supabase/migrations/20260914161741_dev_123_projection_task_scope.sql', 'utf8');
  const acceptedLinksMigration = readFileSync('supabase/migrations/20260915103000_dev_123_projection_accepted_links.sql', 'utf8');
  const timelineMigration = readFileSync('supabase/migrations/20260915133000_dev_123_manifest_timeline_integrity.sql', 'utf8');
  const projectionIdempotencyMigration = readFileSync('supabase/migrations/20260915170000_dev_123_projection_request_idempotency.sql', 'utf8');
  for (const marker of [
    'source_frozen_at', 'reservation_key', 'upload_token_expires_at', 'verified_at',
    'meeting_capture_segment_unique unique (capture_id, source_version, segment_index)',
    'claim_meeting_analysis_run_v1', 'reserve_meeting_budget_v1', 'settle_meeting_budget_v1',
    'complete_meeting_upload_v1', '10000000',
    'for update skip locked', 'meeting_cleanup_attempt_kind_idx',
  ]) assert.match(controlMigration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(controlMigration, /complete_meeting_upload_v1\([\s\S]*?p_expected_source_version integer/);
  assert.match(controlMigration, /SOURCE_VERSION_REQUIRED/);
  assert.match(controlMigration, /AUDIO_MANIFEST_NOT_CONTIGUOUS/);
  assert.match(controlMigration, /final_pointer_sequence/);
  assert.match(controlMigration, /source_gaps/);
  assert.match(controlMigration, /partial request must not reopen/);
  assert.match(controlMigration, /SOURCE_CONFLICT/);
  for (const marker of [
    'retry_meeting_analysis_v1', 'for update', 'RUN_CANNOT_BE_RETRIED',
    'CAPTURE_CANNOT_BE_RETRIED', 'MEETING_EDITOR_REQUIRED',
    'revoke all on function public.retry_meeting_analysis_v1',
  ]) assert.match(retryMigration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const marker of ['TASK_OUTSIDE_PROJECT', 'jsonb_typeof', 'wbs_items', 'save_meeting_projection_v1']) {
    assert.match(projectionScopeMigration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(projectionScopeMigration, /v_record\.status <> 'draft'/);
  assert.match(acceptedLinksMigration, /server-owned match authority/);
  assert.match(acceptedLinksMigration, /candidate_match\.decision = 'accepted'/);
  assert.match(acceptedLinksMigration, /not exists \([\s\S]*record_task_links existing/);
  assert.match(timelineMigration, /AUDIO_SEGMENT_TIMELINE_CONFLICT/);
  assert.match(timelineMigration, /v_verified_count/);
  for (const marker of ['PROJECTION_REQUEST_KEY_REQUIRED', 'PROJECTION_PAYLOAD_HASH_REQUIRED', 'PROJECTION_REQUEST_CONFLICT', 'for update', 'last_request_key = p_request_key']) {
    assert.match(projectionIdempotencyMigration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(readFileSync('src/features/meetingTaskResolution/meetingAnalysisContract.ts', 'utf8'), /created'.*'recording'.*'paused'/s);
  const control = readFileSync('supabase/functions/meeting_capture_control/index.ts', 'utf8');
  assert.match(control, /const begin[\s\S]*?allowPrivateOwner: true[\s\S]*?visibility === "private"[\s\S]*?status !== "draft"/);
  assert.match(control, /const assertCaptureEditor[\s\S]*?allowPrivateOwner: true[\s\S]*?record\.created_by !== actor\.userId[\s\S]*?actor\.membership/);
  assert.match(control, /audio_expires_at: null/);
  assert.match(control, /server-authoritative stop time/);
  assert.match(control, /operation === "pause"/);
  assert.match(control, /\["recording", "paused", "stopped"\]/);
  assert.match(control, /const stop[\s\S]*?SOURCE_VERSION_REQUIRED[\s\S]*?sourceVersionOf\(capture\) !== expectedSourceVersion/);
  assert.match(control, /const stop[\s\S]*?normalizeEpochManifest[\s\S]*?finalPointerSequence[\s\S]*?sourceGaps/);
  assert.match(control, /const completeUpload[\s\S]*?SOURCE_VERSION_REQUIRED[\s\S]*?p_expected_source_version/);
  assert.match(control, /const completeUpload[\s\S]*?overlapMs[\s\S]*?gapBeforeMs[\s\S]*?Audio manifest timeline is invalid/);
  assert.match(control, /operation === "review"/);
  assert.match(control, /operation === "save-projection"/);
  assert.match(control, /const saveProjection[\s\S]*?await getCapture\(captureId\)[\s\S]*?await assertCaptureEditor\(request, capture\)/);
  assert.match(control, /const saveProjection[\s\S]*?MEETING_RECORD_CONFLICT/);
  assert.match(control, /const saveProjection[\s\S]*?requestedLinks\.map[\s\S]*?TASK_OUTSIDE_PROJECT/);
  assert.match(control, /const progress[\s\S]*?await assertCaptureEditor\(request, capture\)/);
  assert.match(control, /const progress[\s\S]*?\["recording", "paused"\]/);
  assert.match(control, /const progress[\s\S]*?MEETING_RECORD_CONFLICT/);
  assert.doesNotMatch(control.match(/const progress[\s\S]*?const pause/)?.[0] ?? '', /upsert\(/);
  assert.match(control, /const stop[\s\S]*?await assertCaptureEditor\(request, capture\)/);
  assert.match(control, /const stop[\s\S]*?\["recording", "paused", "stopped"\][\s\S]*?MEETING_RECORD_CONFLICT/);
  assert.match(control, /const publicError[\s\S]*?AUTH_REQUIRED[\s\S]*?FORBIDDEN[\s\S]*?MEETING_CAPTURE_REQUEST_FAILED/);
  assert.match(control, /PROJECTION_REQUEST_CONFLICT/);
  assert.match(control, /publicError\(error\)[\s\S]*?errorResponse\(safe\.code, safe\.status\)/);
  assert.match(control, /const actorAndProject[\s\S]*?const token = getToken\(request\)[\s\S]*?supabase\.auth\.getUser\(token\)/);
  assert.match(control, /const serviceKey = resolveSupabaseFunctionKey\("secret"\)/);
  assert.match(control, /schema\("private"\)\.from\("meeting_artifact_cleanup"\)/);
  assert.match(control, /schema\("private"\)\.from\("meeting_ai_usage_attempts"\)/);
  const purgeFunction = readFileSync('supabase/functions/purge_meeting_audio/index.ts', 'utf8');
  assert.match(purgeFunction, /schema\("private"\)\.from\("meeting_artifact_cleanup"\)/);
  assert.match(control, /const appendPointer[\s\S]*?await assertCaptureEditor\(request, capture\)/);
  assert.match(control, /TextEncoder\(\)\.encode\(JSON\.stringify\(intervals\)\)/);
  assert.match(control, /itemCaptureId !== captureId/);
  assert.match(control, /const appendPointer[\s\S]*?tenant_id.*capture\.tenant_id[\s\S]*?is_archived.*false[\s\S]*?item_type/);
  assert.match(control, /const review[\s\S]*?tenant_id", capture\.tenant_id[\s\S]*?is_archived", false[\s\S]*?item_type/);
  assert.match(control, /Audio segment is not available/);
  assert.match(control, /operation === "reserve-segment"/);
  assert.match(control, /operation === "verify-segment"/);
  assert.match(control, /operation === "playback-url"/);
  assert.match(control, /\["cancelled", "expired"\][\s\S]*?AUDIO_EXPIRED/);
  assert.match(control, /operation === "revise-source"/);
  assert.match(control, /operation === "retry"/);
  assert.match(control, /operation === "cancel"/);
  assert.match(control, /state: "cancelled"[\s\S]*?\.eq\("state", capture\.state\)/);
  assert.match(control, /MEETING_RECORD_CONFLICT/);
  assert.match(control, /UPLOAD_TOKEN_EXPIRED/);
  assert.match(control, /Audio manifest SHA-256 is invalid/);
  assert.match(control, /AUDIO_RESERVATION_CONFLICT/);
  assert.match(control, /MAX_AUDIO_SEGMENT_BYTES/);
  assert.match(control, /cancelled_before_dispatch/);
  assert.match(control, /CANCELLED_IN_FLIGHT/);
  assert.match(control, /cleanupError\.code !== "23505"/);
  assert.match(control, /retry_meeting_analysis_v1/);
  assert.match(control, /p_actor_id: actor\.userId/);
  assert.match(control, /error: retryError/);
  assert.match(control, /MEETING_RECORD_CONFLICT/);
  const worker = readFileSync('supabase/functions/process_meeting_analysis/index.ts', 'utf8');
  const purge = readFileSync('supabase/functions/purge_meeting_audio/index.ts', 'utf8');
  assert.match(worker, /DEV123_WORKER_SECRET/);
  assert.match(worker, /x-projed-worker-secret/);
  assert.match(worker, /WORKER_AUTH_REQUIRED/);
  assert.match(worker, /provider_qualification_required/);
  assert.match(purge, /DEV123_PURGE_SECRET/);
  assert.match(purge, /x-projed-purge-secret/);
  assert.match(purge, /PURGE_AUTH_REQUIRED/);
  assert.match(purge, /kind === "provider"/);
  assert.match(purge, /PROVIDER_CLEANUP_ADAPTER_REQUIRED/);
  assert.match(purge, /STORAGE_LOCATOR_MISSING/);
  assert.match(purge, /providerCleanupPending/);
  assert.match(purge, /\["pending", "deleting", "failed", "unknown"\]/);
  assert.match(purge, /const updateCleanup/);
  assert.match(purge, /const updateSegment/);
  assert.match(purge, /const claimCleanup/);
  assert.match(purge, /CLEANUP_LEASE_MS/);
  assert.match(purge, /lease_token/);
  assert.match(purge, /lease_expires_at/);
  assert.match(purge, /state: "failed"/);
  assert.match(worker, /p_usage_state: "known"/);
  assert.match(worker, /state: "awaiting_budget"/);
  assert.match(worker, /state: retryable \? "failed_retryable" : "failed_terminal"/);
  assert.match(worker, /state: "ready"[\s\S]*?\.in\("state", \["queued", "running", "awaiting_budget"\]\)/);
  assert.match(worker, /CAPTURE_CANCELLED_OR_STATE_CHANGED/);
  assert.match(worker, /pointerDurationByTask/);
  assert.match(worker, /semanticScore/);
  assert.match(worker, /pointerFeature/);
  assert.match(worker, /meeting_task_match_results/);
  assert.match(worker, /candidateCount/);
  assert.match(worker, /select\("content,title,status"\)/);
  assert.match(worker, /MEETING_RECORD_CONFLICT/);
  assert.match(worker, /settle_meeting_budget_v1[\s\S]*?const \{ data: completedRun/);
  const recordingControls = readFileSync('src/components/Records/MeetingRecordingControls.tsx', 'utf8');
  assert.match(recordingControls, /pauseRecording/);
  assert.match(recordingControls, /resumeRecording/);
  assert.match(recordingControls, /recoverFinalizedSegments/);
  assert.match(recordingControls, /settleCaptureAfterError/);
  assert.match(recordingControls, /finalizeMissing/);
  assert.match(recordingControls, /recorderStartFailed: true/);
  assert.match(recordingControls, /new MediaRecorder\(stream\)[\s\S]*?無法建立錄音器/);
  assert.match(recordingControls, /setIsRecording\(false\);\s*setIsPaused\(false\)/);
  assert.match(recordingControls, /pointerLossRef/);
  assert.match(recordingControls, /recoveredAfterReload: true/);
  assert.match(recordingControls, /sourceCompleteness: 'partial'/);
  assert.match(recordingControls, /epochManifestRef/);
  assert.match(recordingControls, /finalPointerSequence/);
  assert.match(recordingControls, /bindTrackLossHandler/);
  assert.match(recordingControls, /stopRecorderSafely/);
  assert.match(recordingControls, /bindTrackLossHandler\(stream, begin\.captureId\);\s*if \(!startRecorder\(\)\) return;\s*setIsRecording\(true\)/);
  assert.match(recordingControls, /bindTrackLossHandler\(stream, captureId\);\s*setMessage\(null\);\s*if \(!startRecorder\(\)\) return;\s*setIsPaused\(false\);\s*setIsRecording\(true\)/);
  assert.match(recordingControls, /listMeetingPointerBatches/);
  assert.match(recordingControls, /putMeetingPointerBatch/);
  assert.match(recordingControls, /deleteMeetingPointerBatch/);
  assert.match(recordingControls, /sourceCompleteness: manifestsRef\.current\.length > 0 && !pointerLoss \? 'complete' : manifestsRef\.current\.length > 0 \? 'partial' : 'missing'/);
  assert.match(recordingControls, /initialCaptureId/);
  const pointerEvidence = readFileSync('src/features/meetingTaskResolution/meetingPointerEvidence.ts', 'utf8');
  assert.match(pointerEvidence, /MutationObserver/);
  assert.match(pointerEvidence, /element-disconnect/);
  assert.match(pointerEvidence, /pointer-cancel/);
  assert.doesNotMatch(recordingControls, /id: item\.segmentId/);
  const audioOutbox = readFileSync('src/features/meetingTaskResolution/meetingAudioOutbox.ts', 'utf8');
  assert.match(audioOutbox, /POINTER_STORE_NAME/);
  assert.match(audioOutbox, /putMeetingPointerBatch/);
  assert.match(audioOutbox, /listMeetingPointerBatches/);
  assert.match(audioOutbox, /deleteMeetingPointerBatch/);
  const analysisService = readFileSync('src/features/meetingTaskResolution/meetingAnalysisService.ts', 'utf8');
  assert.match(analysisService, /stop: \(captureId: string, payload: \{ expectedSourceVersion: number/);
  assert.match(analysisService, /completeUpload: \(captureId: string, payload: \{ expectedSourceVersion: number/);
  assert.match(readFileSync('supabase/functions/process_meeting_analysis/index.ts', 'utf8'), /word_offsets: wordOffsets/);
  assert.match(readFileSync('supabase/functions/process_meeting_analysis/index.ts', 'utf8'), /quoteRange/);
  assert.match(readFileSync('supabase/functions/meeting_capture_control/index.ts', 'utf8'), /quote_range/);
  const reviewComponent = readFileSync('src/components/Records/MeetingTaskMatchReview.tsx', 'utf8');
  assert.match(reviewComponent, /data-meeting-task-match-review/);
  assert.match(reviewComponent, /data-meeting-review-task-picker/);
  assert.match(reviewComponent, /action: 'add'/);
  assert.match(reviewComponent, /action: 'replace'/);
  assert.match(reviewComponent, /playbackUrl/);
  assert.match(reviewComponent, /回聽原音/);
  assert.match(reviewComponent, /onResolvedTaskLinksChange/);
  assert.match(reviewComponent, /data-meeting-review-evidence="quote"/);
  assert.match(reviewComponent, /!candidate.quoteRange/);
  assert.match(readFileSync('supabase/migrations/20260914130548_dev_123_review_decisions.sql', 'utf8'), /POINTER_ONLY_NOT_ACCEPTABLE/);
  assert.match(readFileSync('supabase/migrations/20260914130548_dev_123_review_decisions.sql', 'utf8'), /TASK_CANDIDATE_REQUIRED/);
  assert.match(migration, /alter table public\.meeting_capture_sessions enable row level security/);
  assert.match(migration, /revoke all on public\.meeting_capture_sessions from anon, authenticated/);
  assert.match(migration, /grant all on public\.meeting_capture_sessions to service_role/);
  assert.match(migration, /values \('meeting-audio', 'meeting-audio', false/);
  assert.match(migration, /revoke all on private\.meeting_artifact_cleanup from public, anon, authenticated/);
  const recordSidebar = readFileSync('src/components/Records/RecordSidebar.tsx', 'utf8');
  assert.match(recordSidebar, /reviewRevision/);
  assert.match(recordSidebar, /handleMeetingResolvedTaskLinksChange/);
  assert.match(recordSidebar, /autoLinkSet/);
  assert.match(recordSidebar, /manualLinkSet/);
  assert.match(recordSidebar, /resolutionLinkSet/);
  assert.match(recordSidebar, /import\.meta\.env\.MODE !== 'production'/);
  assert.match(recordSidebar, /VITE_DEV123_MEETING_TASK_RESOLUTION_ENABLED === 'true'/);
  assert.match(recordSidebar, /isDev123MeetingTaskResolutionEnabled \? \(/);
  assert.match(readFileSync('.env.example', 'utf8'), /VITE_DEV123_MEETING_TASK_RESOLUTION_ENABLED=false/);
  assert.match(readFileSync('src/features/meetingTaskResolution/meetingAnalysisContract.ts', 'utf8'), /reconcileMeetingResolutionTaskLinks/);
  const browserVerifier = readFileSync('scripts/verify-dev-123-meeting-task-resolution-browser.pw.js', 'utf8');
  assert.match(browserVerifier, /使用固定測試環境/);
  assert.match(browserVerifier, /B01/);
  const browserMediaVerifier = readFileSync('scripts/verify-dev-123-meeting-task-resolution-browser-media.pw.js', 'utf8');
  assert.match(browserMediaVerifier, /FakeMediaRecorder/);
  assert.match(browserMediaVerifier, /B04-no-auto-mic/);
  assert.match(browserMediaVerifier, /B04-recorder-start-failure/);
  assert.match(browserMediaVerifier, /B04-device-loss/);
  assert.match(browserMediaVerifier, /B04-recorder-stop-failure/);
  assert.match(browserMediaVerifier, /B08-stop-finalize-once/);
  assert.match(browserMediaVerifier, /B10-review-task-candidate/);
  assert.match(browserMediaVerifier, /quoteRange/);
  assert.match(browserMediaVerifier, /pointerAcceptDisabled/);
  assert.match(browserMediaVerifier, /B11-human-accept-link/);
  assert.match(browserMediaVerifier, /draftTaskCount/);
  assert.match(browserMediaVerifier, /routeMocked: true/);
  const dbVerifier = readFileSync('scripts/verify-dev-123-meeting-task-resolution-db-isolated.ps1', 'utf8');
  assert.match(dbVerifier, /TEMP_RUNTIME/);
  assert.match(dbVerifier, /TEMP_RUNTIME_CLEANED/);
  assert.match(dbVerifier, /20260914154451_dev_123_retry_atomicity\.sql/);
  assert.match(dbVerifier, /20260914161741_dev_123_projection_task_scope\.sql/);
  assert.match(dbVerifier, /20260915103000_dev_123_projection_accepted_links\.sql/);
  assert.match(dbVerifier, /20260915133000_dev_123_manifest_timeline_integrity\.sql/);
  const dbMatrix = readFileSync('scripts/verify-dev-123-meeting-task-resolution-db-matrix.sql', 'utf8');
  assert.match(dbMatrix, /cancelLateWorkerGuard/);
  assert.match(dbMatrix, /late worker resurrected cancelled capture/);
  assert.match(dbMatrix, /completeUploadSourceVersionGuard/);
  assert.match(dbMatrix, /captureStopMetadata/);
  assert.match(dbMatrix, /indexPlans/);
  assert.match(dbMatrix, /pointerOnlyAcceptanceGuard/);
  assert.match(dbMatrix, /cleanupIdentityUnique/);
  assert.match(dbMatrix, /retryAtomicity/);
  assert.match(dbMatrix, /projectionTaskScope/);
  assert.match(dbMatrix, /publishedProjectionGuard/);
  assert.match(dbMatrix, /acceptedDecisionProjection/);
  assert.match(dbMatrix, /completeUploadTimelineGuard/);
  assert.match(dbMatrix, /published meeting accepted late projection/);
  assert.match(readFileSync('package.json', 'utf8'), /verify:dev-123-meeting-task-resolution-db-isolated/);
  assert.match(readFileSync('package.json', 'utf8'), /verify:dev-123-provider-contract/);
  assert.match(readFileSync('package.json', 'utf8'), /verify:dev-123-meeting-task-resolution-browser-media/);
  assert.match(readFileSync('scripts/verify-dev-123-provider-contract.ts', 'utf8'), /dispatchPerformed: false/);
  assert.match(readFileSync('scripts/verify-dev-123-provider-contract.ts', 'utf8'), /DEV123_PROVIDER_OUTPUT_PATH/);
  assert.match(readFileSync('scripts/verify-dev-123-local-preflight.mjs', 'utf8'), /provider-contract-fail-closed/);
  const authStorageVerifier = readFileSync('scripts/verify-dev-123-auth-storage-local.mjs', 'utf8');
  const authStorageRunner = readFileSync('scripts/verify-dev-123-auth-storage-local.ps1', 'utf8');
  assert.match(authStorageVerifier, /auth-login/);
  assert.match(authStorageVerifier, /raw-capture-authenticated-denied/);
  assert.match(authStorageVerifier, /private-schema-authenticated-denied/);
  assert.match(authStorageVerifier, /private-schema-service-role-readback/);
  assert.match(authStorageVerifier, /audio-bucket-private/);
  assert.match(authStorageVerifier, /private-object-authenticated-denied/);
  assert.match(authStorageVerifier, /synthetic-fixture-cleanup/);
  assert.match(authStorageRunner, /Invoke-Supabase[\s\S]*['"]start['"]/);
  assert.match(authStorageRunner, /Invoke-Supabase[\s\S]*['"]stop['"]/);
  assert.match(authStorageRunner, /pathRemoved/);
  const controlApiVerifier = readFileSync('scripts/verify-dev-123-control-api-local.mjs', 'utf8');
  const controlApiRunner = readFileSync('scripts/verify-dev-123-control-api-local.ps1', 'utf8');
  assert.match(controlApiVerifier, /P06-reserve-segment/);
  assert.match(controlApiVerifier, /hostReachableSignedUrl/);
  assert.match(controlApiVerifier, /P07-complete-upload/);
  assert.match(controlApiVerifier, /P14-cancel/);
  assert.match(controlApiVerifier, /P09-worker-fake-ready/);
  assert.match(controlApiVerifier, /P09-worker-transcript-readback/);
  assert.match(controlApiVerifier, /P09-worker-budget-settlement/);
  assert.match(controlApiVerifier, /P09-purge-secret-required/);
  assert.match(controlApiVerifier, /P09-purge-expired-audio/);
  assert.match(controlApiVerifier, /P01-invalid-auth/);
  assert.match(controlApiVerifier, /P01-missing-auth/);
  assert.match(controlApiVerifier, /P02-cross-project-begin-denied/);
  assert.match(controlApiVerifier, /P13-cross-project-pointer-denied/);
  assert.match(controlApiVerifier, /P21-retry-precondition-readback/);
  assert.match(controlApiVerifier, /P21-retry-atomic/);
  assert.match(controlApiVerifier, /P21-retry-idempotency/);
  assert.match(controlApiVerifier, /P21-retry-conflict-no-orphan/);
  assert.match(controlApiVerifier, /evidenceSensitiveKey/);
  assert.match(controlApiVerifier, /sanitizeEvidence/);
  assert.match(controlApiRunner, /edge-runtime/);
  assert.match(controlApiRunner, /DEV123_LOCAL_EDGE_RUNTIME/);
  assert.match(controlApiRunner, /['"]start['"][\s\S]*-Capture/);
  assert.match(controlApiRunner, /pathRemoved/);
  assert.match(retryMigration, /pm\.role::text not in \('viewer', 'suspended'\)/);
  assert.match(retryMigration, /r\.visibility::text/);
  assert.match(readFileSync('package.json', 'utf8'), /verify:dev-123-control-api-local/);
  assert.match(readFileSync('package.json', 'utf8'), /verify:dev-123-hosted-readiness/);
  assert.match(readFileSync('supabase/config.toml', 'utf8'), /schemas = \["public", "private", "graphql_public"\]/);
  const workerCode = readFileSync('supabase/functions/process_meeting_analysis/index.ts', 'utf8');
  assert.match(workerCode, /schema\("private"\)\.rpc\("claim_meeting_analysis_run_v1"/);
  assert.match(workerCode, /schema\("private"\)\.rpc\("reserve_meeting_budget_v1"/);
  assert.match(workerCode, /schema\("private"\)\.rpc\("settle_meeting_budget_v1"/);
  assert.match(control, /schema\("private"\)\.rpc\("settle_meeting_budget_v1"/);
  const hostedReadiness = readFileSync('scripts/verify-dev-123-hosted-readiness.mjs', 'utf8');
  assert.match(hostedReadiness, /remoteMutationPerformed: false/);
  assert.match(hostedReadiness, /migration.*list/);
  assert.match(hostedReadiness, /functions.*list/);
  assert.match(hostedReadiness, /db.*lint/);
  const spec = readFileSync('ai-doc/specs/SPEC-123-meeting-task-resolution-audio-pointer.md', 'utf8');
  const adr = readFileSync('ai-doc/decisions/ADR-051-projed-owned-meeting-analysis-pipeline.md', 'utf8');
  const devTask = readFileSync('ai-doc/dev_task.md', 'utf8');
  const qa = readFileSync('ai-doc/qa/QA-DEV-123-meeting-task-resolution-audio-pointer.md', 'utf8');
  const documentationMap = readFileSync('ai-doc/documentation_map.md', 'utf8');
  assert.match(spec, /Production Control Plane Deployed/);
  assert.match(spec, /Production Frontend Feature-Gated|Frontend Feature-Gated/);
  assert.match(spec, /供應商不得保留可回取的會議內容/);
  assert.match(spec, /https:\/\/ai\.google\.dev\/gemini-api\/docs\/zdr/);
  assert.match(spec, /https:\/\/ai\.google\.dev\/api\/files\?hl=en/);
  assert.match(spec, /retry_meeting_analysis_v1/);
  assert.match(adr, /Production Control Plane Deployed/);
  assert.match(adr, /Architecture Confirmed/);
  assert.match(adr, /不得保留可回取的會議內容/);
  assert.match(adr, /manual retry.*transaction 內 editor/s);
  assert.match(devTask, /DEV-123.*Production Backend Deployed/);
  assert.match(devTask, /DEV-123.*Frontend Feature-Gated/);
  assert.match(devTask, /provider不得保留可回取內容/);
  assert.match(devTask, /purge 對 provider cleanup obligation 已補上 fail-closed／retryable marker/);
  assert.match(devTask, /retry_meeting_analysis_v1/);
  assert.match(qa, /Hosted Control API 18\/18 PASS/);
  assert.match(qa, /Architecture Confirmed/);
  assert.match(qa, /Local Preflight PASS/);
  assert.match(qa, /Full QA NOT EXECUTED/);
  assert.match(qa, /B04～B11 route-mocked browser\/media candidate smoke/);
  assert.match(qa, /route mock 當成完整 browser\/media QA/);
  assert.match(qa, /\| S19 \|/);
  assert.match(qa, /\| S20 \|/);
  assert.match(qa, /projectionTaskScope/);
  assert.match(qa, /verify:dev-123-control-api-local/);
  assert.match(qa, /control-api-local-result\.json/);
  assert.match(qa, /Hosted gate[\s\S]*private/);
  assert.match(documentationMap, /QA-DEV-123[\s\S]*Local Preflight PASS[\s\S]*Provider Qualification Pending/);
  assert.match(documentationMap, /verify:dev-123-control-api-local/);
  assert.match(spec, /Hosted authenticated gate[\s\S]*private/);
  assert.match(spec, /20260914133819_dev_123_control_hardening\.sql/);
  assert.match(spec, /20260914161741_dev_123_projection_task_scope\.sql/);
  assert.match(spec, /reservation／verify/);
  assert.match(qa, /control-plane core readback/);
  console.log('DEV-123 pure contract verification passed');
};

run();
