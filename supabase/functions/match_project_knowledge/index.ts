import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'https://projed-test.web.app',
  'https://projed-test.firebaseapp.com',
  'https://projed-cc78d.web.app',
  'https://projed-cc78d.firebaseapp.com'
];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

const createErrorResponse = (message: string, code: string, status: number, origin: string | null) => {
  return new Response(
    JSON.stringify({ error: { message, code } }),
    {
      status,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    }
  );
};

const hashString = async (message: string) => {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

type LiveWbsItem = {
  id: string;
  parent_id: string | null;
  code: string | null;
  title: string;
  description: string | null;
  detail_notes: unknown;
  status: string;
  assignee_id: string | null;
  collaborator_ids: string[] | null;
  start_date: string | null;
  end_date: string | null;
  item_type: string;
  sort_order: number;
  depth: number;
  updated_at: string | null;
};

type LiveDependency = {
  from_item_id: string;
  from_side: string;
  to_item_id: string;
  to_side: string;
  offset_days: number;
};

type LiveMember = {
  user_id: string;
  role: string;
};

type LiveProjectSnapshot = {
  content: string;
  itemCount: number;
  dependencyCount: number;
  memberCount: number;
};

const STATUS_LABELS: Record<string, string> = {
  todo: '未開始',
  in_progress: '進行中',
  delayed: '延遲',
  completed: '已完成',
  unsure: '不確定',
  onhold: '暫停',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  group: '群組',
  milestone: '里程碑',
  task: '任務',
};

const MAX_SNAPSHOT_ITEMS = 120;
const MAX_SNAPSHOT_DEPENDENCIES = 80;
const MAX_DETAIL_LENGTH = 140;

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const addDaysIsoDate = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const truncate = (value: string | null | undefined, maxLength = MAX_DETAIL_LENGTH) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
};

const formatStatus = (status: string) => STATUS_LABELS[status] ?? status;
const formatItemType = (type: string) => ITEM_TYPE_LABELS[type] ?? type;
const isCompleted = (item: LiveWbsItem) => item.status === 'completed';
const isTaskLike = (item: LiveWbsItem) => item.item_type !== 'group';
const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '未填');

const formatDateRange = (item: LiveWbsItem) => {
  if (item.start_date && item.end_date) return `${item.start_date} ~ ${item.end_date}`;
  if (item.start_date) return `${item.start_date} 起`;
  if (item.end_date) return `${item.end_date} 到期`;
  return '未填';
};

