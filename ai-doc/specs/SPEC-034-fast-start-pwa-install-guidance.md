# SPEC-034: App 快速啟動、PWA 更新與加入主畫面指引 UX

狀態：Done / Browser QC Passed / Local-first scope  
文件角色：PM / RD 開發規格  
建立日期：2026-06-29  
更新日期：2026-07-03
需求來源：使用者在 `codex/UX優化` 分支提出出差臨時記事啟動摩擦、PWA 更新策略、加入主畫面指引過於複雜等 UX 問題。

最新修正：2026-07-03，QuickCaptureShell 已退役；右下角 `待整理` 浮窗已由 DEV-039 全域任務平台的 `未歸位` lane 取代。保留 `useQuickCaptureStore` 與 `projed.quickCapture.inboxItems` 僅作舊本機快記資料遷移與未歸位來源，不再全域掛載可輸入浮窗。

---

## 1. 背景

使用者回饋：目前 ProJED 開啟 App 時需要等待一段時間。對出差途中、會議前後、臨時想到雜事要先記下的人不友善。

本輪對話已確認三個問題不是同一層：

1. `快速記錄問題`：使用者需要先能輸入，不應等待完整登入、workspace、board、records、calendar、tags、members 全部完成。
2. `PWA 快取與更新問題`：App Shell 應快取以便下次快速開啟，但更新不能被快取卡死。
3. `加入主畫面指引問題`：使用者不知道怎麼把 ProJED 放到手機桌面，現有 UI 說明偏登入錯誤處理，不是安裝引導。

真正目標不是「教使用者 PWA」，而是讓使用者下次能像開原生 App 一樣直接點 ProJED 圖示，快速記下事情，且不需要再問開發人員。

---

## 2. 現況盤點

### 2.1 目前已完成的 PWA 基礎調整

本對話中已先完成 PWA 更新基礎：

- `vite.config.js` 已啟用 `vite-plugin-pwa`，產生 `manifest.webmanifest` 與版本化 `sw.js`。
- `src/services/pwaUpdateService.ts` 已新增 service worker lifecycle：
  - 第一次使用自動註冊 service worker。
  - App 回到前景時檢查更新。
  - 約每小時背景檢查更新。
  - 偵測到新版時等待使用者離開頁面或下次開啟再套用，避免正在輸入時被強制重整。
- `index.html` 已移除永久 `sw-kill.js`。
- `public/sw.js` / `public/sw-kill.js` 已刪除，避免每次啟動都清快取。

驗證結果：

- `npm run build` 通過，產出 `dist/sw.js` 與 `dist/manifest.webmanifest`。
- `npm run lint` 無 error，保留既有 warning。
- Playwright 實測 production preview：service worker 已註冊，active script 為 `/sw.js`，頁面已被 SW 控制。

### 2.2 目前 UI 指引方式

目前使用者可見 UI 與「加入主畫面」相關性很弱：

1. `內建瀏覽器警告`
   - 位置：`src/components/AuthGate.tsx`
   - 觸發：LINE / Facebook / Instagram 等內建瀏覽器。
   - 文案重點：Google 登入受限、403、不允許的瀏覽器、必須使用外部瀏覽器。

2. `開外部瀏覽器動作`
   - 位置：`src/components/AuthGate.tsx`
   - 動作：`用 Chrome 開啟`、`嘗試用 Chrome 開啟`、`用外部瀏覽器開啟`、`複製登入網址`。
   - 目的：解決登入問題，不是完成加入主畫面。

3. `PWA 安裝能力`
   - 位置：`vite.config.js` 的 manifest / service worker 設定。
   - 狀態：瀏覽器知道 App 可安裝，但 App 內沒有明確引導。

4. `更新與快取訊息`
   - 位置：`src/services/pwaUpdateService.ts` console、`GlobalErrorBoundary` 錯誤頁。
   - 狀態：一般使用者看不到或不應依賴這些資訊。

---

## 3. 差距分析

