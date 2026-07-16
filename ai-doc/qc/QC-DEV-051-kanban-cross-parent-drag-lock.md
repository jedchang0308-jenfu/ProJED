# QC-DEV-051: 看板跨父層拖拉停留鎖定與落點定位

狀態: Historical Evidence / Superseded by main Runtime Restoration
關聯 DEV: DEV-051
關聯 SPEC: `ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md`
關聯 QA: `ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md`
執行日期: 2026-07-16
執行基準: branch `持續優化1`，dirty worktree based on `9efc596`

> 2026-07-16 回復註記：以下 QC 結論屬於已撤回版本，不能作為目前 runtime 的通過證據。
> 現況是拖拉程式與基準 browser verifier 回復 `main`，DEV-051 專屬模組與 verifier 已移除。

## 1. QC 結論

DEV-051 本機交付通過。看板同父層拖拉立即 before／after；跨父層只有在同一 parent 停留 750ms 後才 locked。桌面與手機共用 resolver，畫面只保留 locked group frame 與 exact insertion line；鎖定文字、breadcrumb／Level、arming progress、empty-lane 文案與 floating status 已移除。empty child lane、filter canonical ordering、action rail priority 與 single batch undo 均有自動化或瀏覽器證據。

本結論不包含 production deploy、production smoke、physical phone 手感、remote data mutation 或 release。未建立 commit、push 或 PR。

## 2. 實作事實

- `kanbanDropIntent.ts` 集中 750ms lock、200ms unlock grace、20px mobile tolerance、target validity、canonical order 與雙 ancestor rollup；文字提示專用 breadcrumb／Level state 已移除。
- `BoardView.tsx` 的 desktop/mobile adapters 共用 resolver；arming/locked 只更新 transient context，有效 release 才 `batchUpdateNodes`。
- `KanbanDropFeedback.tsx` 只提供 group frame、before/after/append indicator 與 text-free child empty lane；可見鎖定文字與 floating status 已退役。
- 舊 `wbs-card-drop`／`wbs-checklist-drop` 隱性中央 child semantics 已退役。
- 純結構排序 patch 不觸發無關 smart-status／主責 guard，避免 sibling normalize 只更新一半。

## 3. Automated Evidence

| Gate | Result |
|---|---|
| `verify:dev-051-kanban-cross-parent-drag-lock` | Pass，28/28 |
| `verify:dev-051-kanban-cross-parent-drag-lock-browser` | Pass，6/6 |
| DEV-046 static/browser | Pass，27/27 + browser |
| DEV-029 static/browser | Pass，32/32 + browser operation matrix |
| DEV-039 filter parity static/browser | Pass，26/26 + browser |
| DEV-044 undo static/browser | Pass，25/25 + browser |
| DEV-048 multi-person assignment | Pass |
| TypeScript `--noEmit` | Pass |
| `build:test` | Pass，1964 modules transformed |

DEV-051 browser 覆蓋：

- 同父層立即排序，不進 arming。
- 跨父層未 locked 放開為 no-op。
- 750ms locked 後顯示完整 parent frame 與精確 before insertion line，不渲染鎖定文字或 floating status，並正確提交。
- text-free child empty lane insertion line locked 後追加為直接 child。
- mobile long-press 後 cross-parent lock 與 release commit。
- mobile action rail 優先，沒有 action + move 雙重提交。

## 4. UI QC

人工檢視下列本機 browser screenshots：

- `output/playwright/dev-051-kanban-parent-lock-1784166975189-desktop-locked.png`
- `output/playwright/dev-051-kanban-parent-lock-1784166975189-desktop-empty-lane.png`
- `output/playwright/dev-051-kanban-parent-lock-1784166975189-mobile-locked.png`

通過項目：

- Desktop 1440x900：目標整個 parent group 框線與 exact insertion line 可同時辨識，未被 DragOverlay 遮蔽；舊浮動／群組內鎖定文字不存在。
- Empty lane：只顯示可命中的細插入線，沒有「放入／停留／已鎖定」文案。
- Mobile 390x844：compact action rail、locked parent pill、group frame 與 insertion line 無主 CTA 裁切。
- Browser assertion：visible alert/error sweep 無錯誤，body/document 無非預期 horizontal overflow。

## 5. 本輪發現並修正的缺陷

1. 本機 fixture seed size 錯誤導致預設資料覆蓋；修正為固定 seed contract `12`。
2. 行動版 touchend 重新命中來源本身，覆蓋最後有效 locked target；改為 invalid final hit 不取代最後有效 hover。
3. Checklist exact position 使用 sortable rect center，巢狀列會誤判 before／after；桌面改用 final pointer position，鍵盤才 fallback rect center。
4. DnD release 瞬間 `over` 清空會丟棄畫面上的有效 intent；加入 final pointer DOM revalidation，同父層命中可提交，跨父層仍要求 locked。
5. 逾期無主責 sibling 的 order normalize 會誤觸 smart-status guard，造成部分更新；純結構 patch 現在不觸發無關狀態轉換。
6. 先前為避免 DragOverlay 遮住落點曾加入 floating lock status；依 2026-07-16 最新使用者決策退役全部鎖定文字，只保留不被 overlay 遮住的 group frame 與 insertion line。

## 6. Acceptance Coverage

SPEC-051 的 15 項 acceptance criteria 由 deterministic/static、DEV-051 browser、DEV-029/039/044/046/048 regressions、TypeScript/build 與人工 screenshot QC 組合覆蓋。高風險不變量均通過：未滿 750ms 不跨 parent、parent identity 不以 Level 取代、hidden sibling 相對順序保留、cycle/self 拒絕、single batch/undo、action rail 不 double-submit、cancel/pan-first 無回歸。

## 7. Remaining Boundary

- Physical phone supplemental：Not Executed。
- Production deploy/smoke：Not Authorized / Not Executed。
- DB/schema/RLS/RPC/API/migration：Unchanged。
- Git commit/push/PR：Not Executed。

後續若要 release，必須另行取得使用者授權並套用 `deployment-release-gate`；不得以本機 QC 取代 production evidence。
