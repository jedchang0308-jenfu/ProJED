# QA-DEV-029: 手機 Pan-First 觸控手勢驗證計畫

關聯 DEV: DEV-029
關聯 SPEC: `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`
狀態: Phase 1 + Phase 1B Local Automated Browser QA Passed / Physical Phone Supplemental Not Executed / Production Not Deployed
建立日期: 2026-07-04

## DEV-051 Regression Ownership Addendum（2026-07-16）

- 本 QA 繼續 authoritative 驗證 quick tap、short pan、long-press entry、compact action rail、edge auto-scroll 與所有 cancel safety。
- `QA-DEV-051` 另驗證 lift 後跨父層 750ms lock、20px tolerance、empty/collapsed child lane、filter ordering，以及 action rail 與 task move 不得雙重提交。
- DEV-051 本輪已重跑本 QA：static 32/32 與 browser operation matrix passed；此證據只涵蓋本機自動化，physical phone／production 仍未執行。

## 驗證目標

確認手機 coarse pointer 下，BoardView 的主要手勢從 click-first 改為 pan-first：使用者在任務卡、子任務列、欄位與空白處短滑都能移動畫面或至少不觸發任務功能；長按才進入任務操作；互動控制仍可直接點擊。

2026-07-05 Phase 1B addendum:
- 只改手機模式，電腦模式不改。
- 手機長按任務後在 viewport 上方顯示有文字標籤的 compact action rail，不再顯示完整桌機右鍵清單。
- Compact action rail 只保留：標示完成 / 取消完成、新增同階任務、新增下層任務、刪除任務。
- 長按後任務需浮起並進入 drag-action mode，可拖曳排序，也可拖到安全操作選項。
- 拖到刪除只開確認，不得直接刪除。

使用思考習慣：#可驗證性、#證據基礎、#變數控制

## 操作情境全清單

本清單是 QC 執行順序的來源。若某項無法自動化，QC 不得刪除該情境，只能標示 `Manual Required` 或 `Blocked` 並說明原因。

### A. 進入條件與可視錯誤

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-A01 | 手機 viewport 載入 | 390x844、coarse pointer、local-test session | 開啟 BoardView | 看板可見，沒有空白頁或載入失敗 | screenshot、URL、viewport |
| QA-029-A02 | Visible error sweep | A01 後 | 掃描 `.inline-error`、`[role=alert]`、HTTP 4xx/5xx、Not Found、Internal Server Error、可見 `/api/` 錯誤 | 不得出現可視錯誤 | DOM/text sweep |
| QA-029-A03 | Mobile mode scope | 390x844 | 檢查 mode switcher | 手機只 exposes board mode；list/mindmap/gantt/calendar/records 不作本輪驗收 | DOM count |
| QA-029-A04 | Viewport safety | 390x844 | 檢查 body/client width、主要 surface bounding box | 不得出現非預期水平 overflow、固定列遮擋主要任務 | screenshot + width metrics |

### B. Pan-first 主情境

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-B01 | 任務卡主體短滑 | 任務卡可見 | 在 card body touchmove > 10px 後放開，並模擬 compatibility click | 不開 details / menu / rename / drag；click-through 被 suppress | gesture trace、negative DOM |
| QA-029-B02 | 任務卡標題文字短滑 | 任務卡 title 可見 | 在 title 文字上短滑 | 不進 rename、不開 details、不開 menu | negative DOM |
| QA-029-B03 | 子任務列短滑 | checklist row 可見 | 在 child task row 上短滑 | 不開 details / menu / rename / drag | negative DOM |
| QA-029-B04 | 欄位內容區短滑 | column body 可見 | 在 column scroll surface 上短滑 | 不觸發任何 task action；可自然 pan 或至少不 click-through | scroll/negative DOM |
| QA-029-B05 | 看板空白 / gap surface 短滑 | board surface 可見 | 在 board empty/gap 或 mobile pan rail 上短滑 | 不觸發 task action；可自然 pan | scroll/negative DOM |
| QA-029-B06 | 任務台任務列短滑 | mobile workbench overlay 可見 | 在未歸位 / 所有任務排序 row 上短滑 | 不誤開詳情、不拖移、不開 filter | negative DOM |
| QA-029-B07 | L2+ 子任務列垂直短滑 | checklist row 可見且欄位可垂直捲動 | 在 child task row 上向上短滑 | column `scrollTop` 有可觀察增加，不誤開任務功能 | scrollTop before/after |
| QA-029-B08 | L2+ 子任務列水平短滑 | checklist row 可見且看板可水平捲動 | 在 child task row 上向左短滑 | board `scrollLeft` 有可觀察增加，不誤開任務功能 | scrollLeft before/after |
| QA-029-B09 | 手機拖曳把手短滑 | task drag handle 可見且看板可水平捲動 | 從把手向左短滑 | board `scrollLeft` 有可觀察增加，不啟動 dnd-kit drag / action rail | scrollLeft before/after + negative DOM |

