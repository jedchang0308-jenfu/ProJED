# QA-DEV-108 任務明細會議補記持續呈現驗證計畫

- 狀態：`Executed / PASS / Local-only / NOT RELEASED`
- 日期：2026-09-07
- 對應：DEV-108、SPEC-108
- 風險：Medium
- Evidence rule：以 deterministic 資料證據、真實 browser flow、TypeScript、build 與 targeted regression
  結果判定；本文件只宣告本機執行範圍，正式 provider／release gate 仍未執行。

## 1. QA 目標與範圍

驗證任務明細人工補記具有穩定 provenance、同一 meeting record aggregate 生命週期、active draft／
persisted 去重、archive 保留、source delete 移除、第一層 latest-3 UI、錯誤恢復與跨 viewport 可用性。

不驗證：新的永久刪除 UI、多人同步、通知、搜尋、AI 產生 quick-note entry、production deployment、
database migration 或 mobile meeting composer。

## 2. 測試 fixture 與入口

### 2.1 固定資料

- Workspace／board：local-test owner 可讀寫看板；權限沿用既有 record/task 契約，本 DEV 不重測角色矩陣。
- Task A：active L1；Task B：active L2；兩者都可從正常看板 task activation 開啟 `TaskDetailsModal`。
- Meeting M1：active draft，Task A 有四筆 valid v1 entries；含一行人工相似格式但無 metadata。
- Meeting M2：published，Task A 有一筆 valid entry，另含 AI 整理與任務活動文字。
- Meeting M3：archived，Task A 有一筆 valid entry且 task link 保留。
- Meeting M4：metadata unknown version／malformed，正文仍有效，供 fail-safe 使用。
- Legacy M0：DEV-009 格式正文與 task link，但無 `meetingTaskQuickNotes`。
- 長文：120 字中文、多行、長英文 token、URL、emoji 與 IME 組字。

每個 entry 固定 `id`、`occurredAt` 與預期 taskId；測試不得依執行當下分鐘推算 expected order。

### 2.2 UI Entry Contract

- URL：local QA primary runtime `http://localhost:4000/`，沿用既有登入與 board fixture。
- Desktop／laptop：看板 → 點任務名稱開任務明細；會議中由既有「會議紀錄」入口建立／開啟 meeting draft。
- Mobile 390：只從一般看板開 task details 驗證歷史列表；不得嘗試啟用 meeting composer。
- Role：主要流程 owner；provider test 只確認 query option 不移除既有 tenant／project／task link 條件。

## 3. Deterministic／static gate

執行 `npm run verify:dev-108-task-meeting-note-persistent-list`，至少覆蓋：

1. absent metadata → empty；valid v1 round-trip；unknown version／malformed／duplicate id → invalid 且原值未被覆寫。
2. append 同步產生 content line、entry、task link；空白 denied；相同 submissionId 重送為 noop。
3. 兩次同 task／同分鐘仍有唯一 id、lineIndex／sourceToken 與穩定 projection。
4. 同行只改正文文字時保留 entry id 並更新 text；在前方插入其他行可用唯一候選 remap；刪行、改 task
   token／time token 時 detach provenance。
5. 同分鐘同 task 的多候選若無法唯一識別，必須 fail closed；不得把 entry 錯配到另一行，正文不得丟失。
6. 人工新增相似行、AI 文字、task activity、legacy DEV-009 行不得被推導成 entry。
7. AI synthesis 合併在 quick-note 前插入／重排其他章節時 rebase lineIndex 且 invariant 保持；projection 遺失
   或多候選歧義時 synthesis 失敗並還原原草稿。Project-change／reservation metadata compose 後 namespace
   不遺失；反向亦同。
8. active draft override saved record；`${record.id}:${entry.id}` 去重；`occurredAt + record.id + entry.id` total order。
9. latest 1／3／4／10 筆 projection、`其餘 N 筆` count 與 `MM/DD` 日標籤正確，列表不顯示時分。
10. Firestore、Supabase、local-test `listByNode` 預設排除 archived；`includeArchived:true` 包含 archived，且不放寬
   workspace／board／task link／record type 條件。
11. append denied、task-scoped load reject、remote save reject：不得產生 optimistic 假資料；輸入／draft recovery
    狀態符合 SPEC-108。
12. `getRecordDraftSignature` 與 DEV-106 snapshot 對 metadata entry 變更敏感，restore 後 identity／text／time 不變。

## 4. Browser scenarios

### B01 加入後立即可見

1. 1440×900 進入 meeting mode，開 Task A。
2. 輸入 `決議先完成測試，再確認交期` 並按「加入」。
3. 斷言第一層列表立即出現完全相同文字與固定時間，draft content 有 task token，輸入已清空。
4. 快速雙擊／重送同一 submission 不得出現第二筆。

### B02 快捷鍵與輸入邊界

- 以 `Ctrl／Cmd + Enter` 提交長文；確認 normalized 顯示、focus 可繼續使用。
- 空白／全換行不提交；IME composition 未完成時不得誤送。

### B03 跨模式持續

