# QA-DEV-068 風險與真實操作證據對照表

狀態：68/68 AI automated coverage PASS / Physical iPhone Safari 與 Android Chrome Pending

日期：2026-08-16

本表把 `QA-DEV-068-task-title-center-child-drop.md` 的 68 個風險案例逐項連到 rendered mouse/touch 或 deterministic evidence。2026-08-16 最新使用者決策要求 candidate 不顯示子任務藍框，armed 才讓藍框與下一子階插入線同步出現；`PASS` 只代表本機 AI 可執行範圍，browser synthetic touch 不取代實機 gate。

## 執行證據總覽

- DEV-068 deterministic：64/64 PASS（完整 hover scope、armed-only primary/subtree frame、控制項幾何排除、task-source 保留、candidate standard coexist、child insertion geometry、source overlay edge contract、Workbench來源邊界、desktop viewport-change cleanup）。
- DEV-068 rendered mouse/touch：27/27 PASS。
- 相鄰 rendered regression：DEV-065 15/15、DEV-053 10/10、DEV-054 15/15、DEV-055 16/16、DEV-067 8/8，共64/64 PASS。
- Browser true-operation 合計：91/91 PASS。
- Static／deterministic 合計：DEV-065 40、DEV-053 30、DEV-054 44、DEV-055 28、DEV-058 26、DEV-067 13、DEV-068 64，共245/245 PASS。
- 完整 scope 核心 screenshot prefix：`output/playwright/dev-068-title-child-drop-1786811035576-*`。

## 68 項案例對照

