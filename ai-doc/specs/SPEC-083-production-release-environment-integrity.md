# SPEC-083：正式發版環境隔離與 artifact 完整性閘門

- 文件狀態：`Implemented / Released / Permanent Credential Unrecoverable Policy`
- 關聯 DEV：DEV-083
- 權威邊界：本文件是 DEV-083 P0＋P1 的工程契約；ADR-037 仍是 ProJED／ProJED-TEST／Level 3 分工權威
- Spec Impact：P0＋P1為`Compatible extension`；2026-08-26使用者以`Intentional replacement`將DEV-083既有 retired credential set 永久標記為不可回收，strict gate改採明確 policy waiver，不更換provider、不改資料或登入產品語意
- 決策來源：使用者先核准P0＋P1、不做P2及Edge Functions／legacy remediation；2026-08-22的一次性例外由2026-08-26的永久 credential policy 取代，candidate、activation與正式站smoke仍保留
- 實作證據：`scripts/release/credential-rotation-policy.json`（policy `DEV-083-retired-credential-set-20260826`）綁定production project ref；缺少該 retired set 的值時以`permanently-unrecoverable`通過，若有人提供值仍照常探測。

## 1. 目標與成功狀態

修正「測試 Supabase 與 localhost 設定可經由 parent `process.env` 進入 production build」的系統性缺口，
並把正式發布改成 fail-closed、artifact-centric 的單一入口。完成後必須同時成立：

1. production build 只從明確的 production public-env authority 取得前端設定，且不讀 test／development profile。
2. Supabase server/admin 驗證憑證不會傳入 Vite child process 或進入 `dist`。
3. 每一份 production artifact 都有可重算 manifest、source identity、environment identity 與 SHA-256 tree identity。
4. 正式 artifact 指向 production Supabase、production redirect 與 production Firebase target；錯誤 profile 在 deploy 前非零退出。
5. OAuth cancel callback 可用不登入、不寫資料的方式自動驗證最終 Location。
6. `release:production` 是 P1 唯一正式發版入口；candidate verification 與 live activation 是兩個不同 phase。
7. production 啟用後，canonical smoke 能證明線上載入的仍是同一份 artifact。

## 2. Human Decision Brief

- 採用：P0 環境隔離、server/public env 分界、artifact manifest／掃描、OAuth callback 自動化。
- 採用：P1 單一 `release:production` orchestration，包含 prepare、candidate、activate 三個明確 phase。
- 不採用：P2 CI protected environment、IAM／credential owner 收斂、技術性封鎖 direct deploy。
- P2 不建立 future implementation capsule；只有使用者日後明確改變決策時才重新登錄。
- 人類保留的必要決策只有 production activation go/no-go；遇到 Firebase／Google／Supabase re-auth 或 2FA 時，
  人類需完成身分驗證，但不需手動編輯 env、artifact 或部署指令。
- Edge Functions新key runtime smoke、legacy disable與readback已完成；Management PAT歷史值已由使用者確認永久不可回收，strict gate改採 tracked policy waiver；現行 PAT／publishable／secret key 仍必須通過 active probe。
- 一次性 `.env.local` → `.env.test.local` migration 由 `npm run migrate:test-env-profile` 執行；遇到不同值即停止且不覆寫，保留人類決策權。

## 3. Scope

### P0：環境與 artifact fail-closed

- 將 `.env.production` 定為 production public-env 的唯一檔案 authority。
- 將本機測試值移至 `.env.test.local`；`.env.local` 不再保存 release-controlled `VITE_*`。
- 將 `.env.p8.local` 定為 server-only verification authority；不得由 production build loader 讀取。
- 將 `load-local-env.mjs` 限定為 local/test 用途，新增 server verification loader，P7／P8 不再使用通用 loader。
- production Vite child 只收到 OS 執行所需環境與隔離後的 public allowlist；parent `VITE_*` 與 server secret 不繼承。
- build 使用 task-owned isolated `envDir`，避免 Vite 自動併入 repo root `.env.local`。
- build 完成後產生 release metadata、artifact manifest、entry asset 與 deterministic SHA-256 tree identity。
- 建立 environment identity、secret、forbidden Supabase ref、local redirect 與 artifact tamper verifier。
- 將 OAuth boolean/manual gate 改為可重現的 safe cancel callback verifier。

### P1：單一正式發版入口

