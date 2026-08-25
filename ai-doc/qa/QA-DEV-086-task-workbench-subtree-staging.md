# QA-DEV-086 全域工作台子樹暫存與跨看板搬移

日期：2026-08-25
狀態：Executed／QA PASS／QC PASS／未 Release
風險：Medium
關聯規格：`ai-doc/specs/SPEC-086-task-workbench-subtree-staging.md`

## 驗證範圍與環境

- 目標：`http://localhost:4000/`，local-test fixture，可編輯帳號。
- Viewport：1440×900、760×900，以及 390×844／320×844 的 CDP touch emulation。
- Fixture：來源工作區 A／看板 A 與目的工作區 B／看板 B；來源看板有 parent→child→grandchild 三層子樹，目的看板有合法 lane。
- 邊界：本機 UI／localStorage persistence；手機以原生 CDP `touchStart／touchMove／touchEnd` 驗證，不代表 production、遠端多人同步、實機 iOS／Android 或輔助科技通過。
- Runtime：重用同專案既有 port 4000 primary runtime；本 DEV 不啟動、不停止該 process tree。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／案例 |
|---|---|---|---|---|---|
| 看板任務無法投進工作台 | board collision guard 把 panel 判為 outside-board | 雙向流程完全不可用 | 真實 pointer drag＋drag debug | P0 | B01 |
| 只搬 root | commit 只更新 active node | 子任務留在舊看板或成 orphan | 三層 fixture 比對 boardId | P0 | S01、B02 |
| parentId 被清空 | 未歸位 normalizer／remote adapter 平坦化 | 歸位後無法重建階層 | storage 與 DOM depth | P0 | S02、B02、B06 |
| 搬移中途遺失 | 先刪來源、後寫目的 | 網路失敗造成資料消失 | persistence order static review | P0 | S03 |
| 搬移留下重複資料 | 跨儲存面只建立不清來源 | 任務重複、完成率失真 | source／target ID 比對 | P0 | S03、B06 |
| 已歸位列意外可拖 | 共用元件帶入 DnD owner | 誤移任務、違反現行操作契約 | drag attribute／pointer negative | P0 | B07 |
| 子樹 UI 太寬 | 沿用完整卡片或大縮排 | 全域面板空間浪費 | row height／title left geometry | P1 | B03、B05 |
| 拖曳範圍不清 | 只標 root、無 descendant preview | 使用者誤以為只搬父任務 | hover box-shadow／截圖 | P1 | B04 |
| 未歸位落點不清或定位線推動內容 | 只做 lane highlight，或把 marker 放進 normal flow | 使用者不知道放開位置，任務列拖曳時跳動 | marker geometry、list／empty anchor 前後比對 | P1 | B10 |
| 手機無法從看板拖進未歸位 | mobile target adapter 沒有工作台 lane target | 桌機可用但手機的跨看板流程中斷 | 390px／320px 原生 touch event 與 target-kind oracle | P0 | B11 |
| 手機只搬 root 或定位線缺席 | mobile commit／presenter 未共用 subtree 與 marker contract | 子樹破裂或使用者無法判斷落點 | storage parent links、marker identity 與 drop cleanup | P0 | B11、B12 |
| 循環資料卡死 | recursive projection 未防 visited | 面板無限遞迴／白屏 | pure helper／visited contract | P0 | S04 |
| undo 只還原部分 | 每節點各自寫 history | 子樹回復成混合狀態 | batch owner static regression | P1 | R02 |

## 測試案例

