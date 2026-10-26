# ADR-054：ProJED Cloud Run／Cloud SQL 與跨系統責任邊界

- 日期：2026-10-26（Asia/Taipei）。
- 修訂：Rev 7，記錄 S1 本地實作；既有使用者相容切換尚未實作或演練。
- 狀態：**Accepted（ProJED 技術選型與 S1 runtime／DB 核心定案）**；S1 程式與 PostgreSQL 18 本地隔離驗收 PASS。S2／S3 及完整整合的外部契約未定案；本 ADR 的 Accepted 不表示其他 owner 接受或整體架構 closure。
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

人類已要求「升級到架構確定」與 rd-tech-lead 審視並優化，本輪再要求把既有使用者切換評估寫入文件。下列 ProJED 架構規則固定，現行契約為 SPEC-139 Rev6 §6／§11，Rev5 的 S1 審查沿 §11.8 保留；D1 publisher 與 D2 首階段範圍不變。人類選定方向及本 repo 決策不表示外部 owner wire／程式已接受或發布：

1. **共用 infrastructure，業務權威獨立。** ProJED 自有 repo、runtime、release、`projed_core / projed_contract`、ledger 及 lifecycle-specific 角色；app key 宣告為 `projed`，平台實際登錄屬 S2。其他 app 只用受控 contract。
2. **保留前端，新增必要 server 邊界。** Vite 產物由 Node HTTP runtime 提供，browser 經自有 API；不讓 DB runtime role／DSN 或 provider Secret 進前端。主／Quick 的既有兩個 public origin 與 manifest identity 保留，相容 Hosting 轉送至兩個自有 Cloud Run 入口，同一套 server 業務實作、各 origin Session；run.app 不直接成為既有使用者必換的新網址。原主 origin 的 Quick 相容入口沿原 Session，不另造帳號狀態或跨 origin token bridge。
3. **OrgMaster 最小身分與 ProJED 本地 UUID 分工。** OrgMaster 發布個人／外部最小 Principal／登入來源及必要安全 metadata，不存私人內容；Platform 處理登入／Session／revocation。verified Principal 決定安全主體；既有 local UUID 保留外鍵／receipt，provider proof／受控 mapping 才可連結。不用 email、Employee 或 UID fallback，不造假 Employee。
4. **保留本地權限，分層銜接身分。** OrgMaster 現有公司角色／scope 契約持續作公司資格權威；ProJED 保留 Workspace／Board membership、五種角色、每 Board 已設定的能力矩陣與繼承、邀請及撤權行為。非預設或空集合權限不重設為 default。離職／公司撤權不直接停用個人 Principal；公司管理角色、入口可見或 SSO 不改派 Workspace／Board owner，也不授予私人存取。
5. **API 與 DB 共守範圍。** server 每請求核實 current identity／grant，自有交易內重驗 resource；DB policy 使用可信且交易區域的 actor context，同 client transaction、transaction advisory lock＋guard revision 及固定 scope 排序，runtime 不是 owner/BYPASSRLS。交易核心只交出 scoped query port，db.ts 獨占 pool／lease cleanup；closed port 不得再 dispatch，COMMIT unknown 不由 rollback 或自動 retry 偽裝成功。S1 只驗 account／profile，缺 context／跨 scope 拒絕；其他 scope 的完整命令在 S3 收斂。
6. **保留現有 durable 語意。** Quick immutable owner／captureId、明確認領、receipt replay；AI source／lease／budget／projection／cleanup；檔案私有存取與已知 qualification gate 保留。同步通知不成為第二資料權威。
7. **先相容與演練，再受控切換。** managed DDL forward-only，新舊 migration 歷史分開；verified mapping 保留原帳號 UUID、canonical IDs／權限／receipt，本機資料另驗。先準備舊入口／舊 client 相容，再演練 snapshot／delta／全來源 writer fence／reconciliation；短暫停寫完成最後核對後才啟用新唯一 writer。不能要求所有使用者同時更新、靠前端停送或按時間戳雙寫。新寫入後的回復須保留新資料；舊入口／資產處置另有恢復義務及 gate。
8. **費用是限制，分期驗證效益。** 用可取得基線比較同等用量持續費用，列出兩入口、相容 Hosting、worker／storage／同步／SQL 容量等邊際增量與雙跑／恢復窗口支出；未能退役的費用不能算節省。沒有必須降費或有投資回收期的條件，不擅設增幅百分比。首階段驗基礎對齊與原功能相容，任務／資料串接效益在後續實際情境驗證。
9. **首階段不擴增業務功能。** ProJED 是身分契約 consumer，Platform 提供 registry／launch／handoff；不新增任務摘要 BFF、AI-PDM project↔Board mapping、跨 app task API 或另一份 task master。跨 app 業務 ACL 預設拒絕，後續明確選定情境再補契約。
10. **固定工程選型，分段完成替代證據。** Node 24／npm 11、node:http＋pg；本地隔離驗證支援 PostgreSQL 17／18，managed target 按實際綁定版本重驗。同步採版本 polling＋canonical reload，檔案採私有 Cloud Storage，工作沿原 DB claim／lease 的 bounded worker／Job；詳細決策見 SPEC-139 Rev7 §11。完整 inventory、legacy ref／UUID、Session前置條件及receipt保留；真provider／原功能移轉及Hosting相容仍須S2／S3驗證。

