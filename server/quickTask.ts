import { createHash } from 'node:crypto';

import type { ActorQueryPort } from './actorTransaction.js';
import { KernelError } from './errors.js';

export interface QuickTaskCreateInput {
  captureId: string;
  title: string;
  workspaceHint: string | null;
}

export interface QuickTaskCreateReceipt {
  status: 'committed';
  captureId: string;
  ownerId: string;
  titleHash: string;
  created: boolean;
  committedAt: number;
}

type ReceiptRow = {
  owner_id: string;
  capture_id: string;
  title_hash: string;
  committed_at_ms: string;
};

const CAPTURE_ID_RE = /^task_workbench_unplaced_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function receipt(row: ReceiptRow, created: boolean): QuickTaskCreateReceipt {
  const committedAt = Number(row.committed_at_ms);
  if (!Number.isSafeInteger(committedAt) || committedAt <= 0) {
    throw new KernelError('DB_BOUNDARY_INVALID', 'Stored quick task receipt is invalid', 503);
  }
  return {
    status: 'committed',
    captureId: row.capture_id,
    ownerId: row.owner_id,
    titleHash: row.title_hash,
    created,
    committedAt,
  };
}

function normalize(input: QuickTaskCreateInput): QuickTaskCreateInput {
  if (typeof input.captureId !== 'string' || !CAPTURE_ID_RE.test(input.captureId)) {
    throw new KernelError('QUICK_TASK_INVALID_CAPTURE', 'Quick task capture id is invalid', 400);
  }
  if (typeof input.title !== 'string') {
    throw new KernelError('QUICK_TASK_INVALID_TITLE', 'Quick task title is invalid', 400);
  }
  const title = input.title.trim();
  if (title === '' || Array.from(title).length > 500) {
    throw new KernelError('QUICK_TASK_INVALID_TITLE', 'Quick task title is invalid', 400);
  }
  if (input.workspaceHint !== null && (typeof input.workspaceHint !== 'string'
      || input.workspaceHint === '' || input.workspaceHint.length > 512)) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'workspaceHint is invalid', 400);
  }
  return { captureId: input.captureId, title, workspaceHint: input.workspaceHint };
}

export class QuickTaskRepository {
  async create(port: ActorQueryPort, unsafeInput: QuickTaskCreateInput): Promise<QuickTaskCreateReceipt> {
    const input = normalize(unsafeInput);
    const titleHash = createHash('sha256').update(input.title, 'utf8').digest('hex');
    await port.query(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('projed:unplaced:' || projed_core.current_actor_user_id_v1()::text, 0)
      )
    `);
    const existing = await port.query<ReceiptRow>(`
      SELECT owner_id::text, capture_id, title_hash,
             floor(extract(epoch FROM committed_at) * 1000)::bigint::text AS committed_at_ms
        FROM projed_core.quick_task_capture_receipts
       WHERE owner_id = projed_core.current_actor_user_id_v1() AND capture_id = $1
    `, [input.captureId]);
    if (existing.rows[0]) {
      if (existing.rows[0].title_hash !== titleHash) {
        throw new KernelError('QUICK_TASK_IDEMPOTENCY_CONFLICT', 'Capture id already committed with another title', 409);
      }
      return receipt(existing.rows[0], false);
    }

    const occupied = await port.query<{ occupied: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM projed_core.unplaced_tasks
         WHERE owner_id = projed_core.current_actor_user_id_v1() AND legacy_task_id = $1
      ) AS occupied
    `, [input.captureId]);
    if (occupied.rows[0]?.occupied) {
      throw new KernelError('QUICK_TASK_EXISTING_ROW_INVALID', 'Capture id is already occupied', 409);
    }

    const workspace = await port.query<{ workspace_id: string }>(`
      SELECT tenant.legacy_workspace_id AS workspace_id
        FROM projed_core.tenant_members member
        JOIN projed_core.tenants tenant ON tenant.id = member.tenant_id
       WHERE member.user_id = projed_core.current_actor_user_id_v1()
         AND member.status = 'active'
       ORDER BY CASE WHEN $1::text IS NOT NULL
                    AND ($1 = tenant.id::text OR $1 = tenant.legacy_workspace_id)
                 THEN 0 ELSE 1 END,
                member.updated_at DESC, member.tenant_id
       LIMIT 1
    `, [input.workspaceHint]);
    const workspaceId = workspace.rows[0]?.workspace_id;
    if (!workspaceId) {
      throw new KernelError('QUICK_TASK_NO_AVAILABLE_WORKSPACE', 'No active workspace is available', 422);
    }

    const nextOrder = await port.query<{ next_order: string }>(`
      SELECT (COALESCE(max(sort_order), -1) + 1)::bigint::text AS next_order
        FROM projed_core.unplaced_tasks
       WHERE owner_id = projed_core.current_actor_user_id_v1()
    `);
    const order = Number(nextOrder.rows[0]?.next_order);
    if (!Number.isSafeInteger(order) || order < 0 || order > 2_147_483_647) {
      throw new KernelError('QUICK_TASK_ORDER_EXHAUSTED', 'Quick task order is exhausted', 409);
    }
    const now = Date.now();
    const task = {
      id: input.captureId,
      workspaceId,
      boardId: '__task_workbench_unplaced__',
      parentId: null,
      title: input.title,
      status: 'todo',
      nodeType: 'task',
      order,
      createdAt: now,
      updatedAt: now,
      detailNotes: [
        { id: 'note_default', title: '任務目的', content: '' },
        { id: 'note_default_secondary', title: '備註', content: '' },
      ],
    };
    await port.query(`
      INSERT INTO projed_core.unplaced_tasks(
        owner_id, legacy_task_id, workspace_legacy_id, task, sort_order
      ) VALUES (
        projed_core.current_actor_user_id_v1(), $1, $2, $3::jsonb, $4
      )
    `, [input.captureId, workspaceId, JSON.stringify(task), order]);
    const inserted = await port.query<ReceiptRow>(`
      INSERT INTO projed_core.quick_task_capture_receipts(
        owner_id, capture_id, title_hash
      ) VALUES (
        projed_core.current_actor_user_id_v1(), $1, $2
      )
      RETURNING owner_id::text, capture_id, title_hash,
                floor(extract(epoch FROM committed_at) * 1000)::bigint::text AS committed_at_ms
    `, [input.captureId, titleHash]);
    if (!inserted.rows[0]) throw new KernelError('DB_BOUNDARY_INVALID', 'Quick task receipt was not stored', 503);
    return receipt(inserted.rows[0], true);
  }
}