### C. 長按與取消情境

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-C01 | 任務卡靜止長按 | 任務卡可見 | touchstart 後靜止 500-650ms | Phase 1B：任務浮起並顯示 compact action rail，不開完整桌機右鍵清單 | rail screenshot / DOM |
| QA-029-C02 | 子任務列靜止長按 | checklist row 可見 | 靜止長按 | Phase 1B：子任務浮起並顯示 compact action rail，不開完整桌機右鍵清單 | rail screenshot / DOM |
| QA-029-C03 | 位移超過 tolerance 取消長按 | 任務卡可見 | touchstart 後移動 > 10px 並等待 > 550ms | 不開 menu、不開 details | negative DOM |
| QA-029-C04 | 長按後 click-through suppress | C01 後 | 放開後觀察 / 模擬 click | 不因放開長按再開 details | modal count |
| QA-029-C05 | action rail viewport safety | C01 後 | 觀察 action rail bounding box | action rail 不超出 390x844，不遮住到不可操作 | screenshot + bounding box |
| QA-029-C09 | 父任務拖曳把手長按 | task drag handle 可見 | 長按把手 500-650ms | 進入 mobile drag-action mode，不進 dnd-kit TouchSensor 拖曳 | rail + preview DOM |
| QA-029-C10 | 子任務拖曳把手長按 | checklist drag handle 可見 | 長按把手 500-650ms | 進入 mobile drag-action mode，不進 dnd-kit TouchSensor 拖曳 | rail + preview DOM |
| QA-029-C11 | touchcancel 復原 | C01 後 | 送出 `touchcancel` | action rail / drag preview 消失，不提交排序 / 完成 / 刪除 | negative DOM + debug trace |
| QA-029-C12 | drag-action 右邊緣自動捲動 | board 可水平捲動 | 長按任務後拖到 board 右邊緣 | board `scrollLeft` 自動增加，action mode 不卡死 | scrollLeft before/after + debug trace |
| QA-029-C13 | drag-action 欄位底部自動捲動 | column 可垂直捲動 | 長按任務後拖到 column 底部邊緣 | column `scrollTop` 自動增加，action mode 不卡死 | scrollTop before/after + debug trace |

### D. Tap / Click 語意

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-D01 | 手機普通 quick tap 任務卡 | 任務卡可見、無位移、無長按 | tap card body | 開啟對應任務的 `TaskDetailsModal`；短滑 pan 仍不得 click-through | modal task id |
| QA-029-D02 | 手機普通 quick tap 子任務 | 子任務列可見 | tap checklist row | 開啟對應子任務的 `TaskDetailsModal`；短滑 pan 仍不得 click-through | modal task id |
| QA-029-D03 | 桌機 click-to-details 回歸 | 1440x900、mouse click | click task card | DEV-028 桌機 click-to-details 仍開 `TaskDetailsModal` | modal screenshot |