| 面向 | 現況 | 目標 | 差距 |
|---|---|---|---|
| 啟動可用性 | 完整 App 載入前使用者可能只能看 loading | 0-3 秒內能記下一段文字 | 快速輸入與完整資料同步沒有分層 |
| 加入主畫面 | 只有 PWA 技術能力，沒有可見教學 | 使用者第一次看到就知道怎麼加入 | 缺少平台分流與明確 CTA |
| 內建瀏覽器 | 說明 Google 403 與外部瀏覽器 | 只告訴使用者下一步 | 技術原因太多，任務目標不明 |
| 更新 | 已改為 SW 背景檢查與背景套用 | 使用者不需理解更新機制 | 缺少使用者層級的「已會自動更新」安心訊號 |
| 狀態記憶 | 未建立安裝提示狀態 | 已安裝/稍後/不要再提示需被記住 | 缺少 installed/dismissed/snoozed state |
| 可回頭查 | 沒有設定頁入口 | 使用者可自行再次查看步驟 | 錯過第一次提示後只能問人 |

---

## 4. 心理成因

使用者要完成的心理任務是：

> 下次臨時想到事情時，我可以直接點 ProJED，馬上記下來。

不是：

> 我要理解 PWA、Service Worker、manifest、快取、外部瀏覽器或 Google 403。

目前 UI 讓使用者產生困惑的原因：

- `技術語言佔據主畫面`：403、Google 安全限制、內建瀏覽器等資訊會讓使用者以為自己遇到錯誤。
- `平台步驟不一致`：iPhone Safari、Android Chrome、桌面 Chrome、LINE 內建瀏覽器的操作不同，不能用同一段說明處理。
- `使用情境壓力高`：出差、會議、臨時記雜事時，使用者沒有心力閱讀長文。
- `沒有完成回饋`：做完加入主畫面後，使用者不確定是否成功。
- `沒有可重複入口`：使用者第一次略過後，找不到教學，只能問開發人員。

---

## 5. 產品目標

1. 使用者第一次在手機瀏覽器開啟 ProJED 時，能看到符合當前平台的加入主畫面引導。
2. 使用者已加入主畫面後，不再看到重複提示。
3. 使用者點手機桌面 ProJED 圖示開啟後，可用 App Shell 快取快速進入。
4. App 更新由系統背景處理，不要求使用者每次手動更新或清快取。
5. 內建瀏覽器情境只顯示「下一步」，不把技術原因放在主訊息。
6. 設定頁保留「App 安裝與快速開啟」入口，讓使用者可自行查詢。

---

## 6. 非目標

- 不承諾程式可替 iOS 使用者自動加入主畫面；iOS Safari 必須由使用者點分享選單，這是瀏覽器限制。
- 不在使用者正在輸入或操作時強制重整套用新版。
- 不把加入主畫面做成長篇教學頁或 onboarding carousel。
- 不導入 browser notification、email、calendar 外部通知。
- 不把私人快記自動公開到 workspace 或自動轉成團隊任務。
- 不在本規格中新增資料庫 schema；安裝提示狀態先以 localStorage 或前端狀態處理。

---

## 7. UX Intent

主要使用者：

- 出差、會議、移動中需要臨時記雜事的人。
- 不熟悉 PWA 或瀏覽器安裝流程的一般使用者。
- 可能從 LINE、Email、聊天連結第一次打開 ProJED 的使用者。

主要任務：

- 第一次設定：把 ProJED 放到手機桌面。
- 日常使用：從桌面圖示打開 ProJED，快速記下一段文字。

成功狀態：

- 使用者知道自己下一步要按哪裡。
- 使用者不需要理解技術名詞。
- 使用者不需要找開發人員問「怎麼安裝」。
- 使用者再次開啟時不被重複教學干擾。

---

## 8. 加入主畫面指引設計

### 8.1 入口與顯示時機

新增 `AppInstallAssistant`，建議顯示位置：

1. `首次登入成功後`：以 bottom sheet 顯示一次。
2. `未登入但瀏覽器可判斷安裝路徑時`：在登入頁下方顯示精簡提示，避免阻礙登入。
3. `設定頁`：新增「App 安裝與快速開啟」入口，可再次查看。

顯示限制：

