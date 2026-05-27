import assert from 'node:assert/strict';
import {
  ICS_LINE_OCTET_LIMIT,
  FEED_TASK_LIMIT,
  addDays,
  buildCalendarFeedIcs,
  escapeIcsText,
  foldLine,
  icsLine,
  toIcsDate,
  utf8Length,
} from '../supabase/functions/calendar-feed/ics.mjs';

const unfold = (value) => value.replace(/\r\n[ \t]/g, '');

const assertFoldedLineWithinLimit = (folded) => {
  const lines = folded.split('\r\n');
  lines.forEach((line, index) => {
    assert.ok(
      utf8Length(line) <= ICS_LINE_OCTET_LIMIT,
      `folded line ${index + 1} exceeds ${ICS_LINE_OCTET_LIMIT} octets: ${utf8Length(line)}`
    );
    if (index > 0) {
      assert.ok(line.startsWith(' '), `continuation line ${index + 1} must start with a single space`);
    }
  });
};

const longChineseTitle = '這是一個很長的中文任務標題，用來驗證 iCalendar 折行是否會依照 UTF-8 byte 數處理，避免 Google 或 Outlook 解析失敗。';
const foldedSummary = icsLine('SUMMARY', longChineseTitle);
assertFoldedLineWithinLimit(foldedSummary);
assert.equal(unfold(foldedSummary), `SUMMARY:${escapeIcsText(longChineseTitle)}`);

const specialText = '逗號, 分號; 反斜線\\ 換行\n第二行';
const escapedSpecialText = escapeIcsText(specialText);
assert.equal(escapedSpecialText, '逗號\\, 分號\\; 反斜線\\\\ 換行\\n第二行');
const foldedDescription = icsLine('DESCRIPTION', `${specialText}${longChineseTitle.repeat(3)}`);
assertFoldedLineWithinLimit(foldedDescription);
assert.equal(unfold(foldedDescription), `DESCRIPTION:${escapeIcsText(`${specialText}${longChineseTitle.repeat(3)}`)}`);

const asciiFolded = foldLine(`X-PROJED-WARNING:${'A'.repeat(200)}`);
assertFoldedLineWithinLimit(asciiFolded);
assert.equal(unfold(asciiFolded), `X-PROJED-WARNING:${'A'.repeat(200)}`);

assert.equal(addDays('2026-06-01', 1), '2026-06-02');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(toIcsDate('2026-06-01'), '20260601');

const feed = buildCalendarFeedIcs({
  subscription: {
    id: 'subscription-1',
    name: '我的測試訂閱',
  },
  items: [
    {
      id: 'task-1',
      tenant_id: 'workspace-a',
      project_id: 'project-a',
      legacy_node_id: 'legacy-task-1',
      title: '含開始日與到期日的長中文任務標題',
      description: '第一行描述\n第二行描述, 含分號; 與反斜線\\',
      status: 'doing',
      start_date: '2026-06-01',
      end_date: '2026-06-03',
      metadata: {
        firebaseWorkspaceId: 'firebase-workspace-a',
        firebaseBoardId: 'firebase-board-a',
      },
    },
    {
      id: 'task-2',
      tenant_id: 'workspace-b',
      project_id: 'project-b',
      legacy_node_id: null,
      title: '只有到期日',
      description: null,
      status: 'todo',
      start_date: null,
      end_date: '2026-07-01',
      metadata: {},
    },
  ],
  dateTypes: ['start_date', 'due_date'],
  tenantNameById: new Map([
    ['workspace-a', 'A 工作區'],
    ['workspace-b', 'B 工作區'],
  ]),
  projectNameById: new Map([
    ['project-a', 'A 看板'],
    ['project-b', 'B 看板'],
  ]),
  assigneeProfile: {
    display_name: '王小明',
    email: 'ming@example.com',
  },
  assigneeUserId: 'user-1',
  appBaseUrl: 'https://app.projed.test/',
  taskLimitReached: true,
  now: new Date('2026-05-26T01:02:03.000Z'),
});
const unfoldedFeed = unfold(feed);

assert.ok(feed.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));
assert.ok(feed.endsWith('\r\nEND:VCALENDAR'));
assert.equal(feed.match(/BEGIN:VEVENT/g)?.length, 3);
assert.ok(unfoldedFeed.includes('X-WR-CALNAME:我的測試訂閱'));
assert.ok(unfoldedFeed.includes(`X-PROJED-WARNING:Feed task limit reached: ${FEED_TASK_LIMIT}`));
assert.ok(unfoldedFeed.includes('UID:task-1-start_date-subscription-1@projed'));
assert.ok(unfoldedFeed.includes('UID:task-1-due_date-subscription-1@projed'));
assert.ok(unfoldedFeed.includes('UID:task-2-due_date-subscription-1@projed'));
assert.ok(unfoldedFeed.includes('DTSTAMP:20260526T010203Z'));
assert.ok(unfoldedFeed.includes('DTSTART;VALUE=DATE:20260601'));
assert.ok(unfoldedFeed.includes('DTEND;VALUE=DATE:20260602'));
assert.ok(unfoldedFeed.includes('DTSTART;VALUE=DATE:20260603'));
assert.ok(unfoldedFeed.includes('DTEND;VALUE=DATE:20260604'));
assert.ok(unfoldedFeed.includes('SUMMARY:[開始] A 工作區 - 含開始日與到期日的長中文任務標題'));
assert.ok(unfoldedFeed.includes('DESCRIPTION:第一行描述\\n第二行描述\\, 含分號\\; 與反斜線\\\\'));
assert.ok(unfoldedFeed.includes('看板: A 看板'));
assert.ok(unfoldedFeed.includes('負責人: 王小明'));
assert.ok(unfoldedFeed.includes('URL:https://app.projed.test/?modal=tasknode&wsId=firebase-workspace-a&boardId=firebase-board-a&itemId=legacy-task-1'));
feed.split('\r\n').forEach((line) => {
  assert.ok(utf8Length(line) <= ICS_LINE_OCTET_LIMIT, `feed line exceeds ${ICS_LINE_OCTET_LIMIT} octets: ${line}`);
});

console.log('Calendar feed ICS verification passed.');
