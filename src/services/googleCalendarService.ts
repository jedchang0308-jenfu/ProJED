/**
 * googleCalendarService — Google Calendar 同步核心服務
 *
 * 設計意圖 (Design Intent)：
 * 封裝所有 Google Calendar API v3 的操作邏輯，包括：
 * 1. OAuth Token 管理（取得、持久化、過期偵測）
 * 2. 日曆 CRUD（自動建立 "ProJED Tasks" 日曆）
 * 3. 事件同步（全量差異同步 + 單筆即時同步）
 * 4. EVENT_ID_CACHE 狀態維護與資料扁平化。
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
  Workspace
} from '../types';

// ── 常數 ─────────────────────────────────────────────────
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const EVENT_ID_CACHE_KEY = 'google_calendar_event_id_cache';

// ── Token 管理 ───────────────────────────────────────────

/** Token 本地持久化鍵名 */
const TOKEN_KEY = 'google_access_token';
const EXPIRY_KEY = 'google_token_expiry';

/**
 * TokenManager — 管理 OAuth Access Token 的生命週期
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
let tokenClient: { requestAccessToken: (config?: { prompt?: string }) => void } | null = null;

// ── 內部輔助函式 ─────────────────────────────────────────

function loadEventIdCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EVENT_ID_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEventIdCache(cache: Record<string, string>): void {
  localStorage.setItem(EVENT_ID_CACHE_KEY, JSON.stringify(cache));
}

function clearEventIdCache(): void {
  localStorage.removeItem(EVENT_ID_CACHE_KEY);
}

function flattenAllItems(workspaces: Workspace[]): SyncableItem[] {
  const items: SyncableItem[] = [];

  workspaces.forEach(ws => {
    (ws.boards || []).forEach(board => {
      (board.lists || []).forEach(list => {
        if (list.isArchived) return;

        if (list.startDate || list.endDate) {
          items.push({
            id: list.id,
            title: list.title,
            type: 'list',
            status: list.status || 'todo',
            startDate: list.startDate,
            endDate: list.endDate,
          });
        }

        (list.cards || []).forEach(card => {
          if (card.isArchived) return;
          if (card.startDate || card.endDate) {
            items.push({
              id: card.id,
              title: card.title,
              type: 'card',
              status: card.status || 'todo',
              startDate: card.startDate,
              endDate: card.endDate,
              notes: card.notes,
            });
          }

          (card.checklists || []).forEach(cl => {
            if (cl.isArchived) return;
            (cl.items || []).forEach(cli => {
              if (cli.isArchived) return;
              if (cli.startDate || cli.endDate) {
                items.push({
                  id: cli.id,
                  title: cli.title || '未命名項目',
                  type: 'checklist',
                  status: cli.status || 'todo',
                  startDate: cli.startDate,
                  endDate: cli.endDate,
                });
              }
            });
          });
        });
      });
    });
  });

  return items;
}

/**
 * apiCall — 通用的 Google Calendar REST API 呼叫器
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

function getTypeLabel(type: SyncableItem['type']): string {
  const labels: Record<SyncableItem['type'], string> = {
    list: '列表',
    card: '卡片',
    checklist: '待辦',
  };
  return labels[type] || '項目';
}

function getStatusColorId(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: '7',
    delayed: '11',
    completed: '10',
    unsure: '3',
    onhold: '8',
  };
  return map[status] || '7';
}

function formatItemToEvent(item: SyncableItem): GoogleCalendarEvent {
  const targetDate = item.endDate || item.startDate || dayjs().format('YYYY-MM-DD');
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
    visibility: 'public',
  };
}

// ── 公開 API ─────────────────────────────────────────────

export const googleCalendarService = {
  // ===== 授權管理 =====
  init(onTokenReceived?: (token: string) => void): void {
    if (!CLIENT_ID) {
      console.warn('⚠️ 未設定 VITE_GOOGLE_CLIENT_ID，Google Calendar 同步功能將停用');
      return;
    }

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
        setTimeout(tryInit, 100);
      }
    };

    tryInit();
  },

  requestToken(): void {
    if (!tokenClient) {
      console.warn('⚠️ Google Calendar OAuth 工具尚未初始化');
      return;
    }
    tokenClient.requestAccessToken({ prompt: '' });
  },

  revokeToken(): void {
    const token = tokenManager.token;
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {
        console.log('🔓 已撤銷 Google Calendar 授權');
      });
    }
    tokenManager.clear();
    clearEventIdCache();
  },

  isTokenValid(): boolean {
    return tokenManager.isValid();
  },

  getToken(): string | null {
    return tokenManager.token;
  },

  // ===== 日曆管理 =====
  async getOrCreateCalendar(): Promise<string> {
    return 'primary'; 
  },

  // ===== 同步核心 =====

  /**
   * syncAll — 全量差異同步
   */
  async syncAll(workspaces: Workspace[]): Promise<SyncResult | null> {
    if (!this.isTokenValid()) {
      throw new Error('未授權：請先連接 Google Calendar');
    }

    const items = flattenAllItems(workspaces);
    console.log(`📋 共有 ${items.length} 個項目需要同步`);
    
    let eventIdCache = loadEventIdCache();
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

    // 3. 刪除多餘的事件
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
    saveEventIdCache(updatedCache);
    return result;
  },

  /**
   * syncItem — 單筆即時同步
   */
  async syncItem(item: SyncableItem): Promise<void> {
    if (!this.isTokenValid()) return;
    if (!item.startDate && !item.endDate) return;

    const eventIdCache = loadEventIdCache();
    const googleEventId = eventIdCache[item.id];
    const calId = await this.getOrCreateCalendar();
    const encodedCalId = encodeURIComponent(calId);
    const eventData = formatItemToEvent(item);

    try {
      if (googleEventId) {
        try {
          await apiCall(
            `/calendars/${encodedCalId}/events/${googleEventId}`, 'PUT', eventData
          );
          console.log(`✅ [即時同步] 更新成功: ${item.title}`);
          return;
        } catch {
          console.log('⚠️ 快取 Event ID 失效，嘗試搜尋...');
        }
      }

      const eventsResp = await apiCall<{ items?: Array<{ id: string; description?: string; summary: string; start?: { date?: string }; end?: { date?: string } }> }>(
        `/calendars/${encodedCalId}/events?maxResults=2500&singleEvents=true`
      );
      const existingEvent = (eventsResp.items || []).find(
        e => e.description?.includes(`PROJED_ID: ${item.id}`)
      );

      if (existingEvent) {
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
        eventIdCache[item.id] = existingEvent.id;
        saveEventIdCache(eventIdCache);
        return;
      } else {
        const created = await apiCall<{ id: string }>(
          `/calendars/${encodedCalId}/events`, 'POST', eventData
        );
        console.log(`✅ [即時同步] 新增成功: ${item.title}`);
        eventIdCache[item.id] = created.id;
        saveEventIdCache(eventIdCache);
        return;
      }
    } catch (err) {
      console.error(`❌ [即時同步] 失敗 [${item.title}]:`, err);
    }
  },

  async clearAll(): Promise<void> {
    if (!this.isTokenValid()) {
      throw new Error('請先連接 Google Calendar');
    }
    console.warn('⚠️ clearAll 功能已停用，因為目前直接使用主日曆，為保護使用者個人行程不被誤刪。');
    clearEventIdCache();
  },

  formatItemToEvent,
};

export default googleCalendarService;
