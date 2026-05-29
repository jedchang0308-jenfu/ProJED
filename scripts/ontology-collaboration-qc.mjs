import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const strict = process.argv.includes('--strict');
const runDb = process.argv.includes('--db') || process.env.ONTOLOGY_COLLABORATION_DB_QC === 'true';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Ontology-qc-${suffix}-Aa1!`;
const results = [];
const cleanup = {
  tenantId: null,
  userIds: [],
};

const addResult = (name, status, extra = {}) => {
  results.push({ name, status, ...extra });
};

const assertNoError = (label, result) => {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
};

const expectRows = (label, result, expectedCount) => {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  const count = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} row(s), got ${count}`);
  }
  return result.data;
};

const expectDenied = async (label, action) => {
  const result = await action();
  if (result.error) return;
  const count = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
  if (count > 0) {
    throw new Error(`${label}: expected denial or zero rows, got ${count}`);
  }
};

const loadText = file => readFileSync(resolve(file), 'utf8');
const hashInviteToken = token => createHash('sha256').update(token).digest('hex');

const runStaticUiGuardChecks = () => {
  const checks = [
    {
      file: 'src/hooks/useBoardPermissions.ts',
      snippets: ['canCreateTask', 'canEditTask', 'canMoveTask', 'canDeleteTask', 'canAssignTask', 'canCreateDependency'],
    },
    {
      file: 'src/components/BoardView.tsx',
      snippets: ['useBoardPermissions', 'canMoveTask', 'canCreateTask', 'canCreateDependency'],
    },
    {
      file: 'src/components/Wbs/WbsListView.tsx',
      snippets: ['useBoardPermissions', 'canMoveTask', 'canCreateTask', 'canCreateDependency'],
    },
    {
      file: 'src/components/Wbs/WbsNodeItem.tsx',
      snippets: ['useBoardPermissions', 'canEditTask', 'canAssignTask', 'canMoveTask', '已離開成員'],
    },
    {
      file: 'src/components/Wbs/KanbanColumn.tsx',
      snippets: ['useBoardPermissions', 'canEditTask', 'canCreateTask', 'canMoveTask'],
    },
    {
      file: 'src/components/Wbs/KanbanCard.tsx',
      snippets: ['useBoardPermissions', 'canEditTask', 'canCreateDependency', 'canMoveTask'],
    },
    {
      file: 'src/components/TaskDetailsModal.tsx',
      snippets: ['useBoardPermissions', 'canEditTask', 'TagPicker', 'disabled={!canEditTask}', '已離開成員'],
    },
    {
      file: 'src/components/Sidebar.tsx',
      snippets: ['useBoardPermissions', 'canCreateBoard', 'canDeleteWorkspace', 'canEditBoardSettings'],
    },
    {
      file: 'src/components/RecycleBinView.tsx',
      snippets: ['useBoardPermissions', 'canEditTask', 'canDeleteTask', 'canEmptyTrash'],
    },
    {
      file: 'src/components/Gantt/GanttTaskBar.tsx',
      snippets: ['useBoardPermissions', 'canEditSchedule', '!canEditSchedule', 'cursor-not-allowed'],
    },
    {
      file: 'src/components/GlobalContextMenu.tsx',
      snippets: ['useBoardPermissions', 'canCreateTask', 'canDeleteTask', 'canCreateDependency', '已離開成員'],
    },
    {
      file: 'src/components/BoardMembersPanel.tsx',
      snippets: [
        'DEFAULT_INVITE_ROLE',
        'boardInviteService.create',
        'boardInviteService.revoke',
        'pendingInvites',
        'handleCopyInviteLink',
      ],
    },
    {
      file: 'src/hooks/useMemberSync.ts',
      snippets: ['postgres_changes', 'tenant_members', 'project_members', 'profiles', 'loadMembers(activeWorkspaceId, activeBoardId)'],
    },
    {
      file: 'src/App.tsx',
      snippets: ['BOARD_INVITE_TOKEN_PARAM', 'boardInviteService.accept', 'processedInviteToken.current = token'],
    },
    {
      file: 'src/services/localTestService.ts',
      snippets: [
        'localTestBoardInviteService',
        'requireCanManageBoard',
        'tokenHash',
        'accept: async',
        "status: 'accepted'",
        "status: 'revoked'",
      ],
    },
    {
      file: 'src/services/supabase/projedService.ts',
      snippets: [
        'supabaseBoardInviteService',
        'invite_created',
        'invite_revoked',
        'accept_board_invite',
        'Failed to write board invite',
      ],
    },
    {
      file: 'supabase/migrations/20260528092834_board_invites.sql',
      snippets: [
        'create table if not exists public.board_invites',
        'board_invites_one_pending_per_email_idx',
        'private.current_user_can_manage_project',
        'create or replace function public.accept_board_invite',
        'invite_accepted',
        'public.audit_logs',
        'when others then',
      ],
    },
  ];

  for (const check of checks) {
    if (!existsSync(resolve(check.file))) {
      addResult(`ui_guard_static:${check.file}`, 'fail', { reason: 'file missing' });
      continue;
    }

    const text = loadText(check.file);
    const missing = check.snippets.filter(snippet => !text.includes(snippet));
    addResult(`ui_guard_static:${check.file}`, missing.length === 0 ? 'pass' : 'fail', {
      missing: missing.length ? missing : undefined,
    });
  }
};

