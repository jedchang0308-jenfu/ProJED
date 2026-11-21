import type { ActorQueryPort, ServerActorV1 } from './actorTransaction.js';
import { KernelError } from './errors.js';
import { createServiceIdentityTokenProvider } from './serviceIdentityToken.js';

export const EXTERNAL_QUALIFICATION_VERSION = 'orgmaster.projed-external-qualification.v1';
const ORGMASTER_ORIGIN = 'https://orgmaster-prod-9536592944.asia-east1.run.app';

export interface ExternalInvitation {
  requestId: string;
  invitationId: string;
  inviterPrincipalId: string;
  boardId: string;
  role: string;
  expiresAt: string;
  contactEmail: string;
  company: string;
  note: string;
}

type Notification =
  | ({ action: 'submit' } & ExternalInvitation)
  | { action: 'bind'; requestId: string; principalId: string; googleSubject: string }
  | { action: 'withdraw'; requestId: string };
export type ExternalInvitationPublisher = (notification: Notification) => Promise<void>;

export function createExternalInvitationPublisher(
  tokenFor = createServiceIdentityTokenProvider({ brokerOrigin: ORGMASTER_ORIGIN }),
  fetchImpl = fetch,
): ExternalInvitationPublisher {
  return async notification => {
    const token = await tokenFor(ORGMASTER_ORIGIN);
    try {
      const response = await fetchImpl(new URL('/api/internal/projed-external-requests/v1', ORGMASTER_ORIGIN), {
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ contractVersion: EXTERNAL_QUALIFICATION_VERSION, ...notification }),
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* Preserve the durable invitation. Owner responses may contain identity data. */ }
    throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'External invitation service is unavailable', 503);
  };
}

export async function requireExternalQualification(
  port: ActorQueryPort, actor: ServerActorV1, invite: ExternalInvitation,
): Promise<void> {
  const result = await port.query<{ status: string }>(`
    SELECT status FROM orgmaster_contract.read_projed_external_qualification_v1($1::text, $2::text)
     WHERE contract_version = $3 AND request_id = $1::uuid AND invitation_id = $1::text
       AND principal_id = $2 AND google_subject = $4 AND board_id = $5 AND role = $6
       AND expires_at = $7::timestamptz AND expires_at > clock_timestamp()
  `, [invite.invitationId, actor.principalId, EXTERNAL_QUALIFICATION_VERSION,
    actor.googleSubject, invite.boardId, invite.role, invite.expiresAt]);
  if (result.rows.length === 1 && result.rows[0]!.status === 'ACTIVE') return;
  if (result.rows.length === 1 && result.rows[0]!.status === 'PENDING') {
    throw new KernelError('EXTERNAL_APPROVAL_PENDING', 'External approval is pending', 409);
  }
  throw new KernelError('ACCESS_DENIED', 'External qualification is unavailable', 403);
}
