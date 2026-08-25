# SPEC-089 全域工作台權威任務搬移交易

日期：2026-08-25  
狀態：Authoritative／RD Implemented／Local QA-QC PASS／Remote Migration Pending／未 Release  
關聯：DEV-089、DEV-086、DEV-039、CAPA-20260825-01

## 問題與目標

production 觀察到同一筆任務在一個裝置上呈現「已歸位」，另一裝置仍以遠端 canonical 資料呈現「未歸位」。既有流程先更新本機 Zustand，再用分離的 create／delete 寫入兩個 ownership surface；失敗不會回滾本機，也沒有可等待的交易結果，因此形成假成功與跨裝置分歧。

本規格以單一權威交易取代 SPEC-086 的 optimistic failure recovery 敘述。跨越「看板 WBS ↔ 帳號級未歸位」邊界時，前端必須先等待 canonical persistence 成功，再收斂本機狀態；失敗則保留完整來源子樹。

## Spec Impact

`Intentional replacement`：

- 取代 SPEC-086「本地 optimistic batch 可由 undo 或重載恢復」；新的必要條件是 failure 時 UI／local cache／canonical source 都不得先搬移。
- 不改工作台的雙向操作、完整子樹、跨工作區、已歸位唯讀、共用定位線與手機 inclusion／exclusion。
- 新增 Supabase migration、owner-scoped operation ledger 與 transactional RPC；production migration、Level 3、production deploy、Level 4 仍是獨立 release authority。

## 權威交易不變量

1. `await-before-local-commit`：RPC 或 provider persistence 成功前，不修改任務的本機 ownership placement。
2. `exactly-one-source`：成功後每個 task ID 只存在目的 surface；失敗後只存在原 surface；不得同時存在兩邊或兩邊皆無。
3. `complete-subtree`：server 依 root 從 canonical source 重建完整 subtree，請求 ID 集合必須完全相等；不接受只搬父任務或額外夾帶節點。
4. `hierarchy-preserved`：root 移入未歸位後為 `parentId=null`；descendants 的 parent links 必須與來源一致；歸位時只有 root 可取得 subtree 外的目的 parent。
5. `idempotent`：同一 owner＋operation ID 的 direction、root、task IDs、source、target 不可變；已 committed 的重送只回傳原結果，不可重做 mutation。
6. `pending-source-stable`：交易進行中，來源列保留原位、整棵子樹不可再次拖曳；realtime refresh 不得以目的投影提前取代來源。
7. `success-effects-only`：只有交易成功後才能寫 local undo、meeting activity、ancestor roll-up 與成功狀態；failure 只顯示保留來源的錯誤。
8. `lossy-link-fail-safe`：含 record link、quick memo promotion link 或 dependency 的 subtree，在尚未有完整關聯搬移策略前拒絕進入 global workbench，來源保持不變。

## Supabase 交易與安全

- `task_workbench_placement_operations` 以 `(owner_id, operation_id)` 為主鍵，記錄 direction、root、task IDs、source／target、platform、status、error code、elapsed time 與 result；不記錄 task title／description。
- owner RLS 只允許本人 select、建立純 `pending` operation，或把自己的 `pending` 標成 `failed`；authenticated 只有 status／error／elapsed 的欄位級 update grant，無法自行偽造 `committed`／result 或改 immutable payload。新 table 權限明確授予，不依賴 schema auto exposure。
- public RPC 為 `SECURITY INVOKER`；private implementation 為 `SECURITY DEFINER SET search_path=''`，每次都驗證 `auth.uid()`、owner 與來源／目的看板的 `move_task` capability。判定會讀取 `board_role_permissions`，未設定時才套用與前端相同的 owner／admin／project_manager／member 預設，避免以一般 write permission 繞過管理員關閉的「移動任務」。
- source rows 與 operation row 使用 row lock；insert destination、delete source、activity event、operation committed result 位於同一 PostgreSQL transaction。
- 看板→未歸位的 task content／assignment／tags／dates 由 server 從 locked canonical WBS row 重建；client 只能提供經驗證的 root、完整 ID set、目的 placement 與 order，不得藉 `move_task` RPC 繞過 `edit_task` 修改內容。未歸位→看板同樣以 owner-scoped canonical JSON 為內容來源，只合併目的 placement 欄位。
- 目的 workspace 缺少來源 tag／assigned member、來源有 record link／quick memo promotion link／dependency、permission 不足、partial subtree、identity collision 或刪除筆數不符時，整筆 rollback。
- transport ambiguity 只可用相同 operation ID 重試一次；第二次回應仍遺失時，以條件式 `pending→failed`（會序列化等待 RPC row lock）再讀 ledger：已 committed 才收斂成功、failed 才宣告來源保留；readback 仍不可得時顯示「結果尚未確認，請重新整理」，不得產生新 mutation ID 或冒稱失敗。

## UI 契約

- 桌機與手機沿用相同 durable commit owner。
- pending 期間原列原位顯示共用 11px spinner；不新增說明段落、modal、遮罩或版面容器。
- 看板 L1／L2／L3+ 與未歸位列共用 `TaskPlacementPendingIndicator`；整棵 pending subtree 暫停拖曳。
- board→未歸位失敗：`搬移失敗，任務已保留在原位置。`
- 未歸位→board 失敗：`歸位失敗，任務已保留在未歸位。`
- transport 結果無法 readback：`搬移結果尚未確認，請重新整理後再操作。`
- failure 不顯示目的副本、不計成功 activity、不推 undo entry。

## 驗收標準

- AC-089-001：手機與桌機跨 ownership drop 都 await 同一 durable transaction。
- AC-089-002：390×844 fault injection 中，root／child／grandchild 在 pending 期間留在來源且有 compact indicator。
- AC-089-003：fault 後 local storage、runtime、DOM 均保留來源三節點與原 parent chain；未歸位副本為 0。
- AC-089-004：failure 後 pending／drag preview／indicator／action rail 全數清除，且 ancestor roll-up、undo success effect 不執行。
- AC-089-005：server 對兩方向驗證 exact full subtree、owner、可設定的 `move_task` permission、immutable idempotency payload 與 exact delete count。
- AC-089-006：transaction rollback 可涵蓋 destination insert、source delete、activity log 與 operation result。
- AC-089-007：record-linked／dependency subtree 被 fail-safe 拒絕且來源不變。
- AC-089-008：DEV-086／DEV-039 的成功 flow、完整子樹、定位線、已歸位唯讀與手機 touch 不回歸。
- AC-089-009：TypeScript、test build、Supabase static／migration history gate、targeted lint 與 diff check 通過。
- AC-089-010：production migration 前必須在 Supabase TEST 執行 RPC success／rollback／idempotency／RLS／advisors，並完成 Level 3；production 後以同 commit 執行 Level 4 與 7／30 日 effectiveness check。

## Release 與 rollback boundary

- 本 DEV 的 local implementation 不代表 production migration、deploy 或 release。
- release 順序固定為：local DB migration test → Supabase TEST migration/RPC matrix → Level 3 → production migration → frontend deploy → Level 4。
- migration 前 frontend 不得啟用新 RPC；frontend 與 DB 必須由同一 release candidate 證據綁定。
- 若 Level 3 或 Level 4 出現任何 task ID 兩邊皆有、兩邊皆無、partial subtree、跨帳號可見或假成功，立即 stop-ship；前端回退到前一版本，DB function 保留但不由舊 client 呼叫，另開復原 CAPA。
