# SPEC-108 任務明細會議補記持續呈現

- 狀態：`Implemented / QA-QC PASS / Local-only / NOT RELEASED`
- 日期：2026-09-07
- 對應 DEV：DEV-108
- 父交付點：DEV-009
- 相容：DEV-008、DEV-024、DEV-066、DEV-106
- 風險：Medium
- Spec Impact：`Intentional partial replacement / implemented`。本規格是 DEV-108 的 authoritative source；
  實作已取代 SPEC-009 中「補記成功只靠清空輸入
  與右側 draft 確認」及「非 meeting mode 完全不顯示補記內容」兩項局部契約，其餘 append、task mention、
  空白 no-op、快捷鍵及 `TaskNode.detailNotes` 資料邊界維持。

2026-09-08 DEV-110 corrective amendment：本規格的provenance、projection、archive、latest-3、recovery與UI
版面仍有效；task-scoped loader不再以active board＋裸taskId推定ownership。account-unplaced、tracking
reference source-board read、same-board append、generic error與unresolved task-link save語意改以
`SPEC-110-unplaced-task-meeting-record-boundary.md`為authority。此修訂尚未實作，不回寫DEV-108歷史PASS。

## 1. 使用者決策與目標

- `1A`：第一層列表只顯示從任務明細「加入」建立的人工補記；不得以 task link 或自由文字推測來源，
  也不得混入 AI 整理、任務活動、一般手寫段落或 legacy DEV-009 無 provenance 的內容。
- `2A`：原始 meeting record 是唯一資料來源。任務節點不保存副本；原紀錄修改時同步、封存後保留、
  原始紀錄被永久刪除後移除。
- `3A`：預設只顯示最新三筆，依提交時間正序排列；畫面只顯示月／日，不顯示幾點幾分；其餘內容以「其餘 N 筆」在原位置展開全部。
- meeting mode 只控制新增入口；只要有符合資格的來源項目，「會議紀錄」列表在會議結束、關閉／重開
  任務與重載後都必須存在。

成功結果是：使用者加入補記後，原文字立即出現在目前任務第一層；離開會議後仍能直接閱讀，且版面
不增加卡片、摘要面板或第二層歷史入口。

## 2. UX Intent 與 UI 契約

### 2.1 固定順序

`任務基本資料 → 任務說明 → 會議紀錄 → 其他備註 → 子任務`

`TaskDetailsModal` 必須在第一個 `TaskDetailNoteField`（預設「任務說明」）之後插入會議紀錄區；不得把
區段放回所有備註之前，也不得藏在 `TaskRecordTimeline` 或「查看歷史資訊」之後。

### 2.2 最小畫面

```text
任務說明                                      A  ＋
確認供應商交期，預計 9/8 回覆。

會議紀錄
09/07　確認供應商明日回覆
09/07　RD 補充測試條件與驗證方式
09/07　決議先完成測試，再確認交期
其餘 2 筆
────────────────────────────────
輸入本次會議內容                              加入

備註                                          A
輸入備註內容……
```

- 列表每列只顯示 `MM/DD` 與原文；不重複任務名稱、會議標題、task tag、來源類型、參與者或狀態。
- 日期採低對比但符合可讀性；不顯示幾點幾分。原文可自然換行，長 URL／英文不得造成水平 overflow。
- 無外層卡片、藍色背景、每列框線、裝飾 icon、badge、搜尋列、常駐成功訊息或 helper。
- 區段最多一條低對比分隔線；輸入控制保留必要邊界及可見 focus。
- 一至三筆全部顯示。四筆以上先取時間最新三筆，再以正序呈現；「其餘 N 筆」具 `aria-expanded`
  及明確 accessible name，展開後顯示全部並提供最短「收合」控制。
- 非 meeting mode 且有資料：只顯示標題與列表。非 meeting mode 且無資料：整區不 render。
- meeting mode：顯示單一 textarea 與「加入」；既有 `Ctrl／Cmd + Enter` 行為維持。沒有歷史資料時不顯示
  空清單、空框或「尚無紀錄」。
- 成功回饋由新文字列出現與輸入清空共同表達；不得新增 toast 或成功面板。