### E. Interactive control 例外

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-E01 | 工作台 collapsed toggle | 390x844 | tap collapsed rail toggle | 工作台可展開，不被 pan guard 擋住 | screenshot |
| QA-029-E02 | 工作台 filter button | 工作台展開 | tap `過濾器` | filter popover 開啟 | popover screenshot |
| QA-029-E03 | 未歸位新增 input | 工作台展開 | tap input 並輸入文字 | input 可聚焦與輸入 | input value |
| QA-029-E04 | 看板欄位新增任務 input | 欄位表單可見 | tap/fill `輸入任務名稱` | input 可聚焦與輸入，不開 details | input value |
| QA-029-E05 | 外層 rename control 移除後 hit-test | 任務卡可見 | 確認外層 rename control/input/menu 不存在，並 tap 卡片 title | 不存在外層 rename 控制項，且手機 tap 仍開啟正確任務詳情 | DOM count / modal task id |
| QA-029-E06 | checklist 展開/收合 | card 有 child task | tap 展開/收合控制 | 只展開/收合，不開 details | DOM count / screenshot |
| QA-029-E07 | date / dependency / assignee / tag controls | 對應控制可見 | tap 控制 | 控制自身行為正常，不開 details | control-specific DOM |

### F. Drag / DnD 防誤觸

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-F01 | 主卡面短滑不得啟動 drag | 任務卡可見 | 在主卡面短滑 | 不出現 drag overlay / preview，任務位置不變 | DOM / order |
| QA-029-F02 | explicit drag handle 保留 | drag handle 可見且有權限 | 檢查 handle selector / computed style | `data-task-drag-handle="true"` 存在，且只有 handle 可 `touch-action: none` | DOM + computed style |
| QA-029-F03 | dnd-kit 不早於 pan 搶事件 | 任務卡可見 | 小距離短滑、斜向短滑、縱向短滑 | 不誤拖、不開 details | negative DOM |

### G. Task Workbench mobile 回歸

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-G01 | collapsed rail 可開啟 | 390x844 | tap rail toggle | panel 展開，寬度/圖示不回退 | screenshot |
| QA-029-G02 | `未歸位` header sticky | workbench 展開且可捲 | 捲動未歸位區 | header 仍可見且不像任務 row | screenshot |
| QA-029-G03 | `所有任務排序` header sticky | workbench 展開且可捲 | 捲動排序區 | header 仍可見且不像任務 row | screenshot |
| QA-029-G04 | workbench row pan safety | row 可見 | row 短滑 | 不誤開詳情或拖移 | negative DOM |

### H. Manual physical-phone 補充

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-H01 | 真機手指慣性捲動 | iOS Safari / Android Chrome | 在任務卡主體上下/左右滑 | 不需找縫隙即可移動畫面 | 錄影 |
| QA-029-H02 | 手指速度變化 | 真機 | 慢滑、快速 flick、斜向滑 | 不誤觸 details / drag / menu | 錄影 |
| QA-029-H03 | 長按手感 | 真機 | 長按 500ms 左右 | menu 穩定出現，不和 scroll 誤觸 | 錄影 |
| QA-029-H04 | 軟鍵盤影響 | 真機 | 新增任務後進入詳情頁 title edit，或在任務詳情頁編輯名稱 | 鍵盤不造成主要 controls 被遮到不可操作 | 截圖 / 錄影 |

### I. Phase 1B 手機 compact action rail 與長按拖放

