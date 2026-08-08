import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174',
  'http://localhost:4173',
  'http://localhost:4174',
  'http://127.0.0.1:5173',
  'https://projed-test.web.app',
  'https://projed-test.firebaseapp.com',
  'https://projed-cc78d.web.app',
  'https://projed-cc78d.firebaseapp.com'
];

const MEETING_SYNTHESIS_CONTRACT_VERSION = 'meeting-synthesis-v2';
const MEETING_SYNTHESIS_FUNCTION_VERSION = 'synthesize_meeting_record-2026-08-07-v3';
const QUALITY_CHECKS = [
  'non-empty-content',
  'numbered-section-structure',
  'no-markdown-heading',
  'task-heading-grounding',
  'complete-task-path',
  'non-empty-task-body',
  'no-low-value-system-text',
  'no-duplicate-narrative',
  'linked-task-integrity',
];

type MeetingSynthesisTask = {
  id: string;
  title: string;
  parentId?: string | null;
  path?: Array<{ id: string; title: string }>;
  depth?: number;
  groupId?: string;
  groupTitle?: string;
  order?: number;
  status?: string;
  description?: string;
  detailNotesText?: string;
  startDate?: string;
  endDate?: string;
};

type MeetingSynthesisActivity = {
  eventType: string;
  nodeId: string;
  title: string;
  occurredAt: number;
  summary: string;
  payload?: Record<string, unknown>;
};

type MeetingSynthesisInput = {
  title: string;
  participantsText?: string;
  rawContent: string;
  taskLinks: Array<{ nodeId: string; role: string }>;
  tasks: MeetingSynthesisTask[];
  activities: MeetingSynthesisActivity[];
  occurredAt?: number;
  requiredContractVersion?: string;
};

type MeetingSynthesisQualityReport = {
  passed: boolean;
  checks: string[];
  violations: string[];
};

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

const createJsonResponse = (payload: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });

const createErrorResponse = (message: string, code: string, status: number, origin: string | null) =>
  createJsonResponse({ error: { message, code } }, status, origin);

const truncate = (value: string | undefined, maxLength: number) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const safeString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const LOW_VALUE_ACTIVITY_PATTERNS = [
  /^(任務)?位置已調整[。.]?$/,
  /^(任務)?順序已調整[。.]?$/,
  /^(任務)?已移動[。.]?$/,
  /^(任務)?已重新排列[。.]?$/,
  /^區塊已更新[。.]?$/,
];

const stripTaskTags = (value: string) =>
  value.replace(/@\[([^\]]+)\]\(task:[^)]+\)/g, '');

const collectTaskTagIds = (value: string) => {
  const ids: string[] = [];
  const pattern = /@\[([^\]]+)\]\(task:([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids;
};

const collectDirectTaskTagIds = (content: string) =>
  Array.from(new Set(
    content
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .flatMap(line => {
        const pattern = /@\[([^\]]+)\]\(task:([^)]+)\)/g;
        const matches = Array.from(line.matchAll(pattern));
        const ids = matches.map(match => match[2]);
        if (ids.length <= 1) return ids;

        const firstMatch = matches[0];
        const prefix = line.slice(0, firstMatch.index ?? 0)
          .replace(/^[-*]\s*/, '')
          .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, '')
          .replace(/^\d{1,2}:\d{2}\s*/, '')
          .trim();
        const separatorsArePath = matches.slice(0, -1).every((match, index) => {
          const nextMatch = matches[index + 1];
          const between = line.slice((match.index ?? 0) + match[0].length, nextMatch.index ?? line.length);
          return /^[\s／/]+$/.test(between);
        });
        return !prefix && separatorsArePath ? [ids[ids.length - 1]] : ids;
      }),
  ));