使用思考習慣：#效用理論、#限制條件、#多層次分析

## Consequences

- 可保留既有前端與個人／外部協作，平台納入方式符合獨立 app 邊界。
- Supabase 的 Auth／API／RPC／policy／Realtime／Functions／Storage 能力需逐項接替，新增 server 開發及維運責任；這些必須算入估工與費用，不能描述成單純搬 DB。
- 保留既有兩個 public origin 可降低本機／安裝變動，但不自動延續 Supabase Session；Principal mapping 與本機 owner／receipt 仍須可恢復且驗證。Hosting Cookie 轉送限制、callback、同 origin Quick Session、靜態 rewrite 優先序及 artifact／cache 相容增加必要驗證責任，不能以 direct run.app 成功、全面 redirect 或重裝取代。
- 加入共用 SQL 擴大共同故障／維護影響，第四 app 需要重新計算 effective revisions／pools 與恢復證據，不能套用舊三 app PASS。
- D1 已採集中最小身分，OrgMaster／Platform 需增加非員工 publication／admission 與分層撤銷的新版本；不建立 ProJED 的平行 Principal publisher 或公司角色權威。這些是外部 owner 交接需求，尚未取得跨專案開發權。
- D2 已將首階段限定為基礎對齊，既有工作區／看板／權限是必要驗收而非重設目標；不發布跨 app 業務 consumer manifest，也不宣稱任務串接效益已交付。後續 consumer、欄位與資料揭露依 SPEC-139 §5.3 的恢復條件再收斂。

## Migration and Compatibility

Intentional replacement 的人類來源是 Cloud Run／Cloud SQL 方案選擇；本 ADR 只記錄未來責任規則。現行 [SPEC-083](../specs/SPEC-083-production-release-environment-integrity.md)、[ADR-053](ADR-053-quick-task-cross-origin-account-link.md)／[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md) 仍約束目前 runtime。

未來受控替換範圍為 hosting／provider／auth adapter／data API／同步 transport；保留 [SPEC-036](../specs/SPEC-036-trello-like-workspace-governance.md) 資源治理、[ADR-050](ADR-050-mobile-quick-task-entry-and-outbox.md) local-first／receipt、ADR-053 各 App Session 與 [ADR-051](ADR-051-projed-owned-meeting-analysis-pipeline.md) pipeline ownership。D2 原功能與權限相容的交接及驗收以 SPEC-139 §4.4／A09 為權威；不改寫歷史正式驗收，也不把未資格 provider 升格為 PASS。

Rev6 的既有網址相容是 **Compatible exception**：相容期保留 Hosting 前門，runtime／DB 仍按 Cloud Run／Cloud SQL 目標替換。它修正先前立即使用新 run.app public origin 的規劃假設，維持 ADR-053 的兩 origin／各自登入／local-first，不復活認證 broker。以 SPEC-139 §6.3–§6.6／A06／A11／T07／T08 為權威；project／region／路由／Cookie／callback／artifact、mapping／fence／恢復尚待工程收斂，不表示此例外已在現行 release 生效。

保留原因是既有書籤／PWA／未同步資料的恢復。移除觸發條件為替代入口／所有已知 pending 或歧義的恢復可驗證、未上線裝置的剩餘義務有明確處置、成本／觀察證據及相應退役主要動作授權。時間到期或七日 synced 副本清理規則不能代替退役證據，也不自行解除 Billing。

現行 SSO v2 的 employeeId required 不能原地放寬；新版本依 owner contract review、consumer 相容窗口與撤銷範圍收斂。原有 producer／consumer 正常路徑持續有效，正式目標、切流與回復操作不在此文件。

## Re-entry and Acceptance

D1／D2及本輪架構文件要求已寫入SPEC-139／DEV-139／map。Rev4自審的callback／取消／設定責任缺口已由Rev5修正；S1完成技術主管文件審查，維持RD Implementation Ready＋架構定案，詳細契約及五項審查發現見SPEC-139 §11／§11.8。同一八案補fail-seeking，沒有另加runtime、框架、queue或人工步驟；未量測工時、帳單或容量，不宣稱實際效能／費用改善。此為RD修改後自驗，不是產品或獨立QC PASS。

Rev6 增補既有使用者相容基線及移轉驗收，S1 核心 source surface／命令／K01–K08 不變；S2 身分 producer／consumer 與 S3 現有能力移轉仍為 RD Readiness Review，外部非員工 wire／撤銷、全部 operation／guard／polling／provider 及相容入口／完整移轉契約未定案。A11／T07／T08 尚未執行，不能宣稱 DEV-139 全架構 closure、無縫切換已具備、正常產品 UI 或整合完成。checkpoint 等目前 gated 能力保持原狀。新登入／provider 切換必須有真身分及相容證據，不重問 D1／D2，也不擴權修改其他 repo。

2026-10-26 已依新的人類實作要求，在 ProJED 獨立工作樹建立 S1 runtime／DB kernel、migration／checker／verifier；型別、靜態契約、unit、PostgreSQL 18 task-owned isolated DB 與既有 Vite build 均通過。COO 審視後不再要求為本地 gate 額外安裝 PG17；managed target 仍依實際版本重驗。既有前端、provider 與正式 runtime 未切換。S2／S3 需各自 prerequisite；正式 migration／release／retirement 各依原 gate。
