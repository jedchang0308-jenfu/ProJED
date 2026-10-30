import { KernelError } from './errors.js';
import { requirePositiveVersion, requireUuid } from './meetingCaptureInput.js';

const MAX_SOURCE_VERSION = 2_147_483_647;
const MAX_REVISION = Number.MAX_SAFE_INTEGER;
const MAX_OPERATIONS = 100;
const MAX_TASK_LINKS = 500;
const MAX_REFERENCE_LENGTH = 512;
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 4 * 1024 * 1024;
const MAX_REQUEST_KEY_LENGTH = 256;
const MAX_METADATA_JSON_LENGTH = 64 * 1024;
const CONTROL_CHAR = /\p{Cc}/u;
const TASK_LINK_ROLES = new Set(['main', 'related', 'decision', 'blocker', 'follow_up']);
const RECORD_STATUSES = new Set(['draft', 'published', 'archived']);
const REVIEW_FIELDS = new Set(['operation', 'captureId', 'expectedSourceVersion']);
const DECISION_FIELDS = new Set([
  'operation', 'captureId', 'resolutionId', 'expectedSourceVersion', 'expectedResolutionRevision', 'operations',
]);
const PROJECTION_FIELDS = new Set([
  'operation', 'recordId', 'captureId', 'expectedSourceVersion', 'expectedRecordUpdatedAt',
  'expectedReviewRevision', 'requestKey', 'userDraft', 'taskLinks', 'tenantId', 'projectId',
]);

export type MeetingReviewInput = Readonly<{
  operation: 'review';
  captureId: string;
  expectedSourceVersion?: number;
}>;

export type MeetingDecisionOperation = Readonly<
  | { action: 'clear-all' }
  | { action: 'accept' | 'reject' | 'add' | 'replace'; taskId: string }
>;

export type MeetingDecisionInput = Readonly<{
  operation: 'decide-match';
  captureId: string;
  resolutionId: string;
  expectedSourceVersion: number;
  expectedResolutionRevision: number;
  operations: readonly MeetingDecisionOperation[];
}>;

export type MeetingProjectionTaskLink = Readonly<{
  nodeId: string;
  role: 'main' | 'related' | 'decision' | 'blocker' | 'follow_up';
}>;

export type MeetingProjectionInput = Readonly<{
  operation: 'save-projection';
  recordId: string;
  captureId: string;
  expectedSourceVersion: number;
  expectedRecordUpdatedAt: string;
  expectedReviewRevision: number;
  requestKey: string;
  userDraft: Readonly<{
    title: string;
    content: string;
    status: 'draft' | 'published' | 'archived';
    metadata: Record<string, unknown>;
  }>;
  taskLinks: readonly MeetingProjectionTaskLink[];
  tenantId?: string;
  projectId?: string;
}>;

function invalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  if (Object.keys(value).some(key => !allowed.has(key))) invalid(`${label} contains an unknown field`);
}

function requireBody(value: unknown, allowed: ReadonlySet<string>, operation: string): Record<string, unknown> {
  if (!isRecord(value)) invalid('Meeting review request is invalid');
  rejectUnknownFields(value, allowed, 'Meeting review request');
  if (value.operation !== operation) invalid('Meeting review operation is invalid');
  return value;
}

function sourceVersion(value: unknown): number {
  const version = requirePositiveVersion(value);
  if (version > MAX_SOURCE_VERSION) invalid('Meeting source version is invalid');
  return version;
}

function requiredRevision(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_REVISION) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function exactText(value: unknown, label: string, maxLength: number, allowEmpty = false, rejectControls = true): string {
  if (typeof value !== 'string' || value.length > maxLength || (rejectControls && CONTROL_CHAR.test(value))
      || (!allowEmpty && value.trim().length === 0)) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function optionalHint(value: Record<string, unknown>, key: 'tenantId' | 'projectId'): string | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  return requireUuid(value[key], key === 'tenantId' ? 'Tenant identifier' : 'Project identifier');
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) invalid('Meeting metadata must be an object');
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || encoded.length > MAX_METADATA_JSON_LENGTH) invalid('Meeting metadata is too large');
    const cloned: unknown = JSON.parse(encoded);
    if (!isRecord(cloned)) invalid('Meeting metadata must be an object');
    return cloned;
  } catch (error) {
    if (error instanceof KernelError) throw error;
    invalid('Meeting metadata is invalid');
  }
}

function expectedRecordTimestamp(value: unknown): string {
  if (typeof value !== 'string' || CONTROL_CHAR.test(value)) invalid('Expected record timestamp is invalid');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/u.exec(value);
  if (!match) invalid('Expected record timestamp is invalid');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    invalid('Expected record timestamp is invalid');
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthDays[month - 1]!) invalid('Expected record timestamp is invalid');
  return value;
}

