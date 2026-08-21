# QA-DEV-083：正式發版環境隔離與 artifact 完整性閘門

- 狀態：`Local QA Subset Executed / PASS / Candidate＋Activation Pending`
- 對應：DEV-083、SPEC-083、ADR-037
- 風險：Medium implementation／Lane 2 release
- 執行邊界：P0＋P1 local gate已執行；本輪不執行遠端candidate或production activation

## 1. 驗證目標與證據邊界

證明production public env、server verification env、build artifact、inactive candidate與live production之間有明確
且不可偷換的identity chain。Local fixture只能驗證程式邏輯；Level 3只能驗證ProJED-TEST整合；
production-bound OAuth/candidate evidence不能被local或staging結果取代。

必要證據分層：

| Layer | Target | 必要證據 |
|---|---|---|
| 1 | source與pure fixtures | env isolation、secret boundary、phase state machine、negative tests |
| 2 | exact sealed artifact | build result、manifest/tree hash、local browser app shell、asset與error sweep |
| 3 | ADR-037 Level 3 | 同commit的ProJED-TEST/Firebase preview evidence或明確N/A rationale |
| 4 | inactive production candidate | Firebase candidate URL、remote hash、release-meta、production Supabase OAuth cancel callback |
| post | canonical production | HTTP/app shell/error sweep、remote hash、release-meta、OAuth callback與conditional authenticated smoke |

## 2. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| parent test env覆蓋production | Vite尊重既有`process.env` | 登入跳test/localhost | conflicting parent fixture | P0 | build前拒絕衝突且child sanitize |
| `.env.local`被Vite自動載入 | root envDir未隔離 | test值進bundle | repo local contamination fixture | P0 | task-owned isolated envDir |
| production key缺失後回退test | loader多檔fallback | release身份不確定 | missing-key fixture | P0 | `.env.production`唯一authority、非零退出 |
| service role／DB token進Vite | P7/P8傳完整env | 正式憑證洩漏 | sentinel與artifact secret scan | P0 | per-step server allowlist |
| artifact含ProJED-TEST ref | env validation或scan缺口 | OAuth/資料指錯project | forbidden ref injection | P0 | target contract＋all-text ref scan |
| localhost掃描假陽性 | vendor library內建測試URL | gate無法使用、團隊繞過 | vendor localhost fixture | P1 | resolved/app-owned判斷；project ref仍全掃 |
| manifest與artifact不同 | build後檔案被改或重建 | candidate證據套錯版本 | one-byte tamper test | P0 | deterministic tree hash、不得自修manifest |
| candidate與live不是同artifact | activate重新build或用stale dist | production未經驗證 | remote entry hash/readback | P0 | manifest artifact直接deploy、禁止rebuild |
| OAuth起始正確但callback錯誤 | Supabase Site URL/allowlist錯誤 | 登入後回localhost | safe cancel 302 chain | P0 | 驗證最終Location，不只authorize URL |
| manual boolean誤報OAuth通過 | confirmation flag無客觀證據 | 問題漏檢 | flag-only fixture | P0 | 移除manual boolean，改machine evidence |
| candidate驗證自動啟用live | phase未分離 | 未批准變更直接上線 | candidate side-effect test | P0 | phase state machine＋獨立approval token |
| Firebase target錯誤 | default project/site歧義 | 發到錯站或漏發 | wrong-target fixture/readback | P0 | tracked contract＋explicit project/site |
| PWA/CDN載入舊asset | cache或錯誤release | 使用者仍看到舊/壞版 | normal navigation＋asset hash | P1 | canonical remote hash與service-worker觀察 |
| manual direct deploy繞過P1 | P2明確不做 | gate仍可被人為跳過 | release report/source review | P1殘留 | 文件揭露；若再發才重新評估P2 |

## 3. Test Data 與安全限制

- Env fixture一律使用明顯假的sentinel，不使用真實service role、DB password或access token。
- Test project identity可使用已知public ref `fhisnnufoeulxqrchldf`；production identity使用public ref
  `knodlkxqpcqyrtgwpdst`。
- OAuth remote test只模擬cancel，不完成Google登入、不建立session、不寫DB。
- 真實local env只允許回報key name、來源檔與pass/fail，不得輸出value。
- Browser evidence不得保存OAuth state、anon key query、token fragment或個人帳號內容。

## 4. Local Mandatory Cases（RD完成後）

