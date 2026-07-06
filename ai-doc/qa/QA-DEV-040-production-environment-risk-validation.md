# QA-DEV-040: 正式環境同型 BUG 風險驗證計畫

狀態: QA Plan Complete / Local + P0 Addendum QC Executed / P0 Remote Read-only Preflight Executed / Production Smoke Executed for Original BUG Flows / Extended Matrix Partially Covered
關聯 DEV: DEV-040
建立日期: 2026-07-03
參考規格: `ai-doc/specs/SPEC-040-production-environment-risk-hardening.md`

## QA Objective

驗證正式環境同型 BUG 是否已被消除，重點不是只確認 happy path，而是確認正式環境常見的慢查詢、timeout、OAuth / Supabase 權限、workspace / board 快速切換、hard reload 與 localStorage 語意下，系統不會卡住、不會 silent data loss、不會 stale response 覆蓋當前畫面。

使用思考習慣: #可驗證性、#風險分級、#多層次分析

## Entry Criteria

- 已確認本輪要驗證的 phase：Phase 1、Phase 2、Phase 3 或 production Phase 4。
- 測試環境至少包含 local-test 與 production-like Supabase；若要宣稱正式環境修復，必須包含正式環境 smoke。
- 測試帳號具有至少 2 個 workspace、每個 workspace 至少 2 個 board。
- 至少一個 board 含多層任務、dependencies、members、tags、record activity events。
- QC 可取得 Console、Network、DB count 或 localStorage evidence。

## Exit Criteria

- P0 case 全部通過，且沒有 infinite spinner、silent data loss、unhandled promise rejection。
- P1 case 快速切換後最終 UI 只反映當前 workspace / board。
- P2 case 有清楚的 timeout / retry / local-only 語意證據。
- 所有 fail 都有截圖、log、重現步驟與對應 RD blocker。
- 若未做 production smoke，不得宣稱正式環境已修復，只能宣稱 local / production-like QC passed。

## Failure Severity

| Severity | 判定條件 |
|---|---|
| P0 | 資料消失、資料錯寫、正式環境無限卡住、AI / RAG 偽成功、匯入 partial success 但 UI 宣稱成功。 |
| P1 | 快速切換後顯示錯 workspace / board 的成員、標籤、任務或權限；active id / temp id race 造成空白畫面。 |
| P2 | 外部服務失敗 UX 不清楚、local-only 語意未標示、需要 reload 才恢復、非主資料偏好消失但未破壞任務。 |

## FMEA Matrix

| ID | 風險 | Likelihood | Impact | Detection | Priority | QA focus |
|---|---|---:|---:|---:|---|---|
| FMEA-040-001 | 備份匯入後 dependencies 消失 | 3 | 5 | 3 | P0 | 匯入、hard reload、DB count、UI dependency lines |
| FMEA-040-002 | RAG / 知識檢索 timeout 卡住 | 3 | 5 | 3 | P0 | Edge/Gemini delay、timeout、visible fallback |
| FMEA-040-003 | 新增看板 temp id race | 3 | 4 | 3 | P1 | 快速切換、reload、temp id 不殘留 |
| FMEA-040-004 | member stale response | 3 | 4 | 3 | P1 | A/B board 角色不同、舊 response 晚回覆 |
| FMEA-040-005 | tag sync stale response | 3 | 4 | 3 | P1 | workspace A/B tag 不同、filter invalid id |
| FMEA-040-006 | Google Calendar fetch 無 timeout | 2 | 4 | 3 | P2 | 401/500/timeout/50 items batch |
| FMEA-040-007 | MindMap localStorage-only 語意 | 2 | 3 | 2 | P2 | clear localStorage、cross-browser、主資料不破壞 |

## Common QC Evidence

每個 case 都要保留：

