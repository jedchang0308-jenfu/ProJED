# QA-DEV-027：Xmind-like 心智圖模式驗證計畫

狀態：Static + Browser Smoke Passed
對應 DEV：DEV-027
建立日期：2026-06-18

> 2026-06-18 UI Reopen：使用者截圖指出 branch connector line 斷裂；本輪另新增 Xmind-like 拖曳即時預覽動畫與同側拖放需求。新增專門驗證計畫 `ai-doc/qa/QA-DEV-027A-xmind-connector-line-visual-validation.md`；後續 RD 修復前，DEV-027 不得再只用原 browser smoke 判定 Xmind-like UI 通過。

## 驗證目標

驗證 ProJED 的 `心智圖` 模式是否能讓使用者用接近 Xmind 的方式建立與調整 WBS 任務階層，並確認所有操作都直接同步到既有任務資料，不產生獨立草稿或資料分叉。

## 範圍

- topbar `心智圖` 模式入口。
- active board title 作為中心主題。
- WBS 任務以分支節點顯示，節點只顯示任務名稱。
- `Enter` 新增同層任務。
- `Tab` 新增子任務。
- 雙擊、`F2` 或直接輸入改名。
- `Delete` / `Backspace` 刪除選取任務。
- 展開/收合。
- 拖曳調整同層排序與父子階層。
- 權限不足狀態。
- 清單、看板、甘特跨視圖資料同步。
- desktop / laptop / mobile viewport 基本可用性。

不驗證：

- Xmind 匯入/匯出。
- 關聯線、摘要框、邊界框、標記、貼紙、style panel、floating topic。
- 日期、負責人、狀態、標籤、依賴關係或進度顯示。
- 新資料表、migration 或後端 API。

## 測試資料

local-test active board 至少包含：

- root task A：`心智圖根任務 A`
- root task B：`心智圖根任務 B`
- child task A1：`心智圖子任務 A1`
- child task A2：`心智圖子任務 A2`
- grandchild task A1a：`心智圖孫任務 A1a`

權限角色：

- 可編輯角色：owner/admin/project_manager 或具備 `create_task`、`edit_task`、`move_task`。
- 只讀角色：viewer 或缺少任務編輯能力者。

## Acceptance Criteria Traceability

| ID | Acceptance Criteria | Auto Evidence | Manual Evidence | Result |
|---|---|---|---|---|
| UX-027-001 | topbar 可切到 `心智圖` | static verifier + browser locator | DOM evidence | Pass |
| UX-027-002 | active board title 顯示為中心主題 | browser DOM | center text evidence | Pass |
| UX-027-003 | WBS 任務只以任務名稱顯示 | static + browser text sweep | selector evidence | Pass |
| UX-027-004 | `Enter` 新增同層任務並同步清單 | browser flow | list input value evidence | Pass |
| UX-027-005 | `Tab` 新增子任務並同步清單 | browser flow | branch level evidence | Pass |
| UX-027-006 | 雙擊 / F2 / 直接輸入可改名 | browser flow | renamed title evidence | Pass |
| UX-027-007 | `Delete` 刪除選取任務且含子任務有防呆 | static + browser flow | confirm dialog evidence | Pass |
| UX-027-008 | 展開/收合只影響視圖不改資料 | static + selector support | n/a | Static Pass |
| UX-027-009 | 拖曳改排序或階層且不能造成 cycle | static guard | n/a | Static Pass |
| UX-027-010 | 無權限者不能新增、改名、刪除或移動 | static disabled reason | n/a | Static Pass |
| UX-027-011 | desktop/laptop/mobile 無不可讀重疊與破版 | browser geometry | viewport evidence | Pass |
| UX-027-012 | lint / typecheck / build / verifier 通過 | command output | n/a | Pass |

## 測試案例

### TC-027-001：模式入口與中心主題

步驟：

1. 以可編輯角色登入 local-test。
2. 進入 active board。
3. 點擊 topbar `心智圖`。

預期：

- 畫面進入心智圖模式。
- active board title 顯示為中心主題。
- root tasks 以主要分支顯示。

### TC-027-002：任務名稱分支顯示

步驟：

1. 進入心智圖模式。
2. 檢查 root、child、grandchild 任務。

預期：

- 每個任務節點只顯示任務名稱。
- 不顯示日期、負責人、狀態、標籤、進度。
- 子分支與既有 WBS 階層一致。

### TC-027-003：Enter 新增同層任務

步驟：

1. 選取 `心智圖根任務 A`。
2. 按 `Enter`。
3. 將新任務命名為 `Enter 新增同層任務`。
4. 切到清單模式。

預期：