| ID | 前置／操作 | 預期 | Evidence |
|---|---|---|---|
| L01 | parent設test `VITE_SUPABASE_URL`，authority為production | build前非零退出；只回報key name | verifier JSON |
| L02 | repo root `.env.local`含test ref，sealed builder使用isolated envDir | artifact仍只含production ref；root local未被讀取 | manifest＋scan |
| L03 | 刪除任一production required key fixture | 不build、不fallback | exit code＋reason |
| L04 | production ref或redirect改成test/loopback fixture | contract preflight fail | verifier JSON |
| L05 | parent／server env放secret sentinel | Vite child、generated env、artifact、manifest、log都找不到sentinel | child probe＋scan |
| L06 | `.env.production.local`含release-controlled key | preflight fail，只報key name | verifier JSON |
| L07 | test/local profile move遇到destination不同值 | 兩檔不變、非零退出 | before/after hashes |
| L08 | valid sealed build | release-meta、manifest、entry assets、tree hash完整 | manifest |
| L09 | artifact改一byte | verifier/candidate/activate拒絕 | tamper result |
| L10 | app-owned chunk插入test ref/local origin | scan fail | finding type/path/offset |
| L11 | vendor fixture含generic localhost URL |不因generic dependency literal失敗 | false-positive regression |
| L12 | artifact插入service-role JWT/PAT格式sentinel | secret scan fail且不回顯token | redacted result |
| L13 | mocked OAuth valid cancel chain | final target等於production canonical redirect | callback evidence |
| L14 | mocked missing-state/test/localhost/loop/200 chain | 每個fixture皆fail | negative matrix |
| L15 | release command無phase | usage＋nonzero；0 remote calls | process spy |
| L16 | `prepare` | 完成Layer 1-2；0 Firebase remote calls | phase evidence |
| L17 | `candidate` | 只允許preview target；live deploy adapter未被呼叫 | process spy |
| L18 | `activate`缺／錯approval release ID | fail beforeFirebase live call | process spy |
| L19 | candidate evidence指不同commit/tree hash/target | activate fail | identity mismatch |
| L20 | canonical smoke有console/pageerror/network/asset mismatch | release fail，不產生complete | browser fixture |

## 5. Engineering Commands（implementation完成後應存在）

```powershell
npm run verify:dev-083-production-release-gate
npm run verify:production-bound-readiness
npm run verify:dev-083-oauth-cancel
npm run verify:dev-083-layer2
npm run lint
npx tsc --noEmit
npm run build
npm run verify:source
npm run release:production -- --phase <prepare|candidate|activate>
git diff --check
```

判定：上述命令必須exit 0；`npm run build`必須走sealed builder，不得直接把parent env交給Vite。

本輪執行結果：

- PASS：`npm run verify:source`（lint 0 errors、TypeScript、sealed build與既有 source gates）。
- PASS：`npm run verify:dev-083-production-release-gate`（15項：production contract、parent conflict、missing key、server-key sanitization、live-channel snapshot candidate delta／live change／missing release、supported command contract、loopback false-positive、manifest tamper、OAuth、candidate evidence identity與phase safety）。
- PASS：`npm run verify:production-artifact`（最新 manifest `20260821072307-a077b5`，tree／contract／target／secret scan）。
- PASS：`npm run verify:dev-083-oauth-cancel`（synthetic valid／invalid callback chain）。
- PASS：`npm run verify:dev-083-layer2`（exact artifact local preview、browser app shell、entry assets、release-meta／tree provenance；port 4174 task-owned runtime已清理）。
- Layer2 evidence：`output/release/dev-083/20260821072307-a077b5/layer2-evidence.json`；manifest：`output/release/dev-083/20260821072307-a077b5/manifest.json`。
- PASS：`node scripts/p8-preflight.mjs --strict` 與 `node scripts/p8-credential-rotation-check.mjs`；server verification、current key shape／activity與 credential rotation flag 均通過。
- PASS：`npm run verify:production-bound-readiness`；production public contract、server-only key boundary、Supabase target與 read-only REST／admin／Management API probes 通過，無資料寫入。
- FAIL-CLOSED（預期）：`npm run migrate:test-env-profile` 偵測到 `.env.local`／`.env.test.local` 的 `VITE_DATA_BACKEND` conflict，未修改任一檔案；需人類選定 test profile 後才可加 `--apply`。
- 未執行：L16 完整 `prepare`（clean worktree＋同commit Level 3 gate）、C01-C06 candidate、Activation與post-deploy canonical smoke；Layer2 component 已由 `verify:dev-083-layer2` PASS，完整 prepare仍受 release boundary 約束。

