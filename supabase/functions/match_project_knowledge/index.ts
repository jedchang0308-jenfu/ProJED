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

    let answer = '';
    if (chunks.length > 0) {
      const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${generationModel}:generateContent`;
      const promptContext = chunks
        .map((c, i) => `[來源${i + 1}] 標題: ${c.title}\n內容:\n${c.content}\n`)
        .join('\n---\n');
      const systemInstruction = `你是 ProJED 的專案助理，請用直接、精簡、像人類同事的口氣回答。

回答規則:
1. 先回答結論或重點，不要先寒暄。
2. 不要使用「主管您好」、「我整理了一下」、「以下是」、「幫您」這類客套開場。
3. 只能使用繁體中文，不要中英並列，不要在中文後面補英文翻譯。
4. 不要使用 Markdown 標題或粗體符號，例如不要用 ###、**、***。
5. 如果要條列，請用簡單的「-」或短句，每點盡量一行。
6. 回答要短，優先保留使用者最需要的資訊；除非使用者要求細節，否則不要寫長篇說明。
7. 只能根據來源內容回答，不要編造來源外的事實。
8. 如果資料不足，請直接說「目前資料不足」，並說明缺哪一類資料。
9. 需要引用時，用「參考來源一」這種中文寫法，不要用英文 Source。

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
      answer = '目前找不到足夠相關的專案資料。請先確認 P9 索引已更新，或改問更具體的問題。';
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
