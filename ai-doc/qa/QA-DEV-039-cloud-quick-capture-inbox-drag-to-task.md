# QA-DEV-039: 雲端快速備忘與拖移轉任務驗證計畫

狀態：Ready for RD / QC Pending  
文件角色：QA 驗證計畫  
建立日期：2026-06-30  
關聯 DEV：DEV-039  
對應 SPEC：`ai-doc/specs/SPEC-039-cloud-quick-capture-inbox-drag-to-task.md`

---

## 1. 驗證目標

確認快速備忘從「本機暫存」升級為「個人雲端備忘錄」，並能在 board view 中以接近既有任務拖移的體驗轉成正式 `TaskNode`。

驗證重點：

- 跨裝置同步可信。
- 私人資料不外洩。
- 離線/未登入不丟資料。
- 未同步項目不可轉正式任務。
- 拖移轉任務位置正確。
- 不使用 LLM token。
- 失敗時可見、可恢復。

---

## 2. Acceptance Matrix

| ID | 類型 | 驗證項目 | 預期 |
|---|---|---|---|
| QA-039-S01 | Static | migration 建立 `public.inbox_items` | table、indexes、RLS、grants、schema reload 均存在 |
| QA-039-S02 | Static | RLS owner-only | policies 使用 `to authenticated` + `owner_id = auth.uid()`，不使用 `auth.role()` |
| QA-039-S03 | Static | 前端 service | 有 inbox service / store sync / dedupe / retry / local outbox ownership |
| QA-039-S04 | Static | parser no-token | 無 LLM、AI function、Edge Function 或 token API 呼叫 |
| QA-039-S05 | Static | DnD contract | quick capture draggable 接入現有 `dnd-kit`，不使用第二套 HTML5 drag engine |
| QA-039-S06 | Static | promotion contract | 存在單一 transaction / RPC 或等效機制，不採前端兩段式建立 task 後 patch inbox |
| QA-039-S07 | Static | legacy migration | localStorage v1 item 可升級為 local outbox v2，且失敗不清空原文字 |
| QA-039-S08 | Static | user-facing naming | UI 文案使用 `快速備忘` / `備忘錄`，不得顯示 `收件匣` 或 `Inbox` |
| QA-039-D01 | DB | owner CRUD | owner 可新增、讀取、更新、封存自己的 inbox item |
| QA-039-D02 | DB | outsider isolation | 其他 authenticated user 不可讀寫 owner item |
| QA-039-D03 | DB | anon denied | anon 無法讀寫 `inbox_items` |
| QA-039-D04 | DB | Data API exposed | authenticated client 可透過 Supabase Data API 存取，anon 不可 |
| QA-039-D05 | DB | promotion atomicity | promote 成功時 TaskNode 與 InboxItem promoted 同時完成，失敗時兩者都不改 |
| QA-039-D06 | DB | promotion idempotency | 同一 inbox item / promotion key 重試不建立第二張任務 |
| QA-039-D07 | DB | board permission | viewer / 無權限者不可 promote 到 target board |
| QA-039-U01 | UX | 登入新增快記 | 顯示同步狀態，成功後為 `已同步` |
| QA-039-U02 | UX | 離線新增快記 | 顯示 `已存本機，待同步`，重新整理仍存在 |
| QA-039-U03 | UX | 同步失敗 | 顯示 `同步失敗` 與重試入口，原文字不消失 |
| QA-039-U04 | UX | pending item | 不可轉任務，disabled reason 清楚 |
| QA-039-U05 | UX | 整理入口 | QuickCaptureShell 可開啟整理備忘錄 |
| QA-039-U06 | UX | 匿名 item 認領 | 未登入建立的 item 登入後需明確認領，不可靜默同步 |
| QA-039-U07 | UX | 換帳號保護 | A 帳號 pending item 不會在 B 帳號同步或顯示為 B 的可轉任務 |
| QA-039-B01 | Browser | 手機新增、電腦讀取 | 同一帳號跨裝置可看到同一筆雲端 item |
| QA-039-B02 | Browser | 拖到欄位底部 | 建立新 `TaskNode`，parentId 為欄位 id，order append |
| QA-039-B03 | Browser | 拖到卡片間 | 建立新 `TaskNode`，order 位於兩卡之間 |
| QA-039-B04 | Browser | 拖到 checklist zone | 建立為目標卡片下層任務 |
| QA-039-B05 | Browser | 無效 drop | 不建立任務，item 留在收件匣 |
| QA-039-B06 | Browser | 轉任務成功 | `InboxItem` 標記 promoted，回填 task id，不可重複轉換 |
| QA-039-R01 | Regression | DEV-034 | 本機快記與安裝助理不破壞 |
| QA-039-R02 | Regression | DEV-028 | 既有任務拖移、點擊、右鍵不退化 |
| QA-039-R03 | Regression | DEV-035 | workspace delete flow 不受 inbox source hint 影響 |
| QA-039-R04 | Regression | DEV-036 | 切換 workspace / board 後 inbox source hint 正確 |

