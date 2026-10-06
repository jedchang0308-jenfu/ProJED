# QC-DEV-096 PWA 更新交易收斂與提示精簡

- 結論：`LOCAL IMPLEMENTATION QC PASS / Core Acceptance PASS / 未 Deploy / 未 Release`
- Source：working-tree boundary，base HEAD `5326a1446f166e25ffa9e205344c8622fa8de8b0`；未宣稱 immutable commit
- 環境：Windows、local-test backend、既有 `http://localhost:4000/`；real-SW 使用 task-owned random-port fixture
- 角色：獨立 readback 本地 candidate 與 verifier artifacts；QC 未修改產品資料、remote schema 或 deployment

## 1. QC 範圍與判定

本次 QC 驗證 DEV-096 的本地實作 acceptance：單一 transaction／owner fence、waiting worker activation、controllerchange reload、post-reload current/target 對帳、B waiting→C retarget、多分頁 apply、精簡更新提示、bounded recovery 與既有 PWA regression。Production deploy、remote smoke、release authorization 不在本次範圍。

## 2. Fresh fact 結果

| Gate | 實際結果 | 直接證據 |
|---|---|---|
| Transaction contract | PASS，static/pure 25/25；strict schema、legal transition、lease/fence、stale／recovery、old-owner rejection、forbidden path 均通過 | `output/qa/dev-096/static-result.json`、`npm.cmd run verify:dev-096-pwa-update-transaction-convergence` |
| Compact UI | PASS；390×844／320×844 無水平溢位，prompt 高 64px，normal icon／paragraph 皆 0，CTA 68×34px，三個控制項符合 contract | `output/playwright/dev-096/ui-result.json`、`pwa-update-prompt-390.png`、`pwa-update-prompt-320.png` |
| Test-mode interaction | PASS；稍後只隱藏提示不遺失 target、一次點擊完成 test transaction、stale callback 0、recovery action 與最短錯誤可見、critical diagnostics 0 | `output/playwright/dev-096/ui-result.json`、`pwa-update-recovery.png` |
| Real service worker | PASS；A→B、B→C、B waiting→C retarget 均一次收斂，最終 `release:dev096-C` | `output/playwright/dev-096/sw-integration-result.json`、`real-sw-a-to-b-before-apply.png`、`real-sw-retargeted-c.png` |
| Multi-tab | PASS；兩個同 origin page 共用 transaction ID `tx-eb65f73a-db30-463d-870f-cb8c481df8db`，只有一個有效 apply owner，兩頁均 post-reload 到 B | `output/playwright/dev-096/sw-integration-result.json`、real-SW verifier output |
| Storage safety | PASS；A→B 後 local／session marker、獨立 IndexedDB marker 與 Cache Storage marker 均 readback 保留 | `output/playwright/dev-096/sw-integration-result.json`、real-SW verifier output |
| Release identity parity | PASS；injected client release ID、`release-meta.json`、manifest 三者一致；latest artifact `dev096-C` | `npm.cmd run verify:production-artifact` |
| Existing PWA regression | PASS；DEV-041 static 22/22、DEV-041 browser、DEV-034 static 22/22、DEV-034 browser | command output、`output/playwright/dev-034-*` |
| Build / static quality | PASS；TypeScript exit 0、build:test exit 0、touched-file ESLint exit 0、`git diff --check` 無 whitespace error | command output |

## 3. Root-cause verification

重複提示並非單一 UI state bug，而是四層狀態未共用同一筆 transaction：

1. 版本 identity 原先不足以可靠區分目前 bundle 與 latest release。
2. waiting worker、controller 接管與 document reload 沒有明確的 owner／fence／reservation。
3. 連續版本切換時，舊頁面的 async update check 可能晚回寫 transaction；B waiting→C 時也可能喚醒過期的 B worker。
4. completed target 沒有以 post-reload `currentVersion === targetVersion` 作唯一完成條件。

現行實作以 release/bundle namespace、v1 transaction、Web Locks＋獨立 PWA IndexedDB lease、controllerchange quiesce、retarget worker-instance check、bounded recovery 與 startup reconciliation 封閉上述路徑。真實 fixture 已覆蓋到曾造成失敗的 B waiting→C case。

## 4. Failure evidence integrity

首輪 real-SW 驗證曾失敗於：Windows child-process spawn／Response serialization（fixture）、waiting lifecycle 時序（fixture）、controllerchange 後未 reload（產品）、舊 async writer race（產品）、以及 retarget 後仍 activation 舊 waiting worker（產品）。每項均保留於本次工作階段的 command output；後續修正只改對應責任層，並以 fresh rerun 重驗。最後 real-SW run 的 runtime cleanup 為 `portReleased=true`。

## 5. Boundary / 未宣稱事項

- 未執行 Firebase Hosting production deploy、remote authenticated smoke、rollback 或 release；DEV-041 的歷史 production evidence 不回填為 DEV-096 production PASS。
- 未新增 DB schema、migration 或 business storage；正常更新不 unregister service worker、不刪 Cache Storage、不清 localStorage／sessionStorage／IndexedDB 業務資料。
- 既有 `http://localhost:4000/` 是其他 task-owned primary runtime，本次未停止；real-SW random-port runtime、Playwright session 與 temporary code 均由驗證器清理。

## 6. QC 判定

DEV-096 本地 implementation／core acceptance 可接受，狀態為 `RD Implemented / Local QA-QC PASS / 未 Release`。若要正式上線，必須由使用者重新授權並依 deployment-release-gate 執行 immutable release artifact、production A→B smoke 與 rollback readiness。
