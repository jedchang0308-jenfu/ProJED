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
  activities: input.activities
    .filter(activity => safeString(activity.nodeId))
    .slice(-200)
    .map(activity => ({
      eventType: truncate(activity.eventType, 80),
      nodeId: safeString(activity.nodeId),
      title: truncate(activity.title || activity.nodeId, 160),
      occurredAt: Number.isFinite(activity.occurredAt) ? activity.occurredAt : Date.now(),
      summary: truncate(activity.summary, 240),
      payload: activity.payload && typeof activity.payload === 'object' ? activity.payload : {},
    })),
});

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

JSON schema:
{
  "content": "markdown string",
  "warnings": ["string"],
  "linkedTaskIds": ["task id"]
}

content 必須保留三個大章節，但任務內容請使用自然語言段落與編號標題：
1. 本次會議總結
- 本次建立「週報功能開發」工作主線，拆成「研發開發」、「QA驗證」與「技術移轉」等工作面。
- 「研發開發」下展開需求確認、問BOSS、寫成規格與開始開發。
- 「QA驗證」下建立制定驗證計畫與執行QC驗證。

2. 任務討論與結論
2.1 @[研發開發](task:list-id)
2.1.1 @[本機測試成員](task:card-id)
新增任務「本機測試成員」。負責人改為「王小明」。

2.1.1.1 @[需求確認](task:child-id)
新增任務「需求確認」。

2.1.1.2 @[撰成規格](task:child-2-id)
新增任務「撰成規格」。

2.1.1.2.1 @[問BOSS](task:grandchild-id)
新增任務「問BOSS」。

3. 待校稿項目
- ...

任務分段規則：
- 使用 tasks[].path 形成完整階層；2.x 是列表層，2.x.y 是卡片層，2.x.y.z 是子任務，後續依深度往下編號。
- 每個章節標題只能是「編號 + task tag」，例如「2.1.1 @[任務](task:id)」，不要加「本任務」或「子任務：」。
- 子任務或孫任務不得升格成獨立「2.x」列表段落，必須放在所屬列表與卡片之下。
- 容器節點若沒有 rawContent 或 activities 直接指向它，只顯示章節標題，不要自行替容器寫總結。
- 同一任務段落內只能整理該任務資訊，不要混入其他任務的結論。
- 每個任務只整理 rawContent 中的會議速記、任務詳情補記，以及 activities 中實際發生的任務變更。
- 沒有會議內容或任務變更的兄弟任務不要硬寫段落。
- 沒有明確決議或下一步時不要硬寫，必要時放到「待校稿項目」提醒人工確認。

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

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return createErrorResponse('GEMINI_API_KEY is not configured', 'CONFIG_ERROR', 500, origin);
  }

  const input = normalizeInput(requestData);
  const generationModel = Deno.env.get('GEMINI_MEETING_SYNTHESIS_MODEL') || 'gemini-3.5-flash';
  const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${generationModel}:generateContent`;

  try {
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

    if (!genRes.ok) {
      const errorText = await genRes.text().catch(() => '');
      const modelUnavailable = [400, 404].includes(genRes.status) || /not found|unavailable|unsupported/i.test(errorText);
      const message = modelUnavailable
        ? `模型不可用，原始草稿已保留，請檢查 GEMINI_MEETING_SYNTHESIS_MODEL：${generationModel}`
        : `Gemini API error: ${genRes.status}`;
      return createErrorResponse(message, modelUnavailable ? 'MODEL_UNAVAILABLE' : 'BAD_GATEWAY', 502, origin);
    }

    const genData = await genRes.json();
    const parsed = parseJsonOutput(extractOutputText(genData));
    const content = safeString(parsed.content);

    if (!content) {
      return createErrorResponse('AI response did not include content', 'EMPTY_SYNTHESIS', 502, origin);
    }

    return createJsonResponse({
      content,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item: unknown) => typeof item === 'string') : [],
      linkedTaskIds: Array.isArray(parsed.linkedTaskIds) ? parsed.linkedTaskIds.filter((item: unknown) => typeof item === 'string') : [],
      provider: 'gemini',
      model: generationModel,
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
