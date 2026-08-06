# QA-DEV-065：任務子樹 hover 與拖曳影響範圍預覽

日期：2026-08-05  
狀態：RD Rework 13 Static + Browser QC Passed  
對應 SPEC：`ai-doc/specs/SPEC-065-task-subtree-hover-preview.md`

## 1. 驗證範圍

- L1 column、L2 card、L3+ recursive checklist 的 desktop fine-pointer hover。
- 父任務／葉節點／父轉子 exact ownership。
- DragOverlay canonical 後代數量與收合狀態。
- 點擊、右鍵、拖曳、undo、手機與 visible-error 回歸。
- 1440x900、1024x768 的 geometry、overflow 與截圖證據。

## 2. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 父子同時顯示來源強框 | `:hover` 向祖先傳遞且未限制 innermost | 不知道實際抓取來源 | QA-065-003、computed ring | P0 | 父轉子後只允許一個強框 |
| L3+ 只框單列 | recursive wrapper 未成為 scope | 不知道後代會連動 | QA-065-002、bounds | P0 | 驗證 scope bottom 包含最後後代 |
| L1 只框標頭 | column content 未承接 subtree scope | 欄位拖動影響範圍不清 | QA-065-001、screenshot | P1 | 驗證既有 column border 與卡片內容完整次要群組框 |
| 隱藏後代未計數 | 以可見 DOM 代替 canonical index | 收合後低估影響範圍 | QA-065-004、fixture count | P0 | 使用 parent index 並加入 cycle guard |
| hover 導致跳版 | 動態 badge 或實體 border 改變 geometry | 任務位置晃動、誤拖 | QA-065-005、before/after rect | P0 | inset ring／overlay，不占 normal flow |
| 普通 hover 留在 drag 中 | hover gate 未辨識 DragOverlay | 來源與落點訊號競爭 | QA-065-004、DOM/style | P1 | drag overlay 存在時停用普通 hover |
| 可見 runtime error | UI 或 fixture regression | 主要工作流不可用 | 全案例 visible-error sweep | P0 | 任何可見錯誤立即 fail |
| L3+ 只顯示左側線 | checklist 群組與 L1／L2 使用不同範圍語意 | 使用者無法快速辨識完整拖動範圍 | QA-065-009、screenshot | P1 | 使用完整 `1px inset` 群組框，維持零版面位移 |
| L2 標題出現巢狀框 | hover marker 留在 card primary 內層 | 卡片任務名稱與列表 UI 不一致、增加視覺噪音 | QA-065-012、DOM／computed shadow | P1 | 來源 marker 由最外層卡片承接，primary 只保留拖放 geometry |
| L2 標題列額外套框 | source marker 放在 title row，標題出現第二個內框 | 卡片來源層與列表來源層不一致、視覺層級重複 | QA-065-005、QA-065-007、QA-065-012、computed box-shadow／DOM marker | P1 | source marker 放回 card root；標題列不另加框，子任務區保留單一 `primary-400` group frame |
| 卡片缺少子任務第二層 | 卡片來源外框取代了整個 subtree group | 使用者無法同時辨識來源與連帶子任務範圍 | QA-065-013、雙層 computed shadow | P1 | source 用最外層，子任務區使用單一 `primary-400` inset group |

## 3. 測試案例