- 新增唯一公開入口 `npm run release:production -- --phase <prepare|candidate|activate>`。
- `prepare` 只做 source boundary、Layer 1、sealed build、manifest、Layer 2 local artifact smoke；不得遠端 deploy。
- `candidate` 只部署 manifest 指定 artifact 到 inactive Firebase preview channel，執行 production-bound read-only gate 與 credential-rotation gate；
  不得啟用 live traffic。
- `activate` 必須重新驗證 manifest、candidate evidence、target、credential-rotation gate 與獨立 go/no-go token，才可部署 live。
- activation 後執行 canonical smoke；失敗即非零退出、保留前一版 reference，且不得宣稱 release complete。
- credential remediation 先讓 `calendar-feed` 改讀 `SUPABASE_SECRET_KEYS.default`、`match_project_knowledge` 改讀
  `SUPABASE_PUBLISHABLE_KEYS.default`，並保留 Supabase CLI 的 singular-key local fallback；production code 不再讀 legacy env。
- 只有兩個 production Edge Functions 部署後 smoke 通過，才可停用 legacy API keys；停用後需重新驗證新 publishable／secret keys、兩個 Functions與 legacy inactive probe。
- Management PAT 必須先建立並驗證新 token、更新 gitignored `.env.p8.local`，才可撤銷舊 token；新 token 無法驗證時不得撤銷舊 token。

## 4. Out of Scope

- 不建立 GitHub Actions 或其他 CI workflow，不新增 paid runner／Supabase Branch。
- 不限制 Firebase Console 或 Firebase CLI 的 IAM/direct deploy 權限；這是明確接受的 P2 殘留風險。
- 不修改 Supabase Auth dashboard、Google OAuth scope、redirect allowlist 或 Site URL。
- 不修改 DB schema、migration、RLS、正式資料、使用者 session 或產品登入 UI。
- 不重寫 ADR-037 的 Level 3 staging/test 流程；P1 只驗證並引用同 source commit 的 Level 3 evidence。
- 不自動 rollback production；canonical smoke 失敗時只 fail closed 並輸出已擷取的 rollback reference。

## 5. Environment Authority 與資料流

| Profile | Authority | 可包含 | 不得流向 |
|---|---|---|---|
| local/test | `.env.test.local` | test public keys、local password fixture、localhost redirect | production builder、production manifest |
| staging | `.env.staging.local` | ProJED-TEST public keys與 Level 3 fixture | production builder、production candidate evidence |
| production public | `.env.production` | 瀏覽器需要的 `VITE_*` public config | server secret loader以外的 alias 回填 |
| server verification | `.env.p8.local` | service role、DB password、access token、readiness flags | Vite child、`dist`、browser log、manifest value |

固定資料流：

```text
.env.production
  -> production contract validation
  -> isolated task-owned envDir + sanitized child env
  -> Vite build once
  -> output/release/dev-083/<release-id>/dist
  -> artifact scan + manifest
  -> inactive Firebase production-candidate preview
  -> explicit activation decision
  -> Firebase live
  -> canonical artifact/provenance/OAuth smoke

.env.p8.local -> server-only loader -> only the P7/P8 step that declares each required key
```

## 6. Production Target Contract

新增不含 secret 的 tracked contract，至少固定：

| 欄位 | 值／規則 |
|---|---|
| release profile | `production` |
| Firebase project | `projed-cc78d` |
| Firebase Hosting site | `projed-cc78d` |
| canonical origin | `https://projed-cc78d.web.app` |
| canonical redirect | `https://projed-cc78d.web.app/` |
| Supabase project ref | `knodlkxqpcqyrtgwpdst` |
| Supabase host | `knodlkxqpcqyrtgwpdst.supabase.co` |
| backend | `supabase` |
| auth mode | `oauth-google` |
| auto test login | `false` |
| forbidden Supabase ref | `fhisnnufoeulxqrchldf` |
| inactive candidate channel | `production-candidate`，預設 1 day expiry |

Production public allowlist：

- 必填：`VITE_DATA_BACKEND`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、
  `VITE_SUPABASE_AUTH_REDIRECT_URL`、`VITE_GOOGLE_CLIENT_ID`、現有七個 `VITE_FIREBASE_*` web config keys。
- 可選但受契約限制：`VITE_PROJED_APP_URL` 必須等於 canonical origin；
  `VITE_CALENDAR_FEED_BASE_URL` 若存在必須是非 loopback HTTPS。
