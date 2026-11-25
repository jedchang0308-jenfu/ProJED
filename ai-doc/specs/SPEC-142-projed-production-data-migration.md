# SPEC-142：ProJED 正式資料一次搬遷與舊網址啟用新後端

- 日期：2026-11-23（Asia/Taipei）。
- 任務：[DEV-142](../dev_task.md#dev-142-production-data-migration)；所屬整合目標：[DEV-139](../dev_task.md#dev-139-jenfu-platform-onboarding)。
- 狀態（2026-11-25）：**已完成正式資料一次搬遷與舊網址業務切流**。最終加密備份、45表apply與獨立READ ONLY reconcile一致，snapshot `0adad950339e91b190a4fe2b9c3eb495eaa33b7a4e95d41207a29b9ea98386b2`；來源fence保留、reader NOLOGIN／連線0，臨時Jobs已刪除。Platform023發布修復既有consumer ACL後，正常登入／原工作區看板／記事讀寫及本機草稿恢復通過。草稿同步修正版來源 `97891d3`（PR #37、main合併 `5d88415`）已建置並發布 `projed-prod-dev142-97891d3` 100%；同一新庫、舊網址及原PWA identity不變。CI45457970960、真modal14項、私人HTTP34／公開HTTP16及四manifest identity通過；正式使用者沿正常PWA選單更新，原未提交草稿關閉重開後恢復同步、重載讀回且無假草稿，Quick本機建立／重開／帳號確認／同步亦通過。恢復參考見[恢復紀錄](../reports/DEV-142-precutover-recovery-point-20261124.md)，收據在`output/dev142-cutover-20261125-w1/`。不等於最後換址或完整DEV-139完成。
- 本文件只維護獨立交付範圍、窗口與判定；資料／身分／權限／草稿的不變條件沿 [SPEC-139 §4–§6](SPEC-139-projed-jenfu-platform-onboarding.md#6-資料移轉pwa-與恢復)，不複製另一套 SQL／API 契約。

## 1. 獨立交付成果

在保留舊主站與 Quick 網址、既有 PWA 入口的條件下，將正式 ProJED 業務資料一次搬至 `jenfu-platform-prod` 的既定 Cloud SQL／私人 Storage，核對後由新 ProJED 成為唯一業務寫入端。使用者透過舊網址操作新版前端、新登入與新 API；Supabase 原資料保留，但舊業務 writer 停止。

**此處啟用中央新後端唯一 writer 即為正式業務切流，即使網址未改。** 2026-11-24 人類原文「我要執行正式資料及業務切流，請先在此建立一個可恢復點」已授權本交付點，取代先前「先不切流」的限制；依要求先完成恢復準備，最後新網址切換仍另階段。

此交付點不包含最後更換網址／重新安裝 PWA，也不把空白 schema 的 51 份 SQL migration 成功、候選健康檢查或合成資料演練計作正式資料已搬遷。DEV-142 完成不代表整個 DEV-139 完成；正式資料搬遷只計一次，不在父／子任務重複認列。

## 2. 搬遷前必要依賴

| 必要條件 | 對應工作與邊界 |
|---|---|
| 舊網址能使用新系統 | DEV-139 完成有界過渡入口、原主／Quick origin 的新版前端、真 Session／callback 與可信既有 UUID mapping。私人候選的本機認證代理只作測試，不能代替一般使用者入口。新的入口／SA／最小 IAM 差額需具名確認，不由此文件授權部署或開放匿名存取。 |
| 原地更新與晚回網安全 | 同 origin／manifest identity 的更新路徑保留本機草稿；舊 bundle、直接 SDK／RPC、背景 worker 及上傳皆有來源端寫入 fence。未更新／離線裝置可稍後恢復，不要求每一台先上線簽到才可搬遷。 |
| 真實盤點、演練與恢復 | 核實正式來源／目標、實際 domain／檔案及既有回執，使用已具名核准的來源讀取／importer 責任。重用有效的隔離演練與 schema 證據，只補正式輸入、權限、恢復及受影響路徑；未承接 domain 不默認為空。備份／恢復只處理 ProJED 範圍，不清空或整庫回復共用 `jenfu_prod` 影響其他 app。 |

準備證據已補 [SPEC-139 §3.0.3](SPEC-139-projed-jenfu-platform-onboarding.md#dev139-source-commit-recovery) 的現役舊版「來源已提交／回覆遺失」兩 domain 恢復，原回執承接後首次 HTTP 不重建任務；此為隔離演練的一部分，不替代本表的正式來源／全domain／fence／檔案及正常入口核對，也不另立關卡。

這些條件限制正式窗口的執行，不阻擋安全的程式開發、隔離演練或文件準備。零留存、原權限及資料完整性要求維持；未資格模型不派送，也不因保持停用而被認列整個 DEV-139 已完成。

## 3. 窗口與執行次序

偏好**晚間低使用量、且操作者仍能即時確認結果的時段**，不強制凌晨、無人值守或自動排程。先在白天完成盤點、演練、備份／恢復確認與使用者提示準備，量測後再決定日期、起訖與可接受的停寫時間；目前未排定時段，不先承諾固定分鐘數。

| 時點 | 執行內容與停止邊界 |
|---|---|
| 窗口前 | 固定已驗來源／映像、資料與檔案範圍、來源讀取身分、目標權限及恢復參考；確認舊網址新系統接線已就緒，但尚未導入正式業務寫入。 |
| 停寫 | 對全部舊業務 writer 啟用可讀回的 fence，核對在途工作已完成或安全結束。前提未成立即不開始搬遷；使用者的本機輸入／草稿仍保留，不能把停寫或登入失效顯示為成功。 |
| 一次搬移與核對 | 沿 SPEC-139 §6.1 的一致性來源 snapshot、受控私人檔案搬移與目標交易／reconciliation，核對資料、權限、回執及來源物件對應。未知寫入結果先讀回，不盲目重送；任一未解差異不開新 writer。 |
| 舊網址開新系統 | 核對完成才開放新後端唯一 writer，從原主站／Quick 正常入口驗既有帳號、原資料、權限、記事及同步；不更換網址。來源 fence 保留，舊版／離線裝置晚回網不得再寫舊庫。 |
| 窗口後 | 立即核對正常操作與保存結果，再於後續日常使用觀察恢復、登入到期及重連。此觀察沿既有必要案例，不新增固定天數、SLA 或逐使用者簽核。 |

## 4. 完成判定與最小證據

- 正式來源與目標的受管 domain 在 count／ID／FK／人工內容 digest／權限矩陣及不可變 receipt 上無未解差異；私人檔案有可核對的 digest、object ref／generation 與原到期／清理責任，不因搬移延長留存或變公開。
- 可讀回證明舊 writer 已停止，只有新後端可提交業務資料；原 UUID／Workspace／Board／Task／captureId 保留，不重建帳號或重複任務。
- 原網址上的真使用者路徑可登入並讀寫本人原資料；未授權個人／外部協作者的拒絕維持，正常工作區／看板／權限及 Quick／備註回歸按實際受影響範圍通過。
- 停寫、登入逾期、離線及晚回網的草稿不遺失、不改綁帳號；unknown 先查原 key 的可信 source／target receipt，再決定恢復，不因重開或更換後端重複建立。
- 原資料／來源備份及可用恢復參考保留；實際版本、來源／目標、fence、reconciliation、入口驗證及剩餘問題回填同一搬遷結果。使用既有 release／provider／測試收據，不另建獨立 QA/QC、簽核或 required gate；敏感營運數量與身分證據留任務本機輸出。

必要案例失敗仍是未通過；隔離 PASS 不代替正式結果。沒有等待新網址發布或全部歷史裝置上線的附加完成條件。

## 5. 失敗與恢復

目標交易提交前失敗沿原交易 rollback。尚未開新 writer 時，先核實是否有目標提交及新增寫入，再按既定 recovery 恢復舊路徑；不得因結果未知就重搬、刪 target rows 或重寫舊收據。

新後端已有新增資料後，不能只解除舊 Supabase fence 或把網址連回舊庫。優先以相容的已驗程式維持同一新庫，保留新增內容與唯一回執；若確需反向資料移轉／人工 rewrite，另界定影響與授權，不隱含於一般應用程式回退。不得 down migration、破壞性清空或整庫恢復共用 SQL。

## 6. 與目前目標及後續網址切換的關係

**DEV-142 已完成，原網址／介面／PWA／草稿保留，中央Cloud SQL為唯一業務寫入庫。** 恢復點 `DEV142-PRE-CUTOVER-20261124-214053`、停寫後最終加密app備份、獨立核對及原Hosting／映像參考均保留。來源受管PITR／整套平台恢復未證明，本機解密依目前Windows DPAPI環境，這些限制未被改寫為已驗證。原來源保持fence；已有新寫入後，恢復應在同一新庫維持相容程式與新資料，不直接解除舊fence或整庫覆蓋。既有有效授權及正常同範圍修正不逐SHA重問，不概括擴張IAM／Secret／credential／billing或破壞性資料回復責任。

DEV-142 正式完成後，DEV-139 可在舊網址上確認新系統日常運作，再執行最後新網址切換。人類已採用[方案2：引導完成切換（SPEC-139 §6.4.1）](SPEC-139-projed-jenfu-platform-onboarding.md#dev139-guided-origin-switch)，依序確認草稿、以原帳號登入新站、更新書籤／PWA入口；等後端穩定後才啟用；目前共用引導及本機互動預覽已實作，正式新origin／回執／草稿交接接線與提示尚未啟用。最後一步沿用同一套 Cloud SQL／Storage，不再安排第二次伺服器資料搬遷；仍需新的 origin／Session／callback、書籤／PWA 及本機草稿交接。網址階段若出問題，可在資料與權限一致的前提下暫回舊入口使用同一新後端，不能解讀為退回舊資料庫。

## 7. 本次集中確認的執行差額（2026-11-25，入口／reader／來源交付已核准；切流等人類起床）

人類已回覆「核准入口／reader／來源交付，切流等我起床」，並補充「只有後端搬遷，使用者還是用舊網址繼續運作，不能讓使用者感覺異樣」及「可接受重新登入」。入口、reader與來源交付授權成立；正式來源停寫、最終匯入、新writer啟用及舊Hosting導流仍等人類起床後續行，不因準備核准即自動開窗。不換網址、不重裝PWA、不清除草稿，不改工作區／看板操作介面；同origin更新必要的後端接線，舊版晚回網仍沿fence及receipt保護。

| 差額 | 精確對象、用途與邊界 |
|---|---|
| 舊網址公開過渡入口 | 僅對 `projects/projed-cc78d/locations/asia-east1/services/projed-legacy-entry` 增加 `allUsers` 的 `roles/run.invoker`，保留IAM檢查；中央 `projed-prod` 不加公開grant。沿既有Hosting site `projed-cc78d` 發布兩個舊origin到固定relay的rewrite，保留manifest identity／前版資產／本機資料，讓一般使用者可取得登入頁與登入後由App Session授權的API。Relay不取得SQL、Secret或使用者權限，不增加容量。先驗SSO外部redirect與Cookie邊界，才曝光；只開relay不等於略過使用者登入。 |
| 正式來源讀取期間 | 既有 `projed_dev139_source_reader` 在正式窗口最多兩小時開放LOGIN，維持連線上限1、原最低唯讀權限與既有Secret版本；只供最終備份、匯入與reconcile讀取，完成或失敗立即NOLOGIN並關閉本任務連線。只建立並清除本任務一次性importer Jobs，不新增credential／IAM責任。 |
| 同範圍來源交付與切流時機 | PR #33及本次DEV-142必要修正的ready通知、正常保護下合併已核准；正式停寫、最終快照、匯入核對及舊網址啟用唯一writer等人類起床後續行。必要CI／回歸與§2依賴仍須成立，不能用人類離線為由略過驗證。未知寫入結果先讀回；已有新資料時不得單純切回舊庫。 |

不包含最後更換網址、Gemini／RAG啟用、billing／容量、其他服務公開、down migration、破壞性清空或反向資料rewrite。正常真使用者登入需在可用正式路徑上驗證，不預收密碼、登入token或已知會逾時的驗證頁；若SDK實際要求重新登入，僅停止依賴該憑證的動作。

**2026-11-25 起床後續行**：人類已明確恢復本交付點，取代上表的等待起床狀態。最終加密備份、來源停寫、一次正式 apply／獨立 reconcile（同一 snapshot digest）、中央 revision 100% 及舊 Hosting 導流均已完成；來源資料保留且 fence 啟用，reader 已恢復 NOLOGIN、連線0。真登入最初因 ProJED 角色建立晚於 Platform 020 而缺 principal-state consumer ACL，callback 回報 IDENTITY_INVALID。Platform #242 已合併 `f5163701d47b7c0a15b5a980b1fccf0784b43301`，Source QC45448051592／原生PG45447012295 通過；contract-prerequisite45450242724 成功套用023（新增1、重放22），Platform runtime／traffic 不變、private core／contract CREATE 仍拒絕。修復後沿舊網址與既有 Google Session 登入成功，原工作區／看板／任務可讀，專用測試記事儲存、重新載入讀回及未送出草稿重開恢復已實測。

**草稿同步修正（已發布並通過正式回歸）**：正式恢復案例發現 HTTP 未歸位任務以已清空的本機快取作 canonical read，造成假衝突。改為驗證同一帳號後讀遠端；HTTP 失敗保留本機並向呼叫端回報失敗，恢復狀態各自持有欄位，避免共享物件清除失敗標記。既有 account lock 內加入 expectedTask 內容 CAS，舊版本盲覆寫拒絕409、相同內容重放不二次寫入；較新本機時鐘也不再自動覆寫既有遠端。最終真modal14項／S3單元180項、CI45457970960（PG75／snapshot67／OCI23）與先前完整PWA升級回歸通過；來源97891d3已由Cloud Build72bc0fab-3eed-4884-bcfd-2208aa81f52f建置，私人HTTP34後發布同一新庫。正式主站／Quick正常更新後登入延續，同一未提交草稿恢復同步並重載讀回、Quick待同步記事確認帳號後提交成功，各專用任務一筆可見，無假草稿。兩筆具名驗證資料保留，不刪除使用者資料。不重匯、不解除來源 fence、不換新網址、不啟用 Gemini／RAG。

**實際準備與入口技術差額**：本機既有relay回歸12項及Hosting renderer 3項通過。`allUsers → roles/run.invoker` 單次setIamPolicy被Google明確拒絕HTTP400／FAILED_PRECONDITION；重新讀回IAM與原值相同。實際effective policy `iam.allowedPolicyMemberDomains`只允許組織customer，`run.managed.requireInvokerIam`為`enforce:false`。人類另具名回覆「核准只調整relay，切流等我起床」，採Google官方的公開服務設定（[Cloud Run public access](https://docs.cloud.google.com/run/docs/authenticating/public)）：只將上述relay的`invokerIamDisabled`設為true，取代表列原allUsers方式。單次PATCH及provider讀回成功，中央後端仍維持IAM及固定relay SA驗證、業務仍須使用者Session；relay runtime／IAM policy／容量／流量及組織政策不變。舊Hosting設定已生成但未發布，reader未開LOGIN、未停寫／搬資料／導流。原拒絕收據與後續讀回保存在`output/dev142-entry-preparation-20261125/`。
