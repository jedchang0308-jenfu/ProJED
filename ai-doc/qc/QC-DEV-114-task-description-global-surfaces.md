# QC-DEV-114：任務說明全介面覆蓋與重複名稱懸浮清理

- 日期：2026-09-10（Task Details surfaces amendment）
- 狀態：`DEV-114 + compatible regression PASS / NOT RELEASED`
- 對應 DEV：DEV-114
- 對應 SPEC：`ai-doc/specs/SPEC-114-task-description-global-surfaces.md`
- 對應 QA：`ai-doc/qa/QA-DEV-114-task-description-global-surfaces.md`
- 驗證環境：Local test runtime `http://localhost:4000/`；Chromium；1440×900、1024×768、390×844

## 結論

DEV-114 本身已完成 RD implementation，並通過專用 static／browser 與 engineering gates。19 個納入位置共用單例
`TaskDescriptionHoverCard`；說明卡只顯示非空 plain-text description，不顯示任務名稱；mobile／touch／coarse pointer
維持 no-op。Task Details ancestor breadcrumb 與子任務列已接通，且卡片 layer 高於 modal。回收桶與紀錄 controls、操作型 tooltip、既有 popover、mention serialization 與 subscription preview identity
均保留。

相容 regression gate 已完成；DEV-039／DEV-002 verifier 已同步目前已定案的 capability／shared date module 與
DEV-110 typed unresolved-link contract。本次仍不宣告 production ready，因正式版本仍須另走 deployment/release gate。

## 證據索引

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-114 static | PASS 29/29 | `npm run verify:dev-114-task-description-global-surfaces` |
| DEV-114 browser | PASS B01～B26＋B02a（27/27） | 1440×900／1024×768／390×844；`output/playwright/dev-114-task-description-global-surfaces/result.json`；0 browser/page/HTTP error；B02/B02a screenshots visibly show cards above modal |
| TypeScript | PASS | `npx tsc --noEmit` |
| ESLint | PASS（0 error） | 受影響檔案 targeted ESLint；TaskMentionNode 保留既有 `_config`／`_editor` 2 warnings |
| Test build | PASS | `npm run build:test`；僅有既有 chunk-size／Browserslist warning |
| Diff check | PASS | `git diff --check` |
| Compatible static regression | PASS | DEV-111 38/38、DEV-028 48/48、DEV-039 33/33、DEV-098 22/22、DEV-045 19/19、DEV-088、DEV-006、DEV-107 20/20、DEV-002 16 file groups |
| Compatible browser regression | PASS | DEV-039 placement-lanes browser、DEV-006 editor input browser PASS（`output/playwright/dev-006-gmail-editor.png`）；DEV-114 專用 browser 已補 1024×768 clamp evidence |

## Runtime ownership

本次驗證重用既有 matching runtime：Vite listener PID `28532`、wrapper PID `3264`，port `4000`；該 runtime 非本任務啟動，
未停止亦未終止其他 `node.exe`。若後續 owner 結束 runtime，須依 lifecycle 規則確認 port 已釋放。

## Release boundary

本 QC 不包含 commit、push、deploy、Firebase Hosting 或 production release。DEV-114 開發完成後，若要納入正式版本，
仍須另走 deployment/release gate。