- build 固定值：`VITE_SUPABASE_AUTH_MODE=oauth-google`、`VITE_SUPABASE_AUTO_TEST_LOGIN=false`、
  `VITE_SUPABASE_TEST_EMAIL=''`、`VITE_SUPABASE_TEST_PASSWORD=''`、diagnostics disabled。
- 任何其他 release-controlled `VITE_*` 必須先加入 tracked contract 與 verifier，不得默默穿透。

Server-only denylist 至少包含：`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_DB_PASSWORD`、
`SUPABASE_ACCESS_TOKEN`、`GEMINI_API_KEY`、`sb_secret_*` 與 service-role JWT。任何值不得出現在
Vite child env、generated env file、artifact、manifest、browser evidence 或 console output。

## 7. Loader 與 Child Process Contract

1. `load-local-env.mjs` 僅供 local/test scripts 使用；偵測 `PROJED_RELEASE_PROFILE=production` 時立即拒絕。
2. 新的 server verification loader 只讀 `.env.p8.local` 與已存在的同名 parent server keys，
   不讀 `.env.local`、`.env.test.local`、`.env.staging.local` 或 `.env.production`，也不做 `VITE_* -> SUPABASE_*` alias。
3. P7／P8 每個 child step 宣告 required env；runner 只注入該 step 的 server keys，不再傳完整 `process.env`。
4. production builder 直接解析 `.env.production`，先驗證 target contract，再把 allowlist 寫入 task-owned isolated envDir。
5. Vite child 使用 sanitized env；release-controlled parent keys若存在且與 authority 不一致，build 前即失敗。
6. `.env.production.local` 不是 authority；若含 release-controlled keys，preflight 必須失敗並只回報 key name。
7. 本機 profile 搬移需 value-preserving、不得覆寫衝突值、不得輸出值；衝突時保持原檔不變並停止。

## 8. Artifact 與 Manifest Contract

Artifact root 固定為 `output/release/dev-083/<release-id>/dist`；同層保存 manifest、evidence 與由 canonical
`firebase.json` 產生的 task-owned Firebase config。`output/` 既有 ignore 規則維持，不加入 Git。

Manifest schema 最少包含：

```json
{
  "schemaVersion": 1,
  "releaseId": "<opaque-id>",
  "createdAt": "<ISO-8601>",
  "source": { "commit": "<sha>", "branch": "<name>", "clean": true },
  "target": { "firebaseProject": "projed-cc78d", "site": "projed-cc78d" },
  "environment": {
    "profile": "production",
    "supabaseProjectRef": "knodlkxqpcqyrtgwpdst",
    "redirectOrigin": "https://projed-cc78d.web.app"
  },
  "artifact": {
    "root": "dist",
    "treeSha256": "<sha256>",
    "entryHtml": "index.html",
    "entryAssets": [{ "path": "assets/index-*.js", "sha256": "<sha256>", "size": 0 }]
  },
  "contractSha256": "<sha256>"
}
```

- `treeSha256` 由排序後的 relative path、file SHA-256 與 size 計算；mtime 不參與。
- manifest 不保存 anon key、client id、Firebase web config value、state token或任何 server secret。
- `dist/release-meta.json` 只保存 release ID、commit、contract digest與 public target identity，供遠端 provenance readback。
- project-ref 掃描涵蓋全部文字 artifact；出現非 production `.supabase.co` ref 或 forbidden ref 即失敗。
- local origin 掃描只針對 resolved public env與 app-owned chunks；vendor library內建 localhost字串不得造成假陽性。
- test email／password採 value match 但不輸出值；命中時只回報 key type、檔案與 byte offset。
- manifest 建立後 artifact 任一 byte 改變，candidate／activation gate 都必須失敗且不得自動重建。

## 9. OAuth Safe Cancel Callback Contract

Verifier 以 manifest 的 Supabase host與 canonical redirect 建立 Google authorize request，並使用 manual redirect：

1. authorize endpoint 必須屬於 manifest 的 production Supabase project。
2. 第一個 redirect 必須前往 Google provider；其中 callback URI 必須回 production Supabase callback。
3. 只記錄 state「存在」與不可逆摘要，不輸出完整 state、query或 key。
4. 以 `access_denied` 模擬取消，呼叫同一 callback；不登入、不建立 session、不寫資料。
5. 最終 `Location` 的 origin與 path必須等於 canonical redirect，且不得是 localhost、test project或其他網域。
6. 任一缺 state、非 3xx、redirect loop、target mismatch或網路錯誤皆為 gate fail。