| ID | 情境 | 前置條件 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| QA-029-I01 | 手機長按父任務卡 | 390x844、任務卡可見 | 長按父任務 450-650ms，位移小於 tolerance | 任務浮起，viewport 上方顯示有文字標籤的 compact action rail | screenshot、DOM |
| QA-029-I02 | 手機長按子任務列 | checklist row 可見 | 長按子任務列 450-650ms | 子任務浮起，顯示 compact action rail | screenshot、DOM |
| QA-029-I03 | Compact action rail 功能精簡 | I01 後 | 讀取 action rail options | 只出現標示完成/取消完成、新增同階、新增下層、刪除；不得出現更多詳細選項、重新命名、指派人、複製、依賴、升降階 | DOM text + screenshot |
| QA-029-I04 | 長按後拖曳排序 preview | I01 後 | 將浮起任務拖到另一個任務位置上方/下方 | 顯示插入線或等效 drop indicator，不觸發 action rail option | screenshot、drop target selector |
| QA-029-I05 | Drop 任務位置排序 | I04 後 | 在任務位置 drop | 任務順序 / 父子位置依 drop target 更新，無重複、無遺失 | before/after order |
| QA-029-I06 | Drop 到完成/取消完成 | I01 後 | 拖到完成/取消完成 option 後放開 | 任務完成狀態切換一次；不開詳情、不重複觸發 | before/after status |
| QA-029-I07 | Drop 到新增同階 | I01 後 | 拖到新增同階 option 後放開 | 建立同階任務一次；若需命名，依 DEV-028 addendum 進詳情 title edit，不開外層 rename | task tree before/after、modal/title edit evidence |
| QA-029-I08 | Drop 到新增下層 | I01 後 | 拖到新增下層 option 後放開 | 建立子任務一次；若需命名，依 DEV-028 addendum 進詳情 title edit，不開外層 rename | task tree before/after、modal/title edit evidence |
| QA-029-I09 | Drop 到刪除 | I01 後 | 拖到刪除 option 後放開 | 開刪除確認；任務尚未刪除 | confirmation screenshot、task still exists |
| QA-029-I10 | 確認刪除 | I09 後 | 點確認刪除 | 任務刪除；取消時任務保留 | before/after task existence |
| QA-029-I11 | 短滑不得進 drag-action mode | 任務卡可見 | touchmove > 10px 後放開 | 不顯示 compact action rail、不顯示 drag preview、不排序 | negative DOM |
| QA-029-I12 | Quick tap 保留開詳情 | 任務卡可見 | 無位移 quick tap | 開 `TaskDetailsModal`，不顯示 action rail | modal evidence |
| QA-029-I13 | 電腦右鍵清單不變 | 1440x900、mouse | 右鍵任務卡 | 桌機 context menu 維持原功能，不受手機 compact action rail 影響 | desktop screenshot |
| QA-029-I14 | Action rail viewport safety | I01 後 | 檢查 bounding box | action rail 在 390x844 上方區域可見、可操作、不被頂部 safe-area / 邊界裁切 | screenshot + bounding box |

## Zero-Tolerance Failures

- 手機任務卡主體短滑仍開 `TaskDetailsModal`。
- 只有卡片縫隙可移動畫面，任務卡或子任務列主體不可 pan。
- 長按任務不再觸發任務操作選單或既有 long press flow。
- Phase 1B 後，手機長按仍顯示完整桌機右鍵清單。
- Phase 1B 後，手機 compact action rail 出現更多詳細選項、重新命名、指派人、複製、依賴、升階或降階。
- Phase 1B 後，手機長按未讓任務浮起或無法拖曳排序。
- Drop 到刪除直接刪除任務，未先開確認。
- 短滑觸發 rename、drag preview、context menu、details modal 或 selected action。
- filter/input/button/date/dependency/assignee/tag controls 被 pan guard 阻擋。
- dnd-kit TouchSensor 在短滑時搶先啟動，導致畫面不能自然移動。
- 390x844 viewport 出現 horizontal overflow、modal 裁切、popover 重疊或 visible runtime error。
- 實作把桌機 click-to-details 一併改掉，破壞 DEV-028 桌機契約。
- 實作把桌機右鍵清單一併改掉。

## Acceptance Matrix

| Case | Surface | Gesture | Expected |
|---|---|---|---|
| QA-029-B01 | Kanban card body | touchmove > 10px | 不開 details / menu / rename / drag；click-through 被 suppress |
| QA-029-B03 | Kanban checklist row | touchmove > 10px | 不開 details；可自然 pan 或 suppress click-through |
| QA-029-B07 | L2+ checklist row | vertical touchmove > 10px | column `scrollTop` 增加 |
| QA-029-B08 | L2+ checklist row | horizontal touchmove > 10px | board `scrollLeft` 增加 |
| QA-029-B04 | Kanban column body | touchmove > 10px | 可移動 board/column surface，不觸發 task action |
| QA-029-B05 | Board empty/gap surface | touchmove > 10px | 可移動畫面 |
| QA-029-B06 | Task Workbench row | touchmove > 10px | 不開 details / menu / drag；click-through 被 suppress |
| QA-029-C01 | Task card | long press 450-550ms, move < tolerance | Phase 1B：任務浮起並顯示 compact action rail |
| QA-029-D01 | Task card | quick tap, no move | 開啟對應任務詳情；pan movement 才 suppress click-through |
| QA-029-E02 | Filter / task workbench button | tap | 正常開啟，不被 pan guard 擋住 |
| QA-029-E04 | Add task input / form | tap/type | 可聚焦與輸入，不被 pan guard 擋住 |
| QA-029-E07 | Date / dependency / assignee / tag control | tap | 控制項正常操作，不開 details |
| QA-029-D03 | Desktop viewport | click task | DEV-028 click-to-details 仍有效 |
| QA-029-I01 | Mobile task card | long press | 任務浮起並顯示 compact action rail |
| QA-029-I03 | Mobile compact action rail | inspect options | 只保留完成/取消完成、新增同階、新增下層、刪除 |
| QA-029-I05 | Lifted task | drop on task insertion target | 任務排序 / 位置更新且不重複 |
| QA-029-I06 | Lifted task | drop on complete target | 完成狀態切換一次 |
| QA-029-I07 | Lifted task | drop on add sibling target | 建立同階任務一次 |
| QA-029-I08 | Lifted task | drop on add child target | 建立子任務一次 |
| QA-029-I09 | Lifted task | drop on delete target | 開刪除確認，不直接刪除 |
| QA-029-I13 | Desktop viewport | right-click task | 桌機 context menu 不變 |

