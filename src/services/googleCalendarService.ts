/**
 * googleCalendarService — Google Calendar 同步核心服務
 *
 * 設計意圖 (Design Intent)：
 * 封裝所有 Google Calendar API v3 的操作邏輯，包括：
 * 1. OAuth Token 管理（取得、持久化、過期偵測）
 * 2. 日曆 CRUD（自動建立 "ProJED Tasks" 日曆）
 * 3. 事件同步（全量差異同步 + 單筆即時同步）
 *
 * 架構決策：
 * - 使用 REST API (fetch) 而非 GAPI client library 呼叫，
 *   以避免 GAPI client 的初始化延遲與版本相依問題。
 * - Token 透過 GSI (Google Identity Services) 的 initTokenClient 取得。
 * - 從環境變數讀取 Client ID，遵守 devops_policy 的環境隔離規範。
 *
 * 遷移自 _legacy_v2/app.js 中的 Google 模組 (L557-855)，
 * 改良項目請見 ARCHITECTURE_DICTIONARY.md。
 */

import dayjs from 'dayjs';
import type {
  SyncableItem,
  GoogleCalendarEvent,
  SyncResult,
  TaskStatus,
} from '../types';

// ── 常數 ─────────────────────────────────────────────────
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

// ── Token 管理 ───────────────────────────────────────────

/** Token 本地持久化鍵名 */
const TOKEN_KEY = 'google_access_token';
const EXPIRY_KEY = 'google_token_expiry';

/**
 * TokenManager — 管理 OAuth Access Token 的生命週期
 *
 * 設計意圖：
 * 將 token 的存取與過期偵測封裝為單一職責的管理器，
 * 避免散落在各處的 localStorage 操作。
 */
class TokenManager {
  private _token: string | null = null;

  constructor() {
    // 啟動時嘗試從 localStorage 恢復有效的 token
    const saved = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (saved && expiry && Date.now() < parseInt(expiry)) {
      this._token = saved;
      console.log('♻️ 已從本地載入有效的 Google Calendar 權杖');
    }
  }

  /** 取得目前的 access token（可能為 null） */
  get token(): string | null {
    // 每次存取時檢查是否已過期
    if (this._token && !this.isValid()) {
      console.log('⏰ Google Calendar 權杖已過期，需重新授權');
      this.clear();
    }
    return this._token;
  }

  /** token 是否有效（存在且未過期） */
  isValid(): boolean {
    if (!this._token) return false;
    const expiry = localStorage.getItem(EXPIRY_KEY);
    return !!expiry && Date.now() < parseInt(expiry);
  }

  /** 儲存新的 token（含過期時間） */
  save(accessToken: string, expiresIn: number = 3600): void {
    this._token = accessToken;
    const expiresAt = Date.now() + expiresIn * 1000;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(EXPIRY_KEY, expiresAt.toString());
  }

  /** 清除 token */
  clear(): void {
    this._token = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  }
}

// ── 單例實例 ─────────────────────────────────────────────
const tokenManager = new TokenManager();
// tokenClient 由 GSI SDK 建立（window.google.accounts.oauth2.initTokenClient）
// 型別宣告在 src/types/google.d.ts，此處用條件型別安全推斷
let tokenClient: { requestAccessToken: (config?: { prompt?: string }) => void } | null = null;

// ── 內部輔助函式 ─────────────────────────────────────────

/**
 * apiCall — 通用的 Google Calendar REST API 呼叫器
 *
 * 設計意圖：封裝 fetch + 認證 header + 錯誤處理，
 * 避免每個方法都重複撰寫 fetch 邏輯。
 */