## 3. Authoritative data contract

### 3.1 Aggregate 與 metadata namespace

權威 aggregate 是既有 `KnowledgeRecord`。不得寫入 `TaskNode.description`、`TaskNode.detailNotes`、新的
task table 或獨立 quick-note record。既有 `knowledge_records.metadata`／Firestore record metadata／
local-test record metadata 增加下列 versioned namespace，不新增 provider schema 或 migration：

```ts
const MEETING_TASK_QUICK_NOTES_KEY = 'meetingTaskQuickNotes';

type MeetingTaskQuickNotesV1 = {
  schemaVersion: 1;
  entries: Array<{
    id: string;              // submissionId；同一 meeting record 內唯一
    taskId: string;
    text: string;            // task-detail list 的 canonical text
    occurredAt: number;      // 建立當下 epoch ms；精確排序與日顯示的時間基礎
    anchor: {
      lineIndex: number;     // 建立時在 normalized content 的 0-based line index
      sourceToken: string;   // `${HH:mm}|${taskId}`；不含可變 task title／text
    };
  }>;
};
```

- `entry` 是 meeting record aggregate 內、供 task-detail list 使用的 canonical quick-note representation；
  `content` 中 `## 任務討論` 的文字列是為 DEV-009、task knowledge 與 AI workflow 保留的 compatibility
  projection。這是同一 record 內的受控雙表示，不得宣稱完全沒有雙寫；兩者必須由 store 在同一次狀態
  更新中建立或協調，不能各自成功。
- `id` 由 UI 每次提交先建立一次，store 以 `record.id + entry.id` 去重；重送相同 `submissionId` 必須
  `noop`，不得新增第二列。
- `text` 沿用 `normalizeMeetingTaskDiscussionText`：換行轉 ` / `、移除空白列、trim；空字串不得建立 entry。
- `occurredAt` 在提交開始時固定，重試不得換時間。列表顯示只取 `MM/DD`，排序仍使用精確 `occurredAt`，不使用 record `updatedAt`。
- namespace 不存在視為合法空集合；legacy DEV-009 正文不回填、不猜測、不顯示。
- namespace 結構錯誤、未知 `schemaVersion`、重複 id、非法 timestamp／lineIndex 或缺欄位時，reader 回報 `invalid`
  並保留原 metadata；append 必須拒絕且不得覆寫未知資料。不得 silent reset 或部分採信。

必須維持以下 aggregate invariant：每個 active entry 在正文恰有一個可匹配 projection；entry `text` 與該列
冒號後 normalized text 相同；每個 `id` 唯一。Supported app write 在 save 前必須驗證 invariant；不一致時
不得把該 record 當成成功同步或以 metadata 覆蓋正文。

### 3.2 正文同步與人工修改

新增 `reconcileMeetingTaskQuickNoteMetadata(previousContent, nextContent, metadata)`，只協調 metadata 已登錄
的 provenance，不得因正文長得像 quick note 就建立新 entry。定位順序必須 fail closed：

1. 先檢查原 `lineIndex` 是否仍為相同 `sourceToken`；若是，將冒號後 normalized text 寫回同一 entry，
   保留 `id` 與 `occurredAt`。這是一般文字修改的主要路徑。
2. 若行號因插入／刪除其他行而改變，先找 `sourceToken + 原 entry.text` 的唯一 exact candidate；只有一筆
   才更新 `lineIndex`。
3. 若沒有 exact candidate，但整份正文只有一筆相同 `sourceToken`，可視為同一列文字修改並更新。
4. 其餘多候選、零候選、task token／`HH:mm` 結構被修改或原列被刪除，一律 detach 該 entry：從
   quick-note namespace 移除但保留正文，不可猜測配對或錯把另一列內容掛到任務。
5. 手動新增、貼上或 AI 產生的相似列沒有既有 entry，不得自動納入。

Supported edit contract 是「修改冒號後文字」或「刪除整列」；任意改動時間／task token 屬結構變更，
會解除該列的 task-detail provenance。這個限制必須寫入 QA，不另加常駐 UI helper。

