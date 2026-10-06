# QC-DEV-068：任務完整預選範圍停留移入子任務

日期：2026-08-16
狀態：AI Browser QA-QC Passed / Physical Mobile 未充分驗證 / 未 Release

對應規格：`ai-doc/specs/SPEC-068-task-title-center-child-drop.md`  
對應 QA：`ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md`  
風險對照：`ai-doc/qa/QA-DEV-068-coverage-matrix.md`

## 1. QC 結論

使用者最後指定的命中範圍已落地：不是「標題文字中央」、不是標題尾端，也不是卡片底部透明追加區，而是 DEV-065 滑鼠預選所呈現的完整預選範圍。L1、L2、L3+ 均以主任務表面加目前可見子樹為 child dwell scope；指標落在內層任務時由最深 scope 接管。

- 進入完整命中範圍未滿 1 秒：不顯示任何子任務 primary／subtree／scope 藍框，只保留原本 standard insertion marker；此時放開仍執行同階排序、lane 或 L1 promotion，不會移成 child。
- 同一 exact target 連續滿 1,000ms：不顯示任何子任務 target 藍框，只顯示下一子階唯一 child insertion marker，原 standard insertion marker 同步清除；放開後只提交一次，`parentId = exact target.id`。
- child insertion marker 沿用既有圓點＋插入線語言；L2、L3、L4+ 起點相對欄位左側實測為 19px、29px、43px，逐層右移。
- 若 child append 的 canonical 結果等於原位置，定位預覽改沿用其他階層的藍底白字來源名稱欄位，不顯示一般圓點插入線；桌機／手機放開後完整 node snapshot 不變，也不播報「已移入」。同父層但確實移到尾端的情況仍是一般插入線與真實 reorder。
- 來源任務固定於滑鼠／手指上方、優先右側 16px，右側不足時左上或 viewport clamp；不遮住 child insertion marker。
- 任務離開後，來源原位置顯示唯一 2px `primary-400` 虛線框：desktop 與 mobile 的 L1 標題列、L2 完整來源 scope、L3+ 任務列，其 left/top/width/height 均與拖曳前量測相同（差≤1px）；框不顯示文字、不改變版面，取消後清除。
- 展開鍵、連結、輸入框、選單等內部控制排除；主任務表面即使帶 `role="button"` 仍屬完整命中範圍。
- Workbench 未歸位來源不進 child intent；原本歸位欄位的 append 流程已回歸通過。

## 2. Gate 結果

| Gate | 結果 | 覆蓋 |
|---|---:|---|
| DEV-068 static／deterministic | PASS 73/73 | 999/1000ms、candidate／armed target frame=0、完整 scope marker、child insertion geometry、origin/no-op 順序判定、來源虛線框、不可取消 touchcancel guard、innermost、controls、cycle、candidate coexist、overlay、Workbench boundary、desktop viewport cleanup |
| DEV-068 browser | PASS 30/30 | desktop/synthetic touch、L1/L2/L3+來源原位虛線框與geometry、depth-line matrix、桌機／手機 child-origin 名稱預覽與 zero-write、pre-dwell/armed、subtree/Undo、cancel/stale/action、五 viewport、error sweep |
| DEV-065 static／browser | PASS 40/40、15/15 | 原滑鼠預選 primary/subtree 樣式、handoff、零位移、一般 before 插入；現行 verifier 共有 15 個 record gates |
| DEV-053 static／browser | PASS 30/30、10/10 | click/right-click、pan、cancel、Workbench、320/390/430 |
| DEV-054 static／browser | PASS 44/44、15/15 | raw finger、12px normal／16px child candidate、jitter、action rail、origin、touch ownership |
| DEV-055 static／browser | PASS 28/28、16/16 | before/after、跨欄、L3+、Undo、10次混合拖曳、Workbench 歸位 |
| DEV-058 static | PASS 26/26 | origin field、candidate 前 indicator、armed 互斥 |
| DEV-067 static／browser | PASS 13/13、8/8 | L1 promotion、column/root drop；快速 release 與一秒 dwell 分流 |
| TypeScript | PASS | `npx tsc --noEmit` |
| Targeted ESLint | PASS | 0 error；CSS 不在 ESLint 設定範圍，樣式由 rendered computed-style gate 驗證 |
| Test build | PASS | `output/build-dev068-no-child-blue-20260816`；Vite 轉換 2000 modules |

Browser 真實渲染操作合計 94/94 PASS（核心 30＋相鄰 64）。Static／deterministic 合計 254/254 PASS（核心 73＋相鄰 181）。wrong parent、early child commit、stale child target、double commit、cycle、subtree loss、來源遮擋、來源虛線框位移、origin 誤寫入、action＋move double terminal與 runtime-visible error 均為 0。

## 3. Failure-first 與 RD 修正事實