| ID | 前置／操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| QA-065-001 | 1440x900 hover 有後代的 L1 標頭 | 標頭為唯一 2px 強框；column root 既有外框與卡片內容區顯示次要藍色；所有可見卡片位於 subtree scope bounds | screenshot、computed style、rect |
| QA-065-002 | hover 有孫任務的 L3+ 父任務，再 hover leaf | 父任務 scope 以完整 `1px inset` 框包含全部可見後代；後代維持原背景；leaf 只有自己，沒有空群組框 | screenshot、scope/source count |
| QA-065-003 | L2 父任務與內部 L3+ 間往返 | 每一時刻最多一個來源強框；範圍跟隨 exact innermost source，不包含兄弟 | DOM count、computed box-shadow |
| QA-065-004 | 收合 L2 子任務後開始拖曳 | overlay 顯示正確「含 N 個子任務」；普通 hover frame 停用；放回來源為 zero-write | overlay text/data、before/after nodes |
| QA-065-005 | 量測 hover 前後任務／兄弟 rect | top、bottom、height 變化皆不超過 1px；無水平 overflow | rect diff、scrollWidth/clientWidth |
| QA-065-006 | 1024x768 重跑父／子 hover、click、right-click 與短距離拖動 | 無裁切、重疊、可見錯誤；click 開正確詳情，右鍵只開 context menu，未過 8px 不啟動 drag | screenshot、DOM、console/error sweep |
| QA-065-007 | 1440x900 分別 hover L2 card surface 與 L3+ parent row | L2 卡片最外層使用 `2px primary-500` 強框且 border 同為 `primary-500`，子任務區使用 `1px primary-400` 群組框；L3+ 使用完整 `1px inset` 群組框；後代不新增大片底色或第三層框 | screenshot、computed box-shadow/background/border |
| QA-065-008 | 1440x900 hover L2 card surface，再移入 L3+ child | L2 卡片外層為唯一 `primary-500` source frame，子任務區為第二層 group frame，內層 card primary 不繪製 hover 框；移入 child 後 L2 兩層訊號均清除，改由 child ownership 接手 | screenshot、source/group computed style、DOM ownership |
| QA-065-009 | Scheme A 一致性檢查 | descendants 背景與圓角維持 baseline；L3+ 群組 computed shadow 為單一 `inset 0 0 0 1px primary-400`，不存在額外 ring 或 `primary-100/60` descendant fill | static CSS gate、1440 screenshot、computed style |
| QA-065-010 | 1440x900 hover L1 column title 與 L2 card title | hover 前後 title computed `color` 與 `cursor` 完全相同；不得出現 `hover:text-primary` 或 cursor mutation | screenshot、computed color/cursor、static class gate |
| QA-065-011 | hover L1／L2／L3+ task title | task title 不帶原生 `title` tooltip；以 `aria-label` 保留可及性名稱，畫面不出現黑色瀏覽器提示框 | DOM attribute、browser screenshot、click/drag regression |
| QA-065-012 | 1440x900 hover L2 card task title | `data-desktop-task-hover-preview` 位於卡片 root；卡片 root 顯示來源強框，標題列、`.task-title-text` 與 `data-task-card-primary` 不顯示第二個 inset 框 | DOM marker、computed box-shadow、screenshot |
| QA-065-013 | 1440x900 hover L2 card task title，再移入 L3+ child | source hover 時同時存在外層 `primary-500` 與子任務區單一 `primary-400` inset；移入 child 後卡片兩層均清除，子任務 source／group 接手 | DOM marker、雙層 computed shadow、handoff screenshot |

## 4. QC 指令與判定

- `npm run verify:dev-065-task-subtree-hover-preview`
- `npm run verify:dev-065-task-subtree-hover-preview-browser`
- `npm run verify:dev-055-desktop-task-drag-target-clarity`
- `npm exec tsc -- --noEmit`
- Targeted ESLint、test build。

`通過`：QA-065-001～013 全數符合，browser console 0 errors，沒有 `.inline-error`、
`[role=alert]` failure、4xx/5xx、Not Found 或 `/api/` 可見錯誤，且截圖／量測支持視覺契約。

`未通過`：任一範圍、count、ownership、geometry、click／right-click／drag regression 或 visible-error gate 失敗。

## 5. QC 結果（2026-08-05）