- 操作前截圖。
- 操作後截圖。
- hard reload 後截圖，若該 case 涉及 persistence。
- Console error sweep。
- Network 4xx / 5xx / timeout evidence。
- DB count 或 localStorage key evidence。
- 測試帳號、workspace、board、瀏覽器與環境。

Fail conditions:
- loading / spinner 超過該 case 規定時間且沒有可見錯誤。
- UI 宣稱成功但 DB / localStorage evidence 不一致。
- 切換後顯示前一 workspace / board 的資料或 CTA。
- unhandled promise rejection、React crash、空白畫面。

## Test Cases

### QA-P0-001: 備份匯入 dependencies 後 reload 不消失

Precondition:
- 測試備份檔包含至少 5 個 tasks、3 條 dependencies、跨層級 from/to。

Steps:
1. 在測試 board 匯入備份。
2. 確認 UI 任務數與依賴線顯示。
3. 查 DB `wbs_dependencies` count 或用既有診斷工具取得 dependency count。
4. hard reload。
5. 切換到另一 board 再切回。
6. 再次確認 UI 任務數、依賴線與 DB count。

Expected:
- dependencies count 匯入後、reload 後、切回後都一致。
- from/to 指向正確新 task identity。
- 沒有 partial success toast。

Fail:
- DB count 為 0、UI 依賴線消失、任務仍在但 dependencies 消失。

Evidence:
- 匯入前 / 後 / reload 後截圖。
- DB count。
- Console / Network。

### QA-P0-002: 備份匯入失敗不得 silent partial success

Steps:
1. 使用含非法 dependency target 的測試備份。
2. 執行匯入。
3. 觀察 UI error 與資料狀態。
4. hard reload。

Expected:
- UI 顯示匯入失敗或 partial failure summary。
- 不得宣稱完整成功。
- 既有正式資料不被清空。

Fail:
- UI 顯示成功但 dependencies 少於預期。
- 既有 board 資料被清空或覆蓋。

### QA-P0-003: RAG 正常查詢仍回傳可用結果

Steps:
1. 以已登入 production-like Supabase 帳號開啟 RAG / 知識檢索。
2. 問一個可命中目前 board 任務與紀錄的問題。
3. 檢查回覆、引用或 evidence。

Expected:
- 查詢在合理時間內完成。
- 結果只包含登入者有權限的 board / workspace 資料。
- 無 Console error。

Fail:
- 回覆跨權限資料、引用不存在資料或無限 loading。

### QA-P0-004: RAG timeout / Edge Function delay 有可見結束

Steps:
1. 用測試設定、mock、network throttling 或 Edge Function 測試開關製造延遲。
2. 送出 RAG query。
3. 等待 timeout 閾值加 5 秒。

Expected:
- UI 結束 loading，顯示 timeout / retry / fallback。
- 不生成偽引用。
- Console 無 unhandled rejection。

Fail:
- spinner 無限轉。
- UI 顯示成功但無 evidence 或產生偽引用。

### QA-P0-005: RAG 401 / 500 / network error 顯示可理解錯誤

Steps:
1. 模擬 token 過期或 Edge Function 500。
2. 送出 query。
3. 觀察 UI 與 Network。

Expected:
- 401 顯示重新登入或權限提示。
- 500 / network error 顯示稍後重試。
- 不污染先前成功結果。

### QA-P0-006: 既有正式環境已發生 BUG 回歸

Steps:
1. 在正式環境或 production-like 環境執行「新增會議記錄 > 匯入 > 整理專案變化」。
2. 日期範圍選含多筆 activity events。
3. 再用 delay / error 情境重跑。

Expected:
- 正常情境會完成並插入內容。
- delay / error 情境會在 timeout 後可見結束。
- 使用者可重試或縮短日期範圍。

Fail:
- 卡住不動、按鈕一直 disabled、沒有錯誤文字。

### QA-P1-001: 新增看板後立即切換不留下 temp id

Steps:
1. 在 Workspace A 新增 board。
2. 新增後 0-2 秒內切換 view、切到另一 board、再切回。
3. hard reload。

