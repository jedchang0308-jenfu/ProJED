import type { ActorQueryPort, ServerActorV1 } from './actorTransaction.js';
import { KernelError } from './errors.js';
import type { OriginSwitchConfig, OriginSwitchEntry, OriginSwitchRoute } from './originSwitchConfig.js';
import { compareOriginSwitchPermissions, originSwitchPermissionsEqual } from './originSwitchPermissions.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export function validateOriginSwitchId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new KernelError('DOMAIN_DATA_INVALID', 'Invalid origin intent', 400);
}
function denied(): never { throw new KernelError('ACCESS_DENIED', 'Origin confirmation is unavailable', 403); }
function conflict(): never { throw new KernelError('REVISION_CONFLICT', 'Origin intent has changed or expired', 409); }
interface SessionRow {
  context_id: string; public_origin: string; entry: OriginSwitchEntry; local_user_id: string;
  principal_id: string; guard_revision: string; expires_at_ms: string; revoked_at_ms: string | null;
  permissions: unknown;
}
interface IntentRow {
  id: string; campaign: string; local_user_id: string; principal_id: string; guard_revision: string;
  guide_entry: OriginSwitchEntry; source_origin: string; target_origin: string;
  source_entry: OriginSwitchEntry; target_entry: OriginSwitchEntry; source_context_id: string;
  target_context_id: string | null; source_permissions: unknown; expires_at_ms: string;
}
const fields = `id::text,campaign,local_user_id::text,principal_id,guard_revision::text,guide_entry,source_origin,
  target_origin,source_entry,target_entry,source_context_id::text,target_context_id::text,source_permissions,expires_at_ms::text`;