`useRecordStore.updateDraft({ content })` 必須依序執行：既有 task-link sync → meeting quick-note reconcile →
既有 project-change metadata reconcile。每個 helper 只更新自己的 namespace，必須以 metadata spread 保留
`meetingSynthesis`、`meetingProjectChangeImport`、`meetingTaskReservations` 與未識別欄位。

AI synthesis 不得建立 quick-note entry。`mergedContent` 形成後，必須以 synthesis 前正文與合併後正文執行
同一 reconcile，重定位可能位移的 `lineIndex`，再驗證 aggregate invariant；不得只 spread 舊 metadata。
若無法唯一重定位或 human quick-note projection 遺失，沿用 DEV-024 fail-safe：整次 synthesis 失敗並還原
preserved draft，不可發布帶 stale anchor 的結果。成功時不得改寫 entry identity、text 或排序時間。

### 3.3 Append transaction

`appendTaskDiscussionToMeetingDraft` 升級為顯式結果：

```ts
type AppendMeetingTaskQuickNoteResult =
  | { status: 'appended'; entryId: string }
  | { status: 'noop'; entryId: string }
  | { status: 'denied'; reason: 'not-meeting' | 'invalid-input' | 'invalid-metadata' | 'invalid-task' };

appendTaskDiscussionToMeetingDraft(input: {
  taskId: string;
  taskTitle: string;
  text: string;
  submissionId: string;
  occurredAt: number;
}): AppendMeetingTaskQuickNoteResult;
```

單次 Zustand `set` 必須同時：append 正文列、append metadata entry、同步 `taskLinks`、更新 cursor、reset
meeting synthesis state 與清除舊成功回饋。只有回傳 `appended`／同一 id 已存在的 `noop` 後，UI 才可
清空與該 `submissionId` 對應的輸入；`denied` 必須保留輸入並在區段附近顯示最短錯誤。

此處的 `appended` 只代表資料已一致進入 current in-memory draft，不代表 remote save 完成。Durability 仍由
DEV-106 local recovery 與既有 `saveDraft` feedback 表達；UI 不得把「加入」改成雲端已儲存宣告。

Store 至少驗證：active meeting mode、meeting draft、draft status 非 published、taskId／title 有效、文字非空。
UI 沿用 `canEditTask`；provider save 與讀取沿用既有 record／board 權限及 RLS，本 DEV 不新增角色或 capability。

## 4. 讀取、封存與 identity continuity

### 4.1 Provider 介面

既有 `recordService.listByProject` 維持排除 archived，避免改變紀錄庫與側欄。擴充 task-scoped read：

```ts
type RecordListByNodeOptions = { includeArchived?: boolean };

recordService.listByNode(workspaceId, boardId, nodeId, options?): Promise<EditableKnowledgeRecord[]>;
```

- 預設 `includeArchived = false`，相容既有呼叫。
- DEV-108 task detail loader 必須傳 `{ includeArchived: true }`。
- Firestore：不得透過已排除 archived 的 `listByProject` 間接查詢；直接讀 board records 後套用 type、task link
  與 options filter。
- Supabase：既有 tenant／project／record type／item link 約束保留；只有 options 為 false 時排除 archived。
- local-test：同樣保留 archived row 並依 options 決定。
- 查詢仍只回傳使用者原本可讀的 record；不得繞過 provider authorization／RLS。

### 4.2 Task detail projection

新增 task-scoped loader/hook，輸入 `workspaceId + boardId + taskId`，載入含 archived 的 meeting records，
並與目前 `useRecordStore.draft` 合併：

- active draft 與 loaded record 同 id 時，以 draft 完整取代 loaded record；不得同時 render。
- unsaved active draft 也可投影；saved／published／archived record 由 provider 結果投影。
- 唯一鍵為 `${record.id}:${entry.id}`。重複鍵保留 active draft，否則保留 `updatedAt` 較新的 record aggregate。
- 只接受 `record.type === 'meeting'`、metadata v1 valid、aggregate invariant valid 且
  `entry.taskId === current taskId`。Metadata valid 但正文 projection 不一致的 record 必須隔離並回報部分載入
  錯誤，不得顯示 stale metadata text 冒充同步完成。