Supabase 官方契約依據：`redirectTo` 必須符合專案 allowlist，production 建議使用 exact redirect path；
2026-08-21 changelog scan 未發現 hosted social-login redirect 的相關 breaking change。

## 10. P1 `release:production` Phase Contract

### Phase A — `prepare`

- 不帶 phase時顯示 usage並非零退出；不得採用「無參數即部署」。
- 檢查 branch、HEAD、upstream、ahead/behind與 clean tracked worktree；dirty或 unknown-risk change立即停止。
- 驗證同 commit的 ADR-037 Level 3 evidence存在；若該 release profile明確 N/A，需保存具體 rationale。
- 執行最小 Layer 1 source checks、sealed production build、artifact scan與 manifest建立。
- 啟動 task-owned temporary preview runtime做 Layer 2 browser SPA smoke，完成後停止該 process tree並確認 port釋放。
- 輸出 manifest path與 release ID；不得執行 Firebase remote operation。

### Phase B — `candidate`

- 讀既有 manifest，重新計算 artifact、contract、source identity；不得 rebuild。
- 執行 P7／P8 server readiness 與 credential-rotation gate，但 server keys只注入宣告它們的 child steps。
- 讀取 Firebase `live` channel 的 current release/version；candidate channel 的新增或更新不得改變 live snapshot。
- 使用 manifest同層 generated Firebase config，將同一 artifact部署至 `production-candidate` preview。
- 驗證 preview HTTP/app shell/console/pageerror/network、manifest全部entries的remote size/hash、release-meta與 OAuth safe callback。
- 保存 candidate URL、Firebase release/version ID、manifest tree hash與 evidence；live target保持不變。

### Phase C — `activate`

- 需要與 prepare/candidate不同的命令，並要求 `--approve-release <release-id>` 精確匹配 manifest。
- 重新驗證 candidate evidence、artifact、source、target、credential rotation與 Firebase auth；candidate不可用時停止，不可偷換 staging evidence。
- activation前記錄目前 live release/version作 rollback reference。
- 部署 manifest指定 artifact到 explicit project/site；不得 rebuild或使用 repo root stale `dist`。
- canonical smoke驗證 HTTP、app shell、critical console/page/network、manifest全部entries hashes、release-meta、Supabase ref與 OAuth callback。
- 若本次 release變更 Auth client/session code或 Supabase Auth設定，authenticated smoke為 blocking；
  只有 pipeline本身變更且 Auth code/config未變時，safe callback＋artifact identity可作必要 Auth regression evidence。
- canonical smoke失敗時非零退出並留下 rollback reference；不得自動聲稱完成或以 deploy CLI success取代 smoke。

## 11. File／Module Impact