- 已安裝 standalone 模式：不顯示。
- 使用者選 `稍後`：7 天內不再自動提示。
- 使用者選 `不要再提示`：永久不再自動提示，但設定頁仍可查看。
- 使用者已點擊 Android 原生安裝並成功：標記 installed。

### 8.2 平台分流

| 情境 | 偵測 | UI 策略 |
|---|---|---|
| 已從桌面 App 開啟 | `display-mode: standalone` 或 iOS `navigator.standalone` | 不提示；設定頁顯示已完成 |
| Android Chrome / Edge | `beforeinstallprompt` event available | 顯示主要按鈕 `加入主畫面`，呼叫原生 prompt |
| iPhone / iPad Safari | iOS + Safari + not standalone | 顯示三步驟：分享 -> 加入主畫面 -> 新增 |
| LINE / FB / IG 內建瀏覽器 | 既有 `isEmbeddedAuthBlocked()` | 先提示用 Safari / Chrome 開啟，不談加入主畫面 |
| 桌面 Chrome / Edge | Desktop + installable | 顯示 `安裝到電腦` 或提示網址列安裝圖示 |
| 不支援安裝 | 無安裝能力且非 iOS Safari | 隱藏自動提示，設定頁顯示瀏覽器不支援 |

### 8.3 建議文案

主標題：

```text
把 ProJED 放到手機桌面
```

副文案：

```text
下次一點就能快速記事，不用找網址。
```

Android Chrome：

```text
加入手機桌面
之後可直接點 ProJED 圖示快速記事。
```

主要 CTA：

```text
加入主畫面
```

iPhone Safari：

```text
加入 iPhone 主畫面
1. 點下方分享按鈕
2. 選「加入主畫面」
3. 點「新增」
```

內建瀏覽器：

```text
請先用 Safari 或 Chrome 開啟
目前在 LINE / Facebook 內建瀏覽器，無法完成登入與加入桌面。
```

完成狀態：

```text
已完成
之後請從手機桌面的 ProJED 圖示開啟。
```

### 8.4 文案禁用詞

主畫面不得把以下詞彙作為主要說明：

- PWA
- Service Worker
- manifest
- cache / 快取
- 403
- chunk
- OAuth 技術細節

這些資訊若需要保留，應放在 debug、console、錯誤頁或開發文件，不放在一般使用者的任務指引中。

---

## 9. 快速啟動與快記設計

本輪對話建議下一階段新增 `QuickCaptureShell`。

### 9.1 啟動分層

| 層級 | 目標 | 不應等待 |
|---|---|---|
| L0 Quick Capture | 0-3 秒內可輸入並本機保存 | Auth migration、workspace sync、records、calendar、RAG |
| L1 App Shell | 顯示基本導覽與最近狀態 | active board 深層資料 |
| L2 Active Board | 載入目前 board nodes/dependencies | 非目前 board、records、calendar |
| L3 Secondary Data | records、calendar、tags、members、RAG | 不阻擋 L0/L1 |

### 9.2 Local-first Outbox

建議資料形狀：

```ts
type CaptureDraft = {
  id: string;
  content: string;
  itemType: 'todo' | 'note' | 'someday';
  createdAt: number;
  updatedAt: number;
  sourceWorkspaceId?: string | null;
  sourceBoardId?: string | null;
  syncState: 'local' | 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  nextRetryAt?: number;
  clientMutationId: string;
};
```

規則：

- 使用者輸入後立即寫入本機 queue。
- 顯示 `已存本機`、`待同步`、`已同步`、`同步失敗，可重試`。
- 背景 auth ready 後再同步到私人 Inbox。
- 未分享的快記不得自動公開到 workspace。
- 轉成正式 `TaskNode` 必須由使用者確認。

---

## 10. PWA 更新規則

### 10.1 已採用規則

- 使用 `vite-plugin-pwa` 產生版本化 service worker。
- 使用 hashed JS/CSS assets，避免新版與舊版 chunk 混用。
- 移除永久 kill switch，不再每次啟動清除 cache。
- `cleanupOutdatedCaches` 自動清理舊版本快取。
- 偵測到新版時，先排入 pending update。
- 使用者離開頁面、頁面進入背景或下次開啟時套用新版。

