# QC-DEV-090 預設全顯示與帳號看板篩選一致性

建立：2026-08-26

目前判定：`RD Implemented / Local Automated QA-QC PASS / Release Gate Required`

規格：SPEC-039 DEV-090 addendum

決策：ADR-045

驗證計畫：QA-DEV-090

## 1. QC 結論

DEV-090 本地開發已完成。未設定篩選時六種狀態全部開啟且 active count 為 0；使用者主動設定後依帳號 × 看板隔離；看板、清單、心智圖、甘特與行事曆共用同一 canonical projection；載入失敗、真無資料、filtered zero與偏好同步失敗均有互斥且可辨識的 UI 狀態。

本判定只代表同一 local source boundary 的 RD／QA／QC 完成，不代表 production Released。遠端 migration、正式資料、deploy與 production smoke 均未執行。

## 2. Source and environment boundary

| Item | Evidence |
|---|---|
| Source | Git HEAD `3b59c1c` + DEV-090 dirty working-tree boundary，驗證截止 2026-08-26 19:50 +08:00 |
| UI runtime | task-owned local-test server，`http://localhost:4000/` |
| Viewports | desktop `1440×900`；mobile `390×844` |
| UI actors | `local-test-user`、`local-test-admin` |
| UI boards | `dev090-board-a`、`dev090-board-b`、`dev090-board-empty` |
| DB runtime | disposable PostgreSQL 18 + Supabase-compatible auth roles/helper，套用 actual DEV-090 migration |
| Cleanup | DB port `58343` released、cluster removed；UI runtime stopped、port 4000 released |
| Artifact | `output/playwright/dev-090/result.json` 與同目錄 screenshots |

## 3. Factual evidence

| Layer | Result | QC fact |
|---|---:|---|
| Default／migration／repository | PASS 10/10 | default與reset皆全顯示；v1～v3 filter丟棄、display／selected board保留；remote none、pending、unknown version與scope queue符合契約 |
| Canonical projection | PASS 5/5 | matched、context、visible、total分離；archived、orphan、cycle、cross-board不洩漏；state priority唯一 |
| DB schema／RLS | PASS | explicit authenticated CRUD grants、anon無權、own/readable-project policies、viewer preference CRUD、other account/inaccessible deny、constraint／trigger／cascade均通過 |
| Five-mode browser | PASS | Board／List／MindMap／Gantt／Calendar visible IDs一致；root→parent→matched descendant脈絡完整 |
| Account／board isolation | PASS | A/B帳號不互相繼承；同帳號board A/B只恢復精確scope；reset刪除精確cache |
| Observable states | PASS | loading、task error、true empty、filtered zero與sync warning互斥；filtered zero只有一個reset CTA |
| No-date eligibility | PASS after corrective fix | no-date matched tasks保留於Gantt／Calendar側欄；grid不建立bar／segment並顯示mode提示 |
| Mobile | PASS | 390×844 Board filter與warning可達；body/document scroll width均為390，無document overflow |
| Diagnostics | PASS | DEV-090 browser `diagnostics=[]`、`networkFailures=[]` |
| Targeted regressions | PASS | account-scoped 7/7、DEV-039 core 66/66、parity 26/26、DEV-027D 11/11，四組browser皆PASS |
| Compile／build | PASS | `tsc --noEmit`零錯誤；`build:test`與PWA產物成功 |

## 4. Corrective finding during QC

第一次 B18 觸發產品反例：Gantt 對沒有有效日期的 canonical visible task仍建立全時間範圍虛線 fallback bar。這違反 frozen QA 的 mode-eligibility邊界。

RD 將 `GanttView` 的 canonical filter visibility與timeline eligibility分離：側欄仍使用全部 `flattenedItems`，timeline只渲染至少有一個有效日期的 `timelineItems`。原 failure screenshot保留，修正後 DEV-090 browser、TypeScript、build與受影響 regressions全部重跑通過。

## 5. Ownership and security review

- `useTaskFilterStore` 是板內條件唯一 owner；`useBoardStore`只保留navigation／display，`useTagStore`只保留tag data。
- 五模式只經 `projectTaskFilterResults()` 建立canonical identity truth；`CalendarSubscriptionBuilderPreview` 的 snapshot predicate屬DEV-045訂閱預覽邊界，未併入板內active state。
- v4 localStorage只保存exact account×board cache與pending journal；遠端row不存在代表default；未知新版remote row會阻擋舊client mutation。
- Migration未加入Realtime publication，未回填server filter，未使用`profiles.ui_preferences` whole-json。

## 6. Release boundary

以下仍屬未執行且不可由本QC推定：remote Supabase migration apply、production migration history reconcile、backup、deploy、authenticated production smoke、Level 3／Level 4與release artifact。

Release gate若開始，必須以本QC通過的migration與client作同一候選來源，重新驗證production target的migration order、RLS、登入帳號跨看板／跨模式與reset readback；未完成前狀態維持 `Not Released`。
