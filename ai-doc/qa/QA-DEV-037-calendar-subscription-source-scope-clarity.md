# QA-DEV-037: 行事曆訂閱來源範圍清晰化驗證計畫

關聯 DEV：DEV-037
關聯 SPEC：`ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md`
狀態：Ready for RD / QC Pending
建立日期：2026-06-29

## 驗證目標

確認行事曆訂閱頁能明確區分 Workspace 與 Board 來源，且 `.ics` feed 的實際資料範圍與 UI 顯示一致。此 DEV 的驗證重點不是只看畫面文案，而是要同時驗證資料契約、權限、Edge Function feed 與 UI summary。

## Zero-Tolerance Failures

- UI 顯示 `目前看板`，但 feed 實際輸出其他看板任務。
- 訂閱列表沒有顯示來源類型與 Workspace / Board path。
- 既有 legacy 訂閱變成無法讀取、無法修改或來源顯示為空白。
- 使用者可用 `project_ids` 訂閱自己沒有權限的 Board。
- 成員資格被移除後，舊 token 仍能讀到該範圍任務。
- `重新產生連結` 造成來源範圍或條件被意外改變。

## Static Verification

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-037-S01 | 文件 | SPEC / QA / dev_task / documentation_map / backlog 均包含 DEV-037 |
| QA-037-S02 | Type contract | `CalendarSubscriptionFilters` 支援 `scope_type` 與 `project_ids`，並保留 legacy `workspace_ids` |
| QA-037-S03 | Service normalizer | create/update 時會 resolve workspace ids 與 project ids，且不丟失 `scope_type` |
| QA-037-S04 | Database validation | `calendar_subscription_filter_allowed` 驗證 `scope_type`、`project_ids`、project-to-workspace 關係與使用者權限 |
| QA-037-S05 | Edge Function | feed query 依 scope 套用 tenant 與 project filters，不只看 `workspace_ids` |
| QA-037-S06 | Legacy handling | 缺少 `scope_type` 的既有訂閱被顯示為 `工作區全部看板` |
| QA-037-S07 | UI labels | 建立表單第一段為 `訂閱範圍`，不再使用孤立 `工作區` 作為主要 label |
| QA-037-S08 | Subscription summary | 每筆訂閱卡片都有 `來源` 與 `條件` 兩段 summary |
| QA-037-S09 | Token regeneration | `regenerateToken` 只更新 token，不修改 filters |

建議新增 static gate：

```powershell
npm.cmd run verify:dev-037-calendar-subscription-source-scope
```

## Browser Verification

| Case | 操作 | 預期 |
|---|---|---|
| QA-037-B01 | 從 `我的工作區 / JED專案` 進入設定 > 行事曆訂閱 | 建立訂閱預設選中 `目前看板`，並顯示 `我的工作區 / JED專案` |
| QA-037-B02 | 不改範圍，選負責人與日期後產生連結 | 成功建立訂閱；toast / copy 行為正常；列表顯示 `來源：看板｜我的工作區 / JED專案` |
| QA-037-B03 | 切換為 `工作區全部看板` | UI 明確說明包含所選工作區內可讀取的全部看板，不再看起來像只選工作區名稱 |
| QA-037-B04 | 建立 workspace scope 訂閱 | 列表顯示 `來源：工作區全部看板｜我的工作區` 與條件 summary |
| QA-037-B05 | 修改既有 legacy 訂閱 | 編輯表單能正確載入為 `工作區全部看板`，儲存後仍可讀取 |
| QA-037-B06 | 點 `重新產生連結` | 新連結被複製；來源與條件不變；舊連結失效提示清楚 |
| QA-037-B07 | 使用長 Workspace / Board 名稱 | 來源 summary 不重疊、不撐破卡片，長字串可 truncate 並保留 tooltip 或完整可讀方式 |
| QA-037-B08 | 390px mobile viewport | Segmented control、來源摘要、按鈕列不水平 overflow、不遮擋、不裁切主要文字 |

建議新增 browser gate：

```powershell
npm.cmd run verify:dev-037-calendar-subscription-source-scope-browser
```

## Feed / DB Verification

| Case | 資料 | 預期 |
|---|---|---|
| QA-037-F01 | 同一 Workspace 內有 Board A / Board B，訂閱 `board` scope = Board A | `.ics` 只含 Board A 任務 |
| QA-037-F02 | 訂閱 `workspace` scope = Workspace X | `.ics` 含 Workspace X 中使用者可讀取的 Board 任務 |
| QA-037-F03 | `project_ids` 包含不屬於 `workspace_ids` 的 project | create/update 被 DB validation 拒絕；即使既有資料含不合法 project，feed 也不得輸出該 project |
| QA-037-F04 | 使用者不是 Board member 且不是 workspace admin | create/update 該 board scope 被拒絕 |
| QA-037-F05 | 訂閱建立後使用者被移出 Board / Workspace | 下一次 feed request 不再輸出該範圍資料 |
| QA-037-F06 | Legacy filters 只有 `workspace_ids` | feed 行為與既有版本一致 |
| QA-037-F07 | `date_types` 選開始日與到期日 | ICS event count 與 UID 規則維持既有行為 |
| QA-037-F08 | 未指派或他人負責人 | 仍需 owner/admin/project_manager，member 不可訂閱他人或未指派任務 |

必跑既有 ICS gate：

```powershell
npm.cmd run verify:calendar-feed-ics
```

## Regression Gate

DEV-037 會觸及 Settings、CalendarSubscriptionsView、Supabase service、calendar-feed Edge Function 與 Workspace / Board 語意，因此至少加跑：

```powershell
npm.cmd run verify:settings-project-context
npm.cmd run verify:settings-project-context-browser
npm.cmd run verify:dev-036-trello-like-workspace-governance
npm.cmd run verify:dev-026-trello-like-board-share-ui
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

若新增 migration 或 Edge Function deployment，release 前還需：

```powershell
npm.cmd run verify:supabase:static
```

## Manual QC Checklist

- 人工確認畫面第一眼能看出目前正在建立「看板」或「工作區全部看板」訂閱。
- 人工確認訂閱名稱改成任意文字後，仍可從來源 summary 看出實際資料範圍。
- 人工確認外部行事曆匯入連結後，事件標題與描述保留 Workspace / Board context。
- 人工確認繁體中文長文字在桌機與手機不重疊。

## QC Handoff Evidence

QC 回報至少包含：

- Static verifier 結果。
- Browser verifier 結果與桌機 / mobile 截圖。
- ICS / feed verifier 結果。
- Supabase migration / Edge Function 是否已部署與對應版本。
- 若未執行真實 DB role QC，需明確標示原因與適用限制。