## Static Gate

Required checks:
- `useTouchTapGuard` 或後續 centralized gesture hook 仍有 movement threshold。
- pan gesture 會 suppress compatibility click。
- mobile task/card surfaces 不使用會阻止自然 pan 的 `touch-action: none`，除非是 explicit drag handle。
- explicit drag handle / task-drag-hitbox 仍可被辨識，不與主卡面混淆。
- DEV-028 長按契約未被刪除。
- Phase 1B 後，mobile long press task surface 不走 desktop full context menu。
- Phase 1B 後，mobile compact action rail 只包含四個 allowed actions。
- Phase 1B 後，mobile delete action 必須連到 confirmation flow。
- Phase 1B 後，desktop context menu code path / selectors 不得被移除。
- Phase 1B hotfix 後，mobile drag handle 必須具備 pan pass-through 且 mobile dnd-kit listener disabled。
- Phase 1B hotfix 後，mobile drag-action mode 必須有 touchcancel / pointercancel / visibility / blur / Escape / timeout 退出路徑。
- DEV-029 package scripts 存在。

Recommended command:

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions
```

## Browser Gate

Required checks:
- 390x844 viewport。
- coarse pointer / hover none 模擬。
- 固定測試資料至少包含:
  - 1 個看板欄位。
  - 1 個普通任務卡。
  - 1 個含 checklist / child task 的任務卡。
  - 1 個可點擊 interactive control。
- 以 synthetic touch sequence 或 Playwright touchscreen:
  - 在 card body 上 pan。
  - 在 checklist row 上 pan。
  - 在 task drag handle 上 pan。
  - 在 column/board surface 上 pan。
  - 在 task card 上 long press。
  - 在 task drag handle / checklist drag handle 上 long press。
  - 在 long press action mode 後送出 `touchcancel`。
  - 在 long press action mode 中拖到 board 左右邊緣與 column 上下邊緣。
  - 在 task card / checklist row 上 long press 後確認 compact action rail。
  - 將 lifted task drop 到任務位置。
  - 將 lifted task drop 到完成、新增同階、新增下層、刪除 option。
  - 點 interactive controls。
- Pan 後掃描:
  - `data-task-details-modal` 不存在。
  - context menu 不存在，除非測的是 long press。
  - rename input 不存在。
  - drag preview 不存在。
  - body 無 HTTP 4xx/5xx、Not Found、Internal Server Error 等 visible runtime error。
- Phase 1B drop 到刪除後，任務在確認前仍存在。
- 1440x900 desktop right-click context menu 與手機 compact action rail 分離。

Recommended command:

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
```

Coverage note:
- `verify:dev-029-mobile-pan-first-interactions-browser` 必須覆蓋 A01-A04、B01-B09、C01-C05、C09-C13、D01、D03、E01-E05、F01-F03、I01-I14 的可自動化部分。
- G02/G03 與 H01-H04 可先列入 manual gate；未執行時不得宣告完整手機 UX 通過。
- 若既有 verifier 仍期待「手機 tap 任務卡開 details」，該 verifier 已過期，需更新後才能作為 DEV-029 evidence。

## Regression Gate