Expected:
- activeBoardId 最終為後端正式 id。
- 不出現空白 board 或首頁跳轉。
- localStorage / store 不殘留 temp id。

Fail:
- URL / activeBoardId 指向 temp id。
- 新 board 消失或 duplicated ghost board。

### QA-P1-002: 新增看板後端失敗不產生 ghost board

Steps:
1. 模擬 Supabase create board 失敗。
2. 新增 board。
3. reload。

Expected:
- UI 顯示失敗。
- ghost board 被移除。
- active board 回到安全狀態。

### QA-P1-003: Board create 與 workspace sync 競態

Steps:
1. 在 Workspace A 新增 board。
2. 同時觸發 workspace / board sync 或切換 Workspace B。
3. 回到 Workspace A。

Expected:
- Workspace A 的 board list 與 DB 一致。
- Workspace B 不出現 Workspace A 的新 board。

### QA-P1-004: member stale response 不覆蓋目前 board

Precondition:
- Board A: 使用者為 owner/admin。
- Board B: 使用者為 viewer 或權限較低。

Steps:
1. 開啟 Board A members panel。
2. 快速切到 Board B。
3. 人為延遲 Board A 的 members response。
4. 觀察 Board B members panel 與 CTA。

Expected:
- Board B 顯示 Board B 成員與權限。
- Board A 舊 response 不覆蓋 Board B。
- viewer 不看到可操作 owner/admin CTA。

Fail:
- Board B 顯示 Board A 成員或邀請按鈕。

### QA-P1-005: member reload / realtime 後仍符合當前 context

Steps:
1. A/B board 快速切換 5 次。
2. 觸發 member realtime update。
3. hard reload。

Expected:
- 最終 members / pending invites / CTA 都符合當前 board。

### QA-P1-006: tag workspace stale response 不污染另一 workspace

Precondition:
- Workspace A 只有 tag `A-only`。
- Workspace B 只有 tag `B-only`。

Steps:
1. 在 Workspace A 開啟 filter 並選 `A-only`。
2. 快速切到 Workspace B。
3. 延遲 Workspace A tag response。
4. 觀察 Workspace B tag list 與 filter state。

Expected:
- Workspace B 不顯示 `A-only` 可選 tag。
- invalid tag filter 被清除、停用或標示 unavailable。

Fail:
- Workspace B filter 仍套用 `A-only` 並影響結果。

### QA-P1-007: tag create / delete 不寫入錯 workspace

Steps:
1. Workspace A 建立新 tag。
2. 立即切 Workspace B 並刪除另一 tag。
3. reload 兩個 workspace。

Expected:
- 新 tag 只存在 Workspace A。
- 刪除只影響 Workspace B 指定 tag。

### QA-P1-008: 已發生未歸位任務消失 BUG 回歸

Steps:
1. 在全域任務平台新增未歸位任務。
2. 切換到不同 board。
3. 切回原 board。
4. hard reload。

Expected:
- 未歸位任務仍顯示。
- title、status、date、assignee、tags 或詳情資訊不遺失。
- 任務未重複出現在多個 lane。

Fail:
- 任務消失、變成空白、重複或被錯誤歸位。

### QA-P1-009: 快速切換不造成 visible error / blank page

Steps:
1. 在 board / workbench / members / tags 同時可見的情境下快速切換 board 10 次。
2. 觀察 UI 與 console。

Expected:
- 沒有空白畫面、React crash、unhandled promise rejection。
- 最終畫面符合最後一次選取的 board。

### QA-P2-001: Google Calendar 正常 sync

Precondition:
- 測試 Google 帳號已授權 Calendar scope。
- ProJED 有 10 筆可同步 task。

Steps:
1. 執行同步。
2. 檢查成功統計與 Calendar events。

Expected:
- 同步完成。
- UI 顯示成功數。
- 無 Console error。