- QA-065-001～013：13/13 PASS；1440x900 與 1024x768 均完成真實瀏覽器操作、computed-style、rect、overflow、click、right-click、L2 ownership handoff 與來源放回 zero-write 驗證；QA-065-009 確認 L3+ 完整單一 inset 群組框，QA-065-010 確認列表／卡片 title 的 color 與 cursor 不變，QA-065-011 確認沒有原生黑色 tooltip，QA-065-012 確認 L2 卡片來源框直接位於最外層且沒有標題內層框，QA-065-013 確認來源外框與子任務第二層可同時辨識並正確 handoff。
- Browser console：0 errors、2 個既存 warning；頁面沒有 visible alert、runtime error、4xx/5xx、`Not Found` 或水平 overflow。
- DEV-065 static：27/27 PASS；canonical fixture 後代順序為 `childA → grandchild → childB`，封存節點與 cycle 均受保護，並鎖定 Rework 11 card source border gate、Rework 10 column subtree overlay、Rework 9 card two-layer gate、Rework 8 outer-surface gate、Rework 7 native-tooltip gate、Rework 6 text/cursor gate 與 Rework 5 tokens。
- Regression static：DEV-028 45/45、DEV-046 31/31、DEV-055 27/27 PASS。
- Engineering gates：TypeScript PASS、test build PASS、targeted ESLint 0 errors（`BoardView` 2 個既存 warnings）。

截圖證據：

- `output/playwright/dev-065-subtree-hover-1785912725638-1440-column.png`
- `output/playwright/dev-065-subtree-hover-1785912725638-1440-card.png`
- `output/playwright/dev-065-subtree-hover-1785912725638-1440-checklist.png`
- `output/playwright/dev-065-subtree-hover-1785912725638-1440-drag.png`
- `output/playwright/dev-065-subtree-hover-1785912725638-1024.png`

已知獨立回歸：既有 DEV-055 browser B06 仍把展開按鈕座標判為 card `after`，而非 checklist `append`；將驗證座標移到真正 checklist lane 時，又可觀察到 direct DOM hit 與 dnd cached rect 不一致。DEV-065 scope 已縮為純 data marker 與 inset CSS、沒有 normal-flow 幾何，移除新增 positioning／transition 後仍可重現，因此未將此既存拖放核心問題併入本 DEV；DEV-055 verifier 已還原，建議另立修復任務。

2026-08-05 Annotation 1：使用者在實際畫面回報 card／list 層不夠明顯，前次 6/6 僅證明「有樣式」，不足以證明「可辨識」。QC 結論已重開；Rework 1 必須新增 source／group 強度與未 hover 背景差異的可觀察斷言，再以新截圖覆蓋舊證據。

Rework 1 QC 結果：QA-065-007 PASS；source computed box-shadow 為 `rgb(99, 102, 241) ... 2px inset`，group 為 `rgb(165, 180, 252) ... 2px inset`，card 與 list descendant 的 background 均與未 hover 基準不同。新截圖人工複查可清楚辨識來源、群組與連帶後代，且 rect delta ≤ 1px、console 0 errors、無 visible error 或水平 overflow。

Rework 2 reopen：使用者指出 Rework 1 的 L2 深藍框仍只在 card root，沒有獨立描繪 title source。前次 QA-065-007 對 L2 只檢查 card root primary-500，因此驗收不完整；QA-065-008 改為同時要求 title primary-500 與 card root primary-300，並驗證移入 child 後 ownership 正確切換。

Rework 2 QC 結果：QA-065-008 PASS；L2 title primary computed box-shadow 為 `rgb(99, 102, 241) ... 2px inset`，card root group 為 `rgb(165, 180, 252) ... 2px inset`。移入 L3 child 後兩個 L2 box-shadow 都清除，child source／group 分別接手 primary-500／primary-300；新 card screenshot 人工複查可清楚看到雙框，無 layout shift、console error、visible error 或 overflow。

Rework 3（Scheme A）QC 結果：QA-065-009 PASS；source computed box-shadow 維持 `rgb(99, 102, 241) ... 2px inset`，column/card group 改為既有 `border-color: rgb(165, 180, 252)`，checklist group 改為既有左側 `inset 2px` 結構線。L3+ descendant 與 L2 card descendant 背景均等同未 hover baseline，沒有額外 `primary-300` ring、`primary-100/60` fill 或 layout shift；新截圖人工複查確認來源可辨識且視覺密度收斂。

