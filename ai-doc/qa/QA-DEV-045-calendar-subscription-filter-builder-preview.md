# QA-DEV-045: 行事曆訂閱逐看板篩選器與即時預覽驗證計畫

關聯 DEV：DEV-045
關聯 SPEC：`ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md`
關聯 ADR：`ai-doc/decisions/ADR-038-calendar-subscription-per-board-filter-snapshot.md`
狀態：Revised v3 QA Executed / Phase 1-2 Local Automated Gates Passed / Pre-production QA Plan Ready / Former v2 QC Historical Only / Release Gate Required
建立日期：2026-07-06
重大修訂：2026-07-12

正式部署前專用驗證計畫：`ai-doc/qa/QA-DEV-045-pre-production-release-validation.md`。該文件定義Level 3、FMEA、Git / artifact boundary、Supabase TEST migration / Edge、live preview / ICS event identity、外部calendar client、cleanup、rollback與Go / No-Go；尚未執行，不代表Release Ready。

## 驗證目標

驗證行事曆訂閱器與全域任務工作台使用相同的任務條件 UI 與操作語法，但保持 state / persistence 完全獨立；每張看板直接持有自己的 filter snapshot，預覽、保存 payload 與 `.ics` feed 的 task identity 一致。

## Superseded Evidence Boundary

- 2026-07-07 已通過的 v2 global filter / board override static、browser、local DB 與 Edge source gates仍是有效歷史事實。
- 這些證據不能證明 v3 逐看板 UI、`board_filters` payload、batch copy、v1/v2 materialization 或 v3 feed matcher通過。
- 舊 remote migration / Edge Gate 已凍結；不得因舊 preflight 通過而部署 v2 source。

## Zero-Tolerance Failures

- Calendar 與 Workbench 各自維護一份條件 JSX，造成控制順序、label、selected state 或 reset 行為不一致。
- Calendar 修改會寫入 Workbench active filters，或 Workbench 修改會改變既有訂閱。
- Calendar v3 仍顯示 global、沿用、自訂或 override。
- Board A filter 變更影響 Board B，且不是使用者明確執行批次複製。
- 批次複製未顯示來源、目標與覆寫影響，或複製後仍建立連動。
- Preview 與 `.ics` feed task identity 不一致。
- `board_filters` 與 `project_ids` key set 不一致仍被接受。
- 缺少 board filter 時自動套 global / default fallback。
- 未來新增看板自動進入既有訂閱。
- partial/error source、0 included boards、invalid payload 或 permission failure 時仍可產生 / 儲存。
- 一般 member 可對無權看板、他人、未指派或不限 assignee 產生外部 feed。
- v1 / v2 編輯轉換靜默縮小或擴大原輸出。
- 手機 drawer、preview 或 CTA 重疊、裁切、不可關閉或 horizontal overflow。
- 操作者可見 HTTP / API / runtime failure text，卻沒有可執行下一步。

## QA Matrix

### Static / Source Contract

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-045-S01 | 文件一致性 | SPEC / QA / dev_task / documentation_map 指向 v3 逐看板方向；QC 清楚標示舊 evidence boundary |
| QA-045-S02 | Shared component | Workbench 與 Calendar 都使用 `TaskConditionFilterControls` 或等效單一來源元件 |
| QA-045-S03 | Adapter boundary | 共用元件不含 Workbench placement / 顯示設定，也不含 Calendar save / external-link controls |
| QA-045-S04 | State isolation | Workbench storage / state 與 Calendar draft / persisted filters 無共用寫入路徑 |
| QA-045-S05 | Type contract | `CalendarSubscriptionFilters` 支援 v3 `version`, `v3_scope_type`, `board_filters` |
| QA-045-S06 | Forbidden v3 fields | normalized v3 payload 不含 `global_filter`, `board_overrides`, top-level `date_types`, `v2_scope_type` |
| QA-045-S07 | Deterministic normalizer | 同一 payload 重複 normalize 結果完全相同 |
| QA-045-S08 | Token regeneration | regenerate token 不修改 `filters_json` |
| QA-045-S09 | Release freeze | verifier / docs 阻擋舊 v2 migration / Edge source進入 remote gate |

### Browser UX and muscle memory

