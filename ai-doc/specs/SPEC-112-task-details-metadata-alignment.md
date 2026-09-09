# SPEC-112：任務詳情基本資料列對齊

- 日期：2026-09-09
- 狀態：Implemented / Local QA-QC PASS / NOT RELEASED
- 關聯 DEV：DEV-112
- 相容權威：DEV-028、DEV-031、DEV-066、DEV-098

## 目的

依使用者在 `TaskDetailsModal` 實畫面框選「狀態／日期／主責／協作」區並要求「排版整齊一點」的回饋，
整理桌機基本資料列的視覺節奏。只修對齊與間距，不新增欄位、文字、容器或操作。

## Spec Impact

分類：`Compatible refinement`。

- 沿用既有 `TaskDetailsModal`、欄位、事件處理、資料來源、儲存與權限。
- 不改 DEV-028 的 click-to-details 與詳情內唯一改名入口。
- 不改標籤第二列、任務說明、會議紀錄、子任務與歷史資訊。
- 低於 1024px 的既有 responsive metadata layout 維持原契約；本期主修桌機 `lg` 格線。
- 無 schema、provider、API、migration、ADR 或 persisted preference 變更。

## UX / Layout Contract

1. 桌機第一列固定為狀態、日期、主責／協作三欄；欄寬為 88px、384px、剩餘寬度，欄距統一 12px。
2. 「狀態／日期／主責／協作」標籤上緣同一基線，容許瀏覽器字型 round-off 1px。
3. 三組控制項上緣、下緣與 32px 高度一致，不以額外 padding 或負 margin 補視覺位置。
4. 日期子格線為開始日 128px、箭頭軌道 32px、結束日 128px、工期 96px；四者連續且不得重疊。
5. 箭頭填滿完整中央軌道並置中，讓開始日與結束日兩側留白對稱。
6. 結束日與工期維持 joined control；狀態維持緊湊，主責／協作取得剩餘寬度。
7. 標籤仍在第二列，不增加 metadata 高度、水平 overflow 或新框線。

## Acceptance Criteria

- [x] 三個第一列標籤 top 差異不超過 1px。
- [x] 狀態、兩個日期、工期與主責控制項 top／bottom 一致，皆為 32px 高。
- [x] 日期四個軌道不重疊；開始日與箭頭、箭頭與結束日、結束日與工期邊界連續。
- [x] 桌機 metadata 無水平 overflow，標籤維持第二列且 grid 高度不超過 100px。
- [x] DEV-028 四模式詳情互動 static／browser regression 通過。
- [x] TypeScript、targeted ESLint 與 test build 通過。

## Out of Scope / Stop Conditions

- 不重設整個任務詳情資訊架構，不改欄位順序或新增折疊／設定。
- 不修改任何任務資料、日期規則、工期計算、指派或標籤操作。
- 不處理舊 mobile metadata verifier 的會議紀錄 fixture 前置條件；若要修該 gate，另立 corrective scope。
- 不 deploy 或 release。

## Evidence

- `npm run verify:dev-112-task-details-metadata-alignment`：10/10 PASS。
- `npm run verify:dev-028-cross-mode-task-interactions`：48/48 PASS。
- `npm run verify:dev-028-cross-mode-task-interactions-browser`：PASS，含新增 label baseline 與 precise date spacing assertions。
- In-app browser 1298×698：標籤 top 均 129.5px；控制項 top 149.4875px、bottom 181.4875px；日期軌道 128／32／128／96px；document width = viewport width 1298px；visible error 0。
- `npx tsc --noEmit`、targeted ESLint、`npm run build:test`：PASS。
