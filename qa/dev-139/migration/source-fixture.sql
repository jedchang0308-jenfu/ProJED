CREATE SCHEMA private;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  external_auth_provider text,
  external_auth_id text,
  ui_preferences jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  legacy_workspace_id text,
  owner_id uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  legacy_board_id text,
  sort_order bigint NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.tenant_members (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.project_members (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.board_role_permissions (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  role text NOT NULL,
  capabilities text[] NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.task_tags (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  legacy_tag_id text,
  name text NOT NULL,
  color text NOT NULL,
  sort_order bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.wbs_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  parent_id uuid,
  legacy_node_id text,
  title text NOT NULL,
  detail_notes jsonb NOT NULL,
  description text,
  status text NOT NULL,
  assignee_id uuid,
  assignee_ids uuid[] NOT NULL,
  collaborator_ids uuid[] NOT NULL,
  start_date date,
  end_date date,
  is_duration_locked boolean,
  item_type text,
  kanban_stage_id text,
  sort_order bigint NOT NULL,
  depth integer NOT NULL,
  path uuid[] NOT NULL,
  is_archived boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.wbs_item_tags (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  item_id uuid NOT NULL,
  tag_id uuid NOT NULL
);
CREATE TABLE public.wbs_dependencies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  legacy_dependency_id text,
  from_item_id uuid NOT NULL,
  from_side text NOT NULL,
  to_item_id uuid NOT NULL,
  to_side text NOT NULL,
  offset_days integer NOT NULL
);
CREATE TABLE public.board_invites (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL,
  default_role text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.knowledge_records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  legacy_record_id text,
  record_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  participants_text text,
  occurred_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recorded_by uuid,
  status text NOT NULL,
  visibility text NOT NULL,
  rag_enabled boolean NOT NULL,
  source_document_id uuid,
  metadata jsonb NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.record_task_links (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  record_id uuid NOT NULL,
  item_id uuid NOT NULL,
  role text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid,
  actor_id uuid,
  event_type text NOT NULL,
  entity_table text,
  entity_id uuid,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity_table text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.llm_access_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  project_id uuid,
  actor_id uuid,
  provider text NOT NULL,
  model text,
  prompt_hash text,
  retrieved_chunk_ids uuid[] NOT NULL,
  response_metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.task_workbench_unplaced_items (
  owner_id uuid NOT NULL,
  id text NOT NULL,
  workspace_id text,
  task jsonb NOT NULL,
  sort_order bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE private.quick_task_capture_receipts (
  owner_id uuid NOT NULL,
  capture_id text NOT NULL,
  title_hash bytea NOT NULL,
  committed_at timestamptz NOT NULL
);
CREATE TABLE private.quick_task_oauth_clients (
  client_id text PRIMARY KEY,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.task_workbench_placement_operations (
  owner_id uuid NOT NULL,
  operation_id text NOT NULL,
  direction text NOT NULL,
  root_task_id text NOT NULL,
  task_ids jsonb NOT NULL,
  source_kind text,
  target_kind text,
  source_workspace_id text,
  source_board_id text,
  target_workspace_id text,
  target_board_id text,
  target_parent_task_id text,
  anchor_task_id text,
  position text,
  status text NOT NULL,
  error_code text,
  client_platform text,
  result jsonb,
  elapsed_ms integer,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.wbs_item_placements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL,
  project_id uuid NOT NULL,
  parent_placement_id uuid,
  placement_kind text NOT NULL,
  sort_order bigint NOT NULL,
  kanban_stage_id text,
  revision bigint NOT NULL,
  removed_at timestamptz,
  created_by uuid,
  removed_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.task_tracking_reference_staging (id uuid PRIMARY KEY);
CREATE TABLE public.task_tracking_reference_operations (
  tenant_id uuid NOT NULL,
  operation_id text NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  request_hash text,
  status text NOT NULL,
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE private.backup_import_executions (
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  package_id uuid NOT NULL,
  import_mode text NOT NULL,
  target_project_id uuid,
  status text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.account_board_task_filter_preferences (
  account_id uuid NOT NULL,
  project_id uuid NOT NULL,
  preference_version smallint NOT NULL,
  filters jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.calendar_subscriptions (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL,
  filters_json jsonb NOT NULL,
  is_active boolean NOT NULL,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.inbox_items (id uuid PRIMARY KEY);

INSERT INTO public.profiles VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', 'Owner', 'legacy', 'owner-1', '{"theme":"dark"}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('22222222-2222-4222-8222-222222222222', 'guest@example.test', 'Guest', NULL, NULL, '{}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.tenants VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Workspace', NULL, '11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'Unowned original workspace', 'orphan-ws', NULL, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.projects VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Main board', NULL, 10, '11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Reference board', 'board-ref', 20, '11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'Unowned original board', 'orphan-board', 30, NULL, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.tenant_members VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'viewer', 'active', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.project_members VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'owner', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'owner', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.board_role_permissions VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner', ARRAY['read_board','edit_board_settings','move_board_between_workspaces','manage_board_members','create_task','edit_task','move_task','delete_task','manage_task_reference','assign_task','create_dependency','delete_dependency','read_activity','write_activity','read_audit','write_audit'], '2026-01-02T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'viewer', ARRAY[]::text[], '2026-01-02T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', ARRAY['read_board','edit_board_settings','move_board_between_workspaces','manage_board_members','create_task','edit_task','move_task','delete_task','manage_task_reference','assign_task','create_dependency','delete_dependency','read_activity','write_activity','read_audit','write_audit'], '2026-01-02T00:00:00Z');
INSERT INTO public.task_tags VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, 'Important', 'red', 1, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.wbs_items VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', NULL, NULL, 'Parent task', '[]', 'Parent detail', 'in_progress', '11111111-1111-4111-8111-111111111111', ARRAY['22222222-2222-4222-8222-222222222222']::uuid[], ARRAY[]::uuid[], '2026-01-01', '2026-01-05', false, 'task', 'doing', 1, 0, ARRAY[]::uuid[], false, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'task-child', 'Child task', '[]', NULL, 'todo', NULL, ARRAY[]::uuid[], ARRAY[]::uuid[], NULL, NULL, false, 'task', NULL, 2, 1, ARRAY['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1']::uuid[], false, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9', NULL, 'orphan-task', 'Retained original task', '[]', 'Unowned data must not be discarded', 'todo', NULL, ARRAY[]::uuid[], ARRAY[]::uuid[], NULL, NULL, false, 'task', NULL, 1, 0, ARRAY[]::uuid[], false, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.wbs_item_tags VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.wbs_dependencies VALUES
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', NULL, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'end', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'start', 1);
INSERT INTO public.board_invites VALUES
  ('12345678-1234-4234-8234-123456789001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ' Invitee@Example.Test ', '11111111-1111-4111-8111-111111111111', 'pending', 'viewer', repeat('a', 64), '2027-01-01T00:00:00Z', NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.knowledge_records VALUES
  ('23456789-1234-4234-8234-123456789002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'record-1', 'meeting', 'Meeting', 'Notes', 'Owner, Guest', '2026-01-01T01:00:00Z', NULL, NULL, '11111111-1111-4111-8111-111111111111', 'published', 'project', false, NULL, '{"kind":"fixture"}', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.record_task_links VALUES
  ('34567890-1234-4234-8234-123456789003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '23456789-1234-4234-8234-123456789002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'related', '11111111-1111-4111-8111-111111111111', '2026-01-02T00:00:00Z');
INSERT INTO public.activity_events VALUES
  ('45678901-1234-4234-8234-123456789004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'task.updated', 'wbs_items', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '{"field":"title"}', '2026-01-02T00:00:00Z');
INSERT INTO public.audit_logs VALUES
  ('56789012-1234-4234-8234-123456789005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'task.update', 'wbs_items', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '{"title":"Old"}', '{"title":"Parent task"}', '2026-01-02T00:00:00Z');
INSERT INTO public.llm_access_logs VALUES
  ('01234567-1234-4234-8234-123456789011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'google', 'fixture-model', 'original-prompt-hash', ARRAY['01234567-1234-4234-8234-123456789099']::uuid[], '{"resultCount":1,"usage":{"inputTokens":7}}', '2026-01-02T00:00:00Z'),
  ('01234567-1234-4234-8234-123456789012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, '22222222-2222-4222-8222-222222222222', 'legacy', NULL, NULL, ARRAY[]::uuid[], '["legacy",{"tokens":2}]', '2026-01-03T00:00:00Z'),
  ('01234567-1234-4234-8234-123456789013', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, NULL, 'legacy-service', NULL, NULL, ARRAY[]::uuid[], '9007199254740993.1234567890123456789', '2026-01-04T00:00:00.123456Z'),
  ('01234567-1234-4234-8234-123456789017', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, NULL, 'legacy-string', NULL, NULL, ARRAY[]::uuid[], '"scalar metadata"', '2026-01-05T00:00:00Z'),
  ('01234567-1234-4234-8234-123456789018', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL, NULL, 'legacy-json-null', NULL, NULL, ARRAY[]::uuid[], 'null'::jsonb, '2026-01-06T00:00:00Z');
INSERT INTO public.task_workbench_unplaced_items VALUES
  ('11111111-1111-4111-8111-111111111111', 'unplaced-1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"id":"unplaced-1","title":"Unplaced"}', 1, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO private.quick_task_capture_receipts VALUES
  ('11111111-1111-4111-8111-111111111111', 'capture-1', decode(repeat('ab', 32), 'hex'), '2026-01-02T00:00:00Z');
INSERT INTO public.task_workbench_placement_operations VALUES
  ('11111111-1111-4111-8111-111111111111', 'place-1', 'to_board', 'unplaced-1', '["unplaced-1"]', 'unplaced', 'board', NULL, NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', NULL, NULL, 'end', 'committed', NULL, 'fixture', '{"status":"committed"}', 10, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.wbs_item_placements VALUES
  ('67890123-1234-4234-8234-123456789006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', NULL, 'tracking_reference', 1, 'todo', 2, NULL, '11111111-1111-4111-8111-111111111111', NULL, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.task_tracking_reference_operations VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'track-1', '11111111-1111-4111-8111-111111111111', 'create', repeat('b', 64), 'committed', '{"status":"committed"}', NULL, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO private.backup_import_executions VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '78901234-1234-4234-8234-123456789007', '11111111-1111-4111-8111-111111111111', '89012345-1234-4234-8234-123456789008', 'copy_to_new_board', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'succeeded', '{"status":"succeeded"}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.account_board_task_filter_preferences VALUES
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 6, '{"status":["todo"]}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
INSERT INTO public.calendar_subscriptions VALUES
  ('90123456-1234-4234-8234-123456789009', '11111111-1111-4111-8111-111111111111', 'Main calendar', repeat('c', 64), '{"workspace_ids":["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],"date_types":["start"]}', true, NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