| Case | Viewport | 操作 | 預期 |
|---|---|---|---|
| QA-045-B01 | 1440x900 | 分別開啟 Workbench 與 Calendar 過濾器 | 都是單一按鈕 + overlay；條件順序、label、chips、搜尋、清除與 reset 回饋一致 |
| QA-045-B02 | 1440x900 | Calendar 選 Board A 調整狀態 / 到期 / keyword / assignee / tag | 預覽即時更新；只有 Board A draft 改變 |
| QA-045-B03 | 1440x900 | 切換 Board B 再回 Board A | 兩張看板各自保留 draft，沒有 global / inheritance UI |
| QA-045-B04 | 1440x900 | 關閉 Board A 納入 toggle 再重開 | 預覽移除 / 恢復 Board A；原 filter draft 保留 |
| QA-045-B05 | 1440x900 | 重設目前看板 | 只重設 selected board的任務條件與事件日期，不影響其他 board |
| QA-045-B06 | 1440x900 | 從 Board A 複製到 B/C | 顯示來源、2 個目標與覆寫摘要；複製任務條件與事件日期；included state不變；複製後可各自修改 |
| QA-045-B07 | 1440x900 | Workbench 修改同一 Board A filter | Calendar draft / saved subscription不變 |
| QA-045-B08 | 1440x900 | Calendar 修改 Board A filter | Workbench active filter 不變 |
| QA-045-B09 | 1440x900 | source load 某看板失敗 | 顯示失敗看板與下一步；產生 / 儲存 disabled |
| QA-045-B10 | 1440x900 | 關閉全部 included boards | 顯示至少納入一張看板的下一步；產生 / 儲存 disabled |
| QA-045-B11 | 1440x900 | create / update API failure | draft 保留，可重試；不清空其他看板設定 |
| QA-045-B12 | 390x844 | 開啟 drawer、切看板、改條件、關閉 | 可操作、focus restore、無重疊 / horizontal overflow |
| QA-045-B13 | 320x700 | 最長 workspace / board / tag 文字 | 正確 truncate / wrap，控制項與 CTA 不超出 viewport |
| QA-045-B14 | keyboard | Tab / Shift+Tab / Space / Enter / Escape | focus order 清楚、toggle/chip 可操作、Escape 關閉並回復 focus |
| QA-045-B15 | 1440x900 | Board A只選開始日、Board B只選到期日 | 切換看板保留各自設定；預覽依各 board日期投影，不互相覆寫 |
| QA-045-B16 | 1440x900 | 清空已納入看板的事件日期 | 顯示該看板缺少事件日期；產生 / 儲存 disabled |
| QA-045-B17 | 1440x900 | 開啟訂閱事件預覽 | 5秒內可讀取看板數、unique task數、總事件數、開始與到期事件數 |
| QA-045-B18 | 1440x900 | 同一task具開始與到期，board選兩種日期 | 顯示兩列事件；每列只有一種日期類型且具有task / board / date / date type identity |
| QA-045-B19 | 1440x900 | 切換依日期 / 依看板 | 只改分組，事件集合與總數不變；預設為依日期 |
| QA-045-B20 | 1440x900 | 符合條件但缺少所選日期 | 摘要顯示未產生事件數；展開可看缺少開始日或到期日原因 |
| QA-045-B21 | 1440 / 1024 / 390 / 320 | 預覽超過12個事件並查看全部 | 使用頁面捲動，預覽本身無 nested vertical scrollbar或horizontal overflow |
| QA-045-B22 | all | 檢查事件列status | 顯示待辦 / 進行中 / 延遲 / 完成 / 未定 / 暫緩，不顯示raw status key |

### Data / Normalization

| Case | Payload | 預期 |
|---|---|---|
| QA-045-D01 | 3 project IDs + 3 board filter keys | Normalize 成 deterministic v3 snapshot |
| QA-045-D02 | project key 缺漏 / 額外 / 非 UUID | Client validation 與 DB validator 都拒絕 |
| QA-045-D03 | 所有 `included = false` | 拒絕 create / update |
| QA-045-D04 | 重複 workspace / project IDs | 去重並以 project relation重新解析 workspace IDs |
| QA-045-D05 | task filter 缺 optional fields | 以 canonical `TaskFilterState` defaults 正規化；不得跨 board fallback |
| QA-045-D06 | v3 payload混入 global / override / top-level date fields | 移除或拒絕，normalized output不得保留 |
| QA-045-D07 | v1 edit conversion | scope materialize為 board snapshot；原頂層 dates複製至各 board，assignee/date/status output不被靜默縮小 |
| QA-045-D08 | v2 edit conversion | 每張 board materialize effective global/override結果並複製舊頂層 dates；disabled對應 included false |
| QA-045-D09 | batch copy | 只改 draft filter與 date values，不改 included與遠端 row |
| QA-045-D10 | regenerate token | filter JSON byte-equivalent / semantic-equivalent 不變 |
| QA-045-D11 | included snapshot `date_types = []` | Client與 DB validator都拒絕 |
| QA-045-D12 | v3 top-level `date_types` | DB validator拒絕混合新舊契約 |

