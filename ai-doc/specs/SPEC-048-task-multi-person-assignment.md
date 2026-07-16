# SPEC-048: 多人主責與協作指派

狀態: Implemented / TEST + Production Migration Verified / Firebase Production Released / Level 4 Passed
對應 DEV: DEV-048
節點類型: 交付點
優先級: P1 任務當責與協作資料契約
是否計入產品交付完成: 是，完成後任務可設定多位主責與多位協作
建立日期: 2026-07-15
最近更新: 2026-07-16

使用思考習慣: #批判思考、#設計思考、#可驗證性

## Human Decision Brief

決策來源:
- 使用者要求「指派人工能優化」，希望任務有主責及協作，且兩者都可設定複數個人。
- 使用者明確註記「最終負責人」先不做，因此本 DEV 不新增 final owner / accountable owner / single decision owner 欄位。

已確認決策:
- `主責` 是可複選角色，可有多位成員。
- `協作` 是可複選角色，可有多位成員。
- 任務允許暫時沒有主責；不再因狀態是進行中、延遲、暫停或未定而阻擋儲存。
- 同一人不能同時是同一任務的主責與協作；主責角色優先。
- Legacy `assigneeId` 保留為第一位主責的相容 alias，canonical data 改為 `assigneeIds`。
- 本輪不改工作區/看板成員權限模型，不新增審核、核准或最終裁決責任。

Rejected options:
- 不新增「最終負責人」或「唯一當責人」欄位。
- 不把多人主責壓回單選 UI。
- 不允許主責與協作重疊，避免報表、篩選與活動紀錄產生雙重身份。

## Problem Statement

現有任務只有單一 `assigneeId` 主責，但實際專案任務常見共同主責、跨職能協作與臨時支援。單人欄位會造成:

| 問題 | 使用者影響 |
|---|---|
| 只能選一位主責 | 共同 owner 被迫留在備註或協作，當責資訊失真 |
| 主責與協作語意不清 | 篩選、報表、活動紀錄無法反映實際人力配置 |
| 資料契約只有 `assigneeId` | 未來備份、Supabase、AI context 與報表會各自推測 |

## Product Goal

使用者能在任務詳情、看板卡片與右鍵/全域選單中快速設定:
1. 多位主責。
2. 多位協作。
3. 系統自動防止同一人同時存在於兩種角色。
4. 報表、篩選、活動紀錄與備份能讀到同一份 canonical assignment contract。

## Scope

In scope:
- `TaskNode.assigneeIds` canonical field，保留 `assigneeId` 作 legacy alias。
- 任務詳情與 WBS / context menu 共用多人指派 picker。
- 主責與協作複選、去重、互斥。
- 所有狀態的任務都可維持未指派；未指派是可見狀態，不是儲存阻擋條件。
- 超過 3 位共同主責時顯示輕量 warning，但不阻擋。
- 任務篩選、報表計算、活動紀錄、local backup package 與 Edge knowledge formatter 讀取多主責。
- Supabase migration 增加 `wbs_items.assignee_ids`、同步 legacy alias、移除 collaborator overlap 並加入 GIN index。

Out of scope:
- 最終負責人、唯一決策窗口、審核人或核准責任。
- 改變 workspace / board membership、role、permission 或邀請模型。
- production migration、TEST migration、Firebase deploy、production smoke。
- 既有 DEV-047 遠端 backup RPC 的完整多人主責升級；本輪僅保證本地 package/model 與產品程式 contract，遠端 RPC 需 release/DB gate 時另行同步。
- 既有 Supabase migration alias hash baseline 修復；`verify:supabase:migration-aliases` 的舊 production source mismatch 不在本 DEV 偷改。

## Data Contract

| Field | Type | Contract |
|---|---|---|
| `assigneeIds` | `string[]` / `uuid[]` | canonical 多主責；順序代表使用者選取順序，第一位同步到 alias |
| `assigneeId` | `string` / `uuid` | legacy alias；永遠等於 `assigneeIds[0]` 或空 |
| `collaboratorIds` | `string[]` / `uuid[]` | 協作成員；不得與 `assigneeIds` 重疊 |