- 新任務出現在 `心智圖根任務 A` 的同層。
- 清單模式可看到同一任務。
- 新任務 `parentId` 與原節點一致，`order` 位於合理 sibling 位置。

### TC-027-004：Tab 新增子任務

步驟：

1. 選取 `心智圖根任務 A`。
2. 按 `Tab`。
3. 將新任務命名為 `Tab 新增子任務`。
4. 切到清單模式。

預期：

- 新任務成為 `心智圖根任務 A` 的子任務。
- 清單模式呈現正確縮排。
- 看板或甘特讀取同一任務資料，不建立孤立草稿。

### TC-027-005：改名同步

步驟：

1. 在心智圖中雙擊 `心智圖子任務 A1`。
2. 改名為 `心智圖子任務 A1 已改名`。
3. 切到清單、看板、甘特。

預期：

- 三個視圖都顯示新名稱。
- 改名不改 parentId、order、日期或狀態。

### TC-027-006：刪除防呆

步驟：

1. 選取含子任務的 `心智圖根任務 A`。
2. 按 `Delete`。

預期：

- 系統不得靜默刪除整棵子樹。
- 需顯示明確確認或防呆文案。
- 使用者取消時資料不變。
- 使用者確認時走既有 soft archive 行為。

### TC-027-007：展開與收合

步驟：

1. 收合 `心智圖根任務 A`。
2. 重新展開。
3. 切換到清單模式再回到心智圖。

預期：

- 收合時子分支隱藏。
- 展開時子分支恢復。
- 收合狀態不得改變 WBS 資料；是否跨模式保存視 RD 決定，但不得造成資料變更。

### TC-027-008：拖曳階層

步驟：

1. 將 `心智圖子任務 A2` 拖到 `心智圖根任務 B` 底下。
2. 切到清單模式。
3. 嘗試將 `心智圖根任務 B` 拖到自己的子孫底下。

預期：

- 第一次拖曳後 `A2.parentId === B.id`。
- 清單模式顯示正確階層。
- 第二次拖曳被拒絕，不造成循環 parent chain。

### TC-027-009：權限不足

步驟：

1. 以 viewer 或缺少任務編輯能力角色進入心智圖。
2. 嘗試 `Enter`、`Tab`、改名、刪除、拖曳。

預期：

- 可瀏覽心智圖。
- 編輯操作不可用。
- 有 tooltip、toast 或狀態提示說明權限不足，不能只無反應。

## QA 驗證策略

QA 判定採「資料契約 + 互動流程 + UI 可用性」三層驗證：

1. 資料契約：心智圖不得建立獨立資料模型；新增、改名、刪除、拖曳都必須落在既有 WBS `TaskNode` 與 `useWbsStore`。
2. 互動流程：驗證 Xmind-like 核心肌肉記憶，包含 `Enter` 同層、`Tab` 子層、`F2` / 雙擊改名、`Delete` 刪除、展開收合、拖曳改階層。
3. UI 可用性：在 desktop、laptop、mobile viewport 中驗證節點可讀、可點、可捲動、狀態清楚、無可見錯誤或不可操作重疊。

HCS 驗證思考：

- `#目的`：此模式的目的不是多一個圖形視圖，而是讓使用者用心智圖完成 WBS 任務拆解。
- `#差距分析`：現有清單、看板、甘特已能管理任務，但不適合發散式規劃；QA 需驗證心智圖是否真的補上規劃媒介。
- `#可驗證性`：每個核心操作都要有可觀察證據，例如 DOM selector、store snapshot、跨視圖 input value、confirmation text、viewport geometry。
- `#設計思考`：主要使用者熟悉 Xmind；QA 需特別檢查快捷鍵與視覺結構是否符合既有心智模型。

## UI 驗證硬性 Gate

UI 驗證不得只用 lint、typecheck、build 或 static verifier 取代。QC 必須打開真實 rendered surface，並記錄 URL、viewport、時間、截圖或 DOM 證據。

必測 viewport：

| Viewport | 目的 | Pass 條件 |
|---|---|---|
| `1440x900` | desktop 主工作區 | topbar `心智圖` 可見；中心主題、左右分支與子分支不互相遮擋；節點可選取與編輯。 |
| `1024x768` | laptop / 窄桌面 | topbar 不擠壓主要操作；心智圖 canvas 可水平或垂直瀏覽；節點文字不溢出到相鄰節點。 |
| `390x844` | mobile portrait | 不要求全圖同屏顯示，但必須可捲動瀏覽；節點 hit target 仍可操作；toolbar 不遮住 canvas。 |

Visible error hard gate：