### Permission Matrix

| Case | Role / filter | 預期 |
|---|---|---|
| QA-045-P01 | member / own user ID | 可在可讀 board 建立或更新 |
| QA-045-P02 | member / another user | 該 board 拒絕 |
| QA-045-P03 | member / unassigned | 該 board 拒絕 |
| QA-045-P04 | member / selectedAssigneeIds empty | 視為不限 assignee，該 board 拒絕 |
| QA-045-P05 | project_manager / managed board others or unassigned | 通過該 board 能力檢查 |
| QA-045-P06 | manager in Board A only / broad filter on Board B | Board B 拒絕，不得跨 board 借權限 |
| QA-045-P07 | owner membership revoked after save | 下一次 feed 排除失權 board |
| QA-045-P08 | suspended membership / deleted board | Feed 不輸出；edit 顯示 unresolved 下一步 |
| QA-045-P09 | anon direct validator execute | 拒絕 |
| QA-045-P10 | authenticated owner create/update | 仍受 row ownership / RLS / payload validation |

### Preview / Feed Identity

| Case | Data | 預期 |
|---|---|---|
| QA-045-F01 | Board A own tasks；Board B tag filter；Board C excluded | Preview 與 feed的 task ID + date type事件 identity完全一致 |
| QA-045-F02 | Board A assignee empty、具管理權 | 該 board 不因 union prefilter 漏掉任務 |
| QA-045-F03 | Board A / B 使用不同 assignees | Query union 可粗篩，最終逐 board matcher 正確 |
| QA-045-F04 | Board A / B 使用不同 tags | Tag join union 載入完整，最終逐 board matcher 正確 |
| QA-045-F05 | dueWithinDays / keyword / status combinations | Preview 與 feed 使用相同 normalized semantics |
| QA-045-F06 | Board A due_date only | Board A只產生到期事件 |
| QA-045-F07 | Board A start_date、Board B due_date | 同一 feed逐 project套日期類型，依既有 UID contract產生對應事件 |
| QA-045-F08 | task limit reached | 結果不宣稱完整，限制訊號可驗證 |
| QA-045-F09 | invalid v3 payload | 受控失敗且不輸出超出 scope 資料 |
| QA-045-F10 | v1 row | feed 維持 DEV-037 contract |
| QA-045-F11 | defensive v2 row | feed / edit仍能讀取，轉 v3 前不改內容 |
| QA-045-F12 | 同task同時輸出開始與到期 | Preview兩列與ICS兩個 `VEVENT UID`的date type suffix一致 |

## Now What State Matrix

| State | 使用者結論 | 下一步 |
|---|---|---|
| loading | 正在載入可訂閱看板與預覽 | 等待；主要 CTA disabled |
| empty boards | 目前沒有可建立訂閱的看板 | 返回建立 / 加入可讀看板 |
| no matched tasks | 條件有效但目前沒有事件 | 調整目前看板條件或納入其他看板 |
| no included boards | 尚未選擇輸出看板 | 開啟至少一張看板 |
| included board without date | 已納入看板尚未選擇事件日期 | 在該看板勾選開始日或到期日 |
| matched task missing selected date | 任務符合條件但不會產生該日期事件 | 展開「未產生」確認原因，補日期或調整該看板事件日期 |
| partial source | 預覽不完整，現在不能儲存 | 重試失敗看板或將其從 snapshot 移除 |
| permission blocked | 此條件超出你在該看板的權限 | 改成自己的任務或聯絡管理角色 |
| unresolved board | 看板已刪除或不可讀 | 移除該看板或恢復權限後重試 |
| save failed | 設定尚未儲存，draft 已保留 | 重試或取消返回 |
| success | 訂閱已建立 / 更新 | 複製連結或返回訂閱列表 |

## Visual FMEA