```powershell
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

若實作觸及 MindMap / Gantt mobile behavior，追加:

```powershell
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027g-mindmap-system-health-browser
```

## Manual UX Review

Reviewer should verify on a physical phone or equivalent browser touch emulation:
- 使用者不用找卡片縫隙即可拖動畫面。
- 卡片文字、子任務、欄位標題附近都不會因短滑誤開詳情。
- 長按足夠穩定，不會在普通滑動時誤觸。
- interactive controls 的可點擊性沒有下降。
- 任務台 collapsed rail、filter popover、未歸位 / 所有任務排序不受 pan-first 修改破壞。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 短滑仍開詳情 | compatibility click 未 suppress 或 click handler 未分 mobile gesture | 使用者無法安心移動畫面 | B01/B02/B03/B07 | P0 | pan 後主動觸發 click，確認 modal count = 0 |
| 只有縫隙可 pan | 主卡面 `touch-action` / dnd sensor 攔截 | 使用者仍需找縫隙，原痛點未解 | B01/B04/B05/H01 | P0 | 任務卡主體、title、子任務列、欄位 body 都測 |
| 長按失效 | pan guard 永遠攔截 task surface | DEV-029 Phase 1B 任務操作入口消失 | C01/C02/I01/I02 | P0 | 靜止 500-650ms 長按，確認 compact action rail 與 drag preview |
| pan 後誤開長按 menu | long press timer 未在 movement > tolerance 時取消 | 滑動畫面時突然跳選單 | C03 | P0 | 移動後等待超過 550ms，確認無 menu |
| 控制項不可點 | interactive target guard 太粗 | filter/input/date 等功能壞掉 | E01-E07 | P0 | 所有例外控制逐一點擊 |
| 不能自然 pan | CSS `touch-action: none` 殘留在主卡面 | 使用者仍只能找縫隙 | F02/H01 | P0 | computed style 檢查 + 真機補測 |
| 誤拖排序 | TouchSensor delay 早於 pan 判定 | 任務順序被誤改 | F01/F03 | P1 | 主卡面短滑後檢查 drag overlay 與 order |
| 手機 tap-to-details 被誤關閉 | 過度解讀 pan-first，將 tap 也視為需攔截 | 使用者無法在手機開啟任務 | D01/D02 | P0 | quick tap 開詳情；短滑 pan 才 suppress click-through |
| 手機仍顯示完整桌機右鍵清單 | mobile/desktop context menu 未分流 | 手機清單過長、遮擋、誤觸 | I01/I03 | P0 | 檢查 compact action rail options 僅四項 |
| 長按沒有進 drag-action mode | context menu 與 drag handler 仍互斥 | 使用者無法長按後拖曳排序 | I01/I04/I05 | P0 | 驗證任務浮起、插入線與 drop commit |
| Drop target 誤判 | action rail hit-test 與 insertion target priority 錯誤 | 想排序卻執行功能，或想執行功能卻改順序 | I04-I09 | P0 | 每個 target 分開測 hover 與 drop result |
| 刪除被 drop 直接執行 | delete target 沒接確認 flow | 高風險誤刪 | I09/I10 | P0 | drop delete 後先確認 task still exists |
| 新增同階/下層重複建立 | pointerup/touchend 重複觸發 | 任務重複、資料污染 | I07/I08 | P0 | drop 一次只建立一筆，檢查 before/after count |
| 桌機右鍵被手機精簡化誤傷 | 共用 context menu 被直接刪功能 | 桌機使用者失去完整操作能力 | I13/D03 | P0 | 1440x900 right-click regression |
| 桌機行為被改壞 | 共用 handler 未分 viewport / pointer | DEV-028 桌機 click-to-details 破壞 | D03 | P0 | 1440x900 mouse click regression |
| visible runtime error 被忽略 | 只跑 static/build，沒有看真畫面 | 使用者看到錯誤仍被判 pass | A02 | P0 | 每輪 browser gate 先做 visible error sweep |

## QC Evidence Required

- Static verifier JSON pass/fail。
- Browser verifier pass/fail。
- 390x844 screenshot after board pan and after long press menu。
- Phase 1B screenshot: mobile compact action rail with exactly four options。
- Phase 1B browser trace: lifted task drag to insertion target and order before/after。
- Phase 1B browser trace: drop to complete, add sibling, add child, delete confirmation。
- Desktop right-click screenshot proving desktop context menu unchanged。
- 操作情境矩陣逐項 pass/fail，至少列出 A/B/C/D/E/F/G/H/I 分類。
- 對每個 fail：提供重現步驟、實際結果、預期結果、DOM selector 或 screenshot。
- Commands and exit codes。
- Any skipped regression with explicit reason。

## QC Evidence - 2026-07-05

判定:
- Phase 1B mobile compact action rail + long-press drag-action mode 已通過本機自動化與真瀏覽器驗證。
- Physical-phone H01-H04 supplemental 尚未執行；不得宣告 iOS Safari / Android Chrome 真機手感已最終簽核。
- Production deploy 未執行。

已通過:
- `npx tsc --noEmit`：passed。
- `npm run verify:dev-029-mobile-pan-first-interactions`：32/32 passed。
- `npm run verify:dev-029-mobile-pan-first-interactions-browser`：passed。
- `npm run build:test`：passed。
- Browser matrix 覆蓋：mobile board 載入、visible error sweep、mobile only board mode、viewport overflow、card/title/checklist/column/board/workbench pan suppression、L2+ vertical/horizontal pan scroll、手機拖曳把手短滑 pan、父卡與子任務長按頂部文字 compact action rail、拖曳把手長按進 mobile action mode、drag-action 右邊緣 auto-scroll board、欄位底部 auto-scroll column、touchcancel 退出不卡死、action rail 只有四個 action 且 label 可見、刪除 drop 只開確認、任務位置 drop reorder、add child 開新任務詳情、complete drop 切換狀態、quick tap 開詳情、workbench row 長按 action rail、desktop click regression。

證據文件:
- `scripts/verify-dev-029-mobile-pan-first-interactions.mjs`
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783241212347-C01-mobile-action-rail-card.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783241212347-C02-mobile-action-rail-child.png`
- Latest passing browser run produced no failure log; prior failure diagnostics were resolved by using L2 title-area touch points in card-level verifier cases.