Normalization rules:
- 移除空字串、null、undefined。
- 依傳入順序去重，不用 UUID 或字母排序改寫使用者順序。
- 若同一人同時出現在 primary / collaborator，保留 primary，從 collaborator 移除。
- 清空主責時，`assigneeIds` 與 legacy `assigneeId` 同步清空。

## UX Contract

- Picker 以兩段清單呈現：`主責成員（可複選）` 與 `協作成員（可複選）`。
- 主責區使用 checkbox，協作區同樣使用 checkbox，符合複選心智模型。
- 被選為主責的人不再出現在協作可選清單；若原本是協作，選為主責後自動移除協作身份。
- 取消最後一位主責時不顯示阻擋 toast；任務摘要顯示 `未指派`。
- 多於 3 位主責時顯示「共同主責較多」提示，提醒使用者可能需要拆任務或釐清責任，但不導入最終負責人欄位。
- 摘要文字顯示 `未指派`、單一姓名、多人姓名或 `共同主責 N 人`，依空間與 context 自動縮短。

## Implementation Notes

主要實作邊界:
- `src/utils/taskAssignments.ts`: canonical normalization、legacy fallback、清空主責同步 alias。
- `src/components/TaskAssignmentPicker.tsx`: 共用多人主責/協作 picker。
- `src/store/useWbsStore.ts`: set/add/update normalization、assignment activity event。
- `src/services/supabase/projedService.ts`: read/write `assignee_ids` 與 legacy alias。
- `supabase/migrations/20260715143000_task_multi_person_assignment.sql`: DB schema、trigger、check、index。
- `src/features/taskFilters/*`: 篩選改讀全部主責 ID，避免只看第一位。
- `src/features/backup/*` 與 `src/services/backup/localTestBackupService.ts`: local backup package 支援 `assigneeIds`。
- `supabase/functions/match_project_knowledge/index.ts`: AI context formatter 支援多主責。

## Acceptance Criteria

| ID | Acceptance |
|---|---|
| AC-048-001 | 任務詳情可設定多位主責與多位協作 |
| AC-048-002 | WBS / context menu 使用同一套 assignment picker |
| AC-048-003 | 同一人不能同時是主責與協作 |
| AC-048-004 | 任何狀態任務都可清空最後一位主責並儲存為未指派 |
| AC-048-005 | TODO / completed / archived / group / active 任務皆可維持未指派 |
| AC-048-006 | `assigneeId` 與 `assigneeIds[0]` 相容同步 |
| AC-048-007 | 篩選、報表與 activity log 不因多主責重複計算任務 |
| AC-048-008 | Supabase migration 保留主責順序、清除角色重疊並建立查詢 index |
| AC-048-009 | local backup package 可 round-trip 多主責；遠端 RPC 差異需在 release gate 前處理 |
| AC-048-010 | UI smoke 無 visible error、checkbox 可操作、互斥與未指派清空有瀏覽器證據 |

## Release Boundary

原始開發階段只完成 local implementation 與本機 QA/QC；2026-07-15 release gate addendum 已另行完成 TEST / production migration、authenticated Level 3 與 Firebase production Level 4。完整證據見 `ai-doc/release/PREPRODUCTION-DEV-048-20260715.md`。

Release gate 結果:
- TEST migration 已套用並驗證 `wbs_items.assignee_ids`、trigger、check、index 與 legacy alias；authenticated Level 3 已通過。
- Production migration 已套用並驗證 461 筆資料、53 筆 legacy alias 對齊、重疊 0；production REST schema read probe HTTP 200。
- Firebase production deploy 與 Level 4 post-deploy smoke 已通過；production root、bundle、CSS、service worker 與 critical error sweep 均正常。
- `verify:supabase:migration-aliases` 仍有 5 個未修改舊 production source hash mismatch，保留為 release governance residual，未改寫 baseline。
- DEV-047 遠端 backup RPC 完整多人主責保存仍未納入本 release；其風險與 frozen boundary 依既有 release gate 治理。