| Failure mode | Risk | Detection / gate |
|---|---|---|
| Calendar filter與 Workbench 控制外觀漂移 | 肌肉記憶失效 | 同 viewport side-by-side screenshot + shared component static gate |
| Board path擠壓 controls | 選錯看板或 CTA 不可用 | 320 / 390 longest-content browser fixture |
| Drawer與 preview雙重 scroll confusion | 無法判斷捲動區 | mobile manual scroll / overscroll gate |
| Included toggle不醒目 | 誤以為條件無效 | selected board state screenshot / 5-second review |
| Batch overwrite summary不清楚 | 多板設定被誤覆寫 | destructive-preview interaction case |
| Active count混入日期 / included | 使用者誤判任務 filter數 | static + browser count assertion |
| Partial/error藏在 drawer下 | 使用者仍產生不完整連結 | visible state + disabled CTA assertion |

## Phase Gates

### Phase 0 - Documentation

- SPEC、QA、dev_task、documentation_map 與 QC historical boundary 一致。
- 舊 v2 remote gate明確凍結。
- Deferred Scope Audit與 All-Phase Coverage Matrix完整。

### Phase 1 - Local UI

- 新 v3 static verifier。
- 新 v3 desktop/mobile browser verifier與截圖。
- Workbench/Calendar shared control parity及 state isolation。
- Batch copy、partial/error、draft recovery、keyboard / focus、320-1440 viewport。
- DEV-039 / settings / mobile regressions、TypeScript、build:test。

### Phase 2 - Local data / Edge source

- v3 payload normalizer allow/deny fixtures。
- v1/v2 materialization fixtures。
- SQL validator transaction + rollback matrix，包含 grants。
- Edge v3 matcher、assignee/tag union、task limit、permission recheck。
- Preview/feed identity static fixtures與 local DB smoke。
- 不得 remote apply / deploy。

### Phase 3-4 - Release gates

- 僅保存 entry / acceptance / evidence requirement。
- 新 release 型指令、Level 3 readiness與 Phase 1/2 QC通過前不可執行。
- deployment / rollback / production smoke artifacts由後續 `deployment-release-gate` 產生。

## Regression Gates

- `verify:dev-037-calendar-subscription-source-scope`
- `verify:dev-037-calendar-subscription-source-scope-browser`
- `verify:dev-039-task-filter-core`
- DEV-039 browser filter parity gate
- settings project context gate
- DEV-042 mobile left-panel / drawer regression where touched
- TypeScript `--noEmit`
- `build:test`
- Edge bundle / type verification when Edge source is touched
- Local DB transaction + rollback smoke when validator source is touched

## QC Handoff Evidence

QC 回報至少包含：

- v3 static contract result。
- Workbench / Calendar shared control source evidence。
- Desktop 1440 / 1024、mobile 390 / 320 screenshots。
- Board isolation、included toggle、selected reset、batch copy、partial/error、draft recovery browser evidence。
- v1/v2/v3 normalization and compatibility evidence。
- DB validator / grants / rollback evidence。
- Preview vs feed task ID parity evidence。
- Permission matrix evidence。
- Visible-error sweep。
- Git boundary與未執行 remote/release事項。

## Deferred Verification Scope Audit

| Deferred verification | Classification | Covered by | Resume condition |
|---|---|---|---|
| Phase 1 local UI verification | Same Spec Phase | DEV-045 Phase 1 | RD implementation request |
| Phase 2 local DB / Edge source verification | Same Spec Phase | DEV-045 Phase 2 | Phase 1 payload stable |
| Remote DB / Edge / live `.ics` | Blocked Human Re-entry / Release Gate Required | DEV-045 Phase 3 | 新 release 指令 + Level 3 ready |
| Production release / smoke | Blocked Human Re-entry / Release Gate Required | DEV-045 Phase 4 | Phase 3 passed + production confirmation |
| Google Calendar write API | No Tracking | None | 不屬只讀 ICS 訂閱 |
| Dynamic future-board auto-join | No Tracking | None | 已拒絕產品方向 |

## QA Readiness Conclusion

Phase 1、Phase 2 測試資料、正向 / 負向案例、viewport、權限、相容、失敗恢復與 evidence contract 已完整，狀態為 `QA Ready / RD Implementation Ready / Not Requested This Turn`。Phase 3、Phase 4 仍為 `Release Gate Required`。
