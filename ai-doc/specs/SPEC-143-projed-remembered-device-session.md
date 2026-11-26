# SPEC-143 ProJED 同一裝置保持登入

- 日期 2026-11-26（Asia/Taipei）
- 任務 [DEV-143](../dev_task.md#dev-143-projed-remembered-device-session)
- 狀態 **已實作並完成本機專項驗證及最新 main 整合；CI 已通過**。採 90 天滾動續期，尚未正式發布。

## 1. 交付目標

ProJED 用於隨時記事與規劃。同一裝置完成一次登入後，平常打開主站或 Quick 可以直接進入原帳號，隔夜、關閉重開或常用一段時間都不因原平台登入期限而中斷。功能只適用於 ProJED，沿用既有主站與 Quick 網址、PWA、帳號及原有工作區權限。Jenfu-Platform 入口、OrgMaster、AI-PDM 和 JF-FMS 維持各自的登入政策。

| 情境 | 使用者看到的結果 |
| --- | --- |
| 第一次使用或新裝置 | 沿現有入口登入。成功後，該瀏覽器設定檔與目前入口可使用 ProJED 保持登入。共用裝置可保留原本的登入期限。 |
| 原裝置持續使用 | 以最近一次成功續期起算 90 天。前景開啟或恢復操作時背景續期，畫面保留原工作區與輸入。隱藏分頁、週期輪詢及背景工作不延長期限。 |
| 超過 90 天未續期、主動登出或瀏覽器已清除登入資料 | 雲端功能要求重新登入，仍可從「先記事」開始本機輸入。重登後只同步同帳號可認領的草稿。 |
| 弱網、斷網或上游暫時無法確認 | 續期可以稍後再試。有效 Session 仍依既有期限與權限可用。到期後沿用本機草稿流程，畫面反映待同步狀態。 |
| 帳號停用、全域撤銷或看板撤權 | 帳號層級撤銷作用於所有受影響入口。工作區／看板撤權沿用既有影響範圍。受影響的舊 Session 和續期資格均失效，恢復資格後由正常登入取得新權限。 |

## 2. 工程契約

- **沿用現行登入。** [App Session 服務](../../server/appSessionService.ts)、[PostgreSQL Session 儲存](../../server/postgresAppSessionStore.ts)與 [Cookie](../../server/sessionCookies.ts)目前都依賴上游來源 Session 到期時間，[現行資料庫契約](../../db/migrations/0019_app_sessions_v1.sql)也有同樣約束。新增版本化的 ProJED 裝置 Session，原合約和已發出的舊 Session 沿原期限運作。使用者在新版本首次正常登入時取得保持登入資格。保持登入由使用者在可信裝置選用，主站與 Quick 分別核發、續期及登出，沿用同源邊界。
- **裝置 Session 由 ProJED 管理。** 續期使用既有同源 HTTPS API 模式，由伺服器持有憑證雜湊、有效期限、Principal／本地帳號 UUID、原登入身分版本、入口與撤銷狀態。瀏覽器憑證用 Secure、HttpOnly、host-only Cookie，沿用同源寫入及 CSRF 防護。保持登入的憑證及其期限由伺服器驗證，日誌與診斷只記錄去識別結果。
- **續期確認身分，沿用原權限。** 先查證既有 ProJED 消費者可在原 Platform Session 到期後，透過[中央身分狀態讀取](../../server/runtimeSessionAuth.ts)核實指定 Principal。續期時確認啟用資格、映射、撤銷時間與版本仍有效，並在與登出／撤權一致的本地交易與鎖定順序下更新期限。日常讀寫、輪詢與重連沿用 [SPEC-139 §4.3](SPEC-139-projed-jenfu-platform-onboarding.md#43-保護查詢與寫入) 的 Session 快照與資料隔離。續期沿用同帳號、入口與原有效快照，新增權限在下次完整登入時取得。若現行中央契約不足，先明確界定只供 ProJED 使用的變更，再行接線。
- **續期與撤權競合按提交順序處理。** 延用 [SPEC-139 §5.7](SPEC-139-projed-jenfu-platform-onboarding.md#57-交易撤權競態與結果不明) 和[中央撤權函式](../../db/migrations/0045_central_session_revocation_v1.sql)。撤權、換帳或登出後，滯留分頁、先前已送出的續期回應或舊 Cookie 都不能恢復有效登入。多分頁同時續期與回覆遺失時，使用同一有效期狀態及既有讀回原則，後端回覆應足以辨別「已續期」「可再試」及「請重新登入」。
- **草稿存取沿既有帳號隔離。** 暫時續期失敗與明確身分失效分流。保留目前尚未提交的輸入和同帳號待同步資料。換帳只載入新帳號資料。雲端同步前再次確認帳號與入口，結果不明時先查回原操作再處理。主站沿用 [Session adapter](../../src/services/httpApi/sessionAdapter.ts)，Quick 沿用既有獨立入口、同步和草稿流程。

## 3. 開發順序

| 階段 | 工作與交付 |
| --- | --- |
| 1. 核對現有契約 | 核對 ProJED 主站／Quick 的 Session 讀取、登出、撤權與草稿流程。驗證來源 Session 已到期但 Principal 仍有效時，既有中央讀取可否支援指定 Principal 的續期，並查證停用、撤權與來源全域撤銷的傳播路徑。以此確定是否需要上游契約增補。 |
| 2. 實作伺服器與資料層 | 在 ProJED 實作裝置 Session 核發、續期、登出與撤銷。必要 schema 採向前追加並保留舊 Session 的有效期限及已撤銷狀態。舊執行版本的 migration 清單採精確比對，發布時讓 schema 及應用程式版本保持相容，先證明兩者可共同冷啟動。 |
| 3. 接上主站與 Quick | 新增保持登入選項，接上前景續期、清楚的重登狀態及草稿復原。正常起用沿舊網址和既有 PWA 更新方式。續期呼叫應在背景合併，不擋記事介面，也不在每次讀寫加上中央身分查詢。 |
| 4. 完成驗證與交接 | 先用可控時鐘、隔離 PostgreSQL 與瀏覽器驗證以下案例。實際發布時沿現有候選流程，讀回服務版本、冷啟動、正式登入和正常記事。先備妥能讀同一 schema 的恢復版及停止新續期的方式，保留原資料與本機草稿。 |

## 4. 驗收條件

| 驗收 | 通過條件 |
| --- | --- |
| 維持登入 | 主站和 Quick 分別登入。用可控時鐘跨過原 Platform 來源到期，隔夜及關閉重開後可用原帳號正常操作。驗證每次成功續期把有效期延至其後 90 天，背景輪詢無法延長。 |
| 到期與登出 | 前景最後續期的第 90 天邊界正確拒絕。共用裝置沿舊期限。主動登出後，該入口 Session 與續期皆失效。舊 Session 仍按原規則可用或到期。 |
| 權限與隔離 | 員工、個人、外部協作者沿用原資格和本地 UUID。停用與全域撤銷後受影響的主站與 Quick 不能讀寫或續期。撤掉一個看板的權限後，既有授權邊界生效。跨帳號、跨入口或已撤銷 Cookie 無法取用私人資料。新增權限下次完整登入才生效。 |
| 續期競態 | 多分頁同時續期、續期與登出／撤權交錯，以及回覆遺失的重試，不會復活舊登入、把期限往回縮、重送未知結果的業務寫入，或把另一帳號的成功狀態套到目前帳號。 |
| 記事與復原 | 弱網／離線開啟 Quick 可先記事。重開、網路恢復與正確帳號重登後，草稿可復原並依原規則同步，且重載後可查到原操作結果。測量有快取且同裝置留存登入時，從開啟到可輸入的時間。 |
| 正常發布與恢復 | 以主站與 Quick 舊網址驗證正常登入、PWA 更新、可記事及匿名拒絕。候選冷啟動和正式版本都使用相容的 migration 清單。停用續期或回到相容版本後，既有帳號、私人資料及草稿仍可使用原復原流程。 |

## 5. 實作交接

- 登入 API `POST /api/v1/session/login` 增加選用的 `rememberDevice: boolean`，預設未選用；主站、Quick 登入與 Quick 草稿的重新登入入口均可選擇。選擇只綁定該次登入意圖，不從其他帳號或入口推定。
- [0054](../../db/migrations/0054_remembered_device_session_v1.sql) 追加 `remember_device` 及 `session_version`。既有 Session 為 v1，繼續受來源期限限制；正常登入明確選用才核發 v2。保留原身分 CHECK、RLS、權限快照、UUID 及撤銷 guard，既有 migration 不改寫。
- `POST /api/v1/session/renew` 接受空 JSON `{}`，沿用同源 Cookie、CSRF 與 expected-account/context 標頭。僅原有效 v2 可續期，回傳與 Session GET 相同的 profile，加上 `rememberedDevice: true`。續期不換 token、context 或權限快照，不建立新業務資料；交易提交結果不明時先讀回同一憑證。
- [前景續期](../../src/services/httpApi/foregroundSession.ts) 在開啟、回到前景或恢復連線時合併呼叫，同一頁成功後 12 小時內不重複續期，不使用週期計時器續期。續期不阻擋記事介面。暫時 503 保留有效登入；明確失效後沿既有帳號隔離，私人草稿保留在本機，原帳號重登才恢復。
- `PROJED_REMEMBERED_DEVICE_ENABLED=false` 可停止新保持登入核發及續期，回覆暫時不可用；已核發 Session 仍按原有效期限讀取，普通登入不受影響。恢復版仍須支援 0054，不能將舊版不認識的 schema 當成相容；正式 migration／發布未在本次本機驗證執行。
- 不新增上游身分契約：既有中央 Principal 狀態讀取依 Principal 鍵查詢，不依賴原 Platform Session 存活。一般業務請求維持原快照；續期核對目前啟用、映射與撤銷版本。零留存要求、模型啟用與雲端容量不變。

## 6. 驗證紀錄與重現

- Session／store／Cookie／runtime 專項 81 tests 通過；前端 S3 單元 232 tests、發布工具 55 tests 通過。前端 TypeScript 通過；本機共用依賴缺少既有 `@types/pg`，伺服器型別以任務專用依賴目錄補齊後檢查通過，沒有改動共用 `node_modules`。
- PostgreSQL 18.4 真實隔離庫已驗證 migration 套用與重覆核對、跨來源期限續期、v1 拒絕續期、並行單調性、中央狀態故障、撤權／登出競態、入口隔離及 worker ACL。最終[專項收據](../../output/qa/dev-139/s3/20261126T014200Z-c6f27ef0/result.json)；既有[完整資料庫回歸](../../output/qa/dev-139/s3/20261126T014034Z-a01c5c1d/result.json)亦通過。這些是本機產物。
- 無視窗 Edge 使用合成 HTTP 身分、真實 PWA 與 IndexedDB，12 項通過，涵蓋主站／Quick 選項、成功續期與 503、離線輸入、整個瀏覽器程序關閉重開、撤銷後隱藏但保留草稿、跨帳號拒絕與原帳號重登復原。[瀏覽器收據](../../output/playwright/dev-143/849eebfc-02c2-4fb4-80ac-baf2cc8975fa/result.json)。該次首次 Quick 可輸入約 124ms、快取離線重開約 135ms，為本機單次觀察，沒有修改前基準，不能宣稱正式環境改善幅度。
- 首輪真 PG 發現來源期限 CHECK 的實際名稱為 `app_sessions_check1`，已修正新增 migration 並證實原身分 CHECK 保留。瀏覽器首輪曾誤等 `clientsClaim`、誤將失效後隱藏私人草稿判為遺失；依既有手動更新與隔離契約修正測試前提及判定，沒有改產品去顯示未登入的私人草稿。失敗紀錄保留在 `output/dev143-browser*.log`。
- 重現：`npx tsx --test qa/dev-139/s2/*.test.ts qa/dev-139/s3/*.test.ts`；`& ./qa/dev-139/s3/verify-isolated.ps1 -RememberedDeviceOnly -PostgresBin <本機 PostgreSQL bin>`；`npm run verify:dev-143:browser`（隔離無視窗 Edge，合成資料，不接正式服務）。既有 CI 同一 job 執行資料庫專項，不新增獨立 required gate。