## QC Evidence - 2026-07-04

判定:
- Local automated + real browser gesture matrix 通過。
- H01-H04 physical-phone 補充案例未執行；不得宣告 iOS Safari / Android Chrome 真機手感已簽核。

已通過:
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`：27/27 passed。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`：passed。
- Fixed Playwright session `dev029-l2-scroll-clean` matrix：25/25 passed，`ok=true`、`fail=0`。
- `QA-029-B07`：L2+ checklist row 垂直 pan 讓 column `scrollTop` 由 0 增至 38。
- `QA-029-B08`：L2+ checklist row 水平 pan 讓 board `scrollLeft` 由 0 增至 120。
- `QA-029-D01`：mobile quick tap 開啟正確 `TaskDetailsModal`。
- `QA-029-B06`：TaskWorkbench row pan 不誤開詳情。
- `QA-029-D03`：1440 desktop click 仍開 `TaskDetailsModal`，modal task id 與 clicked task id 相同。
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`：35/35 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`：22/22 passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`：passed。
- `npm.cmd exec tsc -- --noEmit`：passed。
- `npm.cmd run build:test`：passed。
- `git diff --check`：passed with CRLF warnings only。

證據文件:
- `ai-doc/qc/QC-DEV-029-mobile-pan-first-touch-interactions.md`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-A01-loaded.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-C01-long-press-card.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-C02-long-press-child.png`
- `output/playwright/dev-029-mobile-pan-operation-matrix-1783180293462-D03-desktop-details.png`

## Stop Conditions

- 無法在 task card 主體上 pan。
- 長按任務操作選單不可用。
- Phase 1B 後，手機長按仍開完整桌機右鍵清單。
- Phase 1B 後，手機 compact action rail 不精簡或包含已移除功能。
- Phase 1B 後，手機長按無法進入浮起 / 拖放排序模式。
- Phase 1B 後，drop 到刪除會直接刪除。
- Phase 1B 後，桌機右鍵清單被改動。
- interactive controls 被阻擋。
- 需要重新定義手機 tap-to-details 產品語意。
- 需要 production deploy 或資料層修改。
