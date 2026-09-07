export const MEETING_TASK_RESERVATIONS_KEY = 'meetingTaskReservations';
export const MEETING_TASK_RESERVATION_SCHEMA_VERSION = 1 as const;
export const MEETING_TASK_RESERVATION_MIN = 1;
export const MEETING_TASK_RESERVATION_MAX = 999;

export type MeetingTaskReservationsV1 = {
  schemaVersion: typeof MEETING_TASK_RESERVATION_SCHEMA_VERSION;
  values: Record<string, number>;
};

export type MeetingTaskReservationInputResult =
  | { status: 'value'; value: number }
  | { status: 'clear' }
  | { status: 'invalid'; message: string };

export type MeetingTaskReservationUpdateResult = {
  status: 'updated' | 'cleared' | 'noop' | 'denied';
  metadata: Record<string, unknown>;
};

const INVALID_INPUT_MESSAGE = '請輸入 1–999 的整數';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isValidReservationValue = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isInteger(value)
  && value >= MEETING_TASK_RESERVATION_MIN
  && value <= MEETING_TASK_RESERVATION_MAX
);

const cloneValues = (values: Record<string, number>): Record<string, number> => (
  Object.fromEntries(
    Object.entries(values)
      .filter(([taskId, value]) => Boolean(taskId) && isValidReservationValue(value))
      .sort(([left], [right]) => left.localeCompare(right)),
  )
);

const readRawReservations = (metadata?: Record<string, unknown>): unknown => (
  metadata?.[MEETING_TASK_RESERVATIONS_KEY]
);

const parseNamespace = (raw: unknown): MeetingTaskReservationsV1 | null => {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw) || raw.schemaVersion !== MEETING_TASK_RESERVATION_SCHEMA_VERSION || !isRecord(raw.values)) {
    return null;
  }
  return {
    schemaVersion: MEETING_TASK_RESERVATION_SCHEMA_VERSION,
    values: cloneValues(raw.values as Record<string, number>),
  };
};

export const parseMeetingTaskReservationInput = (rawInput: string): MeetingTaskReservationInputResult => {
  const input = rawInput.trim();
  if (input === '') return { status: 'clear' };
  if (!/^[0-9]+$/.test(input)) return { status: 'invalid', message: INVALID_INPUT_MESSAGE };
  const value = Number(input);
  if (!isValidReservationValue(value)) return { status: 'invalid', message: INVALID_INPUT_MESSAGE };
  return { status: 'value', value };
};

export const getMeetingTaskReservations = (
  metadata?: Record<string, unknown>,
): MeetingTaskReservationsV1 | null => parseNamespace(readRawReservations(metadata));

export const getMeetingTaskReservationValue = (
  metadata: Record<string, unknown> | undefined,
  taskId: string,
): number | null => {
  if (!taskId) return null;
  const reservations = getMeetingTaskReservations(metadata);
  return reservations?.values[taskId] ?? null;
};

export const getMeetingTaskReservationsForSignature = (
  metadata?: Record<string, unknown>,
): MeetingTaskReservationsV1 | null => {
  const raw = readRawReservations(metadata);
  if (raw === undefined || raw === null) return null;
  return parseNamespace(raw);
};

export const updateMeetingTaskReservationMetadata = (
  metadata: Record<string, unknown> | undefined,
  taskId: string,
  value: number | null,
): MeetingTaskReservationUpdateResult => {
  const currentMetadata = { ...(metadata || {}) };
  if (!taskId || (value !== null && !isValidReservationValue(value))) {
    return { status: 'denied', metadata: currentMetadata };
  }

  const raw = readRawReservations(metadata);
  const current = parseNamespace(raw);
  if (raw !== undefined && raw !== null && current === null) {
    return { status: 'denied', metadata: currentMetadata };
  }

  const currentValues = current?.values || {};
  const existingValue = currentValues[taskId] ?? null;
  if (value === null && existingValue === null) return { status: 'noop', metadata: currentMetadata };
  if (value !== null && existingValue === value) return { status: 'noop', metadata: currentMetadata };

  if (value === null) {
    const nextValues = { ...currentValues };
    delete nextValues[taskId];
    if (Object.keys(nextValues).length === 0) {
      delete currentMetadata[MEETING_TASK_RESERVATIONS_KEY];
    } else {
      currentMetadata[MEETING_TASK_RESERVATIONS_KEY] = {
        schemaVersion: MEETING_TASK_RESERVATION_SCHEMA_VERSION,
        values: cloneValues(nextValues),
      } satisfies MeetingTaskReservationsV1;
    }
    return { status: 'cleared', metadata: currentMetadata };
  }

  currentMetadata[MEETING_TASK_RESERVATIONS_KEY] = {
    schemaVersion: MEETING_TASK_RESERVATION_SCHEMA_VERSION,
    values: cloneValues({ ...currentValues, [taskId]: value }),
  } satisfies MeetingTaskReservationsV1;
  return { status: 'updated', metadata: currentMetadata };
};