Rework 4 QC 結果：QA-065-009 PASS；L3+ checklist group computed box-shadow 為單一 `inset 0px 0px 0px 1px` 次要藍框，來源仍為 `rgb(99, 102, 241) ... 2px inset`。1440x900 與 1024x768 截圖確認完整群組範圍可辨識，descendant 背景、圓角、rect 與兄弟位置維持 baseline，沒有 overflow、visible error 或額外 nested ring。

Rework 5 QC 結果：QA-065-009 PASS；column/card group computed border 與 checklist group computed shadow 均為 `primary-400`（瀏覽器計算色約 `rgb(129–131, 140–142, 248)`），來源仍為 `primary-500`。1440x900 與 1024x768 截圖確認子任務框線更清楚，且 source／group 仍有可辨識層級差，無 layout shift、overflow 或 visible error。

Rework 6 QC 結果：QA-065-010 PASS；column title 與 L2 card title 在 hover 前後 computed `color`、`cursor` 均一致，列表不再套用 `hover:text-primary`，hover preview 只增加框線訊號；browser 10/10、static 18/18 通過。

Rework 7 QC 結果：QA-065-011 PASS；Kanban card、checklist、column 與 WBS list task title 均移除原生 `title`，browser screenshot 不再出現黑色 native tooltip，`aria-label` 保留可及性名稱；click、right-click、drag、overflow 與 visible-error regression 均通過。

Rework 8 重新驗證：使用者指出 L2 卡片任務名稱與列表 UI 不一致，標題內層框造成巢狀視覺。RD 將 hover source marker 移至卡片最外層，保留 `data-task-card-primary` 作拖放 geometry；QA-065-012 驗證 root source frame、title／primary 無第二層 inset 框，並與既有 child handoff、文字／cursor、L3+ group frame 與 interaction regression 一併重跑。

Rework 9 重新驗證：使用者補充卡片仍需同時呈現來源任務層與子任務層。RD 在最外層 source frame 內恢復單一子任務 group frame；QA-065-013 驗證兩層同時可見、內層不形成第三層 nested ring，移入 child 後兩層均清除並由 child ownership 接手。

Rework 10 重新驗證：使用者指出列表來源 hover 仍只看見列表外框，卡片群組範圍不夠明確。RD 新增 L1 `data-kanban-column-subtree-scope` overlay，QA-065-001 改驗證標頭來源框、欄位次要邊框與卡片內容完整群組框同時可見；browser 13/13、static 26/26、TypeScript、test build 與 visible-error sweep 通過。

Rework 11 重新驗證：使用者指出卡片來源任務仍未像列表一樣被清楚框起。RD 將 L2 exact source card 的最外層 border 明確切換為 `primary-500`，與既有 `2px inset` source ring 同步；未新增標題內框，文字／cursor／拖曳範圍維持不變。QA-065-005、QA-065-007、QA-065-012 同時檢查 source border 與 ring；browser 13/13、static 27/27。

Rework 12 重新驗證：依使用者目標示意，L2 source marker 改由 `.kanban-task-title-row` 承接，來源框只涵蓋任務名稱／日期標題列；卡片 root 保留基準外框，子任務區維持完整 `primary-400` group frame。QA-065-005、QA-065-007、QA-065-008、QA-065-012、QA-065-013 驗證 title-only ownership、子任務範圍、handoff、文字／cursor、drag overlay 與 geometry；browser 13/13、static 27/27。

Rework 13 重新驗證：使用者再次確認來源任務層應像右側示意，由整張 L2 卡片最外層承接 `primary-500` source frame，標題列不另加內框，子任務區承接單一 `primary-400` group frame。QA-065-005、QA-065-007、QA-065-008、QA-065-012、QA-065-013 驗證 outer-source ownership、title 無 nested frame、子任務範圍、handoff、文字／cursor、drag overlay 與 geometry；browser 13/13、static 27/27。