1. 儲存 draft，關閉任務、重新開啟。
2. 結束 meeting mode；再次開 Task A。
3. reload app 並重開 Task A。
4. 三次皆顯示同一 entry；非 meeting mode 不存在 textarea／「加入」。

### B04 active draft continuity

- 在 draft 未 remote save 前加入一筆；觸發 local recovery flush、save draft、publish transition。
- 每個轉換畫面不得出現 0 筆或 2 筆的中間狀態，entry id 與排序不變。

### B05 修改同步

1. 從既有紀錄 editor 開 M1，只修改某 quick-note 正文文字並儲存。
2. 回 Task A，斷言同一 entry 顯示新文字，無舊文字／副本。
3. 再刪除該正文列並儲存，斷言 entry 移除。
4. 新增一行外觀相同但沒有既有 provenance，斷言不出現在 Task A。
5. 在目標列前插入一般文字行，斷言 entry 能以唯一候選 remap；建立同 task／同分鐘多候選時不得錯配，
   原正文仍保留。

### B06 archive 與 source absence

- 透過既有 record archive 操作封存 M3，重開／reload Task A，M3 entry 仍存在。
- QA fixture 從 provider 移除 M3 source row，重新載入後 M3 entry 消失；不新增永久刪除 UI。

### B07 latest-3 與精簡 UI

- 一至三筆全部可見。四筆以上預設只顯示最新三筆且正序，新加入列位於三筆內。
- 「其餘 N 筆」數量正確；展開在原位置顯示全部，收合後恢復三筆，未開 Modal／Drawer。
- DOM／畫面確認：無列表外卡、每列框、icon、badge、搜尋、helper、空狀態、常駐成功文字。
- 任務明細順序為：基本資料、任務說明、會議紀錄、其他備註、子任務。

### B08 failure／recovery

- 注入 append invalid metadata：輸入保留、無新列、就地錯誤可重試。
- 注入 archived history load failure：不得顯示假空白；active draft entry 保留，顯示最短載入失敗與重試。
- 注入 remote save failure：draft／entry 保留；重試 save 不重複。
- 注入 DEV-106 IndexedDB failure：entry 留在記憶體並顯示既有 degraded/error；恢復後 identity 不變。

### B09 Accessibility／viewport

| Viewport | 驗證 |
|---|---|
| 1440×900 | meeting composer + list；任務說明／備註／子任務均可達，無多焦點或遮擋。 |
| 1024×768 | modal 捲動、long text、展開全部；無水平 overflow、按鈕擠壓或雙重捲動。 |
| 390×844 | 非 meeting 的持續列表可讀／可展開；既有 mobile meeting composer 仍 unavailable。 |

鍵盤必測：Tab 順序與視覺順序一致、textarea → 加入 → 展開控制可達、Enter／Space 操作展開、Escape
只執行既有 modal 行為；focus 不遺失。檢查 `aria-expanded`、控制 accessible name、200% zoom、移除顏色後
仍可辨識。此 Medium lane 以語意 DOM／keyboard 為 gate；screen reader 實機可列 supplemental，未執行不得
寫成已通過。

## 5. Regression gate

最低命令矩陣：

```text
npm run verify:dev-108-task-meeting-note-persistent-list
npm run verify:dev-108-task-meeting-note-persistent-list-browser
npm run verify:dev-009-task-detail-quick-note
npm run verify:dev-066-task-note-rich-text
npm run verify:dev-106-meeting-local-safety
npx tsc --noEmit
npm run build:test
git diff --check
```

另對 DEV-008 task knowledge 與 DEV-024 synthesis 執行其直接 targeted verifier；若 package script 名稱不同，
QC 必須記錄實際命令與結果，不得只寫「已回歸」。Targeted ESLint 至少涵蓋 DEV-108 新增／修改的 TS/TSX。

## 6. Evidence package

- Static JSON：`output/playwright/dev-108-task-meeting-note-persistent-list/static-result.json`
- Browser JSON：`output/playwright/dev-108-task-meeting-note-persistent-list/result.json`
- 截圖：desktop immediate、desktop expanded、laptop long/error、mobile persistent-list 各至少一張。
- 每個 scenario 保存：fixture ids、entry ids、viewport、route、角色、expected／actual、console errors、page errors、
  failed requests、horizontal overflow 數值與 screenshot path。
- Source absence／archive 必須保存 provider readback；active-draft continuity 必須保存每一步 rendered key count。
- QC 報告建立於 `ai-doc/qc/QC-DEV-108-task-detail-meeting-note-persistent-list.md`，已記錄本機 PASS、證據路徑與未執行的正式環境邊界。

## 7. Pass／Fail gate

全部 P0/P1 情境與 regression gate 通過，且 browser evidence 可重現，才可標 `QA-QC PASS`。

任一下列情況直接 Fail 並回 RD：來源誤分類、資料複製到 TaskNode、append 假成功、entry 重複／短暫消失、
archive 後遺失、source delete 後 stale 顯示、內容修改不同步、unknown metadata 被覆寫、load error 被當空白、
mobile composer 意外出現、keyboard/focus 阻斷、水平 overflow、可見 runtime error 或非預期 4xx/5xx。

使用思考習慣：#效用理論、#系統描繪、#可驗證性
