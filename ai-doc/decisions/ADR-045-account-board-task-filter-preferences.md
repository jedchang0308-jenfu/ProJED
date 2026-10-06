# ADR-045：板內任務篩選偏好採專用帳號 × 看板資料列

- 狀態：Accepted / Implemented / DEV-090 Local Automated QA-QC Passed
- 日期：2026-08-26
- 關聯：DEV-090、DEV-039、SPEC-039、QA-DEV-090

## Context

現行板內任務篩選把狀態、到期、負責人與標籤拆在 `useBoardStore`、`useTagStore`，再以只含帳號 uid 的 localStorage key 保存。這會讓同一帳號的不同看板共用 selected IDs，且無法在另一裝置從帳號來源恢復。既有 `profiles.ui_preferences` 雖可保存 JSON，但 `accountPreferencesService` 採 read-merge-update 整包 JSON；若篩選、側欄寬度與工作台寬度同時寫入，會有跨 namespace lost update，也無法由外鍵清理已刪看板資料。

DEV-090 已確認：未設定條件時全部顯示；使用者主動調整後，偏好只屬於該登入帳號與該看板；看板、清單、心智圖、甘特及行事曆共用同一板內 filter state。這是長期的 ownership、schema、RLS 與跨模組資料路徑決策，因此需固定 canonical persistence boundary。

## Options Considered

1. 延伸 `profiles.ui_preferences.taskFilters.byBoardId`：少一張表，但每次仍需整包 JSON merge；跨裝置同時修改 layout 與 filter 可能互相覆寫，刪除看板也不會自然清理巢狀 key。
2. 新增專用 `account_board_task_filter_preferences`：每個帳號／看板一列，可用複合主鍵、project 外鍵、RLS 與 `updated_at` 管理；增加一個 migration 與 adapter。
3. 維持 account-scoped localStorage：改動最少，但不是帳號的雲端偏好，無法滿足重新登入或換裝置恢復。

## Decision

1. Supabase canonical source 採 `public.account_board_task_filter_preferences`，主鍵為 `(account_id, project_id)`；`project_id` 外鍵連到 `public.projects(id) on delete cascade`，`account_id` 外鍵連到 `public.profiles(id) on delete cascade`。
2. 每列保存完整、正規化後的 `TaskFilterState` JSON、`preference_version`、`created_at`、`updated_at`。資料列不存在即代表 `createDefaultTaskFilters()`，不另寫一列 default；重設篩選刪除該列。
3. RLS 只允許 authenticated 使用者對 `account_id = auth.uid()` 且仍可讀該 project 的列執行 select／insert／update／delete；anon 無任何權限。viewer 可保存自己的檢視偏好，但不能讀寫其他帳號的偏好。前端不得使用 service-role key。
4. Client 以完整 normalized filter object 做 upsert，不做欄位級 merge；同一帳號／看板的併發變更採 database commit order 的 last-write-wins。因每列只代表一份單一邏輯偏好，不會再覆寫 layout 或其他看板 namespace；同一 client 仍須以 scope-keyed write queue／coalescing 保證最後操作最後落盤。
5. localStorage v4 只作精確 `accountId × boardId` 的 cache、離線 fallback 與 pending write/delete journal。遠端讀取成功時，遠端列或「列不存在＝default」為權威；只有本機有 pending mutation 時才先重送本機狀態，避免 hydrate 覆蓋尚未同步的使用者操作。
6. 板內 active filter state 收斂到獨立 `useTaskFilterStore`；`useBoardStore` 只保留 navigation 與純顯示設定，`useTagStore` 只保留標籤資料。五種板內模式都從同一 active filter 與 `projectTaskFilterResults()` 投影取值。
7. 不把 preference table 加入 Realtime publication。跨裝置契約是重新登入、reload 或重新進入看板時收斂到最後成功提交的偏好；同時開啟的兩個 session 可短暫不同，不宣稱即時同步。
8. 全域任務平台維持與板內模式分離的 active state；DEV-090 只讓它承接 shared default v4 與 legacy filter reset，不把工作台 filter 上傳到本表，也不改 placement 資料路徑。

## Consequences

- 優點：帳號、看板與 layout namespace 不互相污染；看板／帳號刪除可由外鍵清理；RLS 與 DB role matrix 可獨立驗證。
- 優點：row absence 有單一 default 語意；重設不保存冗餘 JSON；本機 fallback 不再可能讀到另一帳號或另一看板的條件。
- 優點：五模式的 filter state 與 result projection 有單一責任邊界，避免各 View 自行拼接 selected IDs 或逐層套 predicate。
- 成本：需新增 migration、Supabase adapter、v4 cache migration、獨立 Zustand store、database types 與 DB／browser 驗證。
- 成本：跨裝置不是 Realtime；若同一帳號同時在兩個裝置修改同一看板，最後成功提交者成為後續 hydrate 的值。
- 約束：不得回退成 `profiles.ui_preferences` whole-json patch、global board filter state、或僅以 localStorage 成功作為帳號偏好交付證據。

## Implementation Confirmation - 2026-08-26

- Client upsert 只更新既有 `preference_version = 4` 資料列；不存在 v4 row 時才 insert。Repository 在重送 pending journal 前先讀 remote version，遇到未知新版即阻擋 upsert、delete 與 reset，避免舊 client 覆寫新格式。
- 五種板內模式已統一消費 `projectTaskFilterResults()`；Gantt／Calendar 將 canonical filter 可見性與日期適格性分離，matched 但無有效日期的任務仍留在共用側欄，不建立時間軸 bar／segment。
- 本地 source/model、isolated PostgreSQL grants/RLS/CRUD、正常 UI 五模式、帳號／看板隔離、failure feedback、390×844 與 targeted regressions 已通過。這些證據確認 implementation 符合本 ADR，未取代後續 production migration/deploy release gate。

## Migration and Compatibility

- 不回填遠端資料；現有 production 沒有可可靠映射到 board 的 server filter row。
- v1～v3 board filter 條件不得上傳；首次 v4 migration 一律重設為全部顯示，純顯示設定搬到獨立 account-scoped display key 後才移除 legacy payload。
- v1～v3 工作台 `filtersByBoardId` 也重設為空 map，使 shared default 生效；`selectedBoardId` 與 panel/layout 類偏好保留。
- Firebase／local-test backend 使用同一 v4 account × board cache contract，但不宣稱跨裝置同步。
- Production release 必須先通過 migration／RLS gate，再發布依賴新表的 client；migration 與 deploy artifacts 由後續 release gate 產生。

## Superseded / Amended Documents

- 修訂 SPEC-039 的 `completed: false` 預設、uid-only localStorage 板內偏好，以及「profile backend sync cancelled」對板內模式的歷史判定。
- 不改 SPEC-039 對工作台 active state 與板內 active state分離的決策，也不改 DEV-045 行事曆訂閱 snapshot、DEV-089 placement transaction 或任務資料 RLS。