1. 舊 target 仍是 shrink-wrapped title span；改為 DEV-065 完整 hover scope。
2. fixed preview 蓋住底層控制，使 `elementFromPoint` 誤判；改用 scope 內控制項實際矩形排除。
3. `[role="button"]` 過度排除整張任務主表面；以 `data-task-surface-source` 明確保留。
4. child candidate 曾搶走原排序／升階；改成 candidate 狀態只保留 standard indicator，armed 才獨占。
5. mobile 舊回歸固定要求 12px；新契約改為一般 target 12px、child candidate/armed 16px，實際量測一致。
6. Workbench 桌機來源沿用 `wbs-card` 型別，被誤納 child intent；改以 `source="task-workbench"` 排除，歸位回歸恢復。
7. L1 舊測試以 14 段慢移進完整欄位 scope，在高負載下自然超過 1 秒；pre-dwell 案改為單步進入立即 release，另由 armed 案驗證滿 1 秒行為。
8. 使用者指出可見「移入子任務」文字 ghost 與既有階層拖曳不一致；改為同款圓點＋插入線，並新增 L2／L3／L4+ 起點單調右移 gate。
9. QC 接手時既有測試分頁曾顯示舊 HMR module export error；保留為恢復紀錄，同一分頁 hard reload 後恢復，最終版本再執行 visible-error sweep。
10. Commit 後 RD 稽核新增 desktop viewport-change 案，真實操作先抓到 orientationchange 後仍可能提交 child；補上 orientationchange／resize cancel 與 listener cleanup 後，7 種桌機終止來源全數通過。
11. 使用者要求子任務定位藍框完全取消；failure-first 先記錄 armed target frame 存在，再移除 child preview 的 primary/subtree/scope frame，保留 armed child insertion marker，並補 desktop/mobile frame count=0 gate。
12. 使用者要求 child insertion 回到原位時顯示來源名稱；先以缺少 origin resolver 的 deterministic failure 建立 gate，再加入 canonical 順序比較、共用 `TaskOriginTitleField` 與 commit zero-write guard。第一輪 browser 僅因測試誤用 Tailwind 預設藍色碼失敗，畫面實際已是既有品牌藍；校正測試基準後產品未改色，完整矩陣通過。
13. 使用者要求拖離後保留來源虛線框；static failure-first 先證明 L1/L2/L3+ 均缺樣式。首輪 browser 再抓到 L1 source 的 scale/rotate/opacity 與固定 38px child 使原 36px 位置變成約 61px；RD 移除 transform 並恢復單列原高。後續校正 transition 完成後取樣及 L2 完整 scope 基準，最終 desktop／mobile 各三階來源 geometry 全通過。
14. 擴充 mobile L1/L2/L3+ 後，全部功能斷言先通過，但 error sweep 抓到不可取消的 `touchcancel` 仍呼叫 `preventDefault()`；RD 加入 `event.cancelable` guard，保留 session cleanup，再由 static 與完整 browser error sweep 重驗。

以上缺陷均先保留失敗畫面或 assertion，再回送 RD；最終結果不是以放寬產品錯誤斷言取得。

## 4. Rendered Evidence

核心證據 prefix：`output/playwright/dev-068-title-child-drop-1786851252620-*`

- Desktop candidate：`desktop-candidate.png`，子任務 primary/subtree/scope 藍框與 child insertion marker 均為 0，只顯示既有 standard insertion marker。
- Desktop armed：`desktop-armed.png`，不顯示任何 target 藍框，只顯示下一子階 child insertion marker，standard marker 清除，來源卡位於 pointer 右上且無交集。
- Desktop depth：`desktop-depth-insertion.png`，L4+ 插入線起點較 L3、L2 明顯右移。
- Desktop deep armed：`desktop-deep-armed.png`。
- Desktop subtree committed：`desktop-subtree-committed.png`。
- Mobile armed：`mobile-armed.png`，來源卡與 child feedback 均在 viewport／action rail 安全區。
- Desktop child origin：`desktop-origin-child.png`，原任務名稱取代一般插入線；放開 zero-write、announcement 為空。
- Mobile child origin：`mobile-origin-child.png`，同款品牌藍來源名稱欄位；一般 marker=0，放開後 transient UI 全清。
- Desktop source origin placeholder：`desktop-source-origin-placeholder.png`，L2 完整來源 scope 保留虛線框，pointer-upper-right 任務預覽不遮擋。
- Mobile source origin placeholder：`mobile-source-origin-placeholder.png`，long-press 後原位置虛線框與 finger-upper-right 任務預覽並存，action rail 可讀。
- 五 viewport：`viewport-1440x900.png`、`viewport-1024x768.png`、`viewport-390x844.png`、`viewport-430x932.png`、`viewport-320x844.png`。
- 交付頁終檢：目前 App 瀏覽器可用區 `518x698` 的窄版測試頁已 hard reload、收合 Workbench 並標記 deliverable；64 個 child-drop targets 可見，console error、visible alert、HTTP error 與 horizontal overflow 均為 0。自動化另完整覆蓋 `390x844`、`430x932` 與 `320x844`。

視覺複查確認 child preview 不渲染 target primary/subtree/scope 藍框；命中範圍仍涵蓋整張卡片與可見後代，而非只框文字。來源原位框為 `primary-400 / 2px dashed / -2px inset`，不改盒模型；插入線為 fixed overlay，未推動任務、改變欄寬或造成水平 overflow。

## 5. 未充分驗證與 Release Boundary

本機 synthetic touch 能驗證 raw finger、geometry、狀態與資料提交，但不能取代 iPhone Safari 與 Android Chrome 實機。每平台仍需至少 30 次 target-switch、20 次 cancel，並保存 wrong-parent、stale-target、double-commit、卡死、rotation/background 與手指遮擋證據。

實機 gate 未完成前不得標記完整 mobile sign-off 或 release ready。本輪未 push、deploy、release，未修改 schema、migration、RLS、API 或 production data。
