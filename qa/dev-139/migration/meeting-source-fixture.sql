-- Synthetic DEV-123 meeting retention source fixture.
-- Run after source-fixture.sql. No RPC/SECURITY DEFINER objects, real audio,
-- credentials, provider responses, or private meeting text are created here.

CREATE TABLE public.meeting_capture_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES public.knowledge_records(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  state text NOT NULL DEFAULT 'created' CHECK (state IN ('created','recording','paused','stopped','uploading','queued','running','ready','awaiting_budget','cancelled','expired','failed_retryable','failed_terminal')),
  epoch_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_progress_at timestamptz,
  stopped_at timestamptz,
  audio_expires_at timestamptz,
  source_version integer NOT NULL DEFAULT 1,
  audio_manifest_hash text,
  pointer_manifest_hash text,
  source_completeness text NOT NULL DEFAULT 'complete' CHECK (source_completeness IN ('complete','partial','missing')),
  pointer_loss boolean NOT NULL DEFAULT false,
  review_revision bigint NOT NULL DEFAULT 0,
  active_transcript_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz DEFAULT now(),
  stopped_reason text,
  source_frozen_at timestamptz,
  source_parent_version integer,
  final_pointer_sequence bigint,
  source_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT meeting_capture_idempotency_unique UNIQUE (record_id, idempotency_key),
  UNIQUE (tenant_id, project_id, id),
  UNIQUE (record_id, id)
);
CREATE UNIQUE INDEX meeting_capture_one_active_idx
  ON public.meeting_capture_sessions(record_id)
  WHERE state IN ('created','recording','paused','stopped','uploading','queued','running','awaiting_budget','failed_retryable');

