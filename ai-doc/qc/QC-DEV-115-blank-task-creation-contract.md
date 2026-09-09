# QC-DEV-115：空白任務建立契約與跨模式 constructor 收斂

- 日期：2026-09-10
- 狀態：`Targeted QC PASS / NOT RELEASED`
- 對應 DEV：DEV-115
- 對應 CAPA：CAPA-002
- 對應 SPEC：`ai-doc/specs/SPEC-115-blank-task-creation-contract.md`
- 對應 QA：`ai-doc/qa/QA-DEV-115-blank-task-creation-contract.md`
- 驗證環境：Local test runtime `http://localhost:4000/`；Chromium；1440×900；owner actor `local-test-user`

## 結論

DEV-115 的 local product implementation 已完成 targeted QC。`createBlankTaskNode()` 是唯一 blank content authority，7 個
constructor 檔案的 11 個 blank construction points 均已接入；工作台新增後的 store／account-scoped local readback、詳情 note、
rename、reload 與 1000ms hover negative 均符合 `description` absent 契約。Board、context、Gantt、Calendar 與 MindMap 代表性
adapter smoke 也通過，未觀察到 visible、browser/page 或 HTTP error。

本 QC 不等同正式環境驗證或 release approval。permission-denied actor、390×844 mobile fixture、production smoke、歷史資料
dry-run 與 CAPA effectiveness 仍須走各自 gate。

## Targeted QC review

| Check | 事實核對 | 結果 | 證據 |
|---|---|---|---|
| Q01 原始缺陷 | 工作台新建 title=`新任務`；TaskDetails note 空白；persisted own `description` absent；改名後 reload 仍 absent；indicator=0、hover card=0 | PASS | Browser B01；`output/playwright/dev-115-blank-task-creation/result.json` |
| Q02 11-point manifest | 7 檔 expected factory call count = 1／1／1／2／3／2／1，合計 11/11；無未分類 blank candidate | PASS | `npm run verify:dev-115-blank-task-creation` 17/17 |
| Q03 非工作台 adapter | Board root、context child、Gantt shared sidebar、Calendar shared sidebar、MindMap command 建立 payload 均無 own `description` | PASS | Browser B02～B06 |
| Q04 source-derived boundary | inbox promotion 仍保留 `item.note || item.title || ''`；blank factory 未被 capture／clone／import／restore 使用 | PASS | Static source guard、DEV-013、DEV-047 與既有相容 evidence |
| Q05 engineering integrity | TypeScript、targeted ESLint、test build、diff check | PASS | `npx tsc --noEmit`；targeted ESLint 0 error／18 existing warnings；`npm run build:test`；`git diff --check` |
| Q06 runtime/error sweep | visible alert=0、console/page error=0、unexpected HTTP 4xx/5xx=0 | PASS | Browser B07～B09 |

## Evidence index

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-115 static | PASS 17/17 | `npm run verify:dev-115-blank-task-creation` |
| DEV-115 browser | PASS B01～B09 | `output/playwright/dev-115-blank-task-creation/result.json`；1440×900；0 browser/page/HTTP failure |
| Compatible static | PASS | DEV-039 33/33、DEV-111 38/38、DEV-114 27/27、DEV-028 48/48、DEV-098 10/10、DEV-013 PASS、DEV-047 30/30 |
| Protected boundary | PASS | `src/types/index.ts`、`src/store/useWbsStore.ts`、`TaskInteractionScope.tsx`、`migrationManifest.ts` hashes 與 SPEC baseline 一致；未改 schema/provider/RLS/migration/permission |
| Candidate identity | PASS | factory SHA-256 `8D81A098BF45C8C915277E69893119F591233F07926D5464BA5CCAB7E8A064A3`；7 個 migration file hashes 已收錄 SPEC-115 |

## Runtime ownership

本次驗證重用既有 matching runtime：Vite listener PID `28532`、wrapper PID `3264`、port `4000`；runtime 非本任務啟動，未停止亦未
終止其他 `node.exe`。Browser artifact 明確記錄 `cleanup.action = reused; not stopped`。

## QC boundary and follow-up

- 本 QC 只核對 local working-tree candidate；沒有 commit、push、deploy、Firebase Hosting 或 production release。
- 未執行 permission-denied actor 與 390×844，不能把 targeted PASS 擴張為完整 matrix PASS。
- 未執行 CAPA-002 CA-03 historical dry-run；不對既有 `description === '新任務'` 資料做 mutation。
- Release 前須重新執行 deployment/release gate；release 後由 QC／Data owner 完成 E-02／E-03 effectiveness。