- 顯示排序先 `occurredAt`、再 `record.id`、再 `entry.id`，形成 deterministic total order。
- task change、record save/archive、modal reopen 與手動 retry 皆重新載入；舊 request 回應不得覆蓋新 task。
- archive 只改 source record status，entry 仍顯示；原始 row 被 hard delete 後，下次成功 reload 即移除。
- task link 被正文協調移除時，entry 同步移除；不得留下只能靠 stale local cache 顯示的項目。

本 DEV 不新增永久刪除 UI 或 backend action；只驗證資料源不存在時投影消失。

## 5. Failure、recovery 與相容性

- Append action 被拒絕：不改 draft、不新增 optimistic row、不清空輸入；顯示可重試錯誤。
- Append 已原子寫入 draft 後，本機 recovery 失敗：entry 仍留在記憶體 draft／列表，沿用 DEV-106 的
  degraded/error 回饋及重試；不得回滾內容或製造第二筆。
- Remote `saveDraft` 失敗：保留 draft、entry 與既有 save error；再次 save 同一 aggregate，不重建 entry。
- Task-scoped load 失敗：已知 active draft entries 可保留；remote 歷史不得以空白成功取代。區段附近顯示
  最短「會議紀錄載入失敗」與「重試」，成功後移除錯誤。
- Namespace invalid：不破壞 record 或正文；讀取顯示錯誤而非假空白，append 停止。
- Invalid remote record 只隔離該 record；其他 valid records 與 active draft 仍可顯示。若 invalid 的正是
  active draft，composer 必須停止並保留輸入。UI 以一個區段級最短錯誤表示「部分會議紀錄無法讀取」。
- `getRecordDraftSignature` 已包含整份 metadata，DEV-106 local snapshot 也保存 clean metadata；新增 namespace
  必須納入 dirty／recovery signature，不另建 recovery storage。
- Metadata provider passthrough 已存在；實作需補三 provider round-trip 測試，證明 upsert/reload 不遺失 namespace。
- 不修改 `TaskRecordTimeline`／`taskKnowledgeSnippets` 的全量歷史能力；兩者不是本列表資料源。

## 6. 實作檔案與責任

| 檔案 | 變更責任 |
|---|---|
| `src/utils/meetingTaskQuickNotes.ts`（新增） | v1 parser、validator、append、anchor reconcile、invariant、projection、sort/dedupe；不得依 regex 單獨判定 provenance。 |
| `src/utils/meetingTaskDiscussion.ts` | 暴露正文 line parser／append result 所需資料；保留既有 DEV-009 格式相容性。 |
| `src/store/useRecordStore.ts` | append transaction、human edit／AI merge reconcile、save invariant、顯式結果與既有 metadata namespace 組合。 |
| `src/services/dataBackend.ts` | `RecordListByNodeOptions` 轉送。 |
| `src/services/firestoreService.ts` | task-scoped includeArchived read。 |
| `src/services/localTestService.ts` | task-scoped includeArchived read 與 deterministic fixture 支援。 |
| `src/services/supabase/projedService.ts` | RLS-safe task-scoped includeArchived read。 |
| `src/hooks/useTaskMeetingQuickNotes.ts`（新增） | request sequencing、retry、active draft override 與 loading/error state。 |
| `src/components/TaskNotes/TaskMeetingQuickNoteSection.tsx`（新增） | 緊湊純文字列表、latest-3、原地展開、composer 與 a11y。 |
| `src/components/TaskDetailsModal.tsx` | 在任務說明後插入 section，移除舊獨立藍色「本次會議」區塊並串接 submission id。 |
| `scripts/verify-dev-108-task-meeting-note-persistent-list.ts`（新增） | metadata、reconcile、dedupe、sorting、provider option、store failure 的 deterministic gate。 |
| `scripts/verify-dev-108-task-meeting-note-persistent-list-browser.pw.js`（新增） | 真實入口、跨模式持續、edit/archive/delete fixture、viewport、quietness 與 accessibility evidence。 |
| `package.json` | 登錄 DEV-108 static／browser 指令。 |

若實作發現需要修改 database migration、Supabase schema、Firestore rules、permission matrix 或新增遠端
recovery，必須停止並回 PM 升級風險；不得在 DEV-108 scope 內順手擴張。

