/**
 * Google Identity Services (GSI) 與 GAPI 全域型別宣告
 *
 * 設計意圖：
 * index.html 透過 <script> 標籤載入 GSI 和 GAPI SDK 後，
 * 會在 window 上掛載 `google` 和 `gapi` 全域變數。
 * 此檔案為 TypeScript 提供最小型別宣告，避免 TS2304 錯誤。
 */

// ── Google Identity Services (OAuth 2.0) ──────────────────

/** Token 回應（GSI requestAccessToken 的 callback 參數） */
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
  scope?: string;
  token_type?: string;
}

/** Token Client 設定 */
interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type: string; message: string }) => void;
}

/** Token Client 實例 */
interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

/** GSI OAuth2 命名空間 */
interface GoogleOAuth2 {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  revoke: (token: string, callback?: () => void) => void;
}

/** GSI Accounts 命名空間 */
interface GoogleAccounts {
  oauth2: GoogleOAuth2;
}

/** 全域 google 物件 */
interface GoogleGlobal {
  accounts: GoogleAccounts;
}

// ── GAPI (Google API Client Library) ──────────────────────

/** GAPI Client 命名空間 */
interface GapiClient {
  init: (config: { apiKey?: string; discoveryDocs?: string[] }) => Promise<void>;
}

/** 全域 gapi 物件 */
interface GapiGlobal {
  load: (library: string, callback: () => void) => void;
  client: GapiClient;
}

// ── Window 擴充 ──────────────────────────────────────────

declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: GapiGlobal;
  }
  // 也允許直接存取（不透過 window.）
  const google: GoogleGlobal | undefined;
  const gapi: GapiGlobal | undefined;
}

export {};
