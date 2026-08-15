# QC-DEV-068：任務完整預選範圍停留移入子任務

日期：2026-08-15  
狀態：AI Browser QA-QC Passed / Physical Mobile 未充分驗證 / 未 Release

對應規格：`ai-doc/specs/SPEC-068-task-title-center-child-drop.md`  
對應 QA：`ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md`  
風險對照：`ai-doc/qa/QA-DEV-068-coverage-matrix.md`

## 1. QC 結論

使用者最後指定的命中範圍已落地：不是「標題文字中央」、不是標題尾端，也不是卡片底部透明追加區，而是 DEV-065 滑鼠預選所呈現的完整藍框。L1、L2、L3+ 均以主任務表面加目前可見子樹為 child dwell scope；指標落在內層任務時由最深 scope 接管。

- 進入完整藍框未滿 1 秒：顯示 DEV-065 同款 primary／subtree 藍框，保留原本 insertion marker；此時放開仍執行同階排序、lane 或 L1 promotion，不會移成 child。
- 同一 exact target 連續滿 1,000ms：清除原 standard insertion marker，在下一子階起點顯示唯一 child insertion marker；放開後只提交一次，`parentId = exact target.id`。
- child insertion marker 沿用既有圓點＋插入線語言；L2、L3、L4+ 起點相對欄位左側實測為 19px、29px、43px，逐層右移。
- 來源任務固定於滑鼠／手指上方、優先右側 16px，右側不足時左上或 viewport clamp；不遮住 parent frame 或 child insertion marker。
- 展開鍵、連結、輸入框、選單等內部控制排除；主任務表面即使帶 `role="button"` 仍屬完整命中範圍。
- Workbench 未歸位來源不進 child intent；原本歸位欄位的 append 流程已回歸通過。

## 2. Gate 結果

| Gate | 結果 | 覆蓋 |
|---|---:|---|
| DEV-068 static／deterministic | PASS 61/61 | 999/1000ms、完整 scope marker、child insertion geometry、innermost、controls、cycle、candidate coexist、overlay、Workbench boundary |
| DEV-068 browser | PASS 27/27 | desktop/synthetic touch、L1/L2/L3+、depth-line matrix、pre-dwell/armed、subtree/Undo、cancel/stale/action、五 viewport、error sweep |
| DEV-065 static／browser | PASS 40/40、13/13 | 原滑鼠預選 primary/subtree 樣式、handoff、零位移、一般 before 插入 |
| DEV-053 static／browser | PASS 30/30、10/10 | click/right-click、pan、cancel、Workbench、320/390/430 |
| DEV-054 static／browser | PASS 44/44、15/15 | raw finger、12px normal／16px child candidate、jitter、action rail、origin、touch ownership |
| DEV-055 static／browser | PASS 28/28、16/16 | before/after、跨欄、L3+、Undo、10次混合拖曳、Workbench 歸位 |
| DEV-058 static | PASS 26/26 | origin field、candidate 前 indicator、armed 互斥 |
| DEV-067 static／browser | PASS 13/13、8/8 | L1 promotion、column/root drop；快速 release 與一秒 dwell 分流 |
| TypeScript | PASS | `npx tsc --noEmit` |
| Targeted ESLint | PASS | 0 error；`BoardView.tsx` 保留 2 個既有 warning |
| Test build | PASS | `npm run build:test`；Vite 轉換 2000 modules |

Browser 真實渲染操作合計 89/89 PASS（核心 27＋相鄰 62）。Static／deterministic 合計 242/242 PASS（核心 61＋相鄰 181）。wrong parent、early child commit、stale child target、double commit、cycle、subtree loss、來源遮擋、action＋move double terminal與 runtime-visible error 均為 0。

## 3. Failure-first 與 RD 修正事實

1. 舊 target 仍是 shrink-wrapped title span；改為 DEV-065 完整 hover scope。
2. fixed preview 蓋住底層控制，使 `elementFromPoint` 誤判；改用 scope 內控制項實際矩形排除。
3. `[role="button"]` 過度排除整張任務主表面；以 `data-task-surface-source` 明確保留。
4. child candidate 曾搶走原排序／升階；改成 candidate 藍框與 standard indicator 共存，armed 才獨占。
5. mobile 舊回歸固定要求 12px；新契約改為一般 target 12px、child candidate/armed 16px，實際量測一致。
6. Workbench 桌機來源沿用 `wbs-card` 型別，被誤納 child intent；改以 `source="task-workbench"` 排除，歸位回歸恢復。
7. L1 舊測試以 14 段慢移進完整欄位 scope，在高負載下自然超過 1 秒；pre-dwell 案改為單步進入立即 release，另由 armed 案驗證滿 1 秒行為。
8. 使用者指出可見「移入子任務」文字 ghost 與既有階層拖曳不一致；改為同款圓點＋插入線，並新增 L2／L3／L4+ 起點單調右移 gate。
9. QC 接手時既有測試分頁曾顯示舊 HMR module export error；保留為恢復紀錄，同一分頁 hard reload 後恢復，最終版本再執行 visible-error sweep。

以上缺陷均先保留失敗畫面或 assertion，再回送 RD；最終結果不是以放寬產品錯誤斷言取得。

## 4. Rendered Evidence

核心證據 prefix：`output/playwright/dev-068-title-child-drop-1786808137276-*`

- Desktop candidate：`desktop-candidate.png`，完整 parent/subtree 藍框與既有 insertion marker 同時可見。
- Desktop armed：`desktop-armed.png`，standard marker 清除，下一子階 child insertion marker 可見，來源卡位於 pointer 右上且無交集。
- Desktop depth：`desktop-depth-insertion.png`，L4+ 插入線起點較 L3、L2 明顯右移。
- Desktop deep armed：`desktop-deep-armed.png`。
- Desktop subtree committed：`desktop-subtree-committed.png`。
- Mobile armed：`mobile-armed.png`，來源卡與 child feedback 均在 viewport／action rail 安全區。
- 五 viewport：`viewport-1440x900.png`、`viewport-1024x768.png`、`viewport-390x844.png`、`viewport-430x932.png`、`viewport-320x844.png`。
- 交付頁終檢：目前 `390x844` 手機測試頁已收合 Workbench；64 個 child-drop targets 可見，console error、visible alert、HTTP error 與 horizontal overflow 均為 0。

視覺複查確認 primary frame 為 `primary-500 / 2px inset`，可見子樹為 `primary-400 / 1px inset`；命中框涵蓋整張卡片與可見後代，而非只框文字。preview 為 fixed overlay，未推動任務、改變欄寬或造成水平 overflow。

## 5. 未充分驗證與 Release Boundary

本機 synthetic touch 能驗證 raw finger、geometry、狀態與資料提交，但不能取代 iPhone Safari 與 Android Chrome 實機。每平台仍需至少 30 次 target-switch、20 次 cancel，並保存 wrong-parent、stale-target、double-commit、卡死、rotation/background 與手指遮擋證據。

實機 gate 未完成前不得標記完整 mobile sign-off 或 release ready。本輪未 push、deploy、release，未修改 schema、migration、RLS、API 或 production data。
