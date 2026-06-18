# QA-DEV-026：Trello-like 看板分享體驗驗證計畫

狀態：Static + Browser Smoke Passed / DB Smoke Pending
對應 DEV：DEV-026
建立日期：2026-06-18

## 驗證目標

驗證 ProJED 的看板分享流程是否符合 Trello 使用者的既有心智模型：從看板右上角進入 `分享`，在單一 modal 內完成邀請、複製連結、查看成員與管理 pending invite。

## 範圍

- Topbar `分享` 入口。
- `分享看板` modal。
- Email invite create / list pending / revoke。
- 本次建立 invite URL copy。
- 看板成員列表與角色顯示。
- 權限不足時的 disabled reason。
- 設定頁 role permission matrix 不被移除。

不驗證：

- 真正寄信服務。
- 名稱 autocomplete。
- 新資料表或 migration。
- OAuth 登入流程本身；只回歸 token preserve 靜態檢查。

## 測試資料

- local-test 模式一張 active board。
- 至少一個可管理成員的帳號：owner/admin/project_manager。
- 至少一個 viewer 或無管理權限帳號。
- 測試 email：
  - `trello-share-dev026@example.invalid`
  - 長 email：`very.long.board.invite.address.dev026@example.invalid`

## Acceptance Criteria Traceability

| ID | Acceptance Criteria | Auto Evidence | Manual Evidence | Result |
|---|---|---|---|---|
| UX-026-001 | active board topbar 可見 `分享` 入口 | Browser locator | DOM snapshot | Passed |
| UX-026-002 | 點擊後開啟 `分享看板` modal，focus 在輸入框 | Browser locator + DOM snapshot | desktop/mobile smoke | Passed |
| UX-026-003 | 管理者可建立 pending invite | Static service-contract check + input enables CTA | DB/local create flow | Static Passed / DB Smoke Pending |
| UX-026-004 | 建立後可複製 invite URL | Static invite-token contract check | Clipboard check | Static Passed / DB Smoke Pending |
| UX-026-005 | Pending invite 可撤回 | Static revoke contract check | row absence after revoke | Static Passed / DB Smoke Pending |
| UX-026-006 | 成員 tab 顯示成員數、名稱、email、角色 | Browser DOM count/text | desktop smoke | Passed |
| UX-026-007 | 權限不足者管理動作 disabled 並顯示原因 | Static disabled reason check | role-specific browser run | Static Passed |
| UX-026-008 | 設定頁仍保留 role permission matrix | Static locator | settings screenshot | Passed |
| UX-026-009 | modal 在 1440x900 / 1024x768 / 390x844 不重疊、不裁切 | Browser geometry | manual UX review | Desktop + 390x844 Passed |
| UX-026-010 | Visible Error Sweep 通過 | DOM/text sweep | screenshot | Browser Smoke Passed |

## 測試案例

### TC-026-001：入口可發現性

步驟：

1. 以管理者登入 local-test。
2. 進入 active board。
3. 觀察 topbar 右側。

預期：

- `分享` 按鈕可見。
- 按鈕有使用者/邀請 icon。
- 不需要進入設定頁即可找到邀請入口。

### TC-026-002：建立邀請

步驟：

1. 點擊 `分享`。
2. 在 `電子郵件地址或名稱` 輸入 `trello-share-dev026@example.invalid`。
3. 確認角色 dropdown 預設為 `成員`。
4. 點擊 `分享`。
5. 切換或查看 `加入要求`。

預期：

- 顯示成功 toast。
- Pending invite row 顯示 email、角色、建立時間。
- `分享` CTA 在 loading 時 disabled，不重複送出。

### TC-026-003：複製邀請連結

步驟：

1. 在 TC-026-002 建立邀請後，點擊 `複製連結`。
2. 讀取 clipboard。

預期：

- Clipboard 包含目前 app origin 與 `boardInviteToken` query param。
- local-test / localhost 情境保留本機邀請提醒。
- 不顯示不可理解的空連結狀態。