| ID | 操作 | 通過標準 | 結果／證據 |
|---|---|---|---|
| QA-086-S01 | pure helper 對三層子樹執行 leaves-first／root-first | 兩方向皆 3 節點；descendant parent links 不變 | PASS；DEV-086 static |
| QA-086-S02 | 未歸位 normalizer 與 remote adapter 檢查 | 非空 `parentId` 不被清除 | PASS；DEV-086 static |
| QA-086-S03 | 檢查 store transition 與 batch order | 目的先建立、來源後刪；支援 root-first／leaves-first | PASS；source contract |
| QA-086-S04 | 檢查階層投影 owner | orphan／cycle 有 visited 防護，每個 ID 最多一次 | PASS；source review |
| QA-086-S05 | L1 group＋L2 child 進未歸位 | 兩節點一起搬；group nodeType 保留且未歸位 projection 不套 placed container filter | PASS；DEV-086 static |
| QA-086-B01 | 從看板真實拖 parent 到未歸位 lane | drop 成功，不再被 outside-board guard 擋下 | PASS；browser |
| QA-086-B02 | 檢查未歸位三列 | root／child／grandchild 全部存在，depth=0／1／2 | PASS；browser |
| QA-086-B03 | 1440×900 量測 row 與縮排 | 每列 ≤21px；每層 6±1px | PASS；實測約 20px、6px |
| QA-086-B04 | hover root | source row 與完整 subtree 都有非空 shadow；count text=0 | PASS；desktop screenshot |
| QA-086-B05 | 切到 760×900 | indent token=5px，版面無大幅橫向浪費 | PASS；narrow screenshot |
| QA-086-B06 | 工作台跨工作區選目的看板 B，拖 root 到已歸位 lane | 三節點皆進 workspace B／board B；parents=`null/root/child` | PASS；browser／storage |
| QA-086-B07 | 檢查已歸位 root | readonly=true、drag surface 不存在 | PASS；browser |
| QA-086-B08 | error sweep | page error=0 | PASS；browser diagnostics |
| QA-086-B09 | 真實拖曳 L1 group＋L2 child 到未歸位，再跨工作區歸位 | L1 投放後可見、depth 0／1、group nodeType 與 child parent 保留；placed row 仍 readonly | PASS；browser |
| QA-086-B10 | 空白與已有任務兩種狀態拖入未歸位；中途離開再進入 | 直接使用 horizontal compact `KanbanInsertionMarker`；dot=8×8、bar=6px、wrapper height=0；清單／empty anchor 不移位；populated 中心對最後列底邊誤差 ≤1px；離開／放開清除 | PASS；browser／兩張 preview screenshot |
| QA-086-B11 | 390×844 與 320×844 長按看板 parent，拖入未歸位 | target／surface=`workbench-unplaced-lane`；顯示共用 horizontal marker；root／child／grandchild 同批進未歸位且 depths=0／1／2；drop 後 marker／preview／action rail 清除，無水平溢出與可見錯誤 | PASS；CDP touch browser／兩組 preview＋result screenshot |
| QA-086-B12 | 390×844 切至工作區 B／看板 B，長按未歸位 root 歸位 | 三節點皆進目的 workspace／board；parents=`null/root/child`；未歸位清空 | PASS；CDP touch browser／storage／restored screenshot |
| QA-086-B13 | 檢查使用者排除邊界 | 手機不新增 subtree hover 等價效果；`list`／`gantt`／`calendar` 仍由既有 mobile board-only gate 管理 | PASS；SPEC／source contract |
| QA-086-R01 | DEV-039 static＋browser | 既有 placement lanes 與已歸位唯讀不回歸 | PASS；31/31＋browser PASS |
| QA-086-R02 | DEV-044 static | undo coverage 不回歸 | PASS；26/26 |
| QA-086-R03 | DEV-053／065 static | task drag 手感與 subtree hover contract 不回歸 | PASS；30/30＋40 checks |
| QA-086-R04 | TypeScript／build:test | 無新增 compile／bundle error | PASS |

## 實際執行結果

- DEV-086 static：PASS；移出／歸位子樹皆為 3 節點，parent links preserved。
- DEV-086 rendered browser：PASS；完成「工作區 A／看板 A → 未歸位 → 切工作區 B／看板 B → 已歸位」真實 pointer flow。
- Mobile rendered browser：PASS；390×844、320×844 以原生 touch event 長按看板 parent 後，均命中 `workbench-unplaced-lane`、呈現同一個 `KanbanInsertionMarker` 並搬移完整三節點子樹；390×844 另完成跨工作區／跨看板整棵歸位。
- UI geometry：三列高度皆 ≤21px；desktop 相鄰深度 title-left 差各 6px；narrow token 5px。
- Hover：來源列與完整子樹 box-shadow 都不是 `none`；「含 N 個子任務」文字數量 0。
- Persistence：三個 ID 全部落在目的 workspace B／board B；`parentId` 依序為 `null`、root、child。
- 已歸位負向驗證：`data-task-workbench-readonly-task-card=true`，沒有 drag surface。
- L1 專屬路徑：真實 `wbs-column` drag 將 group＋L2 child 搬入未歸位，再歸位到 workspace B／board B；group type、child parent 與 placed readonly 全部保留。
- 定位線：直接重用 `KanbanInsertionMarker`；實測 compact dot 8×8px、bar 6px、零高度 overlay wrapper，empty 清單高度／提示錨點位移 0px；populated marker 中心與最後一列底邊誤差 ≤1px。離開 lane marker detached、重新進入恢復、drop 後 count=0。
- 回歸：DEV-039 static 31/31＋browser PASS、DEV-044 26/26、DEV-053 30/30、DEV-065 40 checks、TypeScript、`build:test` PASS。
- Mobile cleanup／RWD：兩種 viewport drop 後 transient marker／preview／action rail 均為 0，document overflow=0，未歸位列容器未因 marker 發生 layout shift；手機未新增 subtree hover，也未開放清單／甘特／日曆。
- Screenshot：既有 desktop 五張，以及 `output/playwright/dev-086/unplaced-insertion-preview-mobile-390.png`、`unplaced-subtree-mobile-390.png`、`unplaced-insertion-preview-mobile-320.png`、`unplaced-subtree-mobile-320.png`、`restored-subtree-mobile-390.png`。
- Browser page error=0；只觀察到既有 Calendar fallback warning，不列為本 DEV failure。

## QA 結論

AC-086-001～015 的必要本地證據齊全，判定 `QA PASS／QC PASS`。手機功能通過 CDP touch emulation；實機 iOS／Android與輔助科技仍未執行。若未來 production persistence、跨帳號權限或多人同步契約改動，必須另開 remote/release gate；不得以本地 fixture 冒稱 production 通過。