| 檔案 | 動作 | Implementation contract |
|---|---|---|
| `package.json` | 修改 | 新增唯一 `release:production`、sealed build與 DEV-083 verifier scripts；`verify:source`不得再呼叫未隔離的 production build |
| `.env.test.example` | 修改 | 補齊 test Supabase public/auth keys；不放實值 |
| `scripts/load-local-env.mjs` | 修改 | 限定 local/test並拒絕 production release profile |
| `scripts/migrate-test-env-profile.mjs` | 新增 | 以 key-only dry-run／conflict stop 執行 `.env.local` → `.env.test.local` 一次性搬移；不自動覆寫 |
| `scripts/load-server-verification-env.mjs` | 新增 | 只載入 server verification keys，不做 VITE alias |
| `scripts/p7-release-gate.mjs` | 修改 | per-step env allowlist、移除通用 loader與 manual OAuth boolean gate |
| `scripts/p5-supabase-crud-smoke.mjs`、`scripts/p6-supabase-readiness.mjs`、`scripts/p8-credential-rotation-check.mjs`、`scripts/p8-browser-smoke-cleanup.mjs` | 修改 | P7/P8 server verification chain統一使用 server-only loader；credential strict gate只接受`probed-inactive`或production project 綁定的`permanently-unrecoverable` policy，不接受human attestation或probe error冒充PASS |
| `scripts/p8-preflight.mjs` | 修改 | server-only preflight；OAuth gate改讀自動 evidence |
| `scripts/p8-production-readiness.mjs` | 修改 | 不傳完整 process env，串接自動 callback與artifact evidence |
| `vite.config.js` | 修改 | release profile使用 task-owned isolated `envDir`；既有 test mode維持 |
| `scripts/release/production-contract.mjs` | 新增 | non-secret target、public allowlist、forbidden identities與phase constants |
| `scripts/release/env-boundary.mjs` | 新增 | dotenv parse、public/server sanitize、profile migration與不輸值診斷 |
| `scripts/release/credential-rotation-evidence.mjs`、`scripts/release/credential-rotation-policy.json` | 新增 | old credential evidence mode分類、production project綁定的永久不可回收 policy與safe summary；新 credential 若被提供仍必須客觀probe |
| `scripts/release/build-production-artifact.mjs` | 新增 | build once、isolated envDir、release-meta、manifest與task-owned config |
| `scripts/release/verify-production-artifact.mjs` | 新增 | identity/secret/tamper/tree hash verifier與remote provenance比對 |
| `scripts/release/verify-oauth-cancel-callback.mjs` | 新增 | mocked self-check與production-bound safe callback |
| `scripts/release/verify-production-bound-readiness.mjs` | 新增 | production public target＋server-only keys＋read-only Supabase/Management API readiness；不寫資料 |
| `scripts/release/production-release.mjs` | 新增 | prepare/candidate/activate唯一 orchestration入口；live channel-only snapshot，candidate delta不污染live invariant |
| `scripts/verify-release-browser-smoke.pw.js` | 修改 | 接受expected release identity並輸出可保存 evidence；既有 Level 3用法相容 |
| `scripts/verify-dev-083-production-release-gate.mjs` | 新增 | pure/fixture regression與phase safety verifier |
| `supabase/functions/_shared/supabaseApiKeys.mjs` | 新增 | fail-closed 解析 hosted JSON key maps與 CLI singular-key fallback；不得讀 legacy env |
| `supabase/functions/calendar-feed/index.ts` | 修改 | admin client改用新 secret key map；保留既有 public token feed與資料行為 |
| `supabase/functions/match_project_knowledge/index.ts` | 修改 | user-scoped client改用新 publishable key map並維持 caller JWT／RLS |
| `scripts/verify-dev-083-edge-key-rotation.mjs` | 新增 | key-map precedence／failure mode、source legacy-read absence與 function config verifier |
| `src/**`、DB schema／migration、`firebase.json` | 不修改 | 產品 UI、資料、RLS與canonical Hosting contract維持 |

Local-only data migration：RD實作時將 `.env.local` 的 release-controlled test keys移至 `.env.test.local`；
不得在 diff、console或 evidence顯示值。若目的檔存在不同值，停止並保留兩檔原狀，由使用者決定來源。

## 12. Implementation Slices 與 Entry/Exit Gate

| Slice | Scope | Entry | Exit evidence |
|---|---|---|---|
| S0 | 建立 verifier fixtures，重現 process env、local env、tamper與callback錯誤 | SPEC/QA ready | pre-fix regression可被測試描述，無遠端操作 |
| S1 | production contract、env boundary、local/server loader分離 | S0 | contamination/missing/conflict/secret-boundary tests PASS |
| S2 | sealed build、release-meta、manifest、artifact verifier | S1 | deterministic hash、forbidden ref與tamper tests PASS |
| S3 | OAuth safe cancel callback self-check與remote adapter | S2 | mock valid/invalid chain PASS；不輸出state或key |
| S4 | `release:production`三 phase與browser provenance | S1-S3 | prepare不得remote、candidate不得activate、activate缺approval必敗 |
| S5 | QA/QC local gate與Spec Drift | S0-S4 | QA-DEV-083 local必測項PASS；`In sync`；仍未release |
| S6 | Production credential rotation | S5＋使用者明確授權 | rollback snapshot、兩個 Function deploy/smoke、legacy disable/readback、現行 key active probe與 retired credential policy evidence PASS |

第一個 failing slice、secret exposure、artifact identity mismatch、scope drift或需改 Supabase/Auth remote config時立即停止。

## 13. Failure Recovery

- Env migration conflict：不覆寫任何local value；回報key name與來源檔，不回報值。
- Sealed build失敗：保留診斷，標記release workspace incomplete；不得沿用舊artifact或repo root `dist`。
- Manifest/artifact mismatch：整個release ID作廢；回到新的prepare，不可修manifest繼續。
- Candidate失敗：保持live不變，保留candidate evidence與task-ownedartifact供診斷。
- Activation前失敗：不得部署；修復後重新驗證同artifact，輸入變更則建立新release ID。
- Activation後canonical smoke失敗：保留previous live version與failed release ID，回送release gate決定rollback；
  不自動修改production或隱藏失敗。