- `.inline-error`、`[role=alert]` failure text、load failed banner 任一可見即 Fail。
- 可見 `HTTP 4xx/5xx`、`Not Found`、`Internal Server Error`、`/api/` route error 任一出現即 Fail。
- Console error 或 network failed request 若導致使用者可見功能失效，即 Fail。
- 初始 fixture 預期有 WBS 任務時，`data-mindmap-node` 意外為 0 即 Fail；除非測試案例明確是 empty state。

UI 狀態必測：

- Loading / empty / normal state。
- Hover / focus / selected / editing / disabled state。
- 展開與收合 state。
- Delete confirmation modal。
- Toast 或 tooltip 的權限不足說明。
- 長任務名稱截斷或換行，不可覆蓋其他節點。
- RWD 下 topbar、左側欄、canvas、modal 不互相遮擋。

## UI FMEA

| 風險 | 可能影響 | 偵測方式 | Fail 條件 | 防呆 / 驗證 |
|---|---|---|---|---|
| 心智圖節點在窄 viewport 重疊 | 使用者無法讀取或點擊任務 | browser geometry + screenshot | 文字覆蓋、節點 hit target 小於可操作尺寸 | 檢查 1440x900、1024x768、390x844；確認 canvas 可捲動 |
| topbar 模式切換擠壓或消失 | 使用者找不到 `心智圖` 入口 | browser locator + visual sweep | `心智圖` button 不可見或不可點 | 檢查 active board topbar，包含 mobile |
| keyboard focus 不清楚 | 使用者不知道快捷鍵會作用在哪個任務 | DOM `aria-selected` + visual focus | 選取節點無明確樣式或 focus ring | 檢查 selected、focus、editing 三種狀態 |
| Delete 含子任務時靜默刪除 | 子樹意外移到回收桶 | browser flow + confirm text | 沒有確認文案就刪除子樹 | 必須出現含子任務數的 confirmation |
| 權限不足仍能編輯 | viewer 修改任務資料 | role browser run 或 static permission guard | viewer 可新增、改名、刪除或拖曳 | 驗證 disabled、toast、tooltip 與 store 不變 |
| 拖曳造成 cycle | WBS 階層壞掉 | static cycle guard + drag scenario | 任務可被拖到自己的子孫底下 | 驗證 `wouldCreateCycle` 與 drop rejection |
| 心智圖資料與清單不同步 | 形成獨立草稿或資料分叉 | cross-view sync flow | 心智圖新增後清單找不到同任務 | 切到清單檢查 `input[placeholder="任務名稱"]` value |
| visible runtime error 被忽略 | 使用者看到壞畫面但 QA 誤判 Pass | visible error sweep | 可見錯誤存在 | QC report 必須記錄 URL、viewport、錯誤文字 |

## UI 驗證執行腳本

### UI-027-001：Desktop 可用性

1. 開啟 `http://127.0.0.1:4173/`。
2. 設定 viewport `1440x900`。
3. 點擊 topbar `心智圖`。
4. 記錄 `data-mindmap-view`、`data-mindmap-center`、`data-mindmap-node` 數量。
5. 點選第一個節點，確認 selected/focus 樣式清楚。
6. 雙擊或按 `F2`，確認 input 進入 editing state 且文字不溢出。
7. 執行 visible error sweep。

Pass：中心主題可見、節點可讀可點、selected/editing 狀態清楚、無 visible runtime error。

### UI-027-002：Laptop / 窄桌面可用性

1. 設定 viewport `1024x768`。
2. 重新載入或保留同一頁 hard refresh。
3. 進入 `心智圖`。
4. 檢查 topbar 模式切換、分享/紀錄/AI 分析等鄰近 controls 不遮擋心智圖入口。
5. 檢查 canvas scroll 行為；中心主題與主要分支至少可透過捲動操作抵達。
6. 執行 visible error sweep。

Pass：入口可操作、canvas 可瀏覽、節點不縮到不可讀。

### UI-027-003：Mobile portrait 可用性

1. 設定 viewport `390x844`。
2. 進入 `心智圖`。
3. 檢查心智圖區塊不被 toolbar 或 sidebar 完全遮住。
4. 檢查內層 canvas `scrollWidth > clientWidth` 時可水平瀏覽。
5. 點選節點並確認 hit target 可操作。
6. 執行 visible error sweep。

Pass：mobile 不要求全圖同屏，但必須可瀏覽、可點、可讀，且沒有不可操作的縮小節點。

### UI-027-004：Modal / Toast / 權限 UI

1. 選取含子任務的節點並按 `Delete`。
2. 確認 modal 文案包含任務名稱或子任務數。
3. 取消時資料不變；確認時節點進入 soft archive。
4. 以 viewer 或缺少權限角色進入，嘗試新增、改名、刪除、拖曳。
5. 檢查 disabled reason、toast 或 tooltip，不可只有無反應。

