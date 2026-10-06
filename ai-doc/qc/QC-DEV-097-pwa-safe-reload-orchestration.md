# QC-DEV-097：PWA 安全重新載入協調事實驗證

狀態：`Local Independent QC PASS / Physical Device Supplemental Not Verified / Not Released`
關聯 DEV：DEV-097 / DEV-096 / DEV-041 / DEV-034 / DEV-083
關聯 QA：`ai-doc/qa/QA-DEV-097-pwa-safe-reload-orchestration.md`
關聯 ADR：`ai-doc/decisions/ADR-047-pwa-per-client-reload-isolation.md`
執行日期：2026-08-31

## QC 結論

在未修改產品、測試、設定或任務檔案的前提下，依 `QA-DEV-097` frozen acceptance 執行 local
independent QC。靜態、真實 browser、real Service Worker 與相鄰回歸均通過；本機自動化 QC 結論為
`PASS`。Android／iOS 實機補充不具備執行條件，結論保留為 `Not Verified`，不影響本機 automated
QC PASS，也不代表 production release PASS。

## 環境與 Git Boundary

- Repo：`C:\VIBE CODING\ProJED\ProJED`
- Branch：`持續優化3`
- QC 起始 HEAD：`3a924ae5890f958d1010beb66db4c57c9cd76e20`
- Source boundary：既有 working tree changes；QC 未修改產品／測試／設定。
- Browser：Windows 10、HeadlessChrome `151.0.0.0`、Playwright CLI `1.62.1`。
- App URL：`http://localhost:4000/`；fixture 使用 local-test authenticated account。
- Temporary real-SW runtimes：DEV-096 ports `61184`、DEV-097 port `49874`；用途為 A→B→C／two-tab
  lifecycle；兩者均已清理且 `portReleased=true`。既有使用者 app server `localhost:4000` 未停止。
- Hardware discovery：`adb` 不存在、`idevice_id` 不存在、沒有 OK 的 PortableDevice；故無法取得
  Android／iOS 實機畫面、touch latency、WebView／Safari install／background-resume 證據。

## 執行結果

### Static／source contract

| Scope | Result |
|---|---:|
| DEV-097 safety／owner／readiness | 23/23 PASS |
| DEV-096 transaction convergence | 26/26 PASS |
| DEV-041 update/recovery | 22/22 PASS |
| DEV-045 calendar | 19/19 PASS |
| DEV-047 backup contract | 30/30 PASS |
| DEV-054 mobile drag | 47/47 PASS |
| DEV-095 interaction parity | 4/4 PASS |
| DEV-028／034／069／092／RAG | PASS |

### Browser／rendered UI

- DEV-097：authenticated 九個 mandatory owners、dual-tab dirty isolation、record flush／cancel／
  failed prepare／readback、calendar、backup、invite、inline edit、task details、task drag cancellation；
  1440×900、390×844、320×844 prompt與viewport檢查通過，`visibleErrors=[]`、
  `networkFailures=[]`、`diagnostics=[]`。
- DEV-096／041：更新提示、Later、one-click transaction、recovery、同版本 suppression均通過。
- DEV-047：V3 export／inspect／copy／replace／tamper／legacy scope與390／320 clipped-label／overflow
  checks通過。
- DEV-054：15/15 cases通過，含500ms／8px boundary、raw-finger target、single indicator、cancel／
  zero-write、workbench handover與placed-row no-drag。
- DEV-028／034／045／069／092／095 browser回歸全部通過；無非預期console error、pageerror或HTTP
  failure。瀏覽器測試使用touch emulation／CDP，不是實機證據。

### Real Service Worker／storage

- DEV-096與DEV-097均完成immutable A→B→C與兩分頁收斂；每release一筆transaction、每分頁每release
  一次navigation，dirty／safe分頁資料、session、Cache Storage與IndexedDB readback保留。
- release-scoped A／B／C cache可讀，waiting／activated／controller／target／completed與retarget trace
  均符合契約；safe path prompt count為0，沒有 application-level forced reload。

### Engineering support gates

- `npm.cmd exec tsc -- --noEmit`：PASS。
- `npm.cmd run build:test`：PASS。
- 32 個變更程式檔 ESLint：0 errors；9 個既有 warnings。
- `git diff --check`：PASS。

## Evidence Provenance

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `output/qa/dev-097/static-result.json` | 10801 | `fc64779195666af7d666388a44ae0b7e8380471cef42fd48bb055c04c06a1056` |
| `output/playwright/dev-097/ui-result.json` | 10079 | `173327cc41f01ffdc48d6148f942cf6bfe7a3d4bc6f36edceeb5a1431a86112f` |
| `output/playwright/dev-097/sw-integration-result.json` | 402954 | `337fc6617492c01c91b2e9c2e2b7bb688c328b3f758f84d482fd3b133e2cfe29` |
| `output/playwright/dev-096/sw-integration-result.json` | 37481 | `bfdcf6025e116a5130e94a9c15fd4ef3f2ef9a20478fc9797aa035c4f0e2aecf` |

Viewport screenshots位於 `output/playwright/dev-097`、`dev-096`及相鄰DEV目錄；browser runner以正常
產品入口與 local-test fixture產生結果，不以直接注入完成資料代替 UI readback。

## Findings / Residual Boundary

1. 首輪 DEV-054 完整批次曾因CDP touchMove抵達晚於500ms timer，造成9px false failure；不改產品8px
   threshold，將同一事件提早注入後連續兩輪15/15 PASS。此為 harness reliability correction，非產品門檻放寬。
2. Android／iOS physical supplemental 未驗證：恢復條件是連接可識別的Android裝置（adb）與iOS測試裝置／
   Safari通道，再重跑 `QA-DEV-054` physical gate；目前不得標記實機通過。
3. 未執行 production deploy、production smoke、commit前後release artifact provenance或rollback gate；
   下一步需另走 deployment/release gate。

## QC 判定

`Local Independent QC PASS / Physical Device Supplemental Not Verified / Not Released`。