### TC-026-004：撤回邀請

步驟：

1. 對 pending invite 點擊撤回或刪除。
2. 確認列表刷新。

預期：

- 該 pending invite 從列表消失。
- 若列表為空，顯示清楚 empty state。

### TC-026-005：看板成員 tab

步驟：

1. 開啟 `分享看板` modal。
2. 切到 `看板成員 N`。

預期：

- 成員數與 row 數一致。
- 每列顯示 avatar、名稱或 email、角色。
- owner 不可被移除或降級。

### TC-026-006：權限不足狀態

步驟：

1. 切換成 viewer 或無 `manage_board_members` capability 的帳號。
2. 開啟 `分享` modal。

預期：

- 可以查看成員。
- invite input、分享、角色變更、撤回、移除均 disabled。
- disabled reason 可見，不能只灰掉。

### TC-026-007：設定頁進階權限保留

步驟：

1. 進入設定頁。
2. 開啟權限設定 section。

預期：

- Role permission matrix 仍可見。
- 分享 modal 不承載完整權限矩陣。

## UI / UX QC

必測 viewport：

- `1440x900`
- `1024x768`
- `390x844`

檢查：

- modal 完整落在 viewport 內。
- 長 email 不造成水平 overflow。
- role dropdown、tabs、pending invite row、member row 不重疊或裁切。
- mobile 下主要流程可完成，不需非預期左右捲動。
- `Esc`、右上角關閉、overlay click 行為一致。

## Visible Error Sweep

每個關鍵 viewport 需記錄：

- URL/route。
- Screenshot path。
- `.inline-error` / `[role=alert]` text。
- visible `HTTP 4xx/5xx`、`Not Found`、`Internal Server Error`。
- visible `/api/` route error text。
- console/network failed requests。
- pass/fail decision。

## 建議驗證指令

```powershell
npm.cmd run lint -- --quiet
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
npm.cmd run verify:ontology-collaboration
npm.cmd run verify:dev-026-trello-like-board-share-ui
```

`verify:dev-026-trello-like-board-share-ui` 已由 RD 新增，覆蓋分享入口、modal 任務面、invite token contract、設定頁權限矩陣與穩定 selector；互動與 viewport 由 Browser smoke 補證。

## 實際驗證紀錄 - 2026-06-18

已執行：

```powershell
npm.cmd run verify:dev-026-trello-like-board-share-ui
npm.cmd exec tsc -- --noEmit
npm.cmd run lint -- --quiet
npm.cmd run build:test
npm.cmd run verify:ontology-collaboration
```

結果：

- `verify:dev-026-trello-like-board-share-ui`：14 pass / 0 fail。
- `tsc --noEmit`：pass。
- `lint --quiet`：pass。
- `build:test`：pass；僅保留既有 Vite dynamic import / large chunk warning。
- `verify:ontology-collaboration`：17 pass / 1 pending / 0 fail；pending 為 `supabase_db_role_smoke`，需 `--db` 或 `ONTOLOGY_COLLABORATION_DB_QC=true` 才會跑。
- Browser smoke：`http://127.0.0.1:4173/` desktop modal 可見，`data-board-share-dialog`、email/name input、members/requests 區域存在；390x844 mobile 下分享按鈕 hit target 命中、modal 寬 366px、無左右 overflow。
- Role label smoke：使用者可見角色名稱採 `擁有者`、`系統管理員`、`專案負責人`、`成員`、`檢視者`；底層 role key 不變。

## QC 判定

- 通過：所有 acceptance criteria 有自動或人工證據，且三個 viewport 無重疊、裁切、不可操作或 visible error。
- 未通過：分享入口不可見、modal 無法完成邀請、權限不足只灰掉無原因、pending invite 無法撤回、或 viewport 發生不可操作問題。
- 未充分驗證：只有 lint/build，缺少 browser flow、viewport screenshot 或 visible error sweep。