### 10.2 更新 UX 原則

- 預設不打斷正在輸入的使用者。
- 不要求使用者每次手動更新。
- 若需要立即更新，只能在沒有未儲存草稿或已完成保存時提示。
- 發生 chunk load error 時可 reload；必要時才提供清除本地快取作為最後手段。

---

## 11. RD 實作切片

### Slice A：PWA 基礎與更新策略

狀態：已完成基礎實作。

範圍：

- 啟用 `vite-plugin-pwa`。
- 移除 `sw-kill`。
- 新增 `pwaUpdateService`。
- 驗證 service worker 註冊與控制頁面。

### Slice B：加入主畫面助理

狀態：待實作。

建議新增：

- `src/services/pwaInstallService.ts`
- `src/components/AppInstallAssistant.tsx`
- 設定頁區塊：`App 安裝與快速開啟`

核心工作：

- 偵測 iOS Safari / Android Chrome / desktop / in-app browser / standalone。
- 捕捉 `beforeinstallprompt`。
- 儲存 `installed` / `dismissed` / `snoozedUntil` 狀態。
- 依平台顯示短文案與 CTA。

### Slice C：快速啟動 QuickCaptureShell

狀態：待實作。

核心工作：

- 在 root 層先顯示最小快記入口。
- 本機保存 queue。
- 背景同步私人 Inbox。
- 不等待完整 App ready。

### Slice D：資料同步分層

狀態：待實作。

候選調整：

- calendar fetch 改為進入 calendar 或 idle 後才跑。
- records load 改為紀錄面板/紀錄頁需要時才跑。
- member/tag sync 若非首屏必要，延後到 active board ready 或 idle。
- Firestore / Supabase sync 先載 active board，再載次要資料。

### Slice E：QA / QC 自動化

狀態：待實作。

建議新增：

- static verifier：確認 install assistant platform branches、storage key、manifest、SW 註冊。
- browser verifier：桌面 Chrome install eligible、standalone no prompt、dismiss state。
- manual QA：iPhone Safari 加入主畫面步驟必須由人工驗證。

---

## 12. 驗收標準

### 12.1 加入主畫面

- 使用者 5 秒內知道下一步要按哪裡。
- Android Chrome 顯示 `加入主畫面` 並能呼叫原生 install prompt。
- iPhone Safari 顯示三步驟，不出現 Android 或桌面指令。
- LINE / FB / IG 內建瀏覽器只提示先用 Safari / Chrome 開啟。
- 已從桌面圖示開啟時不再提示加入主畫面。
- 使用者選 `稍後` 後 7 天內不再自動提示。
- 使用者選 `不要再提示` 後不再自動提示。
- 設定頁可再次查看安裝教學。
- 主 UI 不出現 PWA、Service Worker、manifest、cache、403 等技術詞作為主要說明。

### 12.2 快速啟動 / 快記

- 慢網路或剛開 App 時，3 秒內可輸入一段快記。
- 斷網時仍可新增快記，顯示 `已存本機，待同步`。
- 重新整理或關閉再開，未同步快記仍存在。
- 登入與同步完成後，快記自動進入私人 Inbox。
- 快記不因 workspace/board 尚未載入而被阻擋。
- 私人快記不會自動轉成團隊任務或公開資料。

### 12.3 更新

- 新版部署後，使用者不需手動清快取。
- 使用者正在輸入時不被強制刷新。
- 使用者關閉或背景化後可套用新版。
- 舊快取會被清理，不留下 `sw-kill` 永久清除機制。
- chunk load error 時能 reload 回最新可用版本。

---

## 13. QA 驗證計畫

### 13.1 自動化檢查

- `npm run build`
- `npm run lint`
- production preview 檢查：
  - `/`
  - `/manifest.webmanifest`
  - `/sw.js`
- Playwright 檢查：
  - `navigator.serviceWorker.ready`
  - active script ends with `/sw.js`
  - controller 為 true
  - standalone 狀態不顯示安裝提示
  - dismissed/snoozed state 生效

### 13.2 手動平台矩陣