const createAuthedClient = async (supabaseUrl, anonKey, email) => {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assertNoError(`signIn:${email}`, await client.auth.signInWithPassword({ email, password }));
  return client;
};

const createUsers = async admin => {
  const users = {};
  for (const role of [
    'owner',
    'admin',
    'project_manager',
    'member',
    'viewer',
    'nonmember',
    'invitee',
    'revoked_invitee',
    'expired_invitee',
    'mismatch_invitee',
  ]) {
    const email = `ontology-${role}-${suffix}@example.invalid`;
    const created = assertNoError(
      `admin.createUser:${role}`,
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: `Ontology QC ${role}` },
      })
    );
    users[role] = { id: created.user.id, email, role };
    cleanup.userIds.push(created.user.id);
  }
  return users;
};

const seedData = async (admin, users) => {
  const profileRows = Object.values(users).map(user => ({
    id: user.id,
    email: user.email,
    display_name: `Ontology QC ${user.role}`,
  }));
  assertNoError('profiles upsert', await admin.from('profiles').upsert(profileRows));

  const tenant = assertNoError(
    'tenant seed',
    await admin
      .from('tenants')
      .insert({
        name: `Ontology Collaboration QC ${suffix}`,
        owner_id: users.owner.id,
        metadata: { smokeId: suffix },
      })
      .select()
      .single()
  );
  cleanup.tenantId = tenant.id;

  const tenantMembers = ['owner', 'admin', 'project_manager', 'member', 'viewer'].map(role => ({
    tenant_id: tenant.id,
    user_id: users[role].id,
    role,
    status: 'active',
  }));
  assertNoError('tenant_members seed', await admin.from('tenant_members').upsert(tenantMembers));

  const project = assertNoError(
    'project seed',
    await admin
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        name: `Ontology QC Board ${suffix}`,
        sort_order: Date.now(),
        created_by: users.owner.id,
        metadata: { smokeId: suffix },
      })
      .select()
      .single()
  );

  const projectMembers = ['owner', 'admin', 'project_manager', 'member', 'viewer'].map(role => ({
    tenant_id: tenant.id,
    project_id: project.id,
    user_id: users[role].id,
    role,
  }));
  assertNoError('project_members seed', await admin.from('project_members').upsert(projectMembers));

  const parent = assertNoError(
    'parent task seed',
    await admin
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        title: 'QC Parent',
        status: 'todo',
        item_type: 'group',
        sort_order: 1,
      })
      .select()
      .single()
  );

  const child = assertNoError(
    'child task seed',
    await admin
      .from('wbs_items')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: parent.id,
        title: 'QC Child',
        status: 'todo',
        assignee_id: users.member.id,
        collaborator_ids: [users.project_manager.id],
        item_type: 'task',
        sort_order: 2,
      })
      .select()
      .single()
  );

  return { tenant, project, parent, child };
};