## 7. Acceptance Criteria

- [ ] 只顯示 metadata v1 已登錄的任務明細人工補記；legacy、AI、任務活動及一般 task-linked 文字不出現。
- [ ] 按「加入」或 `Ctrl／Cmd + Enter` 後，新列立即出現且只有一筆；成功後才清空輸入。
- [ ] 原正文文字修改／刪除後，列表同一 entry 更新／移除；人工新增相似行不會誤納入。
- [ ] 相同行號文字編輯、其他行插入造成的位移與唯一候選皆可同步；多候選時 fail closed，不得錯配。
- [ ] AI synthesis 合併造成行號位移時可 rebase anchor；若 projection 遺失／歧義，保留原草稿並使 synthesis 失敗。
- [ ] active draft 到 saved／published record 切換不閃退、不短暫消失、不重複、不改排序。
- [ ] 結束 meeting mode、關閉／重開任務及 reload 後列表仍在；非 meeting mode 不顯示 composer。
- [ ] archived meeting record 仍顯示；source hard delete 後成功 reload 不再顯示。
- [ ] 一至三筆全顯示；四筆以上預設為最新三筆且正序；「其餘 N 筆」可原地展開／收合全部。
- [ ] 畫面順序正確，沒有卡片、每列框、icon、badge、搜尋、空狀態或常駐成功提示。
- [ ] denied／invalid metadata／load failure／save failure 不假成功；原輸入或已進 draft 的內容可恢復，重試不重複。
- [ ] DEV-008 task knowledge、DEV-009 append/token、DEV-024 synthesis、DEV-066 notes 與 DEV-106 recovery 不退化。
- [ ] 1440×900、1024×768、390×844 通過；390 只驗證持續列表，不開放既有 mobile meeting composer。
- [ ] 鍵盤、focus、`aria-expanded`、accessible name、長文換行與 200% zoom 可完成主要流程。

## 8. ADR、migration 與 release boundary

- ADR：不需要。本變更使用既有 `KnowledgeRecord.metadata` 擴充、內部 provider query option 與可逆 UI；
  不改外部 API、主資料身份、權限、database schema 或組織治理基準。
- Migration：無。legacy record 不回填，只有 DEV-108 後由任務明細加入的內容具有 provenance。
- Release：本文件只授權 RD 實作與 local QA/QC；不授權 commit、push、PR、deploy、production migration
  或 release。正式發版另走 deployment/release gate。

### 8.1 受控技術債

- 債務：quick note 在同一 `KnowledgeRecord` 內同時具有 canonical metadata entry 與 compatibility content
  projection；任意結構性文字編輯無法在沒有隱藏 marker 的前提下做到永遠無歧義配對。
- 影響：相同 task／分鐘的多候選遭大幅重排時，該 entry 會 fail closed 並離開 task-detail list；正文不丟失。
- 隔離：所有 append、reconcile、invariant 與 projection 只能存在 `meetingTaskQuickNotes.ts`；其他 UI／store
  不得自行解析或修補。
- 移除觸發：若未來 record editor 支援 stable structured quick-note node，或不再需要 DEV-009 content
  projection，另案把 stable id 納入 editor document model 後移除此 anchor reconciliation。
- 驗證：同分鐘重複、行號位移、文字修改、整列刪除、多候選與 invariant mismatch 都是 static 必測；
  任何錯配比 detach 更嚴重，直接判 Fail。

## 9. Stop Conditions

- 必須靠掃描自由文字才能判定 provenance，或會把 legacy／AI 內容誤納入。
- 任一方案把補記複製到 `TaskNode` 或另一筆可獨立編輯 record。
- active draft／persisted／archived identity 無法去重，或 meeting 結束時會短暫消失。
- provider 無法在既有 RLS 下安全讀取 archived linked record。
- namespace 損毀會被 silent reset，或 save/retry 可能清空尚未進入 draft 的輸入。
- 精簡 UI 造成錯誤不可見、focus 遺失、窄版 overflow 或 mobile composer 意外開放。

使用思考習慣：#效用理論、#系統描繪、#可驗證性