| 平台 | 必測項目 |
|---|---|
| iPhone Safari | 分享 -> 加入主畫面 -> 新增；從桌面圖示開啟後不再提示 |
| Android Chrome | 原生 install prompt；安裝後 standalone 不再提示 |
| LINE / FB / IG 內建瀏覽器 | 只提示用 Safari / Chrome 開啟，不顯示加入主畫面步驟 |
| Desktop Chrome / Edge | install eligible 或設定頁指引 |
| 弱網路 / 離線 | App Shell 可重開；快記可本機保存 |

---

## 14. 風險與防呆

| 風險 | 影響 | 防呆 |
|---|---|---|
| iOS 不提供原生 install prompt | 使用者無法一鍵安裝 | 只顯示 Safari 三步驟，不承諾自動加入 |
| 使用者從 LINE 開啟 | 登入與安裝都可能失敗 | 先導出到 Safari / Chrome |
| 更新時有未儲存草稿 | 強制刷新造成資料遺失 | pending update 等背景化或下次開啟 |
| 安裝提示太常出現 | 使用者厭煩 | snooze / dismiss / installed state |
| 快記同步失敗 | 使用者以為資料消失 | local queue + retry + 狀態標籤 |
| 技術詞過多 | 使用者不理解 | 主 UI 禁用技術詞，技術細節降層 |

---

## 15. 規格治理 Gate

### 15.1 已檢查文件

- `ai-doc/documentation_map.md`
- `ai-doc/dev_task.md`
- `ai-doc/backlog.md`
- `ai-doc/specs/SPEC-002-whole-person-todo-platform.md`
- `src/components/AuthGate.tsx`
- `src/services/pwaUpdateService.ts`
- `vite.config.js`
- `index.html`

### 15.2 Cross-spec consistency

- 與 `SPEC-002` 相容：快記仍走私人 `InboxItem / CaptureItem` 先行，不要求一開始選 workspace、board、負責人或日期。
- 與現有會議/工作紀錄主線不衝突：本規格處理 App 啟動、安裝與私人快記入口，不改 `KnowledgeRecord` 或 meeting workflow。
- 與 PWA 更新基礎相容：保留已實作的背景更新策略，不恢復永久 kill switch。

### 15.3 ADR 判斷

目前不新增 ADR。

理由：

- 本規格第一階段是前端 UX、PWA lifecycle 與 local-first 快記入口的產品規格。
- 不改資料庫 schema、權限模型、主資料 identity、審核責任或 release gate。
- 若後續決定改成「新版一到就強制刷新所有使用者」或「快記進入正式團隊任務前自動分類/公開」，則需要另開 ADR。

### 15.4 DEV / Backlog 登錄狀態

- 使用者已要求 `pm-dev 執行開發`，本文件提升為 `DEV-034 [交付點] App 快速啟動與加入主畫面 UX`。
- 目前已完成並驗證：Slice B PWA 安裝助理與設定頁快速開啟入口、Slice C QuickCaptureShell 已退役、Slice D local-first pending queue 保留為未歸位資料來源。
- DEV-034 仍未宣告完整 Inbox 產品完成；正式雲端 Inbox、正式任務轉換與跨裝置同步需接 SPEC-002 後續交付。
- 拆分支援開發點：
  - `DEV-034A` PWA 更新基礎與背景套用策略
  - `DEV-034B` PWA 安裝助理與加入主畫面 UX
  - `DEV-034C` QuickCaptureShell 已退役，由 DEV-039 全域任務平台 `未歸位` lane 取代
  - `DEV-034D` local-first pending queue 與啟動效能優化

### 15.5 Slice B RD Evidence

