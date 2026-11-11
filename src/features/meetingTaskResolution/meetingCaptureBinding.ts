export type MeetingAudioOutboxScope = Readonly<{
  accountId: string;
  tenantId: string;
  projectId: string;
  recordId: string;
  captureId: string;
  sourceVersion: number;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SCOPE_TEXT_LENGTH = 256;

const isSafeScopeText = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= MAX_SCOPE_TEXT_LENGTH
  && value === value.trim()
  && !Array.from(value).some(character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  })
);

const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

export const normalizeMeetingAudioOutboxScope = (value: MeetingAudioOutboxScope): MeetingAudioOutboxScope => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Meeting audio outbox scope is invalid.');
  }
  if (!isSafeScopeText(value.accountId)
    || !isUuid(value.tenantId)
    || !isUuid(value.projectId)
    || !isUuid(value.recordId)
    || !isUuid(value.captureId)
    || !Number.isSafeInteger(value.sourceVersion)
    || value.sourceVersion < 1
    || value.sourceVersion > 2_147_483_647) {
    throw new Error('Meeting audio outbox scope is invalid.');
  }
  return Object.freeze({
    accountId: value.accountId,
    tenantId: value.tenantId,
    projectId: value.projectId,
    recordId: value.recordId,
    captureId: value.captureId,
    sourceVersion: value.sourceVersion,
  });
};

export const isMeetingAudioOutboxScope = (value: unknown): value is MeetingAudioOutboxScope => {
  try {
    normalizeMeetingAudioOutboxScope(value as MeetingAudioOutboxScope);
    return true;
  } catch {
    return false;
  }
};

export const meetingAudioOutboxScopesEqual = (left: unknown, right: MeetingAudioOutboxScope): boolean => {
  if (!isMeetingAudioOutboxScope(left)) return false;
  return left.accountId === right.accountId
    && left.tenantId === right.tenantId
    && left.projectId === right.projectId
    && left.recordId === right.recordId
    && left.captureId === right.captureId
    && left.sourceVersion === right.sourceVersion;
};

const encodeKeyPart = (value: string): string => encodeURIComponent(value);

const scopeKey = (scopeInput: MeetingAudioOutboxScope): string => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  return [
    'meeting-audio-v2',
    encodeKeyPart(scope.accountId),
    scope.tenantId,
    scope.projectId,
    scope.recordId,
    scope.captureId,
    `v${scope.sourceVersion}`,
  ].join(':');
};

export const meetingAudioSegmentOutboxKey = (
  scope: MeetingAudioOutboxScope,
  segmentId: string,
): string => {
  if (!isSafeScopeText(segmentId)) throw new Error('Meeting audio segment id is invalid.');
  return `${scopeKey(scope)}:segment:${encodeKeyPart(segmentId)}`;
};

export const meetingPointerBatchOutboxKey = (
  scope: MeetingAudioOutboxScope,
  batchKey: string,
): string => {
  if (!isSafeScopeText(batchKey)) throw new Error('Meeting pointer batch key is invalid.');
  return `${scopeKey(scope)}:pointer:${encodeKeyPart(batchKey)}`;
};
