import { KernelError } from './errors.js';
import {
  filterMeetingSynthesisActivities,
  MEETING_SYNTHESIS_CONTRACT_VERSION,
  validateMeetingSynthesisOutput,
  type MeetingSynthesisActivity,
  type MeetingSynthesisInput,
  type MeetingSynthesisNormalizationStats,
  type MeetingSynthesisQualityReport,
  type MeetingSynthesisResponse,
  type MeetingSynthesisTask,
} from '../src/utils/meetingRecordSynthesis.js';
import { repairMeetingSynthesisStructure } from '../shared/meetingSynthesisStructure.js';

const MEETING_SYNTHESIS_FUNCTION_VERSION = 'projed-http-meeting-synthesis-v1';
const MAX_PROVIDER_TEXT_CHARS = 256 * 1024;
const INPUT_KEYS = new Set([
  'title',
  'participantsText',
  'rawContent',
  'taskLinks',
  'tasks',
  'activities',
  'occurredAt',
  'requiredContractVersion',
]);

export interface ParsedMeetingSynthesisRequest {
  input: MeetingSynthesisInput;
  normalization: MeetingSynthesisNormalizationStats;
}

export interface MeetingSynthesisFailureDetails {
  runId: string;
  functionVersion: string;
  violations: string[];
  affectedTaskIds: string[];
}

export class MeetingSynthesisQualityError extends KernelError {
  constructor(readonly details: MeetingSynthesisFailureDetails, message: string) {
    super('QUALITY_GATE_FAILED', message, 502);
    this.name = 'MeetingSynthesisQualityError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 48) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1));
  if (!isRecord(value)) return false;

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.keys(value).every(key => isJsonValue(value[key], depth + 1));
  } catch {
    return false;
  }
}

function invalidInput(): never {
  throw new KernelError('DOMAIN_DATA_INVALID', 'Meeting synthesis input is invalid', 400);
}

function truncate(value: unknown, maxLength: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function sourceContent(value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  return text.length <= 12_000 ? text : `${text.slice(0, 11_997).trimEnd()}...`;
}

function normalizeTask(value: unknown): MeetingSynthesisTask {
  if (!isRecord(value)) invalidInput();
  if (value.path !== undefined && value.path !== null && !Array.isArray(value.path)) invalidInput();
  if (Array.isArray(value.path) && value.path.length > 80) invalidInput();

  const id = safeString(value.id);
  if (!id) invalidInput();
  const task: MeetingSynthesisTask = {
    id,
    title: truncate(safeString(value.title) || id, 160),
    parentId: value.parentId === null ? null : truncate(value.parentId, 160),
    path: Array.isArray(value.path)
      ? value.path
        .filter(isRecord)
        .filter(pathItem => safeString(pathItem.id).length > 0)
        .slice(0, 80)
        .map(pathItem => {
          const pathId = safeString(pathItem.id);
          return { id: pathId, title: truncate(safeString(pathItem.title) || pathId, 160) };
        })
      : [],
    depth: typeof value.depth === 'number' && Number.isFinite(value.depth)
      ? Math.max(0, Math.min(20, value.depth))
      : 0,
    groupId: truncate(value.groupId, 160),
    groupTitle: truncate(value.groupTitle, 160),
    status: truncate(value.status, 60),
    description: truncate(value.description, 600),
    detailNotesText: truncate(value.detailNotesText, 1000),
    startDate: truncate(value.startDate, 40),
    endDate: truncate(value.endDate, 40),
  };
  if (typeof value.order === 'number' && Number.isFinite(value.order)) task.order = value.order;
  return task;
}

function normalizeActivity(value: unknown): MeetingSynthesisActivity {
  if (!isRecord(value)) invalidInput();
  const occurredAt = typeof value.occurredAt === 'number' && Number.isFinite(value.occurredAt)
    ? value.occurredAt
    : Date.now();
  return {
    eventType: truncate(value.eventType, 80),
    nodeId: safeString(value.nodeId),
    title: truncate(safeString(value.title) || safeString(value.nodeId), 160),
    occurredAt,
    summary: truncate(value.summary, 240),
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

export function parseMeetingSynthesisRequest(body: Record<string, unknown>): ParsedMeetingSynthesisRequest {
  if (!isRecord(body) || !isJsonValue(body) || Object.keys(body).some(key => !INPUT_KEYS.has(key))) invalidInput();
  if (typeof body.title !== 'string' || typeof body.rawContent !== 'string'
    || !Array.isArray(body.taskLinks) || !Array.isArray(body.tasks) || !Array.isArray(body.activities)
    || body.participantsText !== undefined && typeof body.participantsText !== 'string'
    || body.occurredAt !== undefined && (typeof body.occurredAt !== 'number' || !Number.isFinite(body.occurredAt))) {
    invalidInput();
  }
  if (body.requiredContractVersion !== MEETING_SYNTHESIS_CONTRACT_VERSION) {
    throw new KernelError('CONTRACT_VERSION_MISMATCH', 'Meeting synthesis contract version is unsupported', 409);
  }

  const taskLinks = body.taskLinks
    .map(value => {
      if (!isRecord(value)) invalidInput();
      return { nodeId: safeString(value.nodeId), role: safeString(value.role, 'related') };
    })
    .filter(link => link.nodeId.length > 0)
    .slice(0, 80);

  const tasks = body.tasks
    .map(normalizeTask)
    .slice(0, 80);

  const receivedActivityCount = body.activities.length;
  const normalizedActivities = body.activities
    .map(normalizeActivity)
    .filter(activity => activity.nodeId.length > 0);
  const activities = filterMeetingSynthesisActivities(normalizedActivities).slice(-200);

  const input: MeetingSynthesisInput = {
    title: truncate(body.title, 160),
    participantsText: truncate(body.participantsText, 500),
    rawContent: sourceContent(body.rawContent),
    ...(body.occurredAt === undefined ? {} : { occurredAt: body.occurredAt as number }),
    taskLinks,
    tasks,
    activities,
    requiredContractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
  };
  return {
    input,
    normalization: {
      receivedActivityCount,
      acceptedActivityCount: activities.length,
      droppedActivityCount: receivedActivityCount - activities.length,
    },
  };
}

export function buildMeetingSynthesisPrompt(input: MeetingSynthesisInput): string {
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
}

function invalidProviderResponse(): never {
  throw new KernelError('SYNTHESIS_INVALID_RESPONSE', 'Meeting synthesis provider returned an invalid response', 502);
}

function parseProviderJson(providerText: string): Record<string, unknown> {
  if (typeof providerText !== 'string' || providerText.length > MAX_PROVIDER_TEXT_CHARS) invalidProviderResponse();
  const trimmed = providerText.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed) || !isJsonValue(parsed)) invalidProviderResponse();
    return parsed;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
        if (isRecord(parsed) && isJsonValue(parsed)) return parsed;
      } catch {
        // Return the same bounded provider error for malformed JSON without exposing response text.
      }
    }
    invalidProviderResponse();
  }
}

