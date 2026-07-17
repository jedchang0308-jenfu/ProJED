# QC-DEV-055：電腦版任務拖拉落點清晰化與跨階層定位升級

關聯 DEV：DEV-055  
關聯 SPEC：`ai-doc/specs/SPEC-055-desktop-task-drag-target-clarity.md`  
關聯 QA：`ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md`  
狀態：QC Passed / User Desktop Acceptance Passed / Production Released / Level 4 Passed
執行日期：2026-07-17

## 1. QC 結論

DEV-055 第一次自動化通過後，使用者 T01-T08 真實桌機操作回報未通過：同一格定位線會飄，且 L3+ 任務會被定位線推開。RD Rework 1 已完成並通過自動化、browser 與指定回歸，Stop Ship technical finding 為 0；2026-07-17 使用者回報 Rework 後 T01-T08 共 38 次真實桌機操作及新版手感主觀確認已通過。同日使用者要求部署正式環境，release 以 clean worktree branch `codex/dev055-production-release-20260717-234436` artifact commit `e07ba4b` 發布到 Firebase Hosting production，Level 4 post-deploy smoke 通過。

- 全畫面同時最多一個 `data-desktop-drop-indicator="true"`。
- before / after / append 的 displayed descriptor 與 drop 後 parent/order 共用 canonical resolver，commit 前會以最新 store revalidate。
- child row 採 innermost ownership；無效 source/descendant 不會 fallback 到 ancestor card。
- expanded card 使用 bounded primary geometry，不以整張展開卡片外框當主命中區。
- desktop indicator 為 fixed overlay；card/checklist normal flow 內不再渲染第二條 inline target marker。
- L3+ target hover 時 sibling row 不被推開，B15 實測 row top/bottom delta = 0、parentTransform = `none`。
- 同一 L3+ target 內三次微移時 indicator descriptor 不變，rect top/left/width delta = 0。
- 既有 DragOverlay、8px threshold、click、right-click、blank canvas pan、單次 undo 均保留。
- Workbench unplaced row 可 placement；placed row 不暴露 drag source，仍不能拖。
- 未移植 mobile retain/hysteresis、action rail 或 touch lifecycle 到桌機。

## 2. Required Gates

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-055 static | Pass | 27/27 |
| DEV-055 browser | Pass | B01-B16，16/16，wrong commit 0，console/network error 0 |
| DEV-046 static / browser | Pass | 29/29；browser exit 0 |
| DEV-053 static / browser | Pass | 30/30；browser 10/10；B10 cancel lifecycle 重驗通過 |
| DEV-054 static / browser | Pass | 34/34；R01-R10 10/10 |
| TypeScript | Pass | `npx.cmd tsc --noEmit` |
| Production build | Pass | `npm.cmd run build`，1970 modules transformed |
| QA T01-T08 / user acceptance | Pass | Attempt 1 未通過；RD Rework 1 後使用者回報 38 次真實桌機操作通過 |
| Level 2 local artifact smoke | Pass | production bundle `assets/index-DpRjvQu-.js` / `assets/index-B8eLAVHK.css` 載入，root non-empty，critical browser errors 0 |
| Level 3 Firebase preview | Pass | `https://projed-cc78d--level3-smoke-o1na5wft.web.app`，`playwright-run-code-exit=0`，critical errors 0 |
| Level 4 production smoke | Pass | `https://projed-cc78d.web.app`，live channel release time `2026-07-17 23:56:26`，critical errors 0 |

## 3. Browser 與視覺證據

- Current-state revalidation：2026-07-17 重新於目前 worktree 執行 DEV-055 / DEV-046 / DEV-053 / DEV-054 static 與 browser gates、TypeScript、production build，均 Pass。
- Evidence base：`output/playwright/dev-055-desktop-drag-1784299443605-*`。
- Latest current-state revalidation：2026-07-17 於 T01-T08 使用者驗收失敗回送 RD 後再跑 DEV-055 static 27/27、DEV-055 browser B01-B16 16/16、DEV-046 static/browser、DEV-053 static/browser、DEV-054 static/browser、`npx.cmd tsc --noEmit`、`npm.cmd run build`，均 Pass；最新 DEV-055 evidence base：`output/playwright/dev-055-desktop-drag-1784301885366-*`。
- User acceptance：2026-07-17 使用者回報 RD Rework 1 後 T01-T08 測試通過，確認同格不飄、L3+ 不被定位線推開、桌機手感沒有被重做。
- Production release：release branch `codex/dev055-production-release-20260717-234436` 已 push；artifact commit `e07ba4b`。Firebase live URL `https://projed-cc78d.web.app`；production loaded JS `assets/index-DpRjvQu-.js` SHA-256 `A60177E7FF2B41B24AB2853CBEF40AE23FAF7F764EC805D2EA8DE8D79113E36B`，CSS `assets/index-B8eLAVHK.css` SHA-256 `BC7359535F85D3F5CAB38E8FFA2A15674F709FCD3E902FA5811E2A944D4B7755`，BoardView chunk `assets/BoardView-BnpKRjQU.js` SHA-256 `A95571CCAC646269F1773FDBF1361D8539A59FB957924FC6BB4C738550860141`；線上 hash 與本機 production artifact 一致。
- Rollback reference：Firebase live channel 部署前最後 release time 為 `2026-07-17 18:23:15`；若前端回歸，從 Firebase Console Hosting release history 回退到該 live release。
- 同欄 after：`B01-card-after.png`；同欄 before：`B01-card-before.png`。
- checklist 跨 parent：`B05-checklist-cross-parent.png`。
- expanded child ownership：`B07-expanded-child-ownership.png`。
- 1024x768 同欄 / 跨欄：`B08-1024-same-column.png`、`B08-1024-cross-column.png`。
- Workbench placement：`B12-workbench-placement.png`；undo 前：`B13-before-undo.png`。
- L3+ no-push / same-cell stability：`B15-l3-stable-overlay.png`。

視覺檢查確認 indicator 單一且貼合 target 幾何，source placeholder 不冒充 live target，overlay 維持既有桌機樣式；1024x768 無裁切或水平 overflow；B15 證明 L3+ row 不被 indicator 推開，且同一格微移不漂移。

## 4. 回歸期間矯正

- DEV-055 T01-T08 Attempt 1 使用者驗收失敗：定位線同格漂移、L3+ 被推開。RD Rework 1 將卡片 checklist append dropzone 改為 overlay hit area，移除卡片 inline `KanbanInsertionMarker`，並在桌機 task drag 期間凍結 card/checklist sortable displacement。
- DEV-053 B10 發現取消後原 touch stream 的 compatibility click 會誤開 task details；session 現在只吞掉取消後的那一次 click，五種 cancel path 重驗通過。
- 共用 Playwright runner 原先未關閉 session，造成 Node/Chrome 累積與 `ERR_INSUFFICIENT_RESOURCES`；runner 已用 `finally` close，Vite watcher 排除 `.playwright-cli` 與 browser evidence 目錄。重驗後 `OPEN_SESSIONS=0`、測試站 HTTP 200。

## 5. 最終判定

`Technical QC：Pass`
`Stop Ship technical findings：0`
`T01-T08 true desktop operation：Pass`
`User subjective acceptance：Pass`
`DEV-055 completion gate：Passed`
`Production deployment：Pass`
`Level 4 production smoke：Pass`
`Authenticated production drag smoke：Manual pending; Codex did not automate production login`