const isLowValueActivitySummary = (value: unknown) => {
  const normalized = stripTaskTags(safeString(value))
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, '')
    .replace(/^\d{1,2}:\d{2}\s*/, '')
    .replace(/^[：:，,、\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  return LOW_VALUE_ACTIVITY_PATTERNS.some(pattern => pattern.test(normalized));
};

const getActivitySide = (activity: MeetingSynthesisActivity, side: 'before' | 'after') => {
  const value = activity.payload?.[side];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const getActivityComparableKeys = (eventType: string, before: Record<string, unknown>, after: Record<string, unknown>) => {
  const preferredKeys: Record<string, string[]> = {
    task_status_changed: ['status'],
    task_dates_changed: ['startDate', 'endDate'],
    task_assigned: ['assigneeIds', 'assigneeId'],
    task_collaborators_changed: ['collaboratorIds'],
    task_tags_changed: ['tagIds'],
    task_archived: ['isArchived'],
    task_restored: ['isArchived'],
  };
  const keys = preferredKeys[eventType] ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.filter(key => key in before || key in after);
};

const hasComparablePayload = (activity: MeetingSynthesisActivity) => {
  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');
  return getActivityComparableKeys(activity.eventType, before, after).length > 0;
};

const hasMeaningfulPayloadChange = (activity: MeetingSynthesisActivity) => {
  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');
  const keys = getActivityComparableKeys(activity.eventType, before, after);
  return keys.length > 0 && keys.some(key => stableSerialize(before[key]) !== stableSerialize(after[key]));
};

const getActivityFingerprint = (activity: MeetingSynthesisActivity) => {
  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');
  const keys = getActivityComparableKeys(activity.eventType, before, after);
  if (keys.length > 0) {
    return [
      activity.eventType,
      activity.nodeId,
      ...keys.map(key => `${key}:${stableSerialize(before[key])}:${stableSerialize(after[key])}`),
    ].join('|');
  }
  return `${activity.eventType}|${activity.nodeId}|${safeString(activity.summary).replace(/\s+/g, ' ').trim()}`;
};

const isLowValueActivity = (activity: MeetingSynthesisActivity) =>
  activity.eventType === 'task_moved' ||
  isLowValueActivitySummary(activity.summary) ||
  hasComparablePayload(activity) && !hasMeaningfulPayloadChange(activity);

const isValidInput = (input: unknown): input is MeetingSynthesisInput => {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  return (
    typeof value.title === 'string' &&
    typeof value.rawContent === 'string' &&
    Array.isArray(value.taskLinks) &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.activities)
  );
};

const normalizeInput = (input: MeetingSynthesisInput): MeetingSynthesisInput => ({
  title: truncate(input.title, 160),
  participantsText: truncate(input.participantsText, 500),
  rawContent: truncate(input.rawContent, 12000),
  occurredAt: input.occurredAt,
  taskLinks: input.taskLinks
    .filter(link => safeString(link.nodeId))
    .slice(0, 80)
    .map(link => ({ nodeId: safeString(link.nodeId), role: safeString(link.role, 'related') })),
  tasks: input.tasks
    .filter(task => safeString(task.id))
    .slice(0, 80)
    .map(task => ({
      id: safeString(task.id),
      title: truncate(task.title || task.id, 160),
      parentId: task.parentId === null ? null : truncate(task.parentId, 160),
      path: Array.isArray(task.path)
        ? task.path
          .filter(pathItem => safeString(pathItem?.id))
          .slice(0, 8)
          .map(pathItem => ({
            id: safeString(pathItem.id),
            title: truncate(pathItem.title || pathItem.id, 160),
          }))
        : [],
      depth: Number.isFinite(task.depth) ? Math.max(0, Math.min(20, Number(task.depth))) : 0,
      groupId: truncate(task.groupId, 160),
      groupTitle: truncate(task.groupTitle, 160),
      order: Number.isFinite(task.order) ? Number(task.order) : undefined,
      status: truncate(task.status, 60),
      description: truncate(task.description, 600),
      detailNotesText: truncate(task.detailNotesText, 1000),
      startDate: truncate(task.startDate, 40),
      endDate: truncate(task.endDate, 40),
    })),
  activities: (() => {
    const seen = new Set<string>();
    return input.activities
      .filter(activity => safeString(activity.nodeId))
      .map(activity => ({
        eventType: truncate(activity.eventType, 80),
        nodeId: safeString(activity.nodeId),
        title: truncate(activity.title || activity.nodeId, 160),
        occurredAt: Number.isFinite(activity.occurredAt) ? activity.occurredAt : Date.now(),
        summary: truncate(activity.summary, 240),
        payload: activity.payload && typeof activity.payload === 'object' ? activity.payload : {},
      }))
      .filter(activity => !isLowValueActivity(activity))
      .filter(activity => {
        const fingerprint = getActivityFingerprint(activity);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      })
      .slice(-200);
  })(),
  requiredContractVersion: safeString(input.requiredContractVersion),
});

const validateGeneratedOutput = (
  input: MeetingSynthesisInput,
  contentValue: string,
  linkedTaskIds: string[],
): MeetingSynthesisQualityReport => {
  const violations: string[] = [];
  const addViolation = (code: string) => {
    if (!violations.includes(code)) violations.push(code);
  };
  const content = contentValue.replace(/\r\n?/g, '\n').trim();
  const forbiddenPhrases = [
    '會中變更',
    '新任務：新增任務',
    '新增任務：新增任務',
    '目前任務狀態為',
    '任務背景是',
    '既有備註指出',
    '本次會議沒有留下完整討論內容',
    '請校稿者補上任務內容',
    '請校稿者確認這段紀要',
    '本任務',
    '子任務：',
    '所屬：',
  ];

  if (!content) addViolation('EMPTY_CONTENT');
  if (content && !content.startsWith('1. 本次會議總結')) addViolation('MISSING_SUMMARY_SECTION');
  if (/^#{1,6}\s+/m.test(content)) addViolation('MARKDOWN_HEADING_NOT_ALLOWED');
  if (forbiddenPhrases.some(phrase => content.includes(phrase))) addViolation('FORBIDDEN_SYSTEM_OR_FILLER_TEXT');
  if (['- 結論：', '- 決議：', '- 待辦：', '- 阻塞：', '- 狀態變更摘要：'].some(label => content.includes(label))) {
    addViolation('FIXED_FIELD_TEMPLATE_NOT_ALLOWED');
  }

  const directEvidenceTaskIds = new Set([
    ...collectDirectTaskTagIds(input.rawContent),
    ...input.activities.map(activity => activity.nodeId),
  ]);
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const taskHeadings = Array.from(content.matchAll(/^2\.\d+(?:\.\d+)*\s+(.+)$/gm));
  const seenTaskIds = new Set<string>();
  if (content.includes('2. 任務討論與結論') && taskHeadings.length === 0) addViolation('EMPTY_TASK_SECTION');
  if (!content.includes('2. 任務討論與結論') && taskHeadings.length > 0) addViolation('ORPHAN_TASK_HEADING');

  taskHeadings.forEach((match, index) => {
    const headingTaskIds = collectTaskTagIds(match[1] ?? '');
    const evidenceTaskId = headingTaskIds[headingTaskIds.length - 1];
    if (!evidenceTaskId) {
      addViolation('TASK_HEADING_WITHOUT_TASK_TAG');
      return;
    }
    if (!directEvidenceTaskIds.has(evidenceTaskId)) addViolation('STRUCTURAL_ONLY_TASK_HEADING');
    if (seenTaskIds.has(evidenceTaskId)) addViolation('DUPLICATE_TASK_HEADING');
    seenTaskIds.add(evidenceTaskId);

    const task = taskById.get(evidenceTaskId);
    if (task) {
      const path = Array.isArray(task.path) && task.path.length > 0
        ? [...task.path]
        : [{ id: task.id, title: task.title }];
      if (!path.some(pathItem => pathItem.id === task.id)) path.push({ id: task.id, title: task.title });
      let previousIndex = -1;
      const hasOrderedCompletePath = path.every(pathItem => {
        const pathIndex = headingTaskIds.indexOf(pathItem.id);
        if (pathIndex <= previousIndex) return false;
        previousIndex = pathIndex;
        return true;
      });
      if (!hasOrderedCompletePath) addViolation('INCOMPLETE_TASK_PATH');
    }

    const bodyStart = (match.index ?? 0) + match[0].length;
    const nextTaskHeadingIndex = taskHeadings[index + 1]?.index ?? content.length;
    const thirdSectionIndex = content.indexOf('\n3. 其他', bodyStart);
    const bodyEnd = thirdSectionIndex >= 0 && thirdSectionIndex < nextTaskHeadingIndex
      ? thirdSectionIndex
      : nextTaskHeadingIndex;
    const bodyLines = content.slice(bodyStart, bodyEnd).split('\n').map(line => line.trim())
      .filter(line => {
        if (!line || line === '下一步：') return false;
        const withoutTaskTags = stripTaskTags(line).replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim();
        return !/^[／/>\s]*$/.test(withoutTaskTags);
      });
    if (bodyLines.length === 0) addViolation('EMPTY_TASK_BODY');
  });

  const otherSectionIndex = content.indexOf('\n3. 其他');
  if (otherSectionIndex >= 0) {
    const otherBodyLines = content.slice(otherSectionIndex + '\n3. 其他'.length)
      .split('\n').map(line => line.trim()).filter(Boolean);
    if (otherBodyLines.length === 0) addViolation('EMPTY_OTHER_SECTION');
  }

  const narrativeFingerprints = new Set<string>();
  let insideNextSteps = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (/^\d+(?:\.\d+)*\.?(?:\s+|$)/.test(trimmed)) insideNextSteps = false;
    if (trimmed === '下一步：') {
      insideNextSteps = true;
      continue;
    }
    if (!trimmed || insideNextSteps && /^[-*]\s+/.test(trimmed) || /^\d+(?:\.\d+)*\.?(?:\s+|$)/.test(trimmed)) continue;
    const fingerprint = stripTaskTags(trimmed).replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim();
    if (fingerprint.length < 16) continue;
    if (narrativeFingerprints.has(fingerprint)) addViolation('DUPLICATE_NARRATIVE');
    narrativeFingerprints.add(fingerprint);
  }

  for (const line of content.split('\n')) {
    const normalizedLine = stripTaskTags(line)
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (LOW_VALUE_ACTIVITY_PATTERNS.some(pattern => pattern.test(normalizedLine))) {
      addViolation('LOW_VALUE_ACTIVITY_IN_CONTENT');
    }
  }

  const linkedTaskIdSet = new Set(linkedTaskIds.filter(Boolean));
  if (collectTaskTagIds(content).some(taskId => !linkedTaskIdSet.has(taskId))) {
    addViolation('LINKED_TASK_IDS_INCOMPLETE');
  }

  return {
    passed: violations.length === 0,
    checks: [...QUALITY_CHECKS],
    violations,
  };
};

const buildPrompt = (input: MeetingSynthesisInput) => {
  const sourcePackage = JSON.stringify(input, null, 2);
  return `你是 ProJED 的會議紀錄整理助手。你的任務是把人類在會議中留下的內容整理成任務導向的會議紀錄草稿。

硬性規則：
1. 只能產生會議紀錄草稿，不得要求建立、修改、移動、刪除任務。
2. 不要把原始 activity 流水帳逐筆列入正文，也不要用時間序列當主體。
3. 多次任務狀態或排程變更必須合併成一句自然語言狀態脈絡。
4. 正文必須保留 task tag token，格式為 @[任務標題](task:id)。
5. 只整理會議中實際發生或人類實際寫下的內容，不要補寫人類沒講過、沒做過的事。
6. 僅回傳 JSON，不要加 markdown code fence。
7. 產出風格要像人類會後整理的任務紀要：自然語言、中等精煉、可讀、有上下文。
8. 不要使用固定五欄填空模板，例如「結論：」「決議：」「待辦：」「阻塞：」「狀態變更摘要：」逐欄列出。
9. 不要把 task.status、task.description、task.detailNotesText、startDate、endDate 這類專案既有狀態當作會議紀錄內容；它們最多只能協助辨識任務。
10. 不要在開頭寫 AI 做了什麼，例如「AI 已整理」「本草稿依任務整理」。
11. 「下一步」只能整理 rawContent 中人類明確講到的未來行動、負責人、期限或待辦；不能由 AI 自行推論。已完成的補測結果、確認結果、狀態結果不是下一步。
12. linkedTaskIds 必須包含 markdown content 中實際出現的每個 task tag id，包含列表、卡片、子任務與孫任務。
13. 不要使用 Markdown heading，不得有任何行以 #、##、### 或 #### 開頭；標題階層一律使用 1. / 2.1 / 2.1.1 這種人類會議紀要編號。
14. 不要寫「會中變更」「新任務：新增任務」「新增任務：新增任務」這類系統語；activity 要轉成自然語言，例如「新增任務『任務封存』」、「負責人改為『王小明』」。
15. 負責人變更必須說明變為誰；如果 source package 已給出可讀名稱，要直接使用該名稱。
16. 不要產生「本任務」或「子任務：」這類分類詞；章節標題只放編號與 task tag。
17. 「1. 本次會議總結」是主線摘要，不是 activity log；不能逐筆列出大量「新增任務『...』」。
18. 當多個新增任務屬於同一 tasks[].path 主線時，要彙整成工作主線、工作面與下層拆解。
19. 總結可以整理任務樹脈絡，但不能補出人類沒有講過的決策、下一步或風險。

20. 任務完整路徑必須整合在同一個標題行，以「／」分隔 task tags；例如「2.1.1 @[列表](task:list-id)／@[卡片](task:card-id)」，不得另立「所屬：」行。
21. 只有 rawContent 或 activities 直接指向的任務才建立正文段落；只有階層用途的父節點不可獨立輸出標題，但仍可放在子任務的單行路徑中。
22. 同一任務的日期、狀態、主責或其他變更應合併為一段自然語言；前後值相同、無實質變化或只有低價值位置操作時，不得輸出。
23. 不要把位置、排序、拖曳、重新排列、區塊更新這類低價值操作寫入會議紀錄正文；例如「位置已調整」「任務位置已調整」不得出現在 content。

JSON schema:
{
  "content": "markdown string",
  "warnings": ["string"],
  "linkedTaskIds": ["task id"]
}

content 必須保留會議總結；有任務證據時輸出任務討論章節，有實質其他內容時才輸出第三章，任務內容請使用自然語言段落與編號標題：
1. 本次會議總結
- 本次建立「週報功能開發」工作主線，拆成「研發開發」、「QA驗證」與「技術移轉」等工作面。
- 「研發開發」下展開需求確認、問BOSS、寫成規格與開始開發。
- 「QA驗證」下建立制定驗證計畫與執行QC驗證。

2. 任務討論與結論
2.1 @[研發開發](task:list-id)／@[本機測試成員](task:card-id)
新增任務「本機測試成員」。負責人改為「王小明」。

2.2 @[研發開發](task:list-id)／@[本機測試成員](task:card-id)／@[需求確認](task:child-id)
新增任務「需求確認」。

2.3 @[研發開發](task:list-id)／@[本機測試成員](task:card-id)／@[撰成規格](task:child-2-id)
新增任務「撰成規格」。

2.4 @[研發開發](task:list-id)／@[本機測試成員](task:card-id)／@[撰成規格](task:child-2-id)／@[問BOSS](task:grandchild-id)
新增任務「問BOSS」。

3. 其他
- 會議中另確認……

任務分段規則：
- 使用 tasks[].path 形成完整路徑；可依有實質證據的任務順序使用 2.1、2.2、2.3 連續編號，階層關係由同一行的完整路徑表達，不要為了補齊 WBS 空父節點而新增空標題。
- 每個章節標題只能是「編號 + 單行完整任務路徑」，例如「2.1.1 @[列表](task:list-id)／@[卡片](task:card-id)／@[任務](task:id)」，不要加「本任務」、「子任務：」或獨立的「所屬：」。
- 子任務或孫任務可以作為獨立的證據段落，但標題必須帶有完整路徑，且只描述目前任務的會議內容。
- 容器節點若沒有 rawContent 或 activities 直接指向它，不得獨立顯示章節標題，也不要自行替容器寫總結。
- 同一任務段落內只能整理該任務資訊，不要混入其他任務的結論。
- 每個任務只整理 rawContent 中的會議速記、任務詳情補記，以及 activities 中實際發生的任務變更。
- 沒有會議內容或任務變更的兄弟任務不要硬寫段落。
- 沒有明確決議或下一步時不要硬寫；沒有實質內容時不要輸出空的第三章或固定校稿提示。

補充：若 tasks[].path 有多層，請把 path 中每一層都依序放在同一個 heading，以「／」分隔；heading 後方的敘述仍只描述目前任務本身的會議內容或 activity 結論。

Source package:
${sourcePackage}`;
};

const extractOutputText = (data: any) => {
  if (typeof data?.candidates?.[0]?.content?.parts?.[0]?.text === 'string') {
    return data.candidates[0].content.parts[0].text;
  }
  return '';
};

const parseJsonOutput = (text: string) => {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('AI response is not valid JSON');
  }
};

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405, origin);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return createErrorResponse('Missing Authorization header', 'UNAUTHORIZED', 401, origin);
  }

  const requestData = await req.json().catch(() => null);
  if (!isValidInput(requestData)) {
    return createErrorResponse('Invalid meeting synthesis input', 'BAD_REQUEST', 400, origin);
  }
  if (requestData.requiredContractVersion !== MEETING_SYNTHESIS_CONTRACT_VERSION) {
    return createErrorResponse(
      `Unsupported meeting synthesis contract: ${safeString(requestData.requiredContractVersion, 'missing')}`,
      'CONTRACT_VERSION_MISMATCH',
      409,
      origin,
    );
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return createErrorResponse('GEMINI_API_KEY is not configured', 'CONFIG_ERROR', 500, origin);
  }

  const receivedActivityCount = requestData.activities.length;
  const input = normalizeInput(requestData);
  const normalization = {
    receivedActivityCount,
    acceptedActivityCount: input.activities.length,
    droppedActivityCount: receivedActivityCount - input.activities.length,
  };
  const runId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const configuredModel = Deno.env.get('GEMINI_MEETING_SYNTHESIS_MODEL');
  const primaryModel = configuredModel || 'gemini-3.5-flash';
  const fallbackModels = configuredModel ? [] : ['gemini-3.1-flash-lite'];
  const modelCandidates = [primaryModel, ...fallbackModels];

  try {
    let genData: unknown = null;
    let generationModel = primaryModel;
    const modelWarnings: string[] = [];

    for (let index = 0; index < modelCandidates.length; index += 1) {
      const candidateModel = modelCandidates[index];
      const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent`;
      const genRes = await fetch(generateEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
          contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
        }),
      });

      if (genRes.ok) {
        genData = await genRes.json();
        generationModel = candidateModel;
        break;
      }

      const errorText = await genRes.text().catch(() => '');
      const modelUnavailable = [400, 404].includes(genRes.status) || /not found|unavailable|unsupported/i.test(errorText);
      const nextModel = modelCandidates[index + 1];
      if (modelUnavailable && nextModel) {
        modelWarnings.push(`模型 ${candidateModel} 不可用，已改用 ${nextModel}。`);
        continue;
      }

      const message = modelUnavailable
        ? `模型不可用，原始草稿已保留，請檢查 GEMINI_MEETING_SYNTHESIS_MODEL：${candidateModel}`
        : `Gemini API error: ${genRes.status}`;
      return createErrorResponse(message, modelUnavailable ? 'MODEL_UNAVAILABLE' : 'BAD_GATEWAY', 502, origin);
    }

    if (!genData) {
      return createErrorResponse('AI response did not include content', 'EMPTY_SYNTHESIS', 502, origin);
    }

    const parsed = parseJsonOutput(extractOutputText(genData));
    const content = safeString(parsed.content);

    if (!content) {
      return createErrorResponse('AI response did not include content', 'EMPTY_SYNTHESIS', 502, origin);
    }

    const linkedTaskIds = Array.isArray(parsed.linkedTaskIds)
      ? parsed.linkedTaskIds.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0)
      : [];
    const quality = validateGeneratedOutput(input, content, linkedTaskIds);
    if (!quality.passed) {
      console.warn(JSON.stringify({
        event: 'meeting_synthesis_quality_gate_failed',
        runId,
        contractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
        functionVersion: MEETING_SYNTHESIS_FUNCTION_VERSION,
        model: generationModel,
        violations: quality.violations,
        normalization,
      }));
      return createErrorResponse(
        'AI synthesis output did not pass the meeting record quality gate',
        'QUALITY_GATE_FAILED',
        502,
        origin,
      );
    }

    console.log(JSON.stringify({
      event: 'meeting_synthesis_completed',
      runId,
      contractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
      functionVersion: MEETING_SYNTHESIS_FUNCTION_VERSION,
      provider: 'gemini',
      model: generationModel,
      qualityPassed: true,
      normalization,
    }));

    return createJsonResponse({
      content,
      warnings: [
        ...modelWarnings,
        ...(Array.isArray(parsed.warnings) ? parsed.warnings.filter((item: unknown) => typeof item === 'string') : []),
      ],
      linkedTaskIds,
      provider: 'gemini',
      model: generationModel,
      contractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
      functionVersion: MEETING_SYNTHESIS_FUNCTION_VERSION,
      runId,
      generatedAt,
      normalization,
      quality,
    }, 200, origin);
  } catch (error) {
    console.error('Meeting synthesis failed:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Meeting synthesis failed',
      'SYNTHESIS_ERROR',
      502,
      origin,
    );
  }
});
