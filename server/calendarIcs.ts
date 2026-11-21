import type { CalendarDateType, CalendarFeedTask } from './calendarModel.js';

export const CALENDAR_FEED_TASK_LIMIT = 1000;
const LINE_OCTET_LIMIT = 75;

const utf8Length = (value: string) => Buffer.byteLength(value, 'utf8');

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function foldLine(line: string): string {
  if (utf8Length(line) <= LINE_OCTET_LIMIT) return line;
  const chunks: string[] = [];
  let current = '';
  let octets = 0;
  for (const character of Array.from(line)) {
    const next = utf8Length(character);
    const limit = chunks.length === 0 ? LINE_OCTET_LIMIT : LINE_OCTET_LIMIT - 1;
    if (current && octets + next > limit) {
      chunks.push(current);
      current = character;
      octets = next;
    } else {
      current += character;
      octets += next;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => index === 0 ? chunk : ` ${chunk}`).join('\r\n');
}

const escapeText = (value: string) => value
  .replaceAll('\\', '\\\\')
  .replaceAll(';', '\\;')
  .replaceAll(',', '\\,')
  .replace(/\r?\n/g, '\\n');

const textLine = (name: string, value: string) => foldLine(`${name}:${escapeText(value)}`);
const rawLine = (name: string, value: string) => foldLine(`${name}:${value}`);
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function taskUrl(task: CalendarFeedTask, appBaseUrl: string, workspaceRef: string, boardRef: string): string {
  const base = appBaseUrl.replace(/\/+$/, '');
  if (!base) return '';
  const query = new URLSearchParams({
    modal: 'tasknode', wsId: workspaceRef, boardId: boardRef, itemId: task.legacyTaskId,
  });
  return `${base}/?${query.toString()}`;
}

export interface CalendarIcsInput {
  subscriptionId: string;
  name: string;
  tasks: CalendarFeedTask[];
  dateTypesByProjectId: ReadonlyMap<string, readonly CalendarDateType[]>;
  tenantNameById: ReadonlyMap<string, string>;
  projectNameById: ReadonlyMap<string, string>;
  workspaceRefById: ReadonlyMap<string, string>;
  boardRefById: ReadonlyMap<string, string>;
  memberLabelById: ReadonlyMap<string, string>;
  appBaseUrl?: string;
  taskLimitReached?: boolean;
  now?: Date;
}

export function buildCalendarIcs(input: CalendarIcsInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProJED//Custom Calendar Subscription//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    textLine('X-WR-CALNAME', input.name),
    'X-WR-TIMEZONE:Asia/Taipei',
  ];
  if (input.taskLimitReached) {
    lines.push(textLine('X-PROJED-WARNING', `Feed task limit reached: ${CALENDAR_FEED_TASK_LIMIT}`));
  }
  const nowStamp = stamp(input.now ?? new Date());
  for (const task of input.tasks) {
    const dateTypes = new Set(input.dateTypesByProjectId.get(task.projectId) ?? []);
    const workspaceName = input.tenantNameById.get(task.tenantId) ?? 'ProJED';
    const projectName = input.projectNameById.get(task.projectId) ?? '';
    const assigneeId = task.assigneeIds[0];
    const assignee = assigneeId ? input.memberLabelById.get(`${task.tenantId}:${assigneeId}`) ?? assigneeId.slice(0, 8) : '未指派';
    const url = taskUrl(
      task,
      input.appBaseUrl ?? '',
      input.workspaceRefById.get(task.tenantId) ?? task.tenantId,
      input.boardRefById.get(task.projectId) ?? task.projectId,
    );
    const description = [task.description ?? '', '', `看板: ${projectName}`, `負責人: ${assignee}`, `狀態: ${task.status}`]
      .filter((line, index) => index !== 0 || line.trim() !== '');
    if (url) description.push(`ProJED: ${url}`);
    const events: Array<{ type: CalendarDateType; date: string; label: string }> = [];
    if (dateTypes.has('start_date') && task.startDate) events.push({ type: 'start_date', date: task.startDate, label: '開始' });
    if (dateTypes.has('due_date') && task.endDate) events.push({ type: 'due_date', date: task.endDate, label: '到期' });
    for (const event of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(rawLine('UID', `${task.id}-${event.type}-${input.subscriptionId}@projed`));
      lines.push(rawLine('X-PROJED-TASK-ID', task.id));
      lines.push(rawLine('X-PROJED-BOARD-ID', task.projectId));
      lines.push(rawLine('X-PROJED-DATE-TYPE', event.type));
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(event.date, 1).replaceAll('-', '')}`);
      lines.push(textLine('SUMMARY', `[${event.label}] ${workspaceName} - ${task.title}`));
      lines.push(textLine('DESCRIPTION', description.join('\n')));
      if (url) lines.push(textLine('URL', url));
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
