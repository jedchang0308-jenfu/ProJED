import type { PoolClient } from 'pg';
import { PERMISSION_CAPABILITIES } from './domainRead.js';
import { EXTERNAL_QUALIFICATION_VERSION } from './externalBoardInvites.js';
import type { ProducerVerifiedIdentity } from './identityConsumer.js';

interface PermissionScope {
  role: string | null;
  capabilities: string[];
}
interface BoardScope extends PermissionScope {
  workspaceId: string;
  inheritedRole: string | null;
  approvedRole?: string;
}

// Human login captures once; machine Calendar reads rebuild current rights.
// Both hold the same app mutex as grants and revocations.
export async function captureSessionPermissions(client: PoolClient, identity: Pick<ProducerVerifiedIdentity, 'principalId' | 'principalKind' | 'googleSubject'>) {
  const workspaces: Record<string, PermissionScope> = {};
  const boards: Record<string, BoardScope> = {};
  const workspaceRows = await client.query<{ id: string; role: string; capabilities: string[] }>(`
    SELECT tenant.id::text, member.role, ARRAY(
      SELECT capability FROM unnest($1::text[]) capability
       WHERE projed_core.actor_has_workspace_capability_v1(tenant.id, capability)
      UNION ALL SELECT 'write_tags' WHERE projed_core.actor_can_write_tags_v1(tenant.id)
    ) AS capabilities
      FROM projed_core.tenants tenant
      JOIN projed_core.tenant_members member ON member.tenant_id=tenant.id
       AND member.user_id=projed_core.current_actor_user_id_v1() AND member.status='active'
     WHERE projed_core.actor_has_workspace_capability_v1(tenant.id,'read_workspace')
       AND ($2::boolean OR tenant.owner_id=member.user_id)
  `, [['read_workspace','manage_workspace_settings','manage_workspace_members','create_board',
    'delete_workspace','read_activity','read_audit','write_audit'], identity.principalKind === 'employee']);
  for (const row of workspaceRows.rows) workspaces[row.id] = { role: row.role, capabilities: row.capabilities };

  const boardRows = await client.query<{
    id: string; workspace_id: string; board_role: string | null; inherited_role: string | null;
    capabilities: string[]; owns_workspace: boolean; created_board: boolean; external_invite_id: string | null;
    approved_role: string | null; direct_capabilities: string[] | null; approved_capabilities: string[] | null;
  }>(`
    SELECT board.id::text, board.tenant_id::text AS workspace_id, direct.role AS board_role,
           workspace_member.role AS inherited_role, tenant.owner_id=projed_core.current_actor_user_id_v1() AS owns_workspace,
           board.created_by=projed_core.current_actor_user_id_v1() AS created_board,
           invite.id::text AS external_invite_id, invite.default_role AS approved_role,
           direct_matrix.capabilities AS direct_capabilities, invite_matrix.capabilities AS approved_capabilities,
           ARRAY(SELECT capability FROM unnest($1::text[]) capability
                  WHERE projed_core.actor_has_board_capability_v1(board.tenant_id, board.id, capability)
                 UNION ALL SELECT 'configure_permissions'
                  WHERE projed_core.actor_can_configure_role_permissions_v1(board.tenant_id, board.id)) AS capabilities
      FROM projed_core.projects board JOIN projed_core.tenants tenant ON tenant.id=board.tenant_id
      LEFT JOIN projed_core.project_members direct ON direct.project_id=board.id
       AND direct.user_id=projed_core.current_actor_user_id_v1()
      LEFT JOIN projed_core.tenant_members workspace_member ON workspace_member.tenant_id=board.tenant_id
       AND workspace_member.user_id=projed_core.current_actor_user_id_v1() AND workspace_member.status='active'
      LEFT JOIN projed_core.board_invites invite ON invite.project_id=board.id AND invite.tenant_id=board.tenant_id
       AND invite.external_recipient_user_id=direct.user_id AND invite.external_recipient_principal_id=$2
       AND invite.status='accepted' AND invite.external_access_revoked_at IS NULL
      LEFT JOIN projed_core.board_role_permissions direct_matrix ON direct_matrix.project_id=board.id AND direct_matrix.role=direct.role
      LEFT JOIN projed_core.board_role_permissions invite_matrix ON invite_matrix.project_id=board.id AND invite_matrix.role=invite.default_role
  `, [[...PERMISSION_CAPABILITIES], identity.principalId]);
  for (const row of boardRows.rows) {
    const ownsBoard = row.board_role === 'owner' && row.created_board;
    if (!row.owns_workspace && (row.external_invite_id || identity.principalKind === 'personal' && !ownsBoard)) {
      if (!row.external_invite_id || !row.approved_role) continue;
      const qualification = await client.query(`
        SELECT 1 FROM orgmaster_contract.read_projed_external_qualification_v1($1::text,$2::text)
         WHERE contract_version=$3 AND invitation_id=$1 AND principal_id=$2 AND google_subject=$4
           AND board_id=$5 AND role=$6 AND status='ACTIVE'
      `, [row.external_invite_id, identity.principalId, EXTERNAL_QUALIFICATION_VERSION, identity.googleSubject, row.id, row.approved_role]);
      if (qualification.rowCount !== 1) continue;
      const allowed = row.capabilities.filter(capability => row.direct_capabilities?.includes(capability)
        && row.approved_capabilities?.includes(capability));
      if (row.board_role === 'admin' && row.approved_role === 'admin') allowed.push('configure_permissions');
      if (!allowed.includes('read_board')) continue;
      boards[row.id] = { workspaceId: row.workspace_id, role: row.board_role, inheritedRole: null,
        approvedRole: row.approved_role, capabilities: allowed };
      continue;
    }
    boards[row.id] = { workspaceId: row.workspace_id, role: row.board_role,
      inheritedRole: row.inherited_role === 'owner' || row.inherited_role === 'admin' ? row.inherited_role : null,
      capabilities: row.capabilities };
  }
  return { version: 1, workspaces, boards, visibleWorkspaces: [...new Set([
    ...Object.keys(workspaces), ...Object.values(boards).map(board => board.workspaceId),
  ])] };
}