## 6. Layer 2 Browser Artifact Smoke

針對manifest指定artifact啟動task-owned temporary preview runtime，記錄project、purpose、port、PID tree與cleanup condition。
QC至少驗證：

- entry URL HTTP 200，`#root`非空，登入app shell/ProJED文字可見。
- manifest列出的JS/CSS全部HTTP 200且MIME正確。
- critical console error、pageerror、critical failed request皆為0。
- `release-meta.json`的release ID、commit、contract digest與manifest一致。
- browser載入的entry bundle名稱與hash等於manifest。
- 完成後只停止task-owned process tree並確認port已釋放；不得停止其他local runtime。

## 7. Level 3 Gate

依ADR-037，DEV-083會改build/env/hosting release behavior，第一次發布前Level 3為required：

- staging artifact使用ProJED-TEST，不可使用production manifest冒充。
- Firebase channel為`level3-smoke`，evidence需含source commit、staging bundle、preview URL、Auth/app shell smoke與cleanup。
- P1 production `prepare`只接受同source commit的Level 3 evidence；不要求staging與production artifact hash相同。
- Level 3失敗、expired或source commit不同時，不得進production candidate。

## 8. Production-Bound Candidate Cases（release型指令後執行）

| ID | 操作 | 通過標準 |
|---|---|---|
| C01 | 以manifest artifact部署`production-candidate` | Firebase project/site/channel皆符合contract，live未改變 |
| C02 | candidate browser smoke | HTTP/root/assets/errors通過；remote bundle hashes等於manifest |
| C03 | candidate release-meta readback | release ID、commit、contract digest、Supabase ref等於manifest |
| C04 | production Supabase OAuth safe cancel | authorize/callback chain最終回`https://projed-cc78d.web.app/` |
| C05 | candidate後重新計算local artifact | tree hash未變；不同即fail且需新prepare |
| C06 | side-effect audit | 無production data write、session建立、live activation或Auth config修改 |

## 9. Activation 與 Canonical Post-Deploy Cases

Activation前：

- candidate evidence全部通過且identity一致。
- explicit `--approve-release <release-id>`存在。
- Firebase auth有效、target明確、previous live version已記錄。
- source/artifact/contract未變；不得rebuild。

Activation後：

- production URL HTTP 200，root/app shell非空。
- normal navigation與isolated context都載入manifest entry assets；無stale chunk/cache mismatch。
- console/pageerror/critical network errors為0。
- production release-meta、entry hashes、Supabase ref與manifest一致。
- OAuth safe cancel final Location回production canonical redirect。
- Auth client/session code或Supabase Auth config若同release變更，必須補authenticated smoke；否則不強迫每次人工Google登入。

任何必要項失敗：判定`未通過`，不得以Firebase CLI成功訊息宣稱complete；保存failed release與previous live reference。

## 10. Stop Conditions 與回送

- Secret value出現在任何輸出：立即停止、redact evidence、回送RD評估credential rotation。
- Local env migration conflict：停止且不修改原檔，等待使用者決定來源。
- Source dirty/unknown、Level 3缺失、artifact mismatch、wrong target、OAuth mismatch：停止，不進下一phase。
- Candidate驗證造成live變更：P0流程缺陷，回送RD，不可繼續activate。
- Canonical smoke失敗：回送release gate決定rollback；QC不自行修改production。
- 相同失敗修正後重跑最小受影響case；source/env/contract改變時，原artifact evidence全部失效並建立新release ID。

## 11. Evidence Layout 與QC回報

```text
output/release/dev-083/<release-id>/
  manifest.json
  firebase.generated.json
  dist/
  evidence/
    local-env-boundary.json
    artifact-scan.json
    layer2-browser.json
    level3-reference.json
    candidate.json
    oauth-cancel.json
    activation.json
    canonical-smoke.json
```

- 檔案只有在對應phase實際執行後才存在；不得預建PASS evidence。
- QC回報需列source commit、artifact tree hash、environment/target identity、執行命令、exit code、適用layer與結果。
- `QA Plan Ready`、文件完成、rollback完成或local PASS都不等於DEV-083產品交付完成。

## 12. Final Acceptance Traceability