Pass：高風險操作有明確防呆；權限不足時有可理解的 UI 回饋。

## QC Handoff 條件

QA 計畫交給 QC 前，必須具備：

- Acceptance criteria traceability 已覆蓋資料、互動、UI、權限、viewport。
- Browser UI 腳本已列明 URL、viewport、操作步驟、pass/fail 條件。
- Visible error sweep 已列為 hard gate。
- 至少一個 cross-view sync 驗證，證明心智圖不是獨立草稿。
- 拖曳與 viewer role 若未做 browser run，必須在 QC 報告中明確標示為 static pass 或待補 E2E。

## UI / UX QC

必測 viewport：

- `1440x900`
- `1024x768`
- `390x844`

檢查：

- 中心主題、主要分支、子分支不出現不可讀重疊。
- 節點文字不溢出節點框；長任務名稱可截斷或換行，但不能覆蓋相鄰節點。
- 分支線不遮擋節點文字。
- mobile 下可水平或垂直瀏覽整張心智圖，不產生不可操作的縮小節點。
- keyboard focus、selected node、editing node 狀態清楚可辨識。
- 右側紀錄欄、RAG 側欄或全域 modal 若開啟，不會讓心智圖操作失效。

## Visible Error Sweep

每個關鍵 viewport 需記錄：

- URL / route。
- Screenshot path。
- visible alert / inline error / toast。
- visible `HTTP 4xx/5xx`、`Not Found`、`Internal Server Error`。
- console error。
- network failed requests。
- pass/fail decision。

## 建議驗證指令

```powershell
npm.cmd run lint -- --quiet
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
npm.cmd run verify:core-regression-static
npm.cmd run verify:dev-027-xmind-like-mind-map-mode
npm.cmd run verify:dev-027-xmind-like-mind-map-browser
```

## 實際驗證紀錄

執行日期：2026-06-18

Static gates：

- `npm.cmd run verify:dev-027-xmind-like-mind-map-mode`：Pass，23 checks。
- `npm.cmd run verify:dev-027-xmind-like-mind-map-browser`：Pass，覆蓋 Playwright mouse drag 階層調整、cycle guard、mobile viewport、viewer 唯讀權限。
- `npm.cmd exec tsc -- --noEmit`：Pass。
- `npm.cmd run lint -- --quiet`：Pass。
- `npm.cmd run build:test`：Pass；保留既有 Vite dynamic import / chunk size warning，非 DEV-027 新增阻塞。
- `npm.cmd run verify:core-regression-static`：Pass，10 checks。

Browser smoke：

- URL：`http://127.0.0.1:4173/`
- Desktop viewport：`1440x900`
- Mobile viewport：`390x844`
- 入口與中心主題：`data-mindmap-view` 數量 1，中心主題為 `ProJED 品質驗證測試看板`，任務節點 16。
- Keyboard/edit/delete flow：`DEV027-smoke-*` 測試任務新增 root 後 nodeCount 16 -> 18；`Tab` 建立 child level 2；`F2` 改名成功；刪除 root 顯示 `包含 1 個子任務` 確認文案；確認後 nodeCount 回到 16 且無 smoke title 殘留。
- Cross-view sync：`DEV027-sync-*` 任務在心智圖新增後，切到清單模式可於 `input[placeholder="任務名稱"]` value 找到；回心智圖刪除後 nodeCount 回到 16。
- Mobile geometry：390x844 下內層 canvas `scrollWidth` 1620、`clientWidth` 134，節點維持約 38px 高度，可橫向瀏覽；未偵測 visible `Internal Server Error` / `Not Found` / `HTTP 4xx/5xx` / `TypeError` / `ReferenceError`。

限制註記：

- 拖曳階層與 cycle guard 本輪以 static verifier 驗證 source invariant；未額外建立 Playwright pointer drag runner。
- viewer/無權限角色本輪以 `useBoardPermissions` guard 與 static verifier 驗證；未額外切換 viewer role 做 browser run。

## QC 判定

通過：

- 所有 acceptance criteria 有自動或人工證據。
- 新增、改名、刪除、拖曳都直接同步到 WBS 任務。
- 不發生循環 parent chain。
- desktop/laptop/mobile 沒有不可操作或不可讀 UI 問題。

未通過：

- 心智圖只顯示資料但不能直接編輯。
- 任務變更只存在心智圖草稿，未同步 WBS。
- `Enter` / `Tab` 行為與同層/子層語意不一致。
- 刪除含子任務節點時缺少防呆。
- 拖曳造成資料循環或任務遺失。
- 無權限者可以修改任務。

未充分驗證：

- 只有 lint/build，缺少鍵盤流程、跨視圖同步、drag hierarchy 或 viewport smoke。