export interface OriginSwitchIntentResult {
  id: string; campaign: string; sourceOrigin: string; targetOrigin: string; accountId: string;
  entry: OriginSwitchEntry; expiresAt: number;
  destination: null | { sourceOrigin: string; targetOrigin: string; accountId: string; entry: OriginSwitchEntry;
    workspaceMatched: boolean; permissionsMatched: boolean; expiresAt: number };
}
export class OriginSwitchRepository {
  constructor(private config: OriginSwitchConfig) {}
  private route(intent: IntentRow): OriginSwitchRoute {
    const route = this.config.routes.find(value => intent.campaign === this.config.campaign
      && value.entry === intent.guide_entry && value.sourceOrigin === intent.source_origin
      && value.targetOrigin === intent.target_origin && value.sourceSessionEntry === intent.source_entry
      && value.targetSessionEntry === intent.target_entry);
    if (!route) denied();
    return route;
  }
  private async session(port: ActorQueryPort, contextId: string, actor: ServerActorV1): Promise<SessionRow> {
    const result = await port.query<SessionRow>(`SELECT context_id::text,public_origin,entry,local_user_id::text,
      identity->>'principalId' AS principal_id,account_guard_revision::text AS guard_revision,
      expires_at_ms::text,revoked_at_ms::text,
      projed_core.session_effective_permissions_v1(permission_snapshot,created_resource_permissions) AS permissions
      FROM projed_core.app_sessions WHERE context_id=$1::uuid`, [contextId]);
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row || row.local_user_id !== actor.localUserId
      || row.principal_id !== actor.principalId || row.guard_revision !== actor.accountGuardRevision
      || row.revoked_at_ms !== null) denied();
    return row;
  }
  private async now(port: ActorQueryPort) {
    const row = (await port.query<{ now: string }>(`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::text AS now`)).rows[0];
    const now = Number(row?.now);
    if (!Number.isSafeInteger(now)) throw new KernelError('DB_UNAVAILABLE', 'Time unavailable', 503);
    return now;
  }
  private async intent(port: ActorQueryPort, id: string): Promise<IntentRow | null> {
    validateOriginSwitchId(id);
    return (await port.query<IntentRow>(`SELECT ${fields} FROM projed_core.origin_switch_intents WHERE id=$1::uuid`, [id])).rows[0] ?? null;
  }
  private async inspect(port: ActorQueryPort, actor: ServerActorV1, row: IntentRow, confirming: boolean): Promise<OriginSwitchIntentResult> {
    this.route(row);
    const now = await this.now(port);
    const source = await this.session(port, row.source_context_id, actor);
    const current = await this.session(port, actor.contextId, actor);
    if (source.public_origin !== row.source_origin || source.entry !== row.source_entry
      || Number(source.expires_at_ms) <= now || Number(row.expires_at_ms) <= now
      || !originSwitchPermissionsEqual(row.source_permissions, source.permissions)) conflict();
    if (confirming) {
      if (current.public_origin !== row.target_origin || current.entry !== row.target_entry) denied();
    } else if (current.context_id !== row.source_context_id
      && (current.context_id !== row.target_context_id || current.public_origin !== row.target_origin
        || current.entry !== row.target_entry)) denied();
    const result: OriginSwitchIntentResult = { id: row.id, campaign: row.campaign,
      sourceOrigin: row.source_origin, targetOrigin: row.target_origin, accountId: row.local_user_id,
      entry: row.guide_entry, expiresAt: Math.min(Number(row.expires_at_ms), Number(source.expires_at_ms)), destination: null };
    const targetId = confirming ? current.context_id : row.target_context_id;
    if (!targetId) return result;
    if (row.target_context_id && row.target_context_id !== targetId) conflict();
    const target = targetId === current.context_id ? current : await this.session(port, targetId, actor);
    if (target.public_origin !== row.target_origin || target.entry !== row.target_entry
      || Number(target.expires_at_ms) <= now) denied();
    const matched = compareOriginSwitchPermissions(row.source_permissions, target.permissions);
    if (confirming && (!matched.workspaceMatched || !matched.permissionsMatched)) denied();
    result.destination = { sourceOrigin: row.source_origin, targetOrigin: row.target_origin, accountId: row.local_user_id,
      entry: row.guide_entry, ...matched, expiresAt: Math.min(result.expiresAt, Number(target.expires_at_ms)) };
    return result;
  }
  async create(port: ActorQueryPort, actor: ServerActorV1,
    input: { id: string; campaign: string; entry: OriginSwitchEntry; targetOrigin: string }): Promise<OriginSwitchIntentResult> {
    validateOriginSwitchId(input.id);
    const current = await this.session(port, actor.contextId, actor);
    const route = this.config.routes.find(value => input.campaign === this.config.campaign
      && input.entry === value.entry && current.public_origin === value.sourceOrigin
      && current.entry === value.sourceSessionEntry && input.targetOrigin === value.targetOrigin);
    if (!route) denied();
    const existing = await this.intent(port, input.id);
    if (existing) {
      if (existing.source_context_id !== actor.contextId || existing.campaign !== input.campaign
        || existing.guide_entry !== input.entry || existing.target_origin !== input.targetOrigin) conflict();
      return this.inspect(port, actor, existing, false);
    }
    const now = await this.now(port);
    const expires = Math.min(now + 900_000, Number(current.expires_at_ms));
    if (expires <= now) denied();
    const inserted = await port.query<IntentRow>(`INSERT INTO projed_core.origin_switch_intents
      (id,campaign,local_user_id,principal_id,guard_revision,guide_entry,source_origin,target_origin,
       source_entry,target_entry,source_context_id,source_permissions,created_at_ms,expires_at_ms)
      VALUES($1::uuid,$2,$3::uuid,$4,$5::bigint,$6,$7,$8,$9,$10,$11::uuid,$12::jsonb,$13::bigint,$14::bigint)
      RETURNING ${fields}`, [input.id, input.campaign, actor.localUserId, actor.principalId, actor.accountGuardRevision,
      input.entry, route.sourceOrigin, route.targetOrigin, route.sourceSessionEntry, route.targetSessionEntry,
      actor.contextId, JSON.stringify(current.permissions), now, expires]);
    const row = inserted.rows[0];
    if (!row) denied();
    return this.inspect(port, actor, row, false);
  }
  async read(port: ActorQueryPort, actor: ServerActorV1, id: string): Promise<OriginSwitchIntentResult | null> {
    const row = await this.intent(port, id);
    return row ? this.inspect(port, actor, row, false) : null;
  }
  async confirm(port: ActorQueryPort, actor: ServerActorV1, id: string): Promise<OriginSwitchIntentResult> {
    const row = await this.intent(port, id);
    if (!row) denied();
    const result = await this.inspect(port, actor, row, true);
    if (row.target_context_id) return result; // Same exact Session replay, never rebind.
    const now = await this.now(port);
    const update = await port.query(`UPDATE projed_core.origin_switch_intents SET target_context_id=$2::uuid,
      confirmed_at_ms=$3::bigint WHERE id=$1::uuid AND target_context_id IS NULL`, [id, actor.contextId, now]);
    if (update.rowCount !== 1) conflict();
    return result;
  }
}