| QA ID | 結果 | AI 操作／證據 |
|---|---|---|
| GEO-001 | PASS | `DEV068-DESK-SCOPE-CONTROLS`：L2 target 是與 DEV-065 相同的外層 `DIV` hover scope，hit rect 包住 primary 與 visible subtree。 |
| GEO-002 | PASS | `DEV068-DESK-SCOPE-BLANK`＋scope/title variants：title tail、主表面底部空白皆可 candidate/armed，不再限制文字寬度。 |
| GEO-003 | PASS | 長中文、無斷字長英文、空標題 fallback 都使用同一完整 task scope；title `SPAN` 不持有 exclusive target marker。 |
| GEO-004 | PASS | `DEV068-DESK-L1`、`DESK-DEEP`、`MOB-L1-SCOPE`、`MOB-DEEP`：L1/L2/L3+ exact innermost target id。 |
| GEO-005 | PASS | `DEV068-MOB-ARMED`＋`DEV068-VIEWPORTS`：390/430/320 hit-scope 與 desktop complete scope 同源，無 title-only 44px halo。 |
| GEO-006 | PASS | `QA-054-R03`＋`DEV068-MOB-MOTION-SCROLL`：candidate 前保留原 standard target；離開 scope、scroll/re-enter 後不吸回舊 target。 |
| UX-001 | PASS | `DEV068-DESK-900`＋`DEV068-MOB-900`：未滿1秒 primary/subtree/scope frame=0、child insertion=0，僅保留原standard insertion marker。 |
| UX-002 | PASS | `DEV068-DESK-ARMED`＋`DEV068-MOB-ARMED`＋`DEV068-DESK-DEPTH-LINE`：parent frame與唯一child insertion marker；L2/L3/L4+起點相對欄位左側為19/29/43px。 |
| UX-003 | PASS | `DEV068-DESK-ARMED-LEAVE`、`MOB-ACTION`、`QA-055-B07`：origin/general/candidate/armed 互斥且清理。 |
| TIM-001 | PASS | `DEV068-DESK-900`＋`DEV068-MOB-900`：門檻前 release，parent/order/type zero-write。 |
| TIM-002 | PASS | `DEV068-DESK-ARMED`＋`DEV068-MOB-ARMED`：滿門檻先顯示 armed，release 前 store 不變。 |
| TIM-003 | PASS | `DEV068-DESK-LIFECYCLE-A11Y`：armed 後延長 hold，不自動 commit、不累積 preview/timer。 |
| TIM-004 | PASS | `DEV068-DESK-LIFECYCLE-A11Y`：離開完整 scope 後 stale timer 不會再 armed；release 可依目前 standard target，但不得提交舊 child parent。 |
| TIM-005 | PASS | `DEV068-DESK-SWITCH`：A→B→A 每次重算 dwell，candidate 不沿用舊時間。 |
| TIM-006 | PASS | `DEV068-DESK-ARMED-LEAVE`：離開 armed scope 後依當下 standard target，絕不提交舊 parent。 |
| TIM-007 | PASS | DEV-068 deterministic：fake clock 999ms candidate、1000ms armed。 |
| TIM-008 | PASS | `DEV068-MOB-TRIALS`＋desktop/mobile cancel matrix：20 次 commit/cancel與 lifecycle retry 無卡死或殘留。 |
| DESK-001 | PASS | `DEV068-DESK-900`。 |
| DESK-002 | PASS | `DEV068-DESK-ARMED`：L2→L2 direct child，canonical append。 |
| DESK-003 | PASS | `DEV068-DESK-SUBTREE-UNDO`：完整 source subtree 關係不變。 |
| DESK-004 | PASS | `DEV068-DESK-L1`＋`QA-067-003/002/004`：中央 child 與非中央 promotion/root-drop 分流。 |
| DESK-005 | PASS | `DEV068-DESK-L1-SOURCE`：L1 group→L2 child 正規化為 task，保留 27 個 descendants。 |
| DESK-006 | PASS | `DEV068-DESK-DEEP`：exact L3+ direct child。 |
| DESK-007 | PASS | `DEV068-DESK-SUBTREE-UNDO`：收合 target 的完整 children canonical append、成功展開與 highlight。 |
| DESK-008 | PASS | `DEV068-DESK-CANCEL-MATRIX`：Escape/pointercancel/blur/pagehide/visibility/orientationchange/resize，zero-write、feedback 全清且 retry PASS。 |
| DESK-009 | PASS | `QA-055-B09/B10/B11`＋`QA-053-B02/B03`：threshold、click、right-click、blank pan 不誤啟動。 |
| DESK-010 | PASS | `DEV068-DESK-SUBTREE-UNDO`：一次 Undo/Redo 完整還原／重現 parent/order/type。 |
| MOB-001 | PASS | `QA-053-B05`：L1/L2/L3+ quick tap 開啟 exact details。 |
| MOB-002 | PASS | `QA-053-B06`＋`QA-054-R13`：短 pan 有實際 scroll，無 drag/click-through。 |
| MOB-003 | PASS | `DEV068-MOB-900`：long-press 啟動時間不計入 child dwell。 |
| MOB-004 | PASS | `DEV068-MOB-ARMED`：唯一 armed preview，release 前 store 不變。 |
| MOB-005 | PASS | `DEV068-VIEWPORTS`＋`QA-054-R08`：320/390/430 預覽與 action rail 無 overflow。 |
| MOB-006 | PASS | `DEV068-MOB-L1-CENTER`＋`QA-067-006/007`：L1 中央 direct child；非中央 promotion/root append 保留。 |
| MOB-007 | PASS | `DEV068-MOB-DEEP`：L2→L3+ exact direct child。 |
| MOB-008 | PASS | `DEV068-MOB-MOTION-SCROLL`＋`QA-054-R04`：安全區微移穩定，離開立即解除且不 nearest magnet。 |
| MOB-009 | PASS | `DEV068-MOB-MOTION-SCROLL`：auto-scroll 後重新 hit-test，只允許當下 visibly armed target。 |
| MOB-010 | PASS | `DEV068-MOB-ACTION-MATRIX`：完成、新增同階、新增子任務、刪除各只完成一個 action，child move=0。 |
| MOB-011 | PASS | `DEV068-MOB-CANCEL`、`MOB-CANCEL-MATRIX`、`QA-053-B10`：touch/pointer/lifecycle/orientation/resize 清理與 contextmenu 抑制。 |
| MOB-012 | PASS | `DEV068-MOB-TRIALS`：10 次 child commit＋10 次 armed cancel，wrong parent/double commit/stuck=0。 |
| DATA-001 | PASS | `DESK/MOB-ARMED`、`DESK/MOB-L1`、`DESK/MOB-DEEP`：preview target id 等於 final parentId。 |
| DATA-002 | PASS | `DEV068-DESK-SUBTREE-UNDO`：target children 收合未渲染時仍依完整 store children 計算末尾 order。 |
| DATA-003 | PASS | `DEV068-DESK-SUBTREE-UNDO`：所有 descendant id 與 parent relation 前後相同。 |
| DATA-004 | PASS | `DEV068-DESK-L1-SOURCE`＋DEV-067 deterministic/browser：L1 source type、parent、subtree與 root/task projection 一致。 |
| DATA-005 | PASS | `DEV068-MOB-ACTION-MATRIX`、`MOB-TRIALS`、`DESK-SUBTREE-UNDO`：terminal/undo instrumentation 均為一次。 |
| SAFE-001 | PASS | `DEV068-DESK-INVALIDS`：self center 不 armed、zero-write。 |
| SAFE-002 | PASS | `DEV068-DESK-INVALIDS`：descendant owns point但驗證失敗，不 fallback ancestor。 |
| SAFE-003 | PASS | `DEV068-DESK-INVALIDS`＋DEV-068 deterministic：duplicate DOM/cycle 均拒絕且無崩潰。 |
| SAFE-004 | PASS | `DEV068-DESK-STALE-REVALIDATION` viewer：無 desktop overlay、zero-write。 |
| SAFE-005 | PASS | 同案 `permission-revoked`：armed 後撤權，release revalidation zero-write。 |
| SAFE-006 | PASS | 同案 `target-filtered/archived/removed`：渲染消失或 store 失效後 release 均 zero-write。 |
| SAFE-007 | PASS | DEV-068 deterministic Workbench邊界＋`QA-055-B12`／`QA-053-B13`／`QA-054-R15`：未歸位可正常歸位、placed row不可拖。 |
| CON-001 | PASS | `QA-055-B01/B02`＋`DEV068-DESK-ARMED-LEAVE`：非中央同欄/跨欄排序維持。 |
| CON-002 | PASS | `QA-055-B04/B05`：L3+ 同父與跨父非中央排序維持 canonical。 |
| CON-003 | PASS | DEV-067 8/8 browser：header promotion、root append、column body L2、root reorder 維持。 |
| CON-004 | PASS | `DEV068-DESK-LEGACY`＋`QA-055-B06`：舊底部透明 child lane 退役。 |
| CON-005 | PASS | `DEV068-DESK-SCOPE-CONTROLS`＋`QA-053-B02/B03`：內部控制項依實際矩形排除；task source 的 `role="button"` 不會讓整框失效。 |
| CON-006 | PASS | `DEV068-DESK-LIFECYCLE-A11Y`、`DESK-ARMED-LEAVE`、`QA-055-B07`：feedback priority 唯一且清零。 |
| CON-007 | PASS | `QA-055-B12`＋`QA-053-B13`＋`QA-054-R15`：unplaced 可 placement；placed 不可拖。 |
| CON-008 | PASS | qSize=72 全核心 suite、collapsed target、target switch 與 deterministic canonical order 均通過。 |
| VIS-001 | PASS | `DEV068-VIEWPORTS`：1440/1024/390/430/320 candidate/armed screenshots。 |
| VIS-002 | PASS | `DEV068-DESK-ARMED`＋`QA-055-B15`：drag 前後 rect delta≤1px，fixed overlay 不推動 sibling。 |
| VIS-003 | PASS | `DEV068-DESK-SCOPE-CONTROLS`＋`DEV068-VIEWPORTS`：source overlay預設pointer upper-right、右緣upper-left fallback；完整 scope、深縮排、viewport edge 無 overflow/crop。 |
| VIS-004 | PASS | `DEV068-DESK-ARMED`＋`DEV068-MOB-ARMED`＋`DEV068-VIEWPORTS`＋`QA-054-R08/R11`：source rect與parent frame／child insertion marker交集皆為0，rail/finger/child preview z-order 可讀。 |
| VIS-005 | PASS | `DEV068-DESK-SUBTREE-UNDO`：commit 後展開與短暫 committed highlight，清理後無常駐 badge。 |
| A11Y-001 | PASS | `DEV068-DESK-LIFECYCLE-A11Y`：candidate/armed live status 包含 exact target 與 child 語意。 |
| A11Y-002 | PASS | 最新 desktop/mobile/320 截圖人工複查：框形、圓點、線條與逐層縮排，不只靠顏色；exact parent 另由 live status 宣告。 |
| A11Y-003 | PASS | `DEV068-DESK-ARMED`＋lifecycle/cancel cases：成功 announce 一次；cancel/no-op 無成功誤報。 |
| ERR-001 | PASS | `DEV068-ERROR-SWEEP`＋所有相鄰 suite error sweep：console 0 error、無非預期 network/visible error。 |

## 尚未完成的實機門檻

| Gate | 狀態 | 完成條件 |
|---|---|---|
| Physical iPhone Safari | PENDING | AI 可控實機；至少 30 次 target-switch＋20 次 cancel，wrong-parent/stale/double/stuck 均為 0。 |
| Physical Android Chrome | PENDING | AI 可控實機；至少 30 次 target-switch＋20 次 cancel，另確認長按 contextmenu、旋轉與瀏覽器工具列 viewport。 |

在兩個實機 gate 通過前，DEV-068 不得標記 Complete、完整 mobile sign-off 或 release ready。
