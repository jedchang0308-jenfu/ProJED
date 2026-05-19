import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const args = new Map(
  process.argv.slice(2).map(arg => {
    const [key, ...rest] = arg.split('=');
    return [key.replace(/^--/, ''), rest.join('=') || 'true'];
  })
);

const inputPath = args.get('input');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!inputPath) {
  console.error('Usage: node scripts/rehearse-supabase-import.mjs --input=./projed-export.json');
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this rehearsal script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stableUuid = (scope, value) => {
  if (typeof value === 'string' && uuidRegex.test(value)) return value;

  const hash = createHash('sha256')
    .update(`${scope}:${String(value ?? '')}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${(Number.parseInt(hash.slice(16, 17), 16) & 0x3 | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
};

const migrationEmail = legacyUserId =>
  `migration-${createHash('sha1').update(String(legacyUserId)).digest('hex').slice(0, 16)}@projed.local`;

const readExport = async () => {
  const raw = await readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    workspaces: parsed.workspaces || parsed?.state?.workspaces || [],
    nodes: Object.values(parsed.nodes || {}),
    dependencies: parsed.dependencies || [],
  };
};

const upsertOrThrow = async (table, rows) => {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
};

const collectLegacyUserIds = (workspaces, nodes) => {
  const ids = new Set();
  for (const workspace of workspaces) {
    if (workspace.ownerId) ids.add(workspace.ownerId);
    for (const memberId of workspace.members || []) ids.add(memberId);
  }
  for (const node of nodes) {
    if (node.assigneeId) ids.add(node.assigneeId);
    for (const collaboratorId of node.collaboratorIds || []) ids.add(collaboratorId);
  }
  return [...ids].map(String).filter(Boolean);
};

const listAuthUsers = async () => {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth user list failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
    page += 1;
  }
};

const ensureAuthUsers = async legacyUserIds => {
  const existingUsers = await listAuthUsers();
  const byLegacyId = new Map(
    existingUsers
      .filter(user => typeof user.user_metadata?.legacy_user_id === 'string')
      .map(user => [user.user_metadata.legacy_user_id, user])
  );
  const userIdMap = new Map();

  for (const legacyUserId of legacyUserIds) {
    const existing = byLegacyId.get(legacyUserId);
    if (existing) {
      userIdMap.set(legacyUserId, existing.id);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: migrationEmail(legacyUserId),
      email_confirm: true,
      user_metadata: {
        legacy_user_id: legacyUserId,
        migration_source: 'projed-rehearsal',
      },
    });

    if (error) throw new Error(`auth user create failed for ${legacyUserId}: ${error.message}`);
    userIdMap.set(legacyUserId, data.user.id);
  }

  await upsertOrThrow('profiles', [...userIdMap.entries()].map(([legacyUserId, userId]) => ({
    id: userId,
    email: migrationEmail(legacyUserId),
    display_name: legacyUserId,
    external_auth_provider: 'firebase',
    external_auth_id: legacyUserId,
  })));

  return userIdMap;
};

const main = async () => {
  const { workspaces, nodes, dependencies } = await readExport();
  const userIdMap = await ensureAuthUsers(collectLegacyUserIds(workspaces, nodes));
  const workspaceIdMap = new Map(workspaces.map(workspace => [workspace.id, stableUuid('workspace', workspace.id)]));
  const boardIdMap = new Map();
  const nodeIdMap = new Map(nodes.map(node => [node.id, stableUuid('node', node.id)]));
  const dependencyIdMap = new Map(dependencies.map(dependency => [dependency.id, stableUuid('dependency', dependency.id)]));

  const projects = workspaces.flatMap(workspace =>
    (workspace.boards || []).map(board => {
      const mappedBoardId = stableUuid('board', `${workspace.id}:${board.id}`);
      boardIdMap.set(board.id, mappedBoardId);
      return {
        ...board,
        id: mappedBoardId,
        legacy_board_id: board.id,
        tenant_id: workspaceIdMap.get(workspace.id),
      };
    })
  );

  await upsertOrThrow('tenants', workspaces.map(workspace => ({
    id: workspaceIdMap.get(workspace.id),
    name: workspace.title || 'Untitled workspace',
    legacy_workspace_id: workspace.id,
    owner_id: workspace.ownerId ? userIdMap.get(String(workspace.ownerId)) : null,
    metadata: {
      legacyMembers: workspace.members || [],
      legacyOrder: workspace.order ?? null,
    },
  })));

  await upsertOrThrow('tenant_members', workspaces.flatMap(workspace =>
    (workspace.members || [])
      .map(memberId => userIdMap.get(String(memberId)))
      .filter(Boolean)
      .map(userId => ({
        tenant_id: workspaceIdMap.get(workspace.id),
        user_id: userId,
        role: userId === userIdMap.get(String(workspace.ownerId)) ? 'owner' : 'member',
        status: 'active',
      }))
  ));

  await upsertOrThrow('projects', projects.map(project => ({
    id: project.id,
    tenant_id: project.tenant_id,
    name: project.title || 'Untitled board',
    legacy_board_id: project.legacy_board_id,
    sort_order: project.order ?? 0,
    metadata: {
      legacyCreatedAt: project.createdAt ?? null,
    },
  })));

  await upsertOrThrow('wbs_items', nodes.map(node => ({
    id: nodeIdMap.get(node.id),
    tenant_id: workspaceIdMap.get(node.workspaceId),
    project_id: boardIdMap.get(node.boardId),
    parent_id: node.parentId ? nodeIdMap.get(node.parentId) : null,
    legacy_node_id: node.id,
    title: node.title || 'Untitled item',
    description: node.description || null,
    detail_notes: node.detailNotes || [],
    status: node.status || 'todo',
    assignee_id: node.assigneeId ? userIdMap.get(String(node.assigneeId)) : null,
    collaborator_ids: (node.collaboratorIds || [])
      .map(collaboratorId => userIdMap.get(String(collaboratorId)))
      .filter(Boolean),
    start_date: node.startDate || null,
    end_date: node.endDate || null,
    is_duration_locked: Boolean(node.isDurationLocked),
    item_type: node.nodeType || 'task',
    kanban_stage_id: node.kanbanStageId || null,
    sort_order: node.order ?? 0,
    is_archived: Boolean(node.isArchived),
    metadata: {
      legacyCreatedAt: node.createdAt ?? null,
      legacyUpdatedAt: node.updatedAt ?? null,
    },
  })));

  await upsertOrThrow('wbs_dependencies', dependencies.map(dependency => {
    const fromNode = nodes.find(node => node.id === dependency.fromId);
    return {
      id: dependencyIdMap.get(dependency.id),
      tenant_id: fromNode ? workspaceIdMap.get(fromNode.workspaceId) : null,
      project_id: fromNode ? boardIdMap.get(fromNode.boardId) : null,
      from_item_id: nodeIdMap.get(dependency.fromId),
      from_side: dependency.fromSide,
      to_item_id: nodeIdMap.get(dependency.toId),
      to_side: dependency.toSide,
      offset_days: dependency.offset ?? 0,
      legacy_dependency_id: dependency.id,
    };
  }).filter(row => row.tenant_id && row.project_id && row.from_item_id && row.to_item_id));

  console.log(JSON.stringify({
    auth_users: userIdMap.size,
    tenants: workspaces.length,
    projects: projects.length,
    wbs_items: nodes.length,
    wbs_dependencies: dependencies.length,
  }, null, 2));
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