CREATE TABLE public.meeting_capture_segments (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.meeting_capture_sessions(id) ON DELETE CASCADE,
  segment_index integer NOT NULL CHECK (segment_index >= 0),
  epoch integer NOT NULL CHECK (epoch >= 0),
  start_offset_ms bigint NOT NULL CHECK (start_offset_ms >= 0),
  end_offset_ms bigint NOT NULL CHECK (end_offset_ms > start_offset_ms),
  overlap_ms integer NOT NULL DEFAULT 0 CHECK (overlap_ms >= 0),
  gap_before_ms integer NOT NULL DEFAULT 0 CHECK (gap_before_ms >= 0),
  object_path text NOT NULL,
  mime text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  sha256 text,
  upload_state text NOT NULL DEFAULT 'pending' CHECK (upload_state IN ('pending','uploading','uploaded','verified','expired','purged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_version integer NOT NULL DEFAULT 1,
  reservation_key text,
  upload_token_expires_at timestamptz,
  verified_at timestamptz,
  last_error text,
  CONSTRAINT meeting_capture_segment_unique UNIQUE (capture_id, source_version, segment_index)
);
CREATE UNIQUE INDEX meeting_capture_segment_reservation_key_idx
  ON public.meeting_capture_segments(capture_id, reservation_key)
  WHERE reservation_key IS NOT NULL;

CREATE TABLE public.meeting_pointer_intervals (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.meeting_capture_sessions(id) ON DELETE CASCADE,
  clock_epoch integer NOT NULL CHECK (clock_epoch >= 0),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  canonical_task_id uuid NOT NULL REFERENCES public.wbs_items(id) ON DELETE RESTRICT,
  surface_kind text NOT NULL,
  started_offset_ms bigint NOT NULL CHECK (started_offset_ms >= 0),
  ended_offset_ms bigint NOT NULL CHECK (ended_offset_ms > started_offset_ms),
  visible boolean NOT NULL DEFAULT true,
  termination_reason text NOT NULL,
  batch_key text NOT NULL,
  batch_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_pointer_sequence_unique UNIQUE (capture_id, sequence)
);

CREATE TABLE public.meeting_analysis_runs (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.meeting_capture_sessions(id) ON DELETE CASCADE,
  source_version integer NOT NULL,
  request_key text NOT NULL,
  transcript_revision_id uuid,
  config_version text NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','ready','awaiting_budget','failed_retryable','failed_terminal','cancelled')),
  resume_stage text NOT NULL DEFAULT 'transcribe',
  stage_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  upload_completed_at timestamptz,
  deadline_at timestamptz,
  budget_month date,
  reserved_twd_micros bigint NOT NULL DEFAULT 0,
  actual_twd_micros bigint,
  error_code text,
  overdue_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_mode text NOT NULL DEFAULT 'fake',
  cleanup_pending boolean NOT NULL DEFAULT false,
  manual_retry_count integer NOT NULL DEFAULT 0,
  CONSTRAINT meeting_analysis_request_unique UNIQUE (capture_id, request_key),
  UNIQUE (capture_id, id)
);

CREATE TABLE public.meeting_transcript_segments (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.meeting_capture_sessions(id) ON DELETE CASCADE,
  transcript_revision_id uuid NOT NULL,
  producer_run_id uuid NOT NULL REFERENCES public.meeting_analysis_runs(id) ON DELETE RESTRICT,
  segment_index integer NOT NULL CHECK (segment_index >= 0),
  source_audio_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_offset_ms bigint NOT NULL CHECK (start_offset_ms >= 0),
  end_offset_ms bigint NOT NULL CHECK (end_offset_ms > start_offset_ms),
  raw_text text NOT NULL DEFAULT '',
  normalized_text text NOT NULL DEFAULT '',
  word_offsets jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_transcript_segment_unique UNIQUE (transcript_revision_id, segment_index),
  UNIQUE (capture_id, id)
);

CREATE TABLE public.meeting_segment_resolutions (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.meeting_capture_sessions(id) ON DELETE CASCADE,
  transcript_segment_id uuid NOT NULL REFERENCES public.meeting_transcript_segments(id) ON DELETE CASCADE,
  candidate_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  latest_run_id uuid REFERENCES public.meeting_analysis_runs(id) ON DELETE RESTRICT,
  resolution_state text NOT NULL DEFAULT 'pending' CHECK (resolution_state IN ('pending','accepted','rejected','needs_review')),
  revision bigint NOT NULL DEFAULT 0,
  human_reviewed boolean NOT NULL DEFAULT false,
  human_empty_decision boolean NOT NULL DEFAULT false,
  protected_source_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  config_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_segment_resolution_unique UNIQUE (capture_id, transcript_segment_id),
  UNIQUE (capture_id, id)
);

CREATE TABLE public.meeting_task_match_results (
  id uuid PRIMARY KEY,
  resolution_id uuid NOT NULL REFERENCES public.meeting_segment_resolutions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.wbs_items(id) ON DELETE RESTRICT,
  quote_range jsonb,
  semantic_score numeric,
  pointer_feature numeric,
  ai_suggestion_version text NOT NULL,
  decision text NOT NULL DEFAULT 'suggested' CHECK (decision IN ('suggested','accepted','rejected','cleared')),
  decision_source text NOT NULL DEFAULT 'ai' CHECK (decision_source IN ('ai','human')),
  corrected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  corrected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_task_match_unique UNIQUE (resolution_id, task_id)
);

CREATE TABLE private.meeting_draft_projections (
  record_id uuid PRIMARY KEY REFERENCES public.knowledge_records(id) ON DELETE CASCADE,
  capture_id uuid NOT NULL REFERENCES public.meeting_capture_sessions(id) ON DELETE RESTRICT,
  applied_run_id uuid REFERENCES public.meeting_analysis_runs(id) ON DELETE RESTRICT,
  applied_review_revision bigint NOT NULL DEFAULT 0,
  last_request_key text,
  payload_hash text,
  block_markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  manual_link_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_link_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  record_version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.meeting_artifact_cleanup (
  obligation_id uuid PRIMARY KEY,
  capture_id uuid REFERENCES public.meeting_capture_sessions(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.meeting_analysis_runs(id) ON DELETE SET NULL,
  attempt_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('storage','provider')),
  object_locator text,
  display_name text,
  external_file_id text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','deleting','deleted','unknown','failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  upload_token_expires_at timestamptz,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, kind)
);

CREATE TABLE private.meeting_ai_budget_months (
  budget_month date PRIMARY KEY,
  limit_twd_micros bigint NOT NULL DEFAULT 1000000000,
  reserved_twd_micros bigint NOT NULL DEFAULT 0,
  spent_twd_micros bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.meeting_ai_usage_attempts (
  attempt_id text PRIMARY KEY,
  capture_id uuid,
  run_id uuid,
  unit_identity text NOT NULL,
  dispatch_month date NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  price_version text NOT NULL,
  reserved_twd_micros bigint NOT NULL DEFAULT 0,
  actual_twd_micros bigint,
  usage_state text NOT NULL DEFAULT 'unknown' CHECK (usage_state IN ('reserved','known','unknown','reconciled')),
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meeting_cleanup_attempt_kind_idx
  ON private.meeting_artifact_cleanup(attempt_id, kind);

INSERT INTO public.meeting_capture_sessions (
  id, tenant_id, project_id, record_id, created_by, idempotency_key, state,
  epoch_manifest, last_progress_at, stopped_at, audio_expires_at,
  source_version, audio_manifest_hash, pointer_manifest_hash, source_completeness,
  pointer_loss, review_revision, active_transcript_revision_id, created_at, updated_at,
  started_at, stopped_reason, source_frozen_at, source_parent_version,
  final_pointer_sequence, source_gaps
) VALUES
  ('a1234567-1234-4234-8234-123456789001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '23456789-1234-4234-8234-123456789002', '11111111-1111-4111-8111-111111111111', 'synthetic-ready-capture', 'ready',
   '[{"epoch":0,"startedAt":"2026-03-01T10:00:00.123456Z","endedAt":"2026-03-01T10:05:00.654321Z"}]'::jsonb, '2026-03-01T10:05:00.654321Z', '2026-03-01T10:05:00.654321Z', '2026-03-08T10:05:00.654321Z',
   7, 'synthetic-audio-manifest-hash-v1', 'synthetic-pointer-manifest-hash-v1', 'complete', false, 2, 'a5334567-1234-4234-8234-123456789001', '2026-03-01T10:00:00.123456Z', '2026-03-08T10:05:00.654321Z',
   '2026-03-01T10:00:00.123456Z', 'user-stop', '2026-03-01T10:05:00.654321Z', 6, 9007199254740993, '[]'::jsonb),
  ('a1234567-1234-4234-8234-123456789002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '23456789-1234-4234-8234-123456789002', '11111111-1111-4111-8111-111111111111', 'synthetic-cancelled-capture', 'cancelled',
   '[{"epoch":0,"startedAt":"2026-03-02T10:00:00.123456Z"}]'::jsonb, '2026-03-02T10:00:04.654321Z', '2026-03-02T10:00:04.654321Z', NULL,
   1, NULL, NULL, 'missing', true, 0, NULL, '2026-03-02T10:00:00.123456Z', '2026-03-02T10:00:04.654321Z',
   '2026-03-02T10:00:00.123456Z', 'user-cancel', '2026-03-02T10:00:04.654321Z', NULL, NULL, '[{"reason":"synthetic-device-ended"}]'::jsonb);

INSERT INTO public.meeting_capture_segments (
  id, capture_id, segment_index, epoch, start_offset_ms, end_offset_ms,
  overlap_ms, gap_before_ms, object_path, mime, bytes, sha256, upload_state,
  created_at, updated_at, source_version, reservation_key, upload_token_expires_at,
  verified_at, last_error
) VALUES (
  'a2234567-1234-4234-8234-123456789001', 'a1234567-1234-4234-8234-123456789001',
  0, 0, 0, 300000, 0, 0, 'synthetic/meeting/a1234567/segment-000.webm', 'audio/webm',
  1234567, repeat('a', 64), 'verified', '2026-03-01T10:00:01.123456Z', '2026-03-01T10:05:01.654321Z',
  7, 'synthetic-reservation-key-v1', '2026-03-01T12:00:00.123456Z', '2026-03-01T10:05:02.123456Z', NULL
);

INSERT INTO public.meeting_pointer_intervals (
  id, capture_id, clock_epoch, sequence, canonical_task_id, surface_kind,
  started_offset_ms, ended_offset_ms, visible, termination_reason,
  batch_key, batch_digest, created_at
) VALUES (
  'a3234567-1234-4234-8234-123456789001', 'a1234567-1234-4234-8234-123456789001',
  0, 9007199254740993, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'task-row',
  123456, 123789, true, 'pointer-leave', 'synthetic-pointer-batch-v1', repeat('b', 64),
  '2026-03-01T10:02:03.123456Z'
);

INSERT INTO public.meeting_analysis_runs (
  id, capture_id, source_version, request_key, transcript_revision_id, config_version,
  state, resume_stage, stage_cursor, attempt_count, next_attempt_at, lease_token,
  lease_expires_at, upload_completed_at, deadline_at, budget_month,
  reserved_twd_micros, actual_twd_micros, error_code, overdue_at,
  created_at, updated_at, provider_mode, cleanup_pending, manual_retry_count
) VALUES
  ('a4234567-1234-4234-8234-123456789001', 'a1234567-1234-4234-8234-123456789001', 7, 'synthetic-ready-request', 'a5334567-1234-4234-8234-123456789001', 'dev123-fake-fixture-v1',
   'ready', 'ready', '9007199254740993.1234567890123456789'::jsonb, 2, '2026-03-01T10:05:03.123456Z', NULL,
   NULL, '2026-03-01T10:05:00.654321Z', '2026-03-01T10:10:00.654321Z', '2026-03-01',
   3000000, 1500000, NULL, NULL, '2026-03-01T10:05:03.123456Z', '2026-03-01T10:05:10.654321Z', 'fake', false, 1),
  ('a4234567-1234-4234-8234-123456789002', 'a1234567-1234-4234-8234-123456789002', 1, 'synthetic-cancelled-request', NULL, 'dev123-fake-fixture-v1',
   'cancelled', 'transcribe', '"cancelled stage cursor"'::jsonb, 1, '2026-03-02T10:00:05.123456Z', NULL,
   NULL, NULL, NULL, '2026-03-01', 3000000, NULL, 'CANCELLED_BEFORE_DISPATCH', NULL,
   '2026-03-02T10:00:05.123456Z', '2026-03-02T10:00:06.654321Z', 'fake', true, 0);

INSERT INTO public.meeting_transcript_segments (
  id, capture_id, transcript_revision_id, producer_run_id, segment_index,
  source_audio_ranges, start_offset_ms, end_offset_ms, raw_text, normalized_text,
  word_offsets, source_hash, created_at
) VALUES (
  'a5234567-1234-4234-8234-123456789001', 'a1234567-1234-4234-8234-123456789001',
  'a5334567-1234-4234-8234-123456789001', 'a4234567-1234-4234-8234-123456789001', 0,
  '[{"segmentId":"a2234567-1234-4234-8234-123456789001","startMs":0,"endMs":300000}]'::jsonb,
  123456, 123789,
  'Synthetic transcript: review the main task and confirm the next action.',
  'synthetic transcript review main task confirm next action',
  '[{"text":"review","start_ms":123456,"end_ms":123789,"source_audio_segment_id":"a2234567-1234-4234-8234-123456789001","source_word_index":0}]'::jsonb,
  'synthetic-transcript-source-hash-v1', '2026-03-01T10:06:00.123456Z'
), (
  'a5234567-1234-4234-8234-123456789002', 'a1234567-1234-4234-8234-123456789002',
  'a5334567-1234-4234-8234-123456789002', 'a4234567-1234-4234-8234-123456789002', 0,
  '[]'::jsonb, 0, 1, 'Synthetic cancelled-run partial transcript.',
  'synthetic cancelled partial transcript', '[]'::jsonb,
  'synthetic-cancelled-transcript-source-hash-v1', '2026-03-02T10:00:03.123456Z'
);

INSERT INTO public.meeting_segment_resolutions (
  id, capture_id, transcript_segment_id, candidate_snapshot, latest_run_id,
  resolution_state, revision, human_reviewed, human_empty_decision,
  protected_source_ranges, config_version, created_at, updated_at
) VALUES (
  'a6234567-1234-4234-8234-123456789001', 'a1234567-1234-4234-8234-123456789001',
  'a5234567-1234-4234-8234-123456789001',
  '[{"taskId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1","source":"synthetic","score":0.123456789012345678901234567890}]'::jsonb,
  'a4234567-1234-4234-8234-123456789001', 'accepted', 2, true, false,
  '[{"fromWord":0,"toWord":4}]'::jsonb, 'dev123-fake-fixture-v1',
  '2026-03-01T10:06:01.123456Z', '2026-03-01T10:06:02.654321Z'
);

INSERT INTO public.meeting_task_match_results (
  id, resolution_id, task_id, quote_range, semantic_score, pointer_feature,
  ai_suggestion_version, decision, decision_source, corrected_by, corrected_at,
  created_at, updated_at
) VALUES (
  'a7234567-1234-4234-8234-123456789001', 'a6234567-1234-4234-8234-123456789001',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '{"fromWord":0,"toWord":4,"text":"review the main task"}'::jsonb,
  0.123456789012345678901234567890, 0.987654321098765432109876543210,
  'dev123-fake-fixture-v1', 'accepted', 'human', '11111111-1111-4111-8111-111111111111',
  '2026-03-01T10:06:03.123456Z', '2026-03-01T10:06:02.123456Z', '2026-03-01T10:06:03.654321Z'
);

INSERT INTO private.meeting_draft_projections (
  record_id, capture_id, applied_run_id, applied_review_revision, last_request_key,
  payload_hash, block_markers, manual_link_set, auto_link_set, record_version, updated_at
) VALUES (
  '23456789-1234-4234-8234-123456789002', 'a1234567-1234-4234-8234-123456789001',
  'a4234567-1234-4234-8234-123456789001', 2, 'synthetic-projection-request-v1',
  'synthetic-projection-payload-hash-v1', '[]'::jsonb,
  '[{"taskId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1","source":"human"}]'::jsonb,
  'null'::jsonb, 3, '2026-03-01T10:06:04.654321Z'
);

INSERT INTO private.meeting_artifact_cleanup (
  obligation_id, capture_id, run_id, attempt_id, kind, object_locator,
  display_name, external_file_id, state, lease_token, lease_expires_at,
  upload_token_expires_at, due_at, last_verified_at, attempts, error_code,
  created_at, updated_at
) VALUES
  ('a9234567-1234-4234-8234-123456789001', NULL, NULL, 'synthetic-detached-provider-attempt', 'provider', NULL,
   'projed-dev123-synthetic-detached', 'synthetic-provider-file-id-001', 'failed', NULL, NULL,
   NULL, '2026-03-01T10:20:00.123456Z', NULL, 3, 'PROVIDER_CLEANUP_ADAPTER_REQUIRED',
   '2026-03-01T10:10:00.123456Z', '2026-03-01T10:10:01.654321Z'),
  ('a9234567-1234-4234-8234-123456789002', 'a1234567-1234-4234-8234-123456789002', 'a4234567-1234-4234-8234-123456789002', 'synthetic-attached-storage-attempt', 'storage', 'synthetic/meeting/a1234567/segment-pending.webm',
   NULL, NULL, 'pending', NULL, NULL, '2026-03-02T12:00:00.123456Z', '2026-03-02T10:20:00.123456Z', NULL, 0, NULL,
   '2026-03-02T10:00:05.123456Z', '2026-03-02T10:00:05.123456Z');

INSERT INTO private.meeting_ai_budget_months (
  budget_month, limit_twd_micros, reserved_twd_micros, spent_twd_micros, updated_at
) VALUES (
  '2026-03-01', 9007199254740993, 4000000, 5000000, '2026-03-31T23:59:59.123456Z'
);

INSERT INTO private.meeting_ai_usage_attempts (
  attempt_id, capture_id, run_id, unit_identity, dispatch_month, provider, model,
  price_version, reserved_twd_micros, actual_twd_micros, usage_state, outcome,
  created_at, updated_at
) VALUES
  ('synthetic-attempt-reserved', 'a1234567-1234-4234-8234-123456789001', 'a4234567-1234-4234-8234-123456789001', 'synthetic-unit-reserved', '2026-03-01', 'fake', 'dev-123-fake', 'fixture-price-v1', 1000000, NULL, 'reserved', NULL, '2026-03-01T10:05:03.123456Z', '2026-03-01T10:05:03.123456Z'),
  ('synthetic-attempt-known', 'a1234567-1234-4234-8234-123456789001', 'a4234567-1234-4234-8234-123456789001', 'synthetic-unit-known', '2026-03-01', 'fake', 'dev-123-fake', 'fixture-price-v1', 2000000, 1500000, 'known', 'synthetic-ready', '2026-03-01T10:05:04.123456Z', '2026-03-01T10:05:05.654321Z'),
  ('synthetic-attempt-unknown', 'a1234567-1234-4234-8234-123456789002', 'a4234567-1234-4234-8234-123456789002', 'synthetic-unit-unknown', '2026-03-01', 'fake', 'dev-123-fake', 'fixture-price-v1', 3000000, NULL, 'unknown', 'synthetic-outcome-unknown', '2026-03-02T10:00:05.123456Z', '2026-03-02T10:00:06.654321Z'),
  ('synthetic-attempt-reconciled-orphan', 'a1234567-1234-4234-8234-123456789099', 'a4234567-1234-4234-8234-123456789099', 'synthetic-unit-reconciled-orphan', '2026-03-01', 'fake', 'dev-123-fake', 'fixture-price-v1', 4000000, 3500000, 'reconciled', 'synthetic-reconciled-orphan', '2026-03-03T10:00:05.123456Z', '2026-03-04T10:00:06.654321Z');