async function apiCall<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<T> {
  const token = tokenManager.token;
  if (!token) throw new Error('未授權：缺少 Google Calendar access token');

  const url = `${CALENDAR_API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const resp = await fetch(url, options);

  // DELETE 成功回傳 204 No Content
  if (method === 'DELETE' && resp.status === 204) return undefined as T;

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
    throw new Error(
      `Google Calendar API 錯誤 (${resp.status}): ${err?.error?.message || JSON.stringify(err)}`
    );
  }

  return resp.json() as Promise<T>;
}

/**
 * getTypeLabel — 將項目類型轉為中文標籤
 * 用於 Google Calendar 事件標題前綴
 */
function getTypeLabel(type: SyncableItem['type']): string {
  const labels: Record<SyncableItem['type'], string> = {
    list: '列表',
    card: '卡片',
    checklist: '待辦',
  };
  return labels[type] || '項目';
}

/**
 * getStatusColorId — 將任務狀態對應至 Google Calendar 顏色 ID
 *
 * Google Calendar Event Colors:
 * 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana,
 * 6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato
 */
function getStatusColorId(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: '7',       // Peacock (藍) — 進行中
    delayed: '11',   // Tomato (紅) — 延遲
    completed: '10', // Basil (綠) — 完成
    unsure: '3',     // Grape (紫) — 不確定
    onhold: '8',     // Graphite (灰) — 暫緩
  };
  return map[status] || '7';
}

/**
 * formatItemToEvent — 將 ProJED 項目轉換為 Google Calendar 事件格式
 *
 * 改良自舊版：
 * - 舊版只取 endDate 作為單日事件 → 新版支援 start~end 跨日事件
 * - 新增深度連結回 ProJED
 * - 使用 PROJED_ID 嵌入 description 做雙向關聯
 */
function formatItemToEvent(item: SyncableItem): GoogleCalendarEvent {
  // 需求變更：只在 Google 行事曆上顯示「結束日期」。
  // 我們將事件的發生日（targetDate）指定為任務的 endDate（若無則拿 startDate 墊檔）
  const targetDate = item.endDate || item.startDate || dayjs().format('YYYY-MM-DD');

  // Google Calendar 的全天事件 end.date 是「排除日」(exclusive)，所以必須加 1 天
  const targetDateExclusive = dayjs(targetDate).add(1, 'day').format('YYYY-MM-DD');

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '';
  const deepLink = `${baseUrl}?itemId=${item.id}`;

  return {
    summary: `[${getTypeLabel(item.type)}] ${item.title || '無標題'}`,
    description: [
      item.notes || '',
      '',
      '---',
      `🔗 在 ProJED 查看: ${deepLink}`,
      `PROJED_ID: ${item.id}`,
    ].join('\n'),
    start: { date: targetDate },
    end: { date: targetDateExclusive },
    colorId: getStatusColorId(item.status),
    visibility: 'public', // ✅ 強制設為公開，確保行事曆訂閱者能看見該事件
  };
}

// ── 公開 API ─────────────────────────────────────────────

export const googleCalendarService = {

  // ===== 授權管理 =====

  /**
   * init — 初始化 Google Identity Services (GSI)
   *
   * 設計意圖：
   * 在 App mount 時呼叫一次，建立 tokenClient 實例。
   * 不會觸發授權彈窗，僅準備好授權工具。
   *
   * @returns Promise<void> — 等同步回傳時 GSI 工具已就緒
   * @param onTokenReceived — token 成功取得時的 callback（用於更新 UI 狀態）
   */
  init(onTokenReceived?: (token: string) => void): void {
    if (!CLIENT_ID) {
      console.warn('⚠️ 未設定 VITE_GOOGLE_CLIENT_ID，Google Calendar 同步功能將停用');
      return;
    }

    // 等待 GSI SDK 載入完成（async defer script）
    const tryInit = () => {
      if (window.google?.accounts?.oauth2) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (resp) => {
            if (resp.error) {
              console.error('❌ Google Calendar 授權失敗:', resp.error_description || resp.error);
              return;
            }
            console.log('🔑 已取得 Google Calendar access token');
            tokenManager.save(resp.access_token, resp.expires_in || 3600);
            onTokenReceived?.(resp.access_token);
          },
        });
        console.log('✅ Google Calendar OAuth 工具已就緒');
      } else {
        // SDK 尚未載入，100ms 後重試（最多等 5 秒）
        setTimeout(tryInit, 100);
      }
    };

    tryInit();
  },

  /**
   * requestToken — 觸發 OAuth 授權彈窗，向用戶請求日曆權限
   *
   * 設計意圖：用戶首次使用「同步 Google 日曆」功能時呼叫。
   * 若用戶曾授權過，瀏覽器會嘗試靜默授權（無彈窗）。
   */
  requestToken(): void {
    if (!tokenClient) {
      console.warn('⚠️ Google Calendar OAuth 工具尚未初始化');
      return;
    }
    // prompt: '' → 讓瀏覽器嘗試靜默授權；若不行才彈窗
    tokenClient.requestAccessToken({ prompt: '' });
  },

  /**
   * revokeToken — 撤銷 Google Calendar 權限並清除本地 token
   */
  revokeToken(): void {
    const token = tokenManager.token;
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {
        console.log('🔓 已撤銷 Google Calendar 授權');
      });
    }
    tokenManager.clear();
  },

  /**
   * isTokenValid — 檢查目前 token 是否有效
   */
  isTokenValid(): boolean {
    return tokenManager.isValid();
  },

  /**
   * getToken — 取得目前的 access token（給外部使用）
   */
  getToken(): string | null {
    return tokenManager.token;
  },

  // ===== 日曆管理 =====

  /**
   * getOrCreateCalendar — 取得日曆 ID
   *
   * 設計意圖：
   * 根據您的需求，直接將任務寫入您的「主日曆 (primary)」。
   * 這樣只要有訂閱您主日曆的同事或成員，就能立刻看到自動同步出來的事件，
   * 徹底免除每次都要去檢查與設定子日曆權限的麻煩！
   */
  async getOrCreateCalendar(): Promise<string> {
    return 'primary'; // 強制使用 Google 帳號的主日曆
  },

  // ===== 同步核心 =====

  /**
   * syncAll — 全量差異同步
   *
   * 設計意圖 (Design Intent)：
   * 遍歷所有具備日期的 ProJED 項目，與 Google Calendar 上的事件做比對：
   * 1. 新增：ProJED 有、Google 沒有 → 建立事件
   * 2. 更新：雙方都有但內容不同 → 更新事件
   * 3. 刪除：Google 有、ProJED 沒有 → 移除事件
   * 4. 跳過：內容一致 → 不操作
   *
   * 改良自舊版 syncAll (L673-774)：
   * - 回傳 SyncResult 統計，而非僅 console.log
   * - Event ID 快取支援（透過 eventIdCache 參數）
   *
   * @param items     — 所有待同步的 ProJED 項目（來自所有工作區）
   * @param eventIdCache — 本地快取的 { projedId → googleEventId } 對照表
   * @returns SyncResult — 同步結果統計
   */
  async syncAll(
    items: SyncableItem[],
    eventIdCache: Record<string, string> = {}
  ): Promise<{ result: SyncResult; updatedCache: Record<string, string> }> {
    const calId = await this.getOrCreateCalendar();
    const encodedCalId = encodeURIComponent(calId);

    // 1. 讀取 Google Calendar 上的所有事件
    console.log('📥 正在從 Google Calendar 讀取事件...');
    const eventsResp = await apiCall<{ items?: Array<{ id: string; summary: string; description?: string; start?: { date?: string }; end?: { date?: string }; colorId?: string }> }>(
      `/calendars/${encodedCalId}/events?maxResults=2500&singleEvents=true`
    );
    const googleEvents = eventsResp.items || [];
    console.log(`✅ 讀取到 ${googleEvents.length} 個 Google Calendar 事件`);

    // 建立 ProJED ID → Google Event 的對照表
    const googleEventMap = new Map<string, typeof googleEvents[0]>();
    googleEvents.forEach(e => {
      if (e.description?.includes('PROJED_ID:')) {
        const match = e.description.match(/PROJED_ID:\s*(\S+)/);
        if (match?.[1]) {
          googleEventMap.set(match[1], e);
        }
      }
    });

    // 2. 逐項比對並同步
    const result: SyncResult = { created: 0, updated: 0, deleted: 0, skipped: 0 };
    const syncedIds = new Set<string>();
    const updatedCache = { ...eventIdCache };

    for (const item of items) {
      const eventData = formatItemToEvent(item);
      const existingEvent = googleEventMap.get(item.id);

      if (existingEvent) {
        // 智慧比對：檢查是否需要更新
        const needsUpdate =
          existingEvent.summary !== eventData.summary ||
          existingEvent.start?.date !== eventData.start.date ||
          existingEvent.end?.date !== eventData.end.date ||
          (existingEvent.colorId || '7') !== (eventData.colorId || '7');

        if (needsUpdate) {
          try {
            await apiCall(
              `/calendars/${encodedCalId}/events/${existingEvent.id}`, 'PUT', eventData
            );
            result.updated++;
            updatedCache[item.id] = existingEvent.id;
          } catch (e) {
            console.error(`❌ 更新失敗 [${item.title}]:`, e);
          }
        } else {
          result.skipped++;
          updatedCache[item.id] = existingEvent.id;
        }
        syncedIds.add(item.id);
      } else {
        // 新增事件
        try {
          const created = await apiCall<{ id: string }>(
            `/calendars/${encodedCalId}/events`, 'POST', eventData
          );
          result.created++;
          updatedCache[item.id] = created.id;
        } catch (e) {
          console.error(`❌ 新增失敗 [${item.title}]:`, e);
        }
        syncedIds.add(item.id);
      }
    }

    // 3. 刪除 Google Calendar 上多餘的事件（ProJED 已不存在的項目）
    for (const [projedId, gEvent] of googleEventMap.entries()) {
      if (!syncedIds.has(projedId)) {
        try {
          await apiCall(
            `/calendars/${encodedCalId}/events/${gEvent.id}`, 'DELETE'
          );
          result.deleted++;
          delete updatedCache[projedId];
        } catch (e) {
          console.warn('刪除失敗:', e);
        }
      }
    }

    console.log(`📊 同步完成: 新增 ${result.created}, 更新 ${result.updated}, 刪除 ${result.deleted}, 跳過 ${result.skipped}`);
    return { result, updatedCache };
  },

  /**
   * syncItem — 單筆即時同步
   *
   * 改良自舊版 syncItem (L801-837)：
   * - 優先使用 eventIdCache 直接定位 Google Event，避免讀取全部事件
   * - 若 cache miss 才 fallback 到全量搜尋
   *
   * @param item         — 要同步的單一項目
   * @param googleEventId — 已知的 Google Event ID（來自快取）
   * @returns 更新後的 googleEventId
   */
  async syncItem(
    item: SyncableItem,
    googleEventId?: string
  ): Promise<string | null> {
    if (!tokenManager.isValid()) return null;
    if (!item.startDate && !item.endDate) return null;

    const calId = await this.getOrCreateCalendar();
    const encodedCalId = encodeURIComponent(calId);
    const eventData = formatItemToEvent(item);

    try {
      // 優先使用快取的 Event ID 直接更新
      if (googleEventId) {
        try {
          await apiCall(
            `/calendars/${encodedCalId}/events/${googleEventId}`, 'PUT', eventData
          );
          console.log(`✅ [即時同步] 更新成功: ${item.title}`);
          return googleEventId;
        } catch {
          // Event ID 失效（可能被用戶手動刪除），fallback 到搜尋
          console.log('⚠️ 快取 Event ID 失效，嘗試搜尋...');
        }
      }

      // Fallback：搜尋現有事件
      const eventsResp = await apiCall<{ items?: Array<{ id: string; description?: string; summary: string; start?: { date?: string }; end?: { date?: string } }> }>(
        `/calendars/${encodedCalId}/events?maxResults=2500&singleEvents=true`
      );
      const existingEvent = (eventsResp.items || []).find(
        e => e.description?.includes(`PROJED_ID: ${item.id}`)
      );

      if (existingEvent) {
        // 比對是否有變動
        if (
          existingEvent.summary !== eventData.summary ||
          existingEvent.start?.date !== eventData.start.date ||
          existingEvent.end?.date !== eventData.end.date
        ) {
          await apiCall(
            `/calendars/${encodedCalId}/events/${existingEvent.id}`, 'PUT', eventData
          );
          console.log(`✅ [即時同步] 更新成功: ${item.title}`);
        }
        return existingEvent.id;
      } else {
        // 新增
        const created = await apiCall<{ id: string }>(
          `/calendars/${encodedCalId}/events`, 'POST', eventData
        );
        console.log(`✅ [即時同步] 新增成功: ${item.title}`);
        return created.id;
      }
    } catch (err) {
      console.error(`❌ [即時同步] 失敗 [${item.title}]:`, err);
      return googleEventId || null;
    }
  },

  /**
   * clearAll — 刪除整個 "ProJED Tasks" 日曆
   *
   * 設計意圖：提供完全重置的功能，讓用戶可以清除所有同步資料
   */
  async clearAll(): Promise<void> {
    if (!tokenManager.isValid()) {
      throw new Error('請先連接 Google Calendar');
    }
    console.warn('⚠️ clearAll 功能已停用，因為目前直接使用主日曆，為保護使用者個人行程不被誤刪。');
  },

  // ===== 輔助方法（公開供外部使用） =====

  /** 將項目轉為事件格式（公開供測試或預覽用） */
  formatItemToEvent,
};

export default googleCalendarService;
