# QC-DEV-107：會議草稿側欄模式與排版收斂

- 關聯 DEV：DEV-107
- 相容回歸：DEV-020、DEV-092、DEV-094、DEV-106
- QC 狀態：`PASS（Local corrective slice）/ NOT RELEASED`
- 驗證日期：2026-09-07（Asia/Taipei）
- Candidate：working-tree（未 commit、未 push、未 deploy）
- Base URL：`http://localhost:4000/`
- Runtime：沿用既有 listener PID 19344；本 QC 未建立或停止臨時 runtime

## QC 結論

DEV-107 的局部修復已通過本地靜態、TypeScript、targeted browser、相鄰 regression、build、lint 與 diff check。
由紀錄庫正常入口開啟既有 meeting draft 時，頁面已收斂為 `meeting-record`：不再出現 `個人流程`、
work-log workflow 或側欄內重複的最近紀錄；editor、操作列與 drawer scroll responsibility 均維持正常文流。
390px meeting-negative、DEV-094 meeting direct-note 與 DEV-106 local recovery／close guard 均未回歸。

本結論只涵蓋 local corrective slice；不代表 production、remote provider、Phase 1、deploy 或 release ready。
未要求的 commit、push、migration、權限或遠端資料變更均未執行。

## Evidence

| Evidence | 結果 | 事實與產物 |
|---|---|---|
| DEV-107 source/static | PASS | `npm.cmd run verify:dev-107-record-sidebar-layout`，20/20 checks；`output/qa/dev-107-record-sidebar-layout/result.json` |
| DEV-107 browser | PASS | `TC-107-001`（1902／1440／1024）、live meeting regression、`TC-107-009` mobile-negative，共 5/5；`output/playwright/dev-107-record-sidebar-layout/result.json` |
| DEV-107 rendered screenshots | PASS | `meeting-record-1902x960.png`、`meeting-record-1440x900.png`、`meeting-record-1024x768.png`、`mobile-negative-390x844.png` |
| DEV-107 geometry | PASS | drawer `overflowY=auto` 且為唯一 scroll owner；meeting editor `minHeight=220`、`resize=none`、`overflowY=visible`；editor 與 actions 不相交；metadata 同列；水平 overflow=0 |
| DEV-092 static/browser | PASS | `54 checks`；browser quietness regression command exit 0，rendered 1440／390 artifacts 位於 `output/playwright/dev-092/` |
| DEV-094 static/pure/browser | PASS | static `13/13`、pure `7/7`、browser exit 0；`output/playwright/dev-094/result.json`，focus／import／publish-only／mobile-negative 保持 |
| DEV-020 static/browser | PASS | project-change-import static 與 browser command exit 0；work-log workflow、task links、save／publish boundary保持 |
| DEV-106 static/browser | PASS | local safety static PASS；browser 14 cases PASS；`output/playwright/dev-106-meeting-local-safety/result.json`；含 transaction truth、force-flush、F5 recovery、failure isolation、discard 與 0 remote recovery request |
| TypeScript | PASS | `npx.cmd tsc --noEmit` exit 0 |
| Targeted ESLint | PASS | `npx.cmd eslint src/components/Records/RecordSidebar.tsx src/components/Records/RecordContentEditor.tsx src/utils/recordComposerVariant.ts scripts/verify-dev-107-record-sidebar-draft-layout.ts` exit 0 |
| Build | PASS | `npm.cmd run build:test` exit 0；僅有既有 chunk-size／Browserslist warning，無 build error |
| Diff integrity | PASS | `git diff --check` exit 0；僅有既有 LF/CRLF conversion warnings |

## Browser fixture與診斷

- local-test actor：`local-test-user`。
- workspace／board：`dev107-workspace`／`dev107-board`。
- fixture record count：4；含 meeting draft、published meeting、work-log draft、另一筆 meeting draft。
- exact target title：`DEV-107 既有會議草稿排版驗證`。
- DEV-107 browser diagnostics：console error `0`、page error `0`、HTTP 4xx/5xx `0`。
- final mobile overflow：body/root `scrollWidth=390`、`clientWidth=390`。

## Scope與限制

1. 本次 QC 針對使用者提供的既有 meeting draft 破版路徑與必要相鄰回歸；不以 DEV-092 新建 live meeting 歷史 PASS 取代 exact existing-record evidence。
2. 長內容由 drawer 承接垂直捲動；操作列位於 editor 之後並可透過 drawer 到達，未新增 nested editor scroll、`overflow-hidden`、z-index 或固定超大高度 workaround。
3. QA-DEV-107 的延伸案例（例如完整人工鍵盤巡覽、各種 save-error UI 注入）仍由相鄰 DEV-094／DEV-106 evidence 與本地 corrective slice 限制承接；若要作 release candidate，需另依 release gate 重跑完整 QA matrix。
4. 本次未驗證 production、remote provider、跨裝置、Phase 1 needs_review、部署或正式發布。

## Follow-up與 release boundary

- DEV-107 可標記為 `Implemented / Targeted QA-QC PASS / Local-only / NOT RELEASED`。
- 若要進入 release，需建立 frozen candidate，重跑 QA-DEV-107 全部 required cases、正式 release gate、deployment smoke 與 provenance；本 QC 不授權上述動作。
- 使用者未要求的資料 schema、API、provider、權限、migration、commit、push 均維持零變更。

## Evidence provenance

以上結論來自本 working-tree 實際執行命令與產生的 JSON／PNG artifacts；QC 僅讀取與判定，未修改產品程式或測試結果。