| SPEC Acceptance | QA cases |
|---|---|
| env/profile隔離 | L01-L07 |
| artifact identity/secret/tamper | L08-L12、C02-C05 |
| OAuth callback final target | L13-L14、C04、post-deploy OAuth |
| phase與activation分離 | L15-L19、C01/C06、Activation preconditions |
| canonical production provenance | L20、post-deploy cases |
| P2未實作與殘留風險揭露 | source review、release report review |

## 13. QA 強化驗證 Addendum（2026-08-21）

### 13.1 獨立 P0 負向矩陣

以獨立 temporary fixture（不修改 repo 檔案，完成後刪除）重跑下列案例，9/9 PASS：

- valid production authority、unknown parent `VITE_*`、parent test project conflict。
- `.env.production.local` public override rejection。
- sanitized child env 不保留 server secret、Gemini key、非 allowlist key。
- server-only loader 不產生 `VITE_*` alias。
- app-owned loopback、test Supabase ref、secret pattern、test public value 均被 artifact scan 攔截。
- vendor generic localhost fixture 不產生誤判。

### 13.2 Canonical 唯讀 browser evidence

- URL：`https://projed-cc78d.web.app/`；1440×900 smoke：root non-empty、critical console/page error/network failure皆為 0。
- 390×844 與 844×390：root non-empty、visible `[role=alert]`／`.inline-error` 為 0、`body.scrollWidth === viewportWidth`。
- 截圖：`output/playwright/qa-dev083-canonical-live.png`、
  `output/playwright/qa-dev083-canonical-responsive/mobile-390x844.png`、
  `output/playwright/qa-dev083-canonical-responsive/mobile-landscape-844x390.png`。
- 限制：rollback 版本沒有 `release-meta.json`，因此本次只能判定目前 live UI smoke 通過，不能判定 DEV-083 artifact provenance 通過。

### 13.3 P1 阻塞 findings

| ID | 優先級 | 事實證據 | QA 判定／修正要求 |
|---|---|---|---|
| QA-083-01 | P1 Blocker → **Resolved locally** | 原實作呼叫不存在的 `hosting:releases:list`；RD 已改為 `firebase hosting:channel:list --project <project> --site <site> --json`；CLI `--help`、source contract與channel fixture均通過。 | local gate 已證明受支援 command contract與缺 live release fail-closed；實際 Firebase read 仍待具權限帳號執行。 |
| QA-083-02 | P1 High → **Resolved locally** | 原實作比較 site-level releases 全清單；RD 已只保存 `live` channel 的 current `release.name`／`release.version.name`。 | candidate channel delta fixture PASS；live release change與missing live release fixture均正確 fail；不再因 preview delta誤判。 |
| QA-083-03 | P1 Medium → **Resolved locally / release evidence pending** | old credential evidence 已固定區分 `probed-inactive`、`probed-active`、`human-attested`、`not-provided` 與 `probe-error`；strict gate 不再接受 attestation-only 或 probe error。 | pure evidence-mode verifier PASS；實際 strict probe 因三組 old credential 都只有 `human-attested` 而如預期非零退出。candidate 前仍需提供 old credential 做 inactive probe，或另走明確 release exception 決策。 |
| QA-083-04 | P1 Medium → **Resolved locally** | `runLayer2Smoke()` 的 Vite preview 與 `runBrowserSmokeAtUrl()` 的 PowerShell／Playwright child 已改用 sanitized runtime env。 | child env sentinel test證明 server secret、DB password、parent `VITE_*`、Gemini key與unrelated secret均未繼承；release profile仍固定為production。 |
| QA-083-05 | P1 Medium → **Resolved locally** | `verifyRemoteArtifact()` 改為逐一下載並比對 manifest全部entries的size與SHA-256，再解析同一已驗證bytes中的`release-meta.json`／`index.html`。 | full-entry fixture PASS；篡改不在`entryAssets`中的lazy asset會被size/hash gate攔截。實際Firebase candidate仍需remote read-back。 |

### 13.4 QA 結論

- P0 env／artifact 本地控制：`PASS`。
- P1 release orchestration：QA-083-01～05 **local QA PASS**；`npm run verify:dev-083-production-release-gate`共19項PASS。完整release仍待Firebase re-auth、old credential客觀inactive probe、同commit Level 3、candidate與activation。
- 正式站目前 UI 可用，但 rollback 版本的 live smoke 不可替代同一 immutable artifact 的 provenance evidence。
- 本 addendum 不執行 Firebase deploy、production activation、資料寫入或 P2；修正後需由乾淨commit重建新release ID，舊evidence不得沿用。
