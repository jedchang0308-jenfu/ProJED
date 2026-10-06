# QC-DEV-111：任務說明跨閱讀模式懸浮視窗

- 日期：2026-09-08（2026-09-09 觸發範圍與微型標示修訂）
- 結論：PASS（Local targeted slice）/ NOT RELEASED
- 產品來源：working tree
- 環境：local-test / Chromium 1440x900＋390x844
- Fixture：`dev-111-v3`

## 事實驗證結果

- 五模式 rendered browser：board、list、mindmap、gantt、calendar 皆在 760ms 時維持隱藏，約
  1.10～1.13 秒顯示正確說明。
- Surface ownership：看板 L1／L2／L3+ 與清單均在 title 外、選取預覽藍框內的實際點位顯示正確說明；
  readback 均確認 trigger 本身為 `data-task-surface-source="true"`。
- Content：三行換行保留，`<b>` 字串以純文字呈現，card 內沒有 HTML child element。
- Indicator：看板 L1／L2／L3+、清單、心智圖、甘特圖、行事曆與共用側欄均呈現同一 `AlignLeft`
  微型標示；實測 glyph 9x9px、slot 11x11px、pointer-events none、border width 0、背景透明、`aria-hidden=true`、
  無 title／role／focus。空白 description 的標示數量為 0。
- Quietness：未 hover 時只保留微型內容存在標示，無文字、數量、badge 或第二入口；空白 description 不開 card。
- Geometry：五模式 overlay 都在 viewport 內，寬 348px、高 82px 的 fixture 未造成水平 overflow。
- Dismissal：hover card 可移入；Escape、提前離開、scroll、pointer down、drag start 均關閉。
- Accessibility：`role=tooltip` 正確，開啟時加入 `aria-describedby`，關閉後移除；calendar native title 已移除。
- Narrow viewport：390x844 下 documentWidth=390，標題右緣 111.34px、圖示 113.34～124.34px，位於 253px
  卡片右緣內，無重疊或水平 overflow。
- Error：visible alert／inline error／HTTP error 0；console/page error 0。

## Evidence

- `output/playwright/dev-111-task-description-hover-card/result.json`：34/34 browser cases。
- `output/playwright/dev-111-task-description-hover-card/static-result.json`：38/38 source assertions。
- 同目錄 `*-board.png`、`*-list.png`、`*-mindmap.png`、`*-gantt.png`、`*-calendar.png`、
  `*-indicator.png` 與 `*-mobile-board-indicator.png`：五模式、近距離標示與窄版畫面。
- DEV-028 static 48/48＋browser PASS、DEV-066 PASS、TypeScript、test build、targeted ESLint 0 error、
  `git diff --check` PASS。
- DEV-065 browser 的 surface architecture、L1/L2/L3+ hover geometry、handoff、native title 與 selected／focus
  藍框案例通過；legacy DragOverlay descendant summary 案仍為既有失敗。

## 限制與判定邊界

- 未 deploy、未驗證 production artifact；本報告不可作為 release PASS。
- touch/coarse pointer 不存在 hover 使用路徑；本期只驗證 fine-pointer positive gate，既有 mobile Board 可達性由
  DEV-028 browser regression 通過。
- DEV-065 現行 static verifier 仍以舊 JSX literal 檢查 props-object，browser 又在未修改的 DragOverlay descendant
  summary case 失敗；DEV-111 的五模式 hover card、DEV-065 前段 hover geometry 與 DEV-028 操作均已直接通過。
  因失敗 target 不在本次 diff，本 QC 不擴張修正，也不宣稱 DEV-065 全綠。
