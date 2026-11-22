# ADR-054：ProJED Cloud Run／Cloud SQL 與跨系統責任邊界

- 日期：2026-11-22（Asia/Taipei）。
- 修訂：Rev 16，Cloud Run 直接入口、本機優先記事與跨 origin 遷移。
- 狀態：**Accepted；本機記事 source／必要驗證完成，D5 恢復候選準備及部署驗證；尚未部署或切流**。
- 主責：[DEV-139](../dev_task.md#dev-139-jenfu-platform-onboarding)；唯一工程交接：[SPEC-139](../specs/SPEC-139-projed-jenfu-platform-onboarding.md)，現行 target 見 §3／§3.2，遷移見 §6，驗收見 §8。
- D5 保留原資料、網址及 PWA，先不切流；集中專案新 IAM／SQL owner 差額依 SPEC §47.2 具名確認後才套用。不做業務資料搬入、不改 DNS、Secret、billing 或容量；舊 Shared VPC 引導不再要求執行，已做的設定不自動撤回。

## Context

ProJED 保留 React／Vite、主程式／Quick、個人及外部協作、原 Workspace／Board／Task 與權限。OrgMaster 登錄最小 Principal／登入來源，Platform 提供身分契約，私人內容及本地能力仍由 ProJED 控制。成本條件為「只要費用不大幅增加即可」，不加入自用軟體不需要的 SaaS 條件。

2026-11-21 人類選定「ProJED 集中到 jenfu-platform-prod，改用自有固定網址」，並要求先更新文件與遷移計畫、保留原資料及舊入口過渡、納入 PWA 重裝／離線草稿／連結轉移、維持零留存，先不部署不切流。這取代先前 runtime 留在 `projed-cc78d`、跨專案 Shared VPC、永久維持舊 origin 與無須重裝的假設；不是立即變更現役服務。

## Options

| 方向 | 決策 |
|---|---|
| Vite 前端／runtime／Jobs 集中 `jenfu-platform-prod`，Cloud Run `run.app` 直接入口、同專案私人 SQL | **目前選定**；不採 Firebase Hosting，不要求另購網域；正式 origin／Session 仍須驗明。 |
| runtime 留在舊專案，跨專案 Shared VPC 並永久保留舊網址前門 | 被本次決策取代；舊資源／證據保留，不再作續行前置。 |
| 將 ProJED 併入 PDM／Platform runtime、共用業務資料或服務身分 | 不採用；集中基礎設施仍保留 app-owned 邊界。 |
| 換網址後直接清舊安裝／本機資料或全面 redirect | 不採用；須先完成草稿、舊裝置與已發出連結的恢復／轉移。 |

## Decision

1. **集中專案，app 權責獨立。** ProJED 靜態前端、單一 Cloud Run runtime、Jobs／Scheduler、app Secret／Storage 在 `jenfu-platform-prod` 管理；同專案 VPC／runtime subnet 連既定 `jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg`／`jenfu_prod`，不開 SQL public IP、不要求跨專案 Shared VPC。保留自有 repo、release、專用 SA、SQL IAM login、`projed_core`／`projed_contract`、ledger 與最小權限，不與 PDM 共用 runtime 身分或合併業務資料。
2. **直接採 Cloud Run 固定入口。** 人類已選與 PDM 相同的 `run.app` 直接入口，不採 Firebase Hosting、不要求購買自有網域。Cloud Run 同時提供 Vite 主程式、實體 Quick 與 API；source 預期網址見 SPEC §3，正式網址仍須 provider readback。主／Quick 各自登入、換帳與登出的語意維持，exact origin／Cookie／callback 隔離須實際驗明，不能用同服務或本機合成登入推論正式接線完成。舊 Firebase 入口只保留既定恢復／過渡，不另建永久 API proxy。
3. **既有資料與授權不重建。** 原帳號 UUID、Workspace／Board／Task ID、正文／備註、membership、非預設／空集合 matrix、附件、job／receipt 及歷史保留。Principal 連原 local UUID 仍要可信 provider proof／mapping，不以 email 補綁、不授公司管理員私人內容；日常操作沿登入快照及受控撤權，不新增跨 app 業務 consumer。
4. **明確處理跨 origin 與 PWA 重裝。** 新站重新登入、使用者更新書籤並重裝 PWA；新 origin 不能自動繼承舊 IDB、localStorage、SW、Session 或安裝。舊入口先提供正常同步或受控匯出／恢復，完成處置再導向；沒有來源／owner proof、尚未登入或網路失敗時保留原副本。known owner 不改綁，unbound 明確認領，結果不明先查原 key 的可信 receipt；不錯帳、不重複任務、不默默丟稿。細節見 SPEC §6.2。
5. **單一 writer 與可回復性維持。** 沿原全來源停寫／在途排空、一致性 full snapshot、分 domain count／ID／FK／digest 與回執核對，不做雙寫／CDC／delta 平台。正式 apply 前未解差異拒絕，新 writer 已產生資料後的恢復須保留新增內容與唯一 receipt，不能只切回舊網址。已套用 SQL 不改寫，不 down migration。
6. **連結分流與退出有界。** 深層任務／Board 連結保留 canonical ref、重導後仍判權；邀請重驗期限／撤回／接受證明，不擅自延長或復活；行事曆訂閱驗 client 轉址支援，需要者更新訂閱，舊 feed 僅限期相容；附件／signed URL 不變公開或延長到期。舊裝置與離線恢復、連結轉移及剩餘義務處置後，才另行授權退出舊入口；新站可開或窗口到期不能代替。
7. **新綁定另驗，未變證據重用。** SPEC §3.2 覆蓋 profile、renderer、SA／SQL IAM login、Jobs／Scheduler／Secret／Storage、Hosting／OAuth、模型／計費 project 與資格。舊 artifact 綁舊 source／project，只能沿真實未變輸入評估重用，不能改寫 receipt 或把舊 digest 直接改掛新專案。未變資料／權限／取消／exactly-once 回歸沿用原證據，不新增重複人工 gate。
8. **零留存保持硬邊界。** 新專案的實際 caller／模型、cache／內容 logging、適用契約／豁免及必要實呼叫均須有對應證據；API 啟用或舊專案關閉 logging 不等於新資格。未資格化推論繼續停用，原始內容及私人結果不能以維運或診斷名義外送。

## Consequences

- 減少跨專案網路與長期入口責任，但不宣稱已降低帳單或已完成新資源設定；比較同等用量的前端傳輸／Cloud Run、Jobs／SQL／Storage、恢復窗口與雙跑支出，不擅設增幅百分比。
- 使用者需明確得知新網址、重新登入與 PWA 重裝步驟；新站的體驗驗收包含舊裝置／草稿／邀請／訂閱，不以 HTTP 200 或新安裝畫面取代資料恢復。
- 私人資料隔離、workspace／board／matrix、取消後寫入拒絕、原 key 唯一回執、資料完整性及 migration recovery 持續有效。集中共用 SQL 不擴張其他 app 的權限或共同發布責任。
- 本輪 target／managed profile、renderer 與模型 project guard 收斂到集中專案，僅代表 source 設定；IAM、資源、正式 Session／origin 與 provider 資格未執行。舊映像與已套用 SQL 保留，不自動刪除或把舊證據改掛新 project。

## Migration and Compatibility

遷移權威為 [SPEC §6](../specs/SPEC-139-projed-jenfu-platform-onboarding.md#6-資料移轉pwa-與恢復)。先盤點來源與本機未送內容、準備兩側恢復，再演練新綁定／candidate／真 Session／私人隔離及跨 origin 移轉，最後另經正式操作授權才停寫、搬移核對、切流與退役。邀請、深鏈、Calendar／其他連結的分類及退出條件見 §6.4。

既有 [SPEC-083](../specs/SPEC-083-production-release-environment-integrity.md)、[ADR-053](ADR-053-quick-task-cross-origin-account-link.md)／[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md) 仍約束目前 runtime；本決策在未來正式替換時更新其 target／origin 綁定，保留 [ADR-050](ADR-050-mobile-quick-task-entry-and-outbox.md) local-first／owner／receipt、[SPEC-036](../specs/SPEC-036-trello-like-workspace-governance.md) 資源授權與 [ADR-051](ADR-051-projed-owned-meeting-analysis-pipeline.md) 管線責任。不把「需要重裝」解讀為可清除舊內容或共享 token。

## Re-entry and Acceptance

本輪依 SPEC §3.3 實作本機記事與必要驗證，直接回填 DEV-139，不新增任務或 required gate。Quick 重用原 DB／outbox、capture ID／receipt；主程式備註 checkpoint 是 task／board／workspace scope 的獨立編輯生命週期，沿現有 canonical readback／CAS，不另建同步 worker。後續仍有正式主／Quick origin／Session 綁定、跨 origin 恢復證明／傳輸、舊連結相容及 A06／A11、T05／T07／T08 的正式環境案例。本機記事切片未觸發部署或正式變更；後續候選依 D5／§47.2 接續，不從本機 PASS 推定正式資格。

本機驗證只支持對應 source／合成身分與資料，不宣稱新目標費用、provider 或正式驗收 PASS。公開文件只放架構與遷移設計，實際營運資料與 IAM 讀回保留本機證據；不新增 COO／QA／QC 簽核或 SaaS 條件。