- Auth/2FA過期：停止於credential boundary，等待人類完成re-auth後從失敗phase重跑，不重建artifact。
- Function migration/deploy smoke失敗：legacy keys保持啟用；必要時以已下載的 production source snapshot重新部署前一版。
- Legacy disable後 Function smoke失敗：立即重新啟用 legacy keys並重跑同一 smoke；未恢復前不得繼續 PAT rotation或candidate。
- 新 Management PAT無法建立或驗證：保留現行 PAT，不執行撤銷；不得以人工聲明冒充 old PAT inactive evidence。
- 舊 PAT撤銷後仍 active：停止並保存 read-only probe evidence，不進 candidate。

## 14. Acceptance Criteria

- [x] `.env.local`與parent test env無法改變sealed production artifact；衝突的parent release key會在build前失敗。
- [x] production builder不讀`.env.p8.local`，server secrets sentinel不出現在child env、artifact、manifest或log。
- [x] 缺少production required key、錯Supabase ref、錯redirect、錯Firebase target均非零退出。
- [x] artifact只解析到production Supabase ref；test ref與test credential literal命中時失敗。
- [x] dependency vendor中的generic localhost literal不造成假陽性，但resolved/app-owned local origin會失敗。
- [x] manifest tree hash可重算；artifact任一byte tamper後candidate/activate拒絕。
- [x] OAuth valid cancel chain回正式origin；localhost/test/missing-state/redirect-loop fixtures全部失敗。
- [x] `prepare`無遠端副作用，`candidate`不啟用live，`activate`缺獨立approval必敗。
- [x] candidate與production遠端manifest全部entries、release-meta與manifest一致。
- [x] canonical post-deploy必要項任一失敗時release狀態不是complete。
- [x] P2未新增，且文件清楚揭露manual direct deploy仍可繞過P1的殘留風險。
- [x] production Edge Functions不再讀legacy key env；停用前後smoke與legacy disabled readback均通過。
- [x] DEV-083 retired credential set 已由使用者永久判定不可回收；policy `DEV-083-retired-credential-set-20260826` 綁定production project ref，strict check 在缺值時以`permanently-unrecoverable`通過，現行 credentials 仍需active probe。

## 15. QA/QC、Stop Conditions 與 Evidence

- 驗證權威：`ai-doc/qa/QA-DEV-083-production-release-environment-integrity.md`。
- Local evidence root：`output/release/dev-083/<release-id>/`；不得提交secret或generatedartifact。
- Release evidence只有在使用者提出release型指令後產生；`RD Implementation Ready`不等於`Release Ready`。
- Stop conditions：secret value/log exposure、dirty/unknown source、missing Level 2 artifact smoke、missing required Level 3、
  missing production-bound candidate、candidate auto-activation、wrong target、hash mismatch、OAuth final target mismatch、
  expired auth、canonical smoke fail。
- QC只執行驗證與蒐證，不修改產品或release scripts；失敗回送RD。
- 本次永久 policy 僅適用 policy 明列的 DEV-083 retired credential set；不豁免新 project、新 credential generation、current credential active probe或其他 release stop conditions。

## 16. Release Feasibility Note

- 現有 Firebase Hosting、Supabase與preview channel能力足以完成P0＋P1，不需要新provider或新固定月費。
- 本變更屬release Lane 2：auth/env/config/artifact；實際發布需Layer 1-2、targeted Level 3、
  production-bound inactive candidate、獨立activation decision與canonical smoke。
- P2不做，因此P1是project convention與官方入口，不是IAM強制；manual direct deploy bypass列為已接受殘留風險。
- 2026-08-22 production activation已依使用者明確go/no-go完成；live version `ca48cc7d514432d8`，previous rollback version `93c2a80ddc1a798e`。

## 17. 官方契約參考

- [Vite Env Variables and Modes](https://vite.dev/guide/env-and-mode.html)：parent process env優先於env files，
  且`.env.local`會與mode file一起載入；因此production build必須隔離child env與envDir。
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)：`redirectTo`需在allowlist內，
  production建議使用exact redirect URL。
- [Firebase Hosting preview and live deploy](https://firebase.google.com/docs/hosting/test-preview-deploy)：
  preview URL可作inactive candidate，live activation仍需獨立決策與post-deploy verification。