function directEvidenceTaskIds(input: MeetingSynthesisInput): Set<string> {
  const pattern = /@\[([^\]]+)\]\(task:([^)]+)\)/g;
  const ids = new Set<string>();
  for (const line of input.rawContent.replace(/\r\n?/g, '\n').split('\n')) {
    const matches = Array.from(line.matchAll(pattern));
    const lineIds = matches.map(match => match[2]!);
    if (lineIds.length <= 1) {
      lineIds.forEach(id => ids.add(id));
      continue;
    }
    const first = matches[0]!;
    const prefix = line.slice(0, first.index ?? 0)
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, '')
      .replace(/^\d{1,2}:\d{2}\s*/, '')
      .trim();
    const separatorsArePath = matches.slice(0, -1).every((match, index) => {
      const next = matches[index + 1]!;
      return /^[\s／/]+$/.test(line.slice((match.index ?? 0) + match[0].length, next.index ?? line.length));
    });
    ( !prefix && separatorsArePath ? [lineIds[lineIds.length - 1]!] : lineIds).forEach(id => ids.add(id));
  }
  filterMeetingSynthesisActivities(input.activities).forEach(activity => ids.add(activity.nodeId));
  return ids;
}

function isParsedSource(value: unknown): value is ParsedMeetingSynthesisRequest {
  if (!isRecord(value) || !isRecord(value.input) || !isRecord(value.normalization)) return false;
  const stats = value.normalization;
  return value.input.requiredContractVersion === MEETING_SYNTHESIS_CONTRACT_VERSION
    && Array.isArray(value.input.tasks) && Array.isArray(value.input.activities)
    && typeof value.input.rawContent === 'string'
    && Number.isSafeInteger(stats.receivedActivityCount) && Number.isSafeInteger(stats.acceptedActivityCount)
    && Number.isSafeInteger(stats.droppedActivityCount);
}

export function completeMeetingSynthesis(
  source: ParsedMeetingSynthesisRequest,
  providerText: string,
  metadata: { runId: string; model: string },
): MeetingSynthesisResponse {
  if (!isParsedSource(source) || !isRecord(metadata)
    || typeof metadata.runId !== 'string' || !metadata.runId.trim() || metadata.runId.length > 128
    || typeof metadata.model !== 'string' || !metadata.model.trim() || metadata.model.length > 128) {
    invalidInput();
  }
  const parsed = parseProviderJson(providerText);
  const generatedContent = typeof parsed.content === 'string' ? parsed.content.trim() : '';
  if (!generatedContent) throw new KernelError('EMPTY_SYNTHESIS', 'Meeting synthesis provider returned empty content', 502);

  const structure = repairMeetingSynthesisStructure(
    generatedContent,
    source.input.tasks,
    directEvidenceTaskIds(source.input),
  );
  const content = structure.content;
  const linkedTaskIds = structure.linkedTaskIds;
  const validated = validateMeetingSynthesisOutput(source.input, { content, linkedTaskIds });
  const quality: MeetingSynthesisQualityReport = {
    ...validated,
    violations: [...new Set([...structure.violations, ...validated.violations])],
  };
  quality.passed = quality.violations.length === 0;

  if (!quality.passed) {
    const taskIdentityViolations = new Set(['UNKNOWN_TASK_ID', 'AMBIGUOUS_TASK_HEADING', 'INVALID_SOURCE_TASK_PATH']);
    const message = quality.violations.some(violation => taskIdentityViolations.has(violation))
      ? '部分段落無法確認對應任務，原草稿已保留。'
      : 'AI 整理結果未通過內容品質檢查，原草稿已保留。';
    throw new MeetingSynthesisQualityError({
      runId: metadata.runId,
      functionVersion: MEETING_SYNTHESIS_FUNCTION_VERSION,
      violations: quality.violations,
      affectedTaskIds: structure.affectedTaskIds,
    }, message);
  }

  return {
    content,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
    linkedTaskIds,
    provider: 'google',
    model: metadata.model,
    contractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
    functionVersion: MEETING_SYNTHESIS_FUNCTION_VERSION,
    runId: metadata.runId,
    generatedAt: new Date().toISOString(),
    normalization: source.normalization,
    quality,
  };
}