---

## 3. Manual UX Review

### 3.1 5 秒理解

驗證者應能在 5 秒內回答：

- 這筆備忘是否已同步？
- 是否可以轉任務？
- 如果不能，原因是什麼？
- 拖到哪裡會建立任務？

### 3.2 拖移手感

必查：

- 快記 drag preview 看起來像「待轉任務卡」。
- 看板 drop highlight 與既有任務拖移一致。
- 拖到欄位、卡片、checklist zone 時目標區域清楚。
- 釋放後不跳動、不建立錯位任務。
- mobile touch 下不與水平/垂直捲動嚴重衝突。

### 3.3 狀態文案

禁用模糊文案：

- `已登入，先存本機待整理`
- `已存入備忘錄` 但實際只本機
- `已同步` 但 DB 尚未成功

必須使用事實狀態：

- `已同步`
- `待同步`
- `同步失敗`
- `同步後才能轉任務`

---

## 4. DB / RLS QC Plan

測試角色：

- owner user A
- outsider user B
- anon
- service role only for setup/cleanup

案例：

1. A insert inbox item，A select 可見。
2. B select A item 回 0 rows 或 permission denied。
3. B update / delete A item 失敗。
4. anon select / insert 失敗。
5. A update `owner_id` 為 B 必須被 `with check` 擋下。
6. A promote item 後，`promoted_task_node_id` 指向同一 owner 有權建立的 board task。
7. promoted item 不可再次 promote。
8. A 以相同 `promotion_client_mutation_id` 重試 promote，回傳同一 task，不新增第二張任務。
9. A 以不同 `promotion_client_mutation_id` 重試已 promoted item，回傳 conflict。
10. viewer 或無 board create permission user promote 時失敗，且不建立 TaskNode。
11. target parent / before / after node 不屬於 target board 時失敗，且不建立 TaskNode。
12. 模擬 task insert 失敗時，InboxItem 不得被標記 promoted。
13. 模擬 inbox promoted update 失敗時，TaskNode 不得留存為 ghost task；若無法模擬 transaction 內部失敗，至少以程式碼審查確認沒有前端兩段式流程。

---

## 5. Failure Mode Tests

| 情境 | 預期 |
|---|---|
| 網路中斷後送出 | 本機 pending item 保留，文字不消失 |
| Supabase 500 | item 進 failed，可重試 |
| schema cache 未更新 | 顯示資料庫尚未就緒，不宣告同步成功 |
| 重複送出同 clientMutationId | 雲端不重複建立 |
| 建 task 失敗 | InboxItem 不標 promoted |
| InboxItem promoted 更新失敗 | transaction rollback，不得留下 ghost task；若 RPC 回傳未知狀態，UI 必須重新查詢 promoted 狀態 |
| promote request 成功但 response 遺失 | retry 使用同一 promotion key，回傳既有 task，不重複建立 |
| 使用者切換 board 拖移 | drop target 以目前 board 為準，不寫到舊 board |
| 權限不足 | 不建立任務，顯示權限不足 |
| 未登入建立 item 後登入 | 需顯示認領/匯入提示，不可靜默同步 |
| A 帳號建立 pending 後切到 B 帳號 | 不得上傳到 B，不得讓 B promote |
| legacy localStorage item 缺 clientMutationId | migration 補 v2 欄位，文字保留 |
| legacy migration 失敗 | 原 local data 保留，可重試 |

