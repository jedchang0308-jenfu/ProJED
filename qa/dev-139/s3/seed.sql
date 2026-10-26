INSERT INTO projed_core.profiles(id, email, display_name) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.invalid', 'A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.invalid', 'B');

INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true, 1);

INSERT INTO projed_core.tenants(id, legacy_workspace_id, title, owner_id, sort_order, created_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'ws-a', 'A workspace', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, '2026-01-01T00:00:00Z'),
  ('12222222-2222-4222-8222-222222222222', 'ws-b', 'B workspace', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, '2026-01-02T00:00:00Z');

INSERT INTO projed_core.projects(id, tenant_id, legacy_board_id, title, sort_order, created_at) VALUES
  ('21111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'board-a', 'A board', 1, '2026-01-01T01:00:00Z'),
  ('22222222-2222-4222-8222-222222222222', '12222222-2222-4222-8222-222222222222', 'board-shared', 'Shared board', 1, '2026-01-02T01:00:00Z'),
  ('23333333-3333-4333-8333-333333333333', '12222222-2222-4222-8222-222222222222', 'board-private', 'Private board', 2, '2026-01-02T02:00:00Z');

INSERT INTO projed_core.actor_scope_access(local_user_id, tenant_id, project_id, active, scope_revision) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', NULL, true, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '12222222-2222-4222-8222-222222222222', NULL, true, 1),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '12222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', true, 1);

INSERT INTO projed_core.tenant_members(
  tenant_id, user_id, role, status, member_email, member_display_name, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'active', 'a@example.invalid', 'A', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('12222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner', 'active', 'b@example.invalid', 'B', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');

INSERT INTO projed_core.project_members(
  tenant_id, project_id, user_id, role, member_email, member_display_name, created_at, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', '21111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'a@example.invalid', 'A', '2026-01-01T01:00:00Z', '2026-01-01T01:00:00Z'),
  ('12222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner', 'b@example.invalid', 'B', '2026-01-02T01:00:00Z', '2026-01-02T01:00:00Z'),
  ('12222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'viewer', 'a@example.invalid', 'A', '2026-01-02T01:01:00Z', '2026-01-02T01:01:00Z'),
  ('12222222-2222-4222-8222-222222222222', '23333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner', 'b@example.invalid', 'B', '2026-01-02T02:00:00Z', '2026-01-02T02:00:00Z');

WITH boards AS (
  SELECT tenant_id, id AS project_id FROM projed_core.projects
), roles(role, capabilities) AS (
  VALUES
    ('owner', ARRAY[
      'read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
      'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
      'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit'
    ]::text[]),
    ('admin', ARRAY[]::text[]),
    ('project_manager', ARRAY['read_board', 'create_task']::text[]),
    ('member', ARRAY['read_board']::text[]),
    ('viewer', ARRAY['read_board']::text[])
)
INSERT INTO projed_core.board_role_permissions(tenant_id, project_id, role, capabilities)
SELECT boards.tenant_id, boards.project_id, roles.role, roles.capabilities
  FROM boards CROSS JOIN roles;

INSERT INTO projed_core.wbs_items(
  id, tenant_id, project_id, legacy_task_id, parent_id, title, detail_notes, description,
  status, assignee_ids, collaborator_ids, tag_ids, start_date, end_date, duration_locked,
  node_type, kanban_stage_id, sort_order, archived, created_at, updated_at
) VALUES
  ('31111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '21111111-1111-4111-8111-111111111111', 'task-a', NULL, 'A task', '[]', NULL, 'todo', ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[], '{}', '{}', NULL, NULL, false, 'task', NULL, 1, false, '2026-01-01T02:00:00Z', '2026-01-01T02:00:00Z'),
  ('32222222-2222-4222-8222-222222222222', '12222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'shared-parent', NULL, 'Shared parent', '[]', 'Visible to A and B', 'in_progress', ARRAY['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']::uuid[], ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[], '{}', '2026-10-01', '2026-10-02', true, 'group', 'doing', 1, false, '2026-01-02T03:00:00Z', '2026-01-02T03:00:00Z'),
  ('33333333-3333-4333-8333-333333333333', '12222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'shared-child', '32222222-2222-4222-8222-222222222222', 'Shared child', '[]', NULL, 'todo', '{}', '{}', '{}', NULL, NULL, NULL, 'task', NULL, 2, false, '2026-01-02T03:01:00Z', '2026-01-02T03:01:00Z'),
  ('34444444-4444-4444-8444-444444444444', '12222222-2222-4222-8222-222222222222', '23333333-3333-4333-8333-333333333333', 'private-task', NULL, 'B secret', '[]', NULL, 'todo', ARRAY['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']::uuid[], '{}', '{}', NULL, NULL, false, 'task', NULL, 1, false, '2026-01-02T04:00:00Z', '2026-01-02T04:00:00Z');

INSERT INTO projed_core.wbs_dependencies(
  id, tenant_id, project_id, legacy_dependency_id, from_id, from_side, to_id, to_side, offset_value
) VALUES (
  '41111111-1111-4111-8111-111111111111',
  '12222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222',
  'dep-shared',
  '32222222-2222-4222-8222-222222222222', 'end',
  '33333333-3333-4333-8333-333333333333', 'start', 2
);