const runDbChecks = async () => {
  if (!runDb) {
    addResult('supabase_db_role_smoke', strict ? 'fail' : 'pending', {
      reason: 'pass --db or set ONTOLOGY_COLLABORATION_DB_QC=true to run service-role DB smoke checks',
    });
    return;
  }

  const missing = requiredEnv.filter(key => !process.env[key]);
  if (missing.length > 0) {
    addResult('supabase_db_role_smoke', strict ? 'fail' : 'pending', {
      reason: `missing env: ${missing.join(', ')}`,
    });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const users = await createUsers(admin);
    const seeded = await seedData(admin, users);
    const clients = {};
    for (const role of Object.keys(users)) {
      clients[role] = await createAuthedClient(supabaseUrl, anonKey, users[role].email);
    }

    for (const role of ['owner', 'admin', 'project_manager', 'member', 'viewer']) {
      expectRows(
        `rls_read_project:${role}`,
        await clients[role].from('projects').select('id').eq('id', seeded.project.id),
        1
      );
      expectRows(
        `rls_read_task:${role}`,
        await clients[role].from('wbs_items').select('id').eq('id', seeded.child.id),
        1
      );
      addResult(`rls_read:${role}`, 'pass');
    }

    expectRows(
      'rls_read_project:nonmember',
      await clients.nonmember.from('projects').select('id').eq('id', seeded.project.id),
      0
    );
    expectRows(
      'rls_read_task:nonmember',
      await clients.nonmember.from('wbs_items').select('id').eq('id', seeded.child.id),
      0
    );
    addResult('rls_read:nonmember_denied', 'pass');

    for (const role of ['owner', 'admin', 'project_manager', 'member']) {
      expectRows(
        `rls_write_task:${role}`,
        await clients[role]
          .from('wbs_items')
          .update({ status: 'in_progress' })
          .eq('id', seeded.child.id)
          .select('id'),
        1
      );
      addResult(`rls_write_task:${role}`, 'pass');
    }

    await expectDenied('rls_write_task:viewer_denied', () =>
      clients.viewer
        .from('wbs_items')
        .update({ status: 'completed' })
        .eq('id', seeded.child.id)
        .select('id')
    );
    addResult('rls_write_task:viewer_denied', 'pass');

    await expectDenied('rls_write_task:nonmember_denied', () =>
      clients.nonmember
        .from('wbs_items')
        .update({ status: 'completed' })
        .eq('id', seeded.child.id)
        .select('id')
    );
    addResult('rls_write_task:nonmember_denied', 'pass');

    const assignment = expectRows(
      'assignment_update',
      await clients.member
        .from('wbs_items')
        .update({
          assignee_id: users.project_manager.id,
          collaborator_ids: [users.owner.id, users.project_manager.id],
        })
        .eq('id', seeded.child.id)
        .select('assignee_id,collaborator_ids'),
      1
    )[0];
    if (
      assignment.assignee_id !== users.project_manager.id ||
      !assignment.collaborator_ids.includes(users.owner.id) ||
      !assignment.collaborator_ids.includes(users.project_manager.id)
    ) {
      throw new Error('assignment_update: persisted assignment fields did not match expected users');
    }

    const loadedAssignment = expectRows(
      'assignment_load_by_pm',
      await clients.project_manager
        .from('wbs_items')
        .select('assignee_id,collaborator_ids')
        .eq('id', seeded.child.id),
      1
    )[0];
    if (loadedAssignment.assignee_id !== users.project_manager.id) {
      throw new Error('assignment_load_by_pm: assignee_id did not persist');
    }
    addResult('assignment_sync', 'pass');

    const activityId = assertNoError(
      'log_activity_event:member',
      await clients.member.rpc('log_activity_event', {
        target_tenant_id: seeded.tenant.id,
        target_project_id: seeded.project.id,
        activity_event_type: 'task_assigned',
        activity_entity_table: 'wbs_items',
        activity_entity_id: seeded.child.id,
        activity_payload: { smokeId: suffix },
      })
    );
    expectRows(
      'activity_read_by_viewer',
      await clients.viewer.from('activity_events').select('id').eq('id', activityId),
      1
    );
    await expectDenied('activity_write_by_viewer_denied', () =>
      clients.viewer.rpc('log_activity_event', {
        target_tenant_id: seeded.tenant.id,
        target_project_id: seeded.project.id,
        activity_event_type: 'task_status_changed',
        activity_entity_table: 'wbs_items',
        activity_entity_id: seeded.child.id,
        activity_payload: { smokeId: suffix },
      })
    );
    addResult('activity_event_rpc', 'pass');

    const auditId = assertNoError(
      'log_audit_event:project_manager',
      await clients.project_manager.rpc('log_audit_event', {
        target_tenant_id: seeded.tenant.id,
        target_project_id: seeded.project.id,
        audit_action: 'member_role_changed',
        audit_entity_table: 'project_members',
        audit_entity_id: users.viewer.id,
        audit_before_data: { role: 'viewer', smokeId: suffix },
        audit_after_data: { role: 'member', smokeId: suffix },
      })
    );
    const roleAudit = expectRows(
      'audit_read_by_owner',
      await clients.owner.from('audit_logs').select('id,before_data,after_data').eq('id', auditId),
      1
    )[0];
    if (roleAudit.before_data?.role !== 'viewer' || roleAudit.after_data?.role !== 'member') {
      throw new Error('audit_role_change_payload: before/after role payload did not match');
    }
    expectRows(
      'audit_read_by_member_denied',
      await clients.member.from('audit_logs').select('id').eq('id', auditId),
      0
    );
    await expectDenied('audit_write_by_member_denied', () =>
      clients.member.rpc('log_audit_event', {
        target_tenant_id: seeded.tenant.id,
        target_project_id: seeded.project.id,
        audit_action: 'member_role_changed',
        audit_entity_table: 'project_members',
        audit_entity_id: users.viewer.id,
        audit_before_data: { role: 'viewer' },
        audit_after_data: { role: 'admin' },
      })
    );
    const removedAuditId = assertNoError(
      'log_audit_event:member_removed',
      await clients.project_manager.rpc('log_audit_event', {
        target_tenant_id: seeded.tenant.id,
        target_project_id: seeded.project.id,
        audit_action: 'member_removed',
        audit_entity_table: 'project_members',
        audit_entity_id: users.viewer.id,
        audit_before_data: { userId: users.viewer.id, role: 'viewer', smokeId: suffix },
        audit_after_data: null,
      })
    );
    const removedAudit = expectRows(
      'audit_member_removed_payload',
      await clients.owner.from('audit_logs').select('action,entity_id,before_data,after_data').eq('id', removedAuditId),
      1
    )[0];
    if (
      removedAudit.action !== 'member_removed' ||
      removedAudit.entity_id !== users.viewer.id ||
      removedAudit.before_data?.userId !== users.viewer.id ||
      removedAudit.after_data !== null
    ) {
      throw new Error('audit_member_removed_payload: member removal target payload did not match');
    }
    addResult('audit_log_rpc', 'pass');
    addResult('audit_role_change_payload', 'pass');
    addResult('audit_member_removed_payload', 'pass');

    const pmUpdatedViewer = expectRows(
      'project_manager_update_viewer_role',
      await clients.project_manager
        .from('project_members')
        .update({ role: 'member' })
        .eq('tenant_id', seeded.tenant.id)
        .eq('project_id', seeded.project.id)
        .eq('user_id', users.viewer.id)
        .select('role'),
      1
    )[0];
    if (pmUpdatedViewer.role !== 'member') {
      throw new Error('project_manager_update_viewer_role: expected viewer to be updated to member');
    }
    assertNoError(
      'project_manager_restore_viewer_role',
      await clients.project_manager
        .from('project_members')
        .update({ role: 'viewer' })
        .eq('tenant_id', seeded.tenant.id)
        .eq('project_id', seeded.project.id)
        .eq('user_id', users.viewer.id)
    );
    addResult('project_manager_manage_members', 'pass');

    const createInvitePayload = (role, email, token, overrides = {}) => ({
      tenant_id: seeded.tenant.id,
      project_id: seeded.project.id,
      email,
      invited_by: users[role].id,
      token_hash: hashInviteToken(token),
      status: 'pending',
      default_role: 'member',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    });

    const ownerInviteEmail = `owner-invite-${suffix}@example.invalid`;
    const ownerInvite = assertNoError(
      'board_invite_insert_by_owner',
      await clients.owner
        .from('board_invites')
        .insert(createInvitePayload('owner', ownerInviteEmail, `owner-invite-${suffix}`))
        .select('id,email,status,default_role,expires_at')
        .single()
    );
    const ownerInviteAuditId = assertNoError(
      'log_audit_event:owner_invite_created',
      await clients.owner.rpc('log_audit_event', {
        target_tenant_id: seeded.tenant.id,
        target_project_id: seeded.project.id,
        audit_action: 'invite_created',
        audit_entity_table: 'board_invites',
        audit_entity_id: ownerInvite.id,
        audit_before_data: null,
        audit_after_data: {
          inviteId: ownerInvite.id,
          email: ownerInvite.email,
          status: ownerInvite.status,
          defaultRole: ownerInvite.default_role,
          expiresAt: ownerInvite.expires_at,
        },
      })
    );
    const ownerInviteAudit = expectRows(
      'board_invite_owner_create_audit',
      await admin
        .from('audit_logs')
        .select('action,entity_table,entity_id,before_data,after_data')
        .eq('id', ownerInviteAuditId),
      1
    )[0];
    if (
      ownerInviteAudit.action !== 'invite_created' ||
      ownerInviteAudit.entity_table !== 'board_invites' ||
      ownerInviteAudit.entity_id !== ownerInvite.id ||
      ownerInviteAudit.before_data !== null ||
      ownerInviteAudit.after_data?.email !== ownerInviteEmail ||
      ownerInviteAudit.after_data?.status !== 'pending'
    ) {
      throw new Error('board_invite_owner_create_audit: audit payload did not match created invite');
    }
    addResult('board_invite_owner_create_audit', 'pass');

    const deniedInviteToken = `denied-${suffix}`;
    const deniedInviteEmail = `denied-${users.viewer.email}`;
    await expectDenied('board_invite_insert_by_viewer_denied', () =>
      clients.viewer
        .from('board_invites')
        .insert(createInvitePayload('viewer', deniedInviteEmail, deniedInviteToken))
        .select('id')
    );
    await expectDenied('board_invite_insert_by_nonmember_denied', () =>
      clients.nonmember
        .from('board_invites')
        .insert(createInvitePayload('nonmember', users.nonmember.email, `nonmember-${suffix}`))
        .select('id')
    );
    const deniedInviteLogs = assertNoError(
      'board_invite_denied_no_success_log_query',
      await admin
        .from('audit_logs')
        .select('id,after_data')
        .eq('action', 'invite_created')
        .eq('entity_table', 'board_invites')
    );
    if (deniedInviteLogs.some(log => log.after_data?.email === deniedInviteEmail)) {
      throw new Error('board_invite_denied_no_success_log: denied viewer invite wrote a success audit log');
    }
    addResult('board_invite_write_denied', 'pass');
    addResult('board_invite_denied_no_success_log', 'pass');

    const duplicateEmail = users.nonmember.email;
    assertNoError(
      'board_invite_insert_by_project_manager',
      await clients.project_manager
        .from('board_invites')
        .insert(createInvitePayload('project_manager', duplicateEmail, `duplicate-a-${suffix}`))
        .select('id,email,status,default_role')
        .single()
    );
    const duplicateInvite = await clients.project_manager
      .from('board_invites')
      .insert(createInvitePayload('project_manager', duplicateEmail, `duplicate-b-${suffix}`))
      .select('id');
    if (!duplicateInvite.error) {
      throw new Error('board_invite_duplicate_pending: expected unique pending invite denial');
    }
    addResult('board_invite_create_policy', 'pass');
    addResult('board_invite_duplicate_pending_denied', 'pass');

    const revokedToken = `revoked-${suffix}`;
    const revokedInvite = assertNoError(
      'board_invite_revoke_seed',
      await clients.project_manager
        .from('board_invites')
        .insert(createInvitePayload('project_manager', users.revoked_invitee.email, revokedToken))
        .select('id,status')
        .single()
    );
    const revokedAt = new Date().toISOString();
    const revokedRow = assertNoError(
      'board_invite_revoke_by_project_manager',
      await clients.project_manager
        .from('board_invites')
        .update({ status: 'revoked', revoked_at: revokedAt })
        .eq('id', revokedInvite.id)
        .select('id,status,revoked_at')
        .single()
    );
    if (revokedRow.status !== 'revoked' || !revokedRow.revoked_at) {
      throw new Error('board_invite_revoke_by_project_manager: revoked status was not persisted');
    }
    await expectDenied('board_invite_accept_revoked_denied', () =>
      clients.revoked_invitee.rpc('accept_board_invite', { invite_token_hash: hashInviteToken(revokedToken) })
    );
    addResult('board_invite_revoke_policy', 'pass');

    const expiredToken = `expired-${suffix}`;
    assertNoError(
      'board_invite_expired_seed',
      await admin.from('board_invites').insert(
        createInvitePayload('project_manager', users.expired_invitee.email, expiredToken, {
          expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        })
      )
    );
    await expectDenied('board_invite_accept_expired_denied', () =>
      clients.expired_invitee.rpc('accept_board_invite', { invite_token_hash: hashInviteToken(expiredToken) })
    );
    addResult('board_invite_accept_denied', 'pass');

    const mismatchToken = `mismatch-${suffix}`;
    assertNoError(
      'board_invite_email_mismatch_seed',
      await clients.project_manager
        .from('board_invites')
        .insert(createInvitePayload('project_manager', `mismatch-target-${suffix}@example.invalid`, mismatchToken))
    );
    await expectDenied('board_invite_accept_email_mismatch_denied', () =>
      clients.mismatch_invitee.rpc('accept_board_invite', { invite_token_hash: hashInviteToken(mismatchToken) })
    );
    addResult('board_invite_accept_email_mismatch_denied', 'pass');

    const acceptedToken = `accepted-${suffix}`;
    const acceptedInviteSeed = assertNoError(
      'board_invite_accept_seed',
      await clients.project_manager
        .from('board_invites')
        .insert(createInvitePayload('project_manager', users.invitee.email, acceptedToken))
        .select('id')
        .single()
    );
    const acceptedInviteResult = assertNoError(
      'board_invite_accept_rpc',
      await clients.invitee.rpc('accept_board_invite', { invite_token_hash: hashInviteToken(acceptedToken) })
    );
    const acceptedInvite = Array.isArray(acceptedInviteResult) ? acceptedInviteResult[0] : acceptedInviteResult;
    if (!acceptedInvite || acceptedInvite.id !== acceptedInviteSeed.id || acceptedInvite.status !== 'accepted') {
      throw new Error('board_invite_accept_rpc: accepted invite response did not match seeded invite');
    }
    const acceptedTenantMember = expectRows(
      'board_invite_accept_tenant_member',
      await admin
        .from('tenant_members')
        .select('role,status')
        .eq('tenant_id', seeded.tenant.id)
        .eq('user_id', users.invitee.id),
      1
    )[0];
    const acceptedProjectMember = expectRows(
      'board_invite_accept_project_member',
      await admin
        .from('project_members')
        .select('role')
        .eq('project_id', seeded.project.id)
        .eq('user_id', users.invitee.id),
      1
    )[0];
    if (
      acceptedTenantMember.role !== 'member' ||
      acceptedTenantMember.status !== 'active' ||
      acceptedProjectMember.role !== 'member'
    ) {
      throw new Error('board_invite_accept_membership: accepted invite did not create member access');
    }
    expectRows(
      'board_invite_accept_audit',
      await admin
        .from('audit_logs')
        .select('id')
        .eq('action', 'invite_accepted')
        .eq('entity_table', 'board_invites')
        .eq('entity_id', acceptedInvite.id),
      1
    );
    addResult('board_invite_accept_policy', 'pass');

    const lateInviteeEmail = `ontology-late-invitee-${suffix}@example.invalid`;
    const lateInviteToken = `late-${suffix}`;
    const lateInviteSeed = assertNoError(
      'board_invite_late_user_seed',
      await clients.project_manager
        .from('board_invites')
        .insert(createInvitePayload('project_manager', lateInviteeEmail, lateInviteToken))
        .select('id')
        .single()
    );
    const lateCreated = assertNoError(
      'admin.createUser:late_invitee',
      await admin.auth.admin.createUser({
        email: lateInviteeEmail,
        password,
        email_confirm: true,
        user_metadata: { name: 'Ontology QC late invitee' },
      })
    );
    cleanup.userIds.push(lateCreated.user.id);
    const lateClient = await createAuthedClient(supabaseUrl, anonKey, lateInviteeEmail);
    const lateInviteResult = assertNoError(
      'board_invite_accept_late_user_rpc',
      await lateClient.rpc('accept_board_invite', { invite_token_hash: hashInviteToken(lateInviteToken) })
    );
    const lateInvite = Array.isArray(lateInviteResult) ? lateInviteResult[0] : lateInviteResult;
    if (!lateInvite || lateInvite.id !== lateInviteSeed.id || lateInvite.status !== 'accepted') {
      throw new Error('board_invite_accept_late_user_rpc: accepted invite response did not match seeded invite');
    }
    expectRows(
      'board_invite_accept_late_user_profile',
      await admin.from('profiles').select('id,email').eq('id', lateCreated.user.id).eq('email', lateInviteeEmail),
      1
    );
    expectRows(
      'board_invite_accept_late_user_tenant_member',
      await admin
        .from('tenant_members')
        .select('role,status')
        .eq('tenant_id', seeded.tenant.id)
        .eq('user_id', lateCreated.user.id),
      1
    );
    expectRows(
      'board_invite_accept_late_user_project_member',
      await admin
        .from('project_members')
        .select('role')
        .eq('project_id', seeded.project.id)
        .eq('user_id', lateCreated.user.id),
      1
    );
    expectRows(
      'board_member_reload_after_late_accept',
      await clients.project_manager
        .from('project_members')
        .select('user_id,role')
        .eq('tenant_id', seeded.tenant.id)
        .eq('project_id', seeded.project.id)
        .eq('user_id', lateCreated.user.id),
      1
    );
    addResult('board_invite_accept_late_user_policy', 'pass');
    addResult('board_member_reload_after_late_accept', 'pass');

    addResult('supabase_db_role_smoke', 'pass', {
      tenant_id: seeded.tenant.id,
      project_id: seeded.project.id,
    });
  } finally {
    if (cleanup.tenantId) {
      await admin.from('tenants').delete().eq('id', cleanup.tenantId);
    }
    for (const userId of cleanup.userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
};

runStaticUiGuardChecks();
await runDbChecks();

const failed = results.filter(result => result.status === 'fail');
const pending = results.filter(result => result.status === 'pending');
const ok = failed.length === 0 && (!strict || pending.length === 0);

console.log(JSON.stringify({
  ok,
  strict,
  summary: {
    pass: results.filter(result => result.status === 'pass').length,
    pending: pending.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (!ok) {
  process.exit(1);
}