- 新增 `src/services/pwaInstallService.ts`：集中處理 `beforeinstallprompt`、`appinstalled`、standalone 偵測、內建瀏覽器偵測、iOS Safari / Android / Desktop 分流，以及 installed / snoozed / dismissed 偏好記憶。
- 新增 `src/components/AppInstallAssistant.tsx`：登入後可自動顯示加入主畫面助理；設定頁可永久回查與重設提示。
- 更新 `src/main.tsx`：App 啟動時自動掛上安裝提示 listener，使用者不需額外設定。
- 更新 `src/App.tsx`：全域掛載安裝助理。
- 更新 `src/components/SettingsView.tsx`：新增 `快速開啟` 設定區塊。
- 新增 `scripts/verify-dev-034-pwa-install-guidance.mjs` 與 `verify:dev-034-pwa-install-guidance`：靜態驗證平台分流、設定頁入口、全域掛載、自動 listener、使用者文案不含技術詞。
- 新增 `scripts/verify-dev-034-pwa-install-guidance-browser.pw.js` 與 `verify:dev-034-pwa-install-guidance-browser`：桌機與手機實際開啟設定頁，驗證 `快速開啟` UI 可見、無水平溢位、未暴露技術詞，並輸出截圖證據。

### 15.6 Slice C-D RD Evidence

- 新增 `src/types/index.ts` 的 `InboxItem`、`InboxItemType`、`InboxItemCaptureStatus`、`InboxItemSyncStatus`，與 SPEC-002 的私人收件匣語意對齊。
- 新增 `src/store/useQuickCaptureStore.ts`：使用 `projed.quickCapture.inboxItems` localStorage key 保存本機快記，每筆預設 `captureStatus=untriaged`、`syncStatus=pending`。
- `src/components/QuickCaptureShell.tsx` 已移除：右下角快記 / 待整理浮窗不再掛載。
- 更新 `src/App.tsx`：移除 QuickCaptureShell 全域掛載，保留 PWA 安裝助理與 Toast。
- `useQuickCaptureStore` 保留，僅供舊本機收件匣資料被全域任務平台 `未歸位` lane 讀取、提升或遷移。
- 目前不做正式雲端 Inbox schema、不做跨裝置同步、不做轉正式 `TaskNode`；pending item 可本機保存、查看、標記完成或刪除。
- `verify:dev-034-pwa-install-guidance` 已調整為檢查 QuickCapture store、InboxItem 型別仍保留，但 QuickCaptureShell 不得再存在或根層掛載。
- `verify:dev-034-pwa-install-guidance-browser` 已調整為手機情境確認右下角快記浮窗與 toggle 不再渲染。

### 15.7 Slice B-C-D Verification

- `npm.cmd run verify:dev-034-pwa-install-guidance`: Pass，24/24。
- `npm.cmd run verify:dev-034-pwa-install-guidance-browser`: Pass。
- `npm.cmd exec tsc -- --noEmit`: Pass。
- `npm.cmd run lint -- --quiet`: Pass。
- `npm.cmd run build`: Pass，PWA 產物包含 `dist/sw.js`、`dist/workbox-6c1be909.js`、`dist/manifest.webmanifest`。
- QC report：`ai-doc/qc/QC-DEV-034-fast-start-pwa-install-guidance.md`
- 截圖證據：
  - `output/playwright/dev-034-quick-capture-before-login-mobile.png`
  - `output/playwright/dev-034-pwa-install-guidance-desktop.png`
  - `output/playwright/dev-034-pwa-install-guidance-mobile.png`

### 15.8 Blockers / Open Questions

Blockers：

- 無。DEV-034 目前 local-first 交付不需後端 schema。

Open questions：

- 後續正式雲端 Inbox 要沿用 SPEC-002 建立完整 `InboxItem` backend service，或先建立 Supabase/Firebase adapter。
- pending local InboxItem 跨裝置同步、正式任務轉換與今日區塊整合應作為 SPEC-002/DEV-004 系列後續範圍。

Deferred scope：

- 外部通知。
- 原生 App 包裝。
- AI 自動分類與自動轉任務。
- 雲端 Inbox schema 與正式任務轉換。

---

## 16. 文件狀態

本文件保存本對話已形成的產品決策、現況分析、差距分析、心理成因與實作建議。  
目前已建立 DEV-034，並完成 PWA 更新基礎、加入主畫面助理與 local-first pending queue；QuickCaptureShell 已退役並由 DEV-039 全域任務平台 `未歸位` lane 取代。後續若要做完整私人 Inbox、跨裝置同步與正式任務轉換，需接續 SPEC-002 另開或恢復對應交付點。
