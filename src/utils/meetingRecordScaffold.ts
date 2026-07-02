export const MEETING_RECORD_SUMMARY_HEADING = '1. 本次會議總結';
export const MEETING_RECORD_TASKS_HEADING = '2. 任務討論與結論';
export const MEETING_RECORD_OTHER_HEADING = '3. 臨時動議&其他';

const MEETING_RECORD_LEGACY_HEADINGS = new Set([
  '本次會議總結',
  '任務討論',
  '任務討論與結論',
  '其他',
  '臨時動議&其他',
  '待校稿項目',
  '1. 本次會議總結',
  '2. 任務討論與結論',
  '3. 其他',
  MEETING_RECORD_OTHER_HEADING,
]);

const MEETING_RECORD_PLACEHOLDERS = new Set([
  '待 AI 統整。',
  '請確認上述整理是否符合會議實際發言與操作。',
  '請補上會中實際討論內容或任務變更後再發布。',
]);

export const createMeetingRecordScaffold = () => [
  MEETING_RECORD_SUMMARY_HEADING,
  '',
  MEETING_RECORD_TASKS_HEADING,
  '',
  MEETING_RECORD_OTHER_HEADING,
].join('\n');

const normalizeScaffoldLine = (line: string) =>
  line
    .replace(/\r\n?/g, '\n')
    .replace(/^[-*]\s*/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

export const isMeetingRecordScaffoldLine = (line: string) => {
  const normalized = normalizeScaffoldLine(line);
  if (!normalized) return true;
  if (MEETING_RECORD_LEGACY_HEADINGS.has(normalized)) return true;
  if (MEETING_RECORD_PLACEHOLDERS.has(normalized)) return true;
  return /^\d+(?:\.\d+)*(?:\.)?\s*$/.test(normalized);
};

export const hasMeaningfulMeetingRecordContent = (content: string | undefined) =>
  Boolean(
    (content ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .some(line => !isMeetingRecordScaffoldLine(line)),
  );