### QA-P2-002: Google Calendar token expired / 401

Steps:
1. 使 access token 過期或撤銷授權。
2. 執行同步。

Expected:
- UI 顯示需要重新授權。
- 不持續 retry 到卡死。

### QA-P2-003: Google Calendar 500 / timeout 有可見結束

Steps:
1. 用 network throttling 或 mock 讓 API 500 / timeout。
2. 執行同步。
3. 等待 timeout 閾值加 5 秒。

Expected:
- UI 結束 loading，顯示失敗與 retry。
- 已成功部分有清楚統計；未成功部分不宣稱完成。

### QA-P2-004: Google Calendar 50 筆批量同步可結束

Steps:
1. 建立 50 筆以上同步項目。
2. 執行 syncAll。
3. 中途製造部分 API failure。

Expected:
- 同步流程結束並回報成功 / 失敗統計。
- 不因單筆 failure 卡住全部 UI。

### QA-P2-005: MindMap localStorage reload / board switch

Steps:
1. 在心智圖建立 note relationship 與 root side override。
2. reload。
3. 切換 board 再切回。

Expected:
- 若定位為本機偏好，資料在同 browser localStorage 中維持。
- 不影響 WBS 任務主資料。

### QA-P2-006: MindMap clear localStorage / cross-browser 語意

Steps:
1. 建立 note relationship 與 root side override。
2. 清除 localStorage 或改用另一 browser。
3. 開啟同 board。

Expected:
- 若定位為本機偏好，relationship / side override 可消失，但 UI 不得宣稱已永久保存為專案資料。
- 任務 nodes、status、dates、dependencies 不受損。

Fail:
- 使用者以為專案資料已保存但換裝置消失。
- 清 localStorage 造成任務主資料損壞。

## Regression Gate

本 DEV 任一 phase 若進 RD，QC 至少加跑：

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run verify:dev-011-ai-meeting-synthesis`
- `npm run verify:dev-020-record-workflow-redesign`
- `npm run verify:dev-020-project-change-import-browser`
- `npm run verify:dev-039-task-workbench-placement-lanes`
- `npm run verify:dev-039-task-workbench-placement-lanes-browser`

視觸及範圍加跑：

- RAG：`npm run verify:p9-edge-function` 或既有 RAG verifier。
- Calendar：calendar service / subscription 相關 verifier；若觸及 DEV-037，需加跑 `verify:dev-037-calendar-subscription-source-scope`。
- MindMap：`verify-dev-027g-mindmap-system-health` 或相關心智圖 verifier。

## Production Smoke Addendum

若使用者授權 production release，QC 必須補：

- 正式 URL。
- 登入帳號與權限角色。
- 7 個風險點各至少 1 張截圖或錄影。
- Network / Console error sweep。
- DB count 或 localStorage evidence。
- rollback readiness。

未完成 production smoke 前，只能回報「local / production-like passed」，不得回報「正式環境已修復」。

## P0 Remote Read-only Preflight Addendum - 2026-07-07

本 addendum 只允許 read-only production / Edge / DB evidence，不允許 remote migration、Edge deploy、production timeout injection 或正式資料異動。

Read-only evidence accepted:
- Supabase project health、Edge Function slug / version / `verify_jwt` / deployed source parity。
- `wbs_dependencies` table existence、columns、RLS、constraints、policies、indexes、row count。
- `match_project_knowledge` DB RPC existence、execute grants、tenant/project filter source coverage。
- Security / performance advisors classification。

Pass / fail interpretation:
- Pass：production DB substrate exists and is compatible with DEV-040 P0 dependency persistence checks。
- Fail / pending：deployed Edge Function does not contain the local timeout guard; this blocks claiming RAG timeout is live-protected until Edge deploy + production timeout smoke are executed.
- Advisor warnings are not auto-fail for this read-only gate, but any DEV-040-related warning must be recorded as a future DB hardening candidate.