const summarizeDetailNotes = (detailNotes: unknown) => {
  if (!Array.isArray(detailNotes)) return '';

  const notes = detailNotes
    .map((note) => {
      if (!note || typeof note !== 'object') return '';
      const record = note as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      return [title, content].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join(' | ');

  return truncate(notes);
};

const countBy = <T>(items: T[], getKey: (item: T) => string) =>
  items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const formatCounts = (counts: Record<string, number>, labels: Record<string, string> = {}) => {
  const entries = Object.entries(counts);
  if (entries.length === 0) return '無';
  return entries.map(([key, count]) => `${labels[key] ?? key} ${count}`).join('、');
};

const buildPath = (item: LiveWbsItem, itemById: Map<string, LiveWbsItem>) => {
  const titles: string[] = [];
  const seen = new Set<string>();
  let current: LiveWbsItem | undefined = item;

  while (current && !seen.has(current.id) && titles.length < 8) {
    titles.unshift(current.title);
    seen.add(current.id);
    current = current.parent_id ? itemById.get(current.parent_id) : undefined;
  }

  return titles.join(' > ');
};

const formatItemLine = (item: LiveWbsItem, itemById: Map<string, LiveWbsItem>) => {
  const collaborators = item.collaborator_ids ?? [];
  const notes = summarizeDetailNotes(item.detail_notes);
  const description = truncate(item.description);
  const details = [description ? `說明:${description}` : '', notes ? `備註:${notes}` : '']
    .filter(Boolean)
    .join('；');

  return [
    `- ${buildPath(item, itemById)}`,
    `類型:${formatItemType(item.item_type)}`,
    `狀態:${formatStatus(item.status)}`,
    `期程:${formatDateRange(item)}`,
    `負責:${shortId(item.assignee_id)}`,
    `協作者:${collaborators.length}`,
    details,
  ].filter(Boolean).join(' | ');
};

const formatDependencyLine = (dependency: LiveDependency, itemById: Map<string, LiveWbsItem>) => {
  const fromTitle = itemById.get(dependency.from_item_id)?.title ?? dependency.from_item_id;
  const toTitle = itemById.get(dependency.to_item_id)?.title ?? dependency.to_item_id;
  const offset = dependency.offset_days ? `，延後 ${dependency.offset_days} 天` : '';
  return `- ${fromTitle}.${dependency.from_side} -> ${toTitle}.${dependency.to_side}${offset}`;
};

const buildLiveProjectSnapshot = async (
  supabase: any,
  tenantId: string,
  projectId: string | null,
): Promise<LiveProjectSnapshot> => {
  const tenantQuery = supabase
    .from('tenants')
    .select('name, owner_id')
    .eq('id', tenantId)
    .maybeSingle();

  const projectQuery = projectId
    ? supabase
      .from('projects')
      .select('name, created_by')
      .eq('tenant_id', tenantId)
      .eq('id', projectId)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  let memberQuery = supabase
    .from('project_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId);
  if (projectId) memberQuery = memberQuery.eq('project_id', projectId);

  const tenantMemberQuery = supabase
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId);

  let itemQuery = supabase
    .from('wbs_items')
    .select('id,parent_id,code,title,description,detail_notes,status,assignee_id,collaborator_ids,start_date,end_date,item_type,sort_order,depth,updated_at')
    .eq('tenant_id', tenantId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
    .limit(250);
  if (projectId) itemQuery = itemQuery.eq('project_id', projectId);

  let dependencyQuery = supabase
    .from('wbs_dependencies')
    .select('from_item_id,from_side,to_item_id,to_side,offset_days')
    .eq('tenant_id', tenantId)
    .limit(250);
  if (projectId) dependencyQuery = dependencyQuery.eq('project_id', projectId);

  const [
    { data: tenant, error: tenantError },
    { data: project, error: projectError },
    { data: members, error: membersError },
    { data: tenantMembers, error: tenantMembersError },
    { data: items, error: itemsError },
    { data: dependencies, error: dependenciesError },
  ] = await Promise.all([tenantQuery, projectQuery, memberQuery, tenantMemberQuery, itemQuery, dependencyQuery]);

  const firstError = tenantError ?? projectError ?? membersError ?? tenantMembersError ?? itemsError ?? dependenciesError;
  if (firstError) {
    throw new Error(`Live project snapshot query failed: ${firstError.message}`);
  }

  const wbsItems = (items ?? []) as LiveWbsItem[];
  const wbsDependencies = (dependencies ?? []) as LiveDependency[];
  const projectMembers = (members ?? []) as LiveMember[];
  const workspaceMembers = (tenantMembers ?? []) as LiveMember[];

  if (wbsItems.length === 0 && wbsDependencies.length === 0 && projectMembers.length === 0 && workspaceMembers.length === 0 && !project && !tenant) {
    return { content: '', itemCount: 0, dependencyCount: 0, memberCount: 0 };
  }

  const itemById = new Map(wbsItems.map((item) => [item.id, item]));
  const today = todayIsoDate();
  const sevenDaysLater = addDaysIsoDate(today, 7);

  const overdueItems = wbsItems
    .filter((item) => !isCompleted(item) && item.end_date && item.end_date < today)
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
  const dueSoonItems = wbsItems
    .filter((item) => !isCompleted(item) && item.end_date && item.end_date >= today && item.end_date <= sevenDaysLater)
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
  const blockedItems = wbsItems.filter((item) => ['delayed', 'onhold', 'unsure'].includes(item.status));
  const missingAssigneeItems = wbsItems.filter((item) => isTaskLike(item) && !item.assignee_id);
  const missingScheduleItems = wbsItems.filter((item) => isTaskLike(item) && (!item.start_date || !item.end_date));
  const memberRoleCounts = countBy(projectMembers, (member) => member.role);
  const workspaceMemberRoleCounts = countBy(workspaceMembers, (member) => member.role);
  const statusCounts = countBy(wbsItems, (item) => item.status);
  const typeCounts = countBy(wbsItems, (item) => item.item_type);

  const projectName = project?.name ?? (projectId ? '可讀取專案名稱不足' : '未指定單一專案');
  const tenantName = tenant?.name ?? '可讀取工作區名稱不足';
  const projectOwner = project?.created_by ?? tenant?.owner_id ?? null;
  const displayedItems = wbsItems.slice(0, MAX_SNAPSHOT_ITEMS);
  const displayedDependencies = wbsDependencies.slice(0, MAX_SNAPSHOT_DEPENDENCIES);

  const sections = [
    '即時專案看板資料（直接從 Supabase wbs_items / wbs_dependencies / project_members 讀取，已套用登入者 RLS 權限）',
    `工作區:${tenantName}`,
    `專案:${projectName}`,
    `專案建立者或工作區負責人ID:${shortId(projectOwner)}`,
    `工作區成員:${workspaceMembers.length} 人；角色:${formatCounts(workspaceMemberRoleCounts)}`,
    `專案成員:${projectMembers.length} 人；角色:${formatCounts(memberRoleCounts)}${projectMembers.length === 0 ? '；目前沒有專案層級成員列，權限範圍以工作區成員為主' : ''}`,
    `WBS 未封存項目:${wbsItems.length}；類型:${formatCounts(typeCounts, ITEM_TYPE_LABELS)}；狀態:${formatCounts(statusCounts, STATUS_LABELS)}；依賴:${wbsDependencies.length} 條`,
    `風險摘要: 逾期 ${overdueItems.length}、未來7天到期 ${dueSoonItems.length}、延遲/暫停/不確定 ${blockedItems.length}、缺負責人 ${missingAssigneeItems.length}、缺完整期程 ${missingScheduleItems.length}`,
    overdueItems.length > 0
      ? `逾期項目:\n${overdueItems.slice(0, 20).map((item) => formatItemLine(item, itemById)).join('\n')}`
      : '逾期項目: 無',
    dueSoonItems.length > 0
      ? `未來7天到期項目:\n${dueSoonItems.slice(0, 30).map((item) => formatItemLine(item, itemById)).join('\n')}`
      : '未來7天到期項目: 無',
    blockedItems.length > 0
      ? `延遲/暫停/不確定項目:\n${blockedItems.slice(0, 20).map((item) => formatItemLine(item, itemById)).join('\n')}`
      : '延遲/暫停/不確定項目: 無',
    `WBS 項目明細（最多 ${MAX_SNAPSHOT_ITEMS} 筆${wbsItems.length > MAX_SNAPSHOT_ITEMS ? '，其餘已截斷' : ''}）:\n${displayedItems.map((item) => formatItemLine(item, itemById)).join('\n') || '無'}`,
    `依賴關係（最多 ${MAX_SNAPSHOT_DEPENDENCIES} 筆${wbsDependencies.length > MAX_SNAPSHOT_DEPENDENCIES ? '，其餘已截斷' : ''}）:\n${displayedDependencies.map((dependency) => formatDependencyLine(dependency, itemById)).join('\n') || '無'}`,
  ];

  return {
    content: sections.join('\n\n'),
    itemCount: wbsItems.length,
    dependencyCount: wbsDependencies.length,
    memberCount: projectMembers.length + workspaceMembers.length,
  };
};

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse('Missing Authorization header', 'UNAUTHORIZED', 401, origin);
    }

    const requestData = await req.json().catch(() => null);
    if (!requestData) {
      return createErrorResponse('Invalid JSON body', 'BAD_REQUEST', 400, origin);
    }

    const { tenantId, projectId, query, generationModel: requestedModel, matchThreshold = 0.35, matchCount = 12 } = requestData;

    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return createErrorResponse('Invalid tenantId', 'BAD_REQUEST', 400, origin);
    }
    if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      return createErrorResponse('Invalid projectId', 'BAD_REQUEST', 400, origin);
    }
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return createErrorResponse('Query is required', 'BAD_REQUEST', 400, origin);
    }
    if (query.length > 4000) {
      return createErrorResponse('Query exceeds 4000 characters', 'BAD_REQUEST', 400, origin);
    }
    if (matchThreshold < 0 || matchThreshold > 1) {
      return createErrorResponse('matchThreshold must be between 0 and 1', 'BAD_REQUEST', 400, origin);
    }
    if (matchCount < 1 || matchCount > 50) {
      return createErrorResponse('matchCount must be between 1 and 50', 'BAD_REQUEST', 400, origin);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return createErrorResponse('GEMINI_API_KEY is not configured', 'CONFIG_ERROR', 500, origin);
    }

    const embeddingModel = 'gemini-embedding-001';
    const validModels = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
    const generationModel = validModels.includes(requestedModel) ? requestedModel : 'gemini-3.1-flash-lite';
    const dimensions = 3072;
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent`;

    const geminiRes = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        model: `models/${embeddingModel}`,
        content: { parts: [{ text: query }] },
        output_dimensionality: dimensions,
      }),
    });

    if (geminiRes.status === 429) {
      return createErrorResponse('Gemini API quota exceeded', 'TOO_MANY_REQUESTS', 429, origin);
    }
    if (!geminiRes.ok) {
      return createErrorResponse(`Gemini API error: ${geminiRes.status}`, 'BAD_GATEWAY', 502, origin);
    }

    const geminiData = await geminiRes.json();
    const embedding = geminiData.embedding?.values;

    if (!Array.isArray(embedding) || embedding.length !== dimensions) {
      return createErrorResponse('Gemini API returned invalid embedding dimensions', 'DIMENSION_MISMATCH', 500, origin);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: rpcData, error: rpcError } = await supabase.rpc('match_project_knowledge', {
      target_tenant_id: tenantId,
      target_project_id: projectId || null,
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (rpcError) {
      return createErrorResponse(`Database RPC error: ${rpcError.message}`, 'INTERNAL_ERROR', 500, origin);
    }

    const chunks = (rpcData || []).map((row: any) => {
      const citation = {
        documentId: row.document_id,
        chunkId: row.chunk_id,
        sourceTable: row.source_table,
        sourceId: row.source_id,
        sourceType: row.source_type,
        title: row.title,
      };

      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        title: row.title,
        content: row.content,
        similarity: row.similarity,
        citation,
      };
    });

    let liveSnapshot: LiveProjectSnapshot;
    try {
      liveSnapshot = await buildLiveProjectSnapshot(supabase, tenantId, projectId || null);
    } catch (snapshotError: any) {
      console.error('Failed to build live project snapshot:', snapshotError);
      return createErrorResponse(snapshotError.message || 'Failed to read live project data', 'INTERNAL_ERROR', 500, origin);
    }

    let answer = '';
    if (chunks.length > 0 || liveSnapshot.content) {
      const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${generationModel}:generateContent`;
      const knowledgeContext = chunks
        .map((c, i) => `[來源${i + 1}] 標題: ${c.title}\n內容:\n${c.content}\n`)
        .join('\n---\n');
      const promptContext = [
        liveSnapshot.content ? `[即時專案看板]\n${liveSnapshot.content}` : '',
        knowledgeContext ? `[向量知識庫片段]\n${knowledgeContext}` : '',
      ].filter(Boolean).join('\n\n---\n\n');
      const systemInstruction = `你是 ProJED 的專案助理，請用直接、精簡、像人類同事的口氣回答。

回答規則:
1. 先回答結論或重點，不要先寒暄。
2. 不要使用「主管您好」、「我整理了一下」、「以下是」、「幫您」這類客套開場。
3. 只能使用繁體中文，不要中英並列，不要在中文後面補英文翻譯。
4. 不要使用 Markdown 標題或粗體符號，例如不要用 ###、**、***。
5. 如果要條列，請用簡單的「-」或短句，每點盡量一行。
6. 回答要短，優先保留使用者最需要的資訊；除非使用者要求細節，否則不要寫長篇說明。
7. 優先使用「即時專案看板」作為目前事實；「向量知識庫片段」只作為補充。
8. 只能根據可參考資料回答，不要編造來源外的事實。
9. 如果即時看板已有任務、狀態、期程、負責人或依賴資料，就要直接分析，不要說完全抓不到專案資料。
10. 只有在對應欄位真的不存在或為空時，才說資料不足，並清楚列出缺哪一類資料。
11. 需要引用時，用「參考來源一」這種中文寫法，不要用英文 Source。

可參考資料:
${promptContext}

使用者問題: ${query}`;

      try {
        const genRes = await fetch(generateEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiApiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemInstruction }] }]
          })
        });

        if (genRes.ok) {
          const genData = await genRes.json();
          answer = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
          console.error(`Gemini Generate API error: ${genRes.status}`);
          answer = '我有找到相關專案資料，但這次 AI 回答生成失敗。請稍後再試，或檢查 Gemini 生成設定。';
        }
      } catch (genErr) {
        console.error('Failed to call Gemini generation:', genErr);
        answer = '我有找到相關專案資料，但這次 AI 回答生成失敗。請稍後再試，或檢查 Gemini 生成設定。';
      }

      if (!answer.trim()) {
        answer = '我有找到相關專案資料，但這次沒有產生可用回答。請換一種問法再試。';
      }
    } else {
      answer = '目前找不到足夠相關的專案資料。請確認你已選取正確工作區與專案看板，且此專案已有 WBS 任務、依賴或成員資料。';
    }

    const responsePayload = {
      answer,
      chunks
    };

    (async () => {
      try {
        const promptHash = await hashString(query);
        const chunkIds = chunks.map(r => r.chunkId);

        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) {
          await supabase.from('llm_access_logs').insert({
            tenant_id: tenantId,
            project_id: projectId || null,
            actor_id: userData.user.id,
            provider: 'google',
            model: generationModel,
            prompt_hash: promptHash,
            retrieved_chunk_ids: chunkIds,
            response_metadata: {
              embeddingModel,
              matchThreshold,
              matchCount,
              resultCount: chunks.length,
              liveSnapshotItemCount: liveSnapshot.itemCount,
              liveSnapshotDependencyCount: liveSnapshot.dependencyCount,
              liveSnapshotMemberCount: liveSnapshot.memberCount,
              generatedAnswerLength: answer.length
            }
          });
        }
      } catch (err) {
        console.error('Failed to write llm_access_logs:', err);
      }
    })();

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Edge Function unhandled error:', err);
    return createErrorResponse('Internal Server Error', 'INTERNAL_ERROR', 500, origin);
  }
});