---

## 6. Suggested Verifiers

建議新增 package scripts：

```powershell
npm.cmd run verify:dev-039-cloud-quick-capture-inbox
npm.cmd run verify:dev-039-cloud-quick-capture-inbox-browser
```

Static verifier 應檢查：

- migration table / RLS / grant / notify。
- promotion RPC / transaction contract / execute grants。
- `database.types.ts` expose `inbox_items`。
- dataBackend expose inbox service。
- store 有 local outbox v2、syncStatus、clientMutationId、createdAuthUserId、anonymous ownership confirmation。
- legacy localStorage migration 不刪原文字。
- parser 沒有 AI / Edge Function / LLM import。
- DnD 使用 `dnd-kit`。
- pending item disabled reason。
- promotion 不走前端兩段式 task insert + inbox update。
- user-facing copy 使用 `快速備忘` / `備忘錄`，不使用 `收件匣` / `Inbox`。

Browser verifier 應檢查：

- mobile quick capture submit。
- local pending persistence。
- anonymous item login import confirmation。
- account switch protection。
- legacy localStorage migration。
- mock/sandbox cloud sync 後出現在 triage drawer。
- board view drag-to-task。
- successful promotion hides item from untriaged list。
- promotion retry does not create duplicate task。
- invalid drop does not promote。
- desktop 1440、tablet 1024、mobile 390 viewport 無 visible error。

---

## 7. RD Exit Gate

RD 完成前建議跑：

```powershell
npm.cmd run verify:dev-039-cloud-quick-capture-inbox
npm.cmd run verify:dev-039-cloud-quick-capture-inbox-browser
npm.cmd run verify:dev-034-pwa-install-guidance
npm.cmd run verify:dev-034-pwa-install-guidance-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-035-workspace-delete-persistence-fix
npm.cmd run verify:dev-036-trello-like-workspace-governance
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

若新增 Supabase migration：

- 需 DB QC 驗證 owner / outsider / anon。
- 需確認 Data API expose / grant。
- 需確認 PostgREST schema cache reload。
- 需驗證 promotion RPC 的 atomicity、idempotency 與 board permission。
- 需跑 Supabase advisors 或等效 MCP advisor；若工具不可用，QC 記錄限制。

---

## 8. QC 判定

通過：

- 快速備忘雲端同步與跨裝置可重現。
- 私人 RLS 邊界可重現。
- 拖移轉任務能建立正確 board / parent / order。
- promoted item 不可重複轉。
- promotion transaction 不產生 ghost task。
- 匿名認領與換帳號不造成資料同步到錯誤帳號。
- legacy localStorage migration 不丟資料。
- failure mode 不丟資料。
- mobile / desktop UI 無 visible error、重疊、裁切或不可操作。

未通過：

- 任何未同步 item 可被轉正式任務。
- 任何非 owner 可讀私人 inbox。
- 拖移建立錯位置任務。
- 失敗時 item 消失或重複建立。
- 出現 TaskNode 已建但 InboxItem 未 promoted 的 ghost state。
- A 帳號或匿名 item 靜默同步到 B 帳號。
- legacy migration 清空或覆蓋使用者文字。
- UI 顯示 `已同步` 但 DB 未成功。
- parser 呼叫 AI token。

未充分驗證：

- 沒有 DB/RLS evidence。
- 沒有真實 browser drag evidence。
- 只跑 lint/build，未驗證 UI 與資料一致性。
