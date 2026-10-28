# ADR-054：ProJED Cloud Run／Cloud SQL 與跨系統責任邊界

- 日期：2026-10-26（Asia/Taipei）。
- 修訂：Rev 13，移除已完成 S1 的重複人工出口與過期授權描述，現行交接以 SPEC-139 Rev37 為準；managed目標仍對齊共用jenfu_prod，保留舊Hosting同project的單一runtime；既有使用者切換尚未執行。
- 狀態：**Accepted（ProJED 技術選型與本 repo 開發完成）**；S1、S2 consumer seam及S3 W1–W18本地驗收PASS。Platform Session／handoff source 已有 draft PR／CI 及 LOCAL_SIMULATION PostgreSQL 證據，但真 Firebase／OIDC、ProJED Session wire、真資料及 release 仍未完成；本 ADR 的Accepted不表示其他owner接受、無縫切換或production closure。
- 主責：[DEV-139](../dev_task.md#dev-139-jenfu-platform-onboarding)。詳細交接契約：[SPEC-139](../specs/SPEC-139-projed-jenfu-platform-onboarding.md)。
- 適用未來整合路徑；不立即取代既有 runtime，不表示其他 repo 接受新契約，也不授權程式、DB、遠端或付費操作。

## Context

ProJED 已有 React／Vite 與主／Quick PWA，瀏覽器使用 Supabase Auth／Data API／RPC／Realtime；profile、業務外鍵與本機 receipt 綁定既有 user ID。Jenfu 現行體系採各 app 獨立 Cloud Run runtime、Cloud SQL app-owned schemas 與 versioned contract，平台不是業務資料容器。

兩者整合的必要工作是替換持久化及 provider 能力、銜接可信身份與資料授權，並保留個人／外部協作。現行平台 SSO v2 要求 employeeId，不含 ProJED audience，不能視為已支援非員工。

使用者已選完整對齊 Cloud Run／Cloud SQL、保留 Vite；費用條件更新為「只要費用不大幅增加即可」。既有雙 App 允許各自登入／切帳、local-first 與私人資料隔離持續有效。

D2 最新人類原文為「保留 ProJED 現有的工作區、看板與權限功能，先處理雲端架構、資料庫和身分契約的對齊」。因此首階段為基礎對齊與既有行為相容，Platform 任務摘要、AI-PDM 專案／看板連結留待後續；原先建議 2A 未被採用。

人類另補充「PROJED已有使用者, 我可以無縫切換嗎」，並要求「請寫進發文件」。因此移轉設計以既有使用者可延續為基線：不丟資料、不重建帳號、不改權限、不強迫重裝，優先保留既有 public origin。預留正常重新登入與經演練確認的短暫停寫，不承諾零重登／零停寫；實際窗口未由人類指定，也未授權正式切換。

## Options

| 已考慮方向 | 決策來源與處置 |
|---|---|
| Cloud Run＋Cloud SQL，保留 Vite、自有 API、app-owned schemas | **人類選定的目標方向**；以最小必要 server 能力承接現有功能。 |
| Portal 連結／API 串接，繼續使用獨立 Supabase DB | 既有評估替代案；不作此任務終態，因人類已選完整對齊。 |
| 全面改寫 Next.js／將 ProJED 併入 Platform runtime | 不在已確認範圍，無目前證據支持增加此重寫與共同發布責任。 |
| OrgMaster 統一最小非員工 Principal／登入來源登錄 | **D1 人類確認**：「接受統一登錄最小身分資料（建議）」；私人內容仍由 ProJED 隔離。 |
| ProJED 保留非公司身份、平台採聯邦驗證 | D1 的替代選項未採用；不建立第二套非員工 publisher。 |
| 保留現有工作區／看板／權限，先雲端架構／DB／身分契約對齊 | **D2 人類確認**，以最新原文為準；首階段交付基礎對齊及原功能相容。 |
| Platform 任務摘要／AI-PDM 專案看板連結 | D2 未採作首階段；未來有業務串接要求及明確資料範圍後再評估。 |
| 保留既有 Hosting public origin，受控轉送 Cloud Run | 納入此次開發文件的相容設計基線；保護既有書籤、PWA 與 origin storage，仍需 Session／路由／費用及環境證據。 |
| 立即改用新 run.app 網址／全面 redirect／要求重裝 | 不作預設切換策略；會影響既有 Session、安裝與未同步資料，不能以新網站可達代替恢復驗收。 |

## Chosen Rule

2026-10-29 續行修正：人類已要求完成外部接線、正式資料及發布；現行契約為 SPEC-139 Rev37，選測與開發出口見 §8.1／§11.5，整合進度與分層證據只在 §33–§37 維護。W22／W23 source、PR／CI 與本地模擬不代表真 Firebase／OIDC、ProJED opaque Session／既有 UUID proof 或正式整合完成；工作區／看板權限仍由 ProJED 控制。W18／Rev10 為 local 切片歷史，W20／W21 資料保留也不代表 RAG／會議等剩餘功能完成，不縮減完整目標。

managed database 固定既有 `jenfu-platform-prod / asia-east1 / jenfu-platform-prod-pg / jenfu_prod`，不是另建 `projed` DB。原 Hosting project 為 `projed-cc78d`，唯一新 runtime 規劃為同 project／asia-east1 的 `projed-prod`，以受控跨 project 身分連共用 SQL，不增加第二個 edge proxy。新 runtime／release 服務帳號、app Secret 與 SQL grant 尚待新責任權限確認；舊 `projed-ai-backend` 與現有身分不覆寫。此項精簡不執行正式資料、流量或權限變更。

人類已要求「升級到架構確定」與 rd-tech-lead 審視並優化，並要求把既有使用者切換評估寫入文件。下列 ProJED 架構規則固定，現行契約為 SPEC-139 Rev37；D1 publisher 與 D2 首階段範圍不變。已完成 S1 的固定順序與人工 freeze／QC／Spec Drift 不作後續開發前置，沿 SPEC §9／§11.5 的授權、選測與啟用界線續行；required CI、DB checker 與正式發布保護仍有效。人類選定方向及本 repo 決策不表示外部 owner wire／程式已接受或發布：

1. **共用 infrastructure，業務權威獨立。** ProJED 自有 repo、runtime、release、`projed_core / projed_contract`、ledger 及 lifecycle-specific 角色；app key 宣告為 `projed`，平台實際登錄屬 S2。其他 app 只用受控 contract。
2. **保留前端，新增必要 server 邊界。** Vite產物由Node HTTP runtime提供，browser經自有API；不讓DB runtime role／DSN或provider Secret進前端。主／Quick既有兩個public origin與manifest identity保留，相容Hosting把兩邊的`/api/**`轉送至同一個ProJED Cloud Run runtime，同一套server業務實作、各origin Session；可信`main / quick`由Session actor決定，不由Host或forwarded header決定。run.app不直接成為既有使用者必換的新網址；原主origin的Quick相容入口沿原Session，不另造帳號狀態或跨origin token bridge。
3. **OrgMaster 最小身分與 ProJED 本地 UUID 分工。** OrgMaster 發布個人／外部最小 Principal／登入來源及必要安全 metadata，不存私人內容；Platform 處理登入／Session／revocation。verified Principal 決定安全主體；既有 local UUID 保留外鍵／receipt，provider proof／受控 mapping 才可連結。不用 email、Employee 或 UID fallback，不造假 Employee。
4. **保留本地權限，分層銜接身分。** OrgMaster 現有公司角色／scope 契約持續作公司資格權威；ProJED 保留 Workspace／Board membership、五種角色、每 Board 已設定的能力矩陣與繼承、邀請及撤權行為。非預設或空集合權限不重設為 default。離職／公司撤權不直接停用個人 Principal；公司管理角色、入口可見或 SSO 不改派 Workspace／Board owner，也不授予私人存取。
5. **API 與 DB 共守範圍。** server 每請求核實 current identity／grant，自有交易內重驗 resource；DB policy 使用可信且交易區域的 actor context，同 client transaction、transaction advisory lock＋guard revision 及固定 scope 排序，runtime 不是 owner/BYPASSRLS。交易核心只交出 scoped query port，db.ts 獨占 pool／lease cleanup；closed port 不得再 dispatch，COMMIT unknown 不由 rollback 或自動 retry 偽裝成功。S1 只驗 account／profile，缺 context／跨 scope 拒絕；其他 scope 的完整命令在 S3 收斂。
6. **保留現有 durable 語意。** Quick immutable owner／captureId、明確認領、receipt replay；AI source／lease／budget／projection／cleanup；檔案私有存取與已知 qualification gate 保留。同步通知不成為第二資料權威。
7. **先相容與演練，再受控切換。** managed DDL forward-only，新舊 migration 歷史分開；verified mapping 保留原帳號 UUID、canonical IDs／權限／receipt，本機資料另驗。先準備舊入口／舊 client 相容，再做全來源 writer fence、單一一致性full snapshot及exact reconciliation；不建delta／雙寫平台。正式來源只接受綁定的Supabase direct或5432 session endpoint、verify-full CA及read-only repeatable-read，目標只接受Cloud SQL Unix socket與專用importer。短暫停寫完成最後核對後才啟用新唯一writer；新寫入後的回復須保留新資料。
8. **費用是限制，分期驗證效益。** 用可取得基線比較同等用量持續費用，列出兩入口、相容 Hosting、worker／storage／同步／SQL 容量等邊際增量與雙跑／恢復窗口支出；未能退役的費用不能算節省。沒有必須降費或有投資回收期的條件，不擅設增幅百分比。首階段驗基礎對齊與原功能相容，任務／資料串接效益在後續實際情境驗證。
9. **首階段不擴增業務功能。** ProJED 是身分契約 consumer，Platform 提供 registry／launch／handoff；不新增任務摘要 BFF、AI-PDM project↔Board mapping、跨 app task API 或另一份 task master。跨 app 業務 ACL 預設拒絕，後續明確選定情境再補契約。
10. **固定工程選型，分段完成替代證據。** Node 24／npm 11、node:http＋pg；本地隔離驗證支援 PostgreSQL 17／18，managed target 按實際綁定版本重驗。同步採版本 polling＋canonical reload，檔案採私有 Cloud Storage，工作沿原 DB claim／lease 的 bounded worker／Job；詳細決策見現行 SPEC-139 §11。完整 inventory、legacy ref／UUID、Session前置條件及receipt保留；真provider／原功能移轉及Hosting相容仍須S2／S3驗證。

使用思考習慣：#效用理論、#限制條件、#多層次分析

## Consequences

- 可保留既有前端與個人／外部協作，平台納入方式符合獨立 app 邊界。
- Supabase 的 Auth／API／RPC／policy／Realtime／Functions／Storage 能力需逐項接替，新增 server 開發及維運責任；這些必須算入估工與費用，不能描述成單純搬 DB。
- 保留既有兩個 public origin 可降低本機／安裝變動，但不自動延續 Supabase Session；Principal mapping 與本機 owner／receipt 仍須可恢復且驗證。Hosting Cookie 轉送限制、callback、同 origin Quick Session、靜態 rewrite 優先序及 artifact／cache 相容增加必要驗證責任，不能以 direct run.app 成功、全面 redirect 或重裝取代。
- 加入共用SQL擴大共同故障／維護影響，第四app需要重新計算effective revisions／pool與恢復證據，不能套用舊三app PASS；Main／Quick共用單一ProJED runtime與pool，避免為入口差異倍增服務與成本。
- D1 已採集中最小身分，OrgMaster／Platform 沿既有 DEV-057／DEV-007 補齊非員工 publication／admission 與分層撤銷；source 進度見 SPEC §36–§37，既有跨專案 source 授權見 DEV-139 直接索引。不建立 ProJED 的平行 Principal publisher 或公司角色權威；新 IAM／Secret／credential、shared foundation grant 與費用責任仍依 §33，不由本 ADR 擴張。
- D2 已將首階段限定為基礎對齊，既有工作區／看板／權限是必要驗收而非重設目標；不發布跨 app 業務 consumer manifest，也不宣稱任務串接效益已交付。後續 consumer、欄位與資料揭露依 SPEC-139 §5.3 的恢復條件再收斂。

## Migration and Compatibility

Intentional replacement 的人類來源是 Cloud Run／Cloud SQL 方案選擇；本 ADR 只記錄未來責任規則。現行 [SPEC-083](../specs/SPEC-083-production-release-environment-integrity.md)、[ADR-053](ADR-053-quick-task-cross-origin-account-link.md)／[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md) 仍約束目前 runtime。

未來受控替換範圍為 hosting／provider／auth adapter／data API／同步 transport；保留 [SPEC-036](../specs/SPEC-036-trello-like-workspace-governance.md) 資源治理、[ADR-050](ADR-050-mobile-quick-task-entry-and-outbox.md) local-first／receipt、ADR-053 各 App Session 與 [ADR-051](ADR-051-projed-owned-meeting-analysis-pipeline.md) pipeline ownership。D2 原功能與權限相容的交接及驗收以 SPEC-139 §4.4／A09 為權威；不改寫歷史正式驗收，也不把未資格 provider 升格為 PASS。

Rev6 的既有網址相容是 **Compatible exception**：相容期保留 Hosting 前門，runtime／DB 仍按 Cloud Run／Cloud SQL 目標替換。它修正先前立即使用新 run.app public origin 的規劃假設，維持 ADR-053 的兩 origin／各自登入／local-first，不復活認證 broker。以 SPEC-139 §6.3–§6.6／A06／A11／T07／T08 為權威；project／region／路由／Cookie／callback／artifact、mapping／fence／恢復尚待工程收斂，不表示此例外已在現行 release 生效。

保留原因是既有書籤／PWA／未同步資料的恢復。移除觸發條件為替代入口／所有已知 pending 或歧義的恢復可驗證、未上線裝置的剩餘義務有明確處置、成本／觀察證據及相應退役主要動作授權。時間到期或七日 synced 副本清理規則不能代替退役證據，也不自行解除 Billing。

現行 SSO v2 的 employeeId required 不能原地放寬；新版本依 owner contract review、consumer 相容窗口與撤銷範圍收斂。原有 producer／consumer 正常路徑持續有效，正式目標、切流與回復操作不在此文件。

## Re-entry and Acceptance

D1／D2及本輪架構文件要求已寫入SPEC-139／DEV-139／map。Rev4自審的callback／取消／設定責任缺口已由Rev5修正；S1完成技術主管文件審查，維持RD Implementation Ready＋架構定案，詳細契約及五項審查發現見SPEC-139 §11／§11.8。同一八案補fail-seeking，沒有另加runtime、框架、queue或人工步驟；未量測工時、帳單或容量，不宣稱實際效能／費用改善。此為RD修改後自驗，不是產品或獨立QC PASS。

Rev29／W18完成本repo importer fail-closed、漏資料blocker及QA Session下正常HTTP產品UI／reload煙霧；這使ProJED本地開發可收斂，但不把QA actor改稱真身分。外部非員工wire／撤銷、真Principal mapping、真資料未承接domain、container／雲端與相容入口、A11／T07／T08正式切換證據仍待owner與release工作，不能宣稱無縫切換或整體整合完成。checkpoint等目前gated能力保持原狀；新登入／provider切換必須有真身分及相容證據，不重問D1／D2，也不擴權修改其他repo。

2026-10-26 已依新的人類實作要求，在 ProJED 獨立工作樹建立 S1 runtime／DB kernel、migration／checker／verifier；型別、靜態契約、unit、PostgreSQL 18 task-owned isolated DB 與既有 Vite build 均通過。COO 審視後不再要求為本地 gate 額外安裝 PG17；managed target 仍依實際版本重驗。既有前端、provider 與正式 runtime 未切換。S2／S3 需各自 prerequisite；正式 migration／release／retirement 各依原 gate。