function normalizeDecisionOperations(value: unknown): MeetingDecisionOperation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_OPERATIONS) {
    invalid('Meeting decision operations are invalid');
  }
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) invalid(`Meeting decision operation ${index} is invalid`);
    const action = candidate.action;
    if (action === 'clear-all') {
      rejectUnknownFields(candidate, new Set(['action']), `Meeting decision operation ${index}`);
      return { action };
    }
    if (action !== 'accept' && action !== 'reject' && action !== 'add' && action !== 'replace') {
      invalid(`Meeting decision operation ${index} is invalid`);
    }
    rejectUnknownFields(candidate, new Set(['action', 'taskId']), `Meeting decision operation ${index}`);
    return { action, taskId: exactText(candidate.taskId, 'Meeting task reference', MAX_REFERENCE_LENGTH) };
  });
}

function normalizeUserDraft(value: unknown): MeetingProjectionInput['userDraft'] {
  if (!isRecord(value)) invalid('Meeting draft is invalid');
  const title = exactText(value.title, 'Meeting title', MAX_TITLE_LENGTH, true, false);
  const content = exactText(value.content, 'Meeting content', MAX_CONTENT_LENGTH, true, false);
  if (typeof value.status !== 'string' || !RECORD_STATUSES.has(value.status)) invalid('Meeting status is invalid');
  const metadata = normalizeJsonObject(value.metadata);
  // Other historical draft fields are intentionally ignored; only the fields
  // consumed by the projection contract are returned.
  return { title, content, status: value.status as MeetingProjectionInput['userDraft']['status'], metadata };
}

function normalizeTaskLinks(value: unknown): MeetingProjectionTaskLink[] {
  if (!Array.isArray(value) || value.length > MAX_TASK_LINKS) invalid('Meeting task links are invalid');
  const seen = new Set<string>();
  const normalized: MeetingProjectionTaskLink[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!isRecord(candidate)) invalid(`Meeting task link ${index} is invalid`);
    rejectUnknownFields(candidate, new Set(['nodeId', 'itemId', 'role']), `Meeting task link ${index}`);
    const hasNodeId = Object.hasOwn(candidate, 'nodeId');
    const hasItemId = Object.hasOwn(candidate, 'itemId');
    if (!hasNodeId && !hasItemId) invalid(`Meeting task link ${index} has no task reference`);
    if (hasNodeId && hasItemId && candidate.nodeId !== candidate.itemId) {
      invalid(`Meeting task link ${index} has conflicting task references`);
    }
    const nodeId = exactText(hasNodeId ? candidate.nodeId : candidate.itemId,
      'Meeting task reference', MAX_REFERENCE_LENGTH);
    const rawRole = candidate.role ?? 'related';
    if (typeof rawRole !== 'string' || !TASK_LINK_ROLES.has(rawRole)) invalid(`Meeting task link ${index} role is invalid`);
    const role = rawRole as MeetingProjectionTaskLink['role'];
    const key = `${nodeId}\u0000${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ nodeId, role });
  }
  return normalized;
}

export function normalizeMeetingReview(value: unknown): MeetingReviewInput {
  const body = requireBody(value, REVIEW_FIELDS, 'review');
  const captureId = requireUuid(body.captureId, 'Capture identifier');
  if (!Object.hasOwn(body, 'expectedSourceVersion')) return { operation: 'review', captureId };
  return { operation: 'review', captureId, expectedSourceVersion: sourceVersion(body.expectedSourceVersion) };
}

export function normalizeMeetingDecision(value: unknown): MeetingDecisionInput {
  const body = requireBody(value, DECISION_FIELDS, 'decide-match');
  return {
    operation: 'decide-match',
    captureId: requireUuid(body.captureId, 'Capture identifier'),
    resolutionId: requireUuid(body.resolutionId, 'Resolution identifier'),
    expectedSourceVersion: sourceVersion(body.expectedSourceVersion),
    expectedResolutionRevision: requiredRevision(body.expectedResolutionRevision, 'Resolution revision'),
    operations: normalizeDecisionOperations(body.operations),
  };
}

export function normalizeMeetingProjection(value: unknown): MeetingProjectionInput {
  const body = requireBody(value, PROJECTION_FIELDS, 'save-projection');
  const recordId = requireUuid(body.recordId, 'Record identifier');
  const captureId = requireUuid(body.captureId, 'Capture identifier');
  const tenantId = optionalHint(body, 'tenantId');
  const projectId = optionalHint(body, 'projectId');
  const requestKey = exactText(body.requestKey, 'Projection request key', MAX_REQUEST_KEY_LENGTH);
  const output: MeetingProjectionInput = {
    operation: 'save-projection',
    recordId,
    captureId,
    expectedSourceVersion: sourceVersion(body.expectedSourceVersion),
    expectedRecordUpdatedAt: expectedRecordTimestamp(body.expectedRecordUpdatedAt),
    expectedReviewRevision: requiredRevision(body.expectedReviewRevision, 'Review revision'),
    requestKey,
    userDraft: normalizeUserDraft(body.userDraft),
    taskLinks: normalizeTaskLinks(body.taskLinks),
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(projectId === undefined ? {} : { projectId }),
  };
  return output;
}
