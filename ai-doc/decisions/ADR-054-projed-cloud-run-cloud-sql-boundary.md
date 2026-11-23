# ADR-054：ProJED Cloud Run／Cloud SQL 與跨系統責任邊界

- 日期：2026-11-23（Asia/Taipei）。
- 修訂：Rev 17，舊網址先跑新系統、正式資料搬遷獨立交付、最後再換網址。
- 狀態：**架構方向 Accepted；私人候選已驗證，過渡入口與正式搬遷尚未執行，未切流**。
- 主責：[DEV-139](../dev_task.md#dev-139-jenfu-platform-onboarding)；唯一工程交接：[SPEC-139](../specs/SPEC-139-projed-jenfu-platform-onboarding.md)，現行 target 見 §3／§3.2，遷移見 §6，驗收見 §8。
- D6 確認兩階段順序及 [DEV-142 正式資料搬遷](../specs/SPEC-142-projed-production-data-migration.md) 的獨立交付；目前 active 目標仍保留原資料（先不搬遷）、網址／PWA，完成正式切流前準備、候選部署與驗證。既有集中 foundation 核准沿 SPEC §47.2 重用；新入口／權限、正式停寫／搬資料／開新 writer 不由文件修訂授權，不改 DNS、Secret、billing 或容量。

## Context

ProJED 保留 React／Vite、主程式／Quick、個人及外部協作、原 Workspace／Board／Task 與權限。OrgMaster 登錄最小 Principal／登入來源，Platform 提供身分契約，私人內容及本地能力仍由 ProJED 控制。成本條件為「只要費用不大幅增加即可」，不加入自用軟體不需要的 SaaS 條件。

2026-11-21 人類選定「ProJED 集中到 jenfu-platform-prod，改用自有固定網址」，並要求先更新文件與遷移計畫、保留原資料及舊入口過渡、納入 PWA 重裝／離線草稿／連結轉移、維持零留存，先不部署不切流。這取代先前 runtime 留在 `projed-cc78d`、跨專案 Shared VPC、永久維持舊 origin 與無須重裝的假設；不是立即變更現役服務。

2026-11-23 人類進一步確認「只保持舊網址，其他都先切過去，等運作順利後再一次切新網址」，並要求資料搬遷獨立成一個交付點，其他先寫入開發文件。此決策把系統／資料切換與使用者換網址解耦，不要求永久維持舊入口，也不承諾跨 origin 自動繼承 Session／草稿／PWA。正式操作時段偏好晚間低使用量且操作者可確認結果；目前沒有排定或執行。

## Options

| 方向 | 決策 |
|---|---|
| Vite 前端／runtime／Jobs／資料集中 `jenfu-platform-prod`，先由舊網址的有界入口承載，穩定後改 Cloud Run `run.app` 直接入口 | **目前選定**；暫留既有 Hosting 門面，不新增 Firebase 網站／另購網域。資料只搬一次，正常入口及真 Session 分階段驗明。 |
| runtime 留在舊專案，跨專案 Shared VPC 並永久保留舊網址前門 | 被本次決策取代；舊資源／證據保留，不再作續行前置。 |
| 將 ProJED 併入 PDM／Platform runtime、共用業務資料或服務身分 | 不採用；集中基礎設施仍保留 app-owned 邊界。 |
| 換網址後直接清舊安裝／本機資料或全面 redirect | 不採用；須先完成草稿、舊裝置與已發出連結的恢復／轉移。 |

## Decision

1. **集中專案，app 權責獨立。** ProJED 靜態前端、單一 Cloud Run runtime、Jobs／Scheduler、app Secret／Storage 在 `jenfu-platform-prod` 管理；同專案 VPC／runtime subnet 連既定 `jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg`／`jenfu_prod`，不開 SQL public IP、不要求跨專案 Shared VPC。保留自有 repo、release、專用 SA、SQL IAM login、`projed_core`／`projed_contract`、ledger 與最小權限，不與 PDM 共用 runtime 身分或合併業務資料。
2. **先換系統，最後換網址。** 中央 Cloud Run 同時提供新版 Vite 主程式、實體 Quick 與 API；第一階段沿原主站／Quick origin 使用，舊 Hosting 只是門面。跨專案接線規劃有界薄轉送入口，不持有業務資料、直接 DB 權限或使用者授權權威；不得把服務身分當成使用者。現行 rewrite／Cookie／同源 HTTP 與原地更新限制、source 變更面及具名 IAM 差額見 SPEC §3.0；本輪不部署入口、不把私人候選改為公開。長期仍改與 PDM 相同的 `run.app` 直接入口，不另購網域或建永久 proxy；兩階段分別驗 exact origin／Session／callback，不能用 loopback 或合成登入代替。
3. **既有資料與授權不重建。** 原帳號 UUID、Workspace／Board／Task ID、正文／備註、membership、非預設／空集合 matrix、附件、job／receipt 及歷史保留。Principal 連原 local UUID 仍要可信 provider proof／mapping，不以 email 補綁、不授公司管理員私人內容；日常操作沿登入快照及受控撤權，不新增跨 app 業務 consumer。
4. **原地升級與最後跨 origin 分開驗收。** 資料搬遷階段保留舊 origin／manifest identity、既有 PWA 與草稿，不要求當晚換網址或重裝；同 origin 的 Supabase→HTTP namespace／owner 恢復仍需相容驗證。最後新 origin 不能自動繼承 IDB、localStorage、SW、Session 或安裝，另做重新登入、書籤／PWA 更新及同步或受控匯出／恢復。known owner 不改綁，unbound 明確認領，unknown 查原 key 的可信回執；失敗保留副本，不全面 redirect 或清資料。細節見 SPEC §6.2。
5. **資料搬遷獨立交付且只搬一次。** [DEV-142／SPEC-142](../specs/SPEC-142-projed-production-data-migration.md) 負責正式窗口、全來源停寫／在途排空、一致性 snapshot、資料／檔案／權限／回執核對與舊網址開放新後端唯一 writer；規劃與目前候選成果不算已執行。原完整 DEV-139 分母保留，父子不重複認列，不等待新網址發布才算資料搬遷完成。維持不雙寫／不建 CDC，未解差異不開 writer；新寫入後不得只回舊 Supabase。最後換網址沿用同一新庫，不再搬 DB／Storage；若入口有問題，可暫回舊網址連同一新後端。已套用 SQL 不改寫、不 down migration、不破壞共用 SQL 其他 app。
6. **連結分流與退出有界。** 深層任務／Board 連結保留 canonical ref、重導後仍判權；邀請重驗期限／撤回／接受證明，不擅自延長或復活；行事曆訂閱驗 client 轉址支援，需要者更新訂閱，舊 feed 僅限期相容；附件／signed URL 不變公開或延長到期。舊裝置與離線恢復、連結轉移及剩餘義務處置後，才另行授權退出舊入口；新站可開或窗口到期不能代替。
7. **新綁定另驗，未變證據重用。** SPEC §3.2 覆蓋 profile、renderer、SA／SQL IAM login、Jobs／Scheduler／Secret／Storage、Hosting／OAuth、模型／計費 project 與資格。舊 artifact 綁舊 source／project，只能沿真實未變輸入評估重用，不能改寫 receipt 或把舊 digest 直接改掛新專案。未變資料／權限／取消／exactly-once 回歸沿用原證據，不新增重複人工 gate。
8. **零留存保持硬邊界。** 新專案的實際 caller／模型、cache／內容 logging、適用契約／豁免及必要實呼叫均須有對應證據；API 啟用或舊專案關閉 logging 不等於新資格。未資格化推論繼續停用，原始內容及私人結果不能以維運或診斷名義外送。

## Consequences

- 把系統／資料搬遷與最後網址切換解耦，縮小最後入口問題的排查範圍；暫時增加一次入口轉送與可能冷啟動／用量成本，維持有界／按需方案並量測記事體驗及整體費用，不先宣稱帳單降低或費用零增加，不擅設百分比／固定觀察天數。
- 第一階段使用者沿用舊網址／PWA 更新並可能重新登入；最後才更新書籤、重新核實登入與必要 PWA 重裝／草稿交接。新站體驗仍含舊裝置／草稿／邀請／訂閱，不以 HTTP 200 或新安裝畫面代替資料恢復。
- 私人資料隔離、workspace／board／matrix、取消後寫入拒絕、原 key 唯一回執、資料完整性及 migration recovery 持續有效。集中共用 SQL 不擴張其他 app 的權限或共同發布責任。
- 集中 foundation／51份 schema SQL 與私人候選已有對應實證，進度以 SPEC §47.2 為準；不是正式業務資料搬遷、真使用者入口／Session 或 provider 零留存資格。舊映像與已套用 SQL 保留，未變證據重用，不自動刪除或改寫歷史收據。

## Migration and Compatibility

共用遷移安全契約為 [SPEC §6](../specs/SPEC-139-projed-jenfu-platform-onboarding.md#6-資料移轉pwa-與恢復)，獨立正式資料交付為 [SPEC-142](../specs/SPEC-142-projed-production-data-migration.md)。先盤點、準備恢復與舊 origin 新系統／真 Session／私人隔離；目前只做準備／候選驗證。另經正式操作授權執行 DEV-142 後，在舊網址確認日常運作，最後才換新網址與跨 origin 草稿／安裝。邀請、深鏈、Calendar／其他連結的分類及退出仍依 §6.4；不把每一台歷史裝置簽到變成新切換關卡。

既有 [SPEC-083](../specs/SPEC-083-production-release-environment-integrity.md)、[ADR-053](ADR-053-quick-task-cross-origin-account-link.md)／[SPEC-133](../specs/SPEC-133-quick-task-shared-identity-sync.md) 仍約束目前 runtime；本決策在未來正式替換時更新其 target／origin 綁定，保留 [ADR-050](ADR-050-mobile-quick-task-entry-and-outbox.md) local-first／owner／receipt、[SPEC-036](../specs/SPEC-036-trello-like-workspace-governance.md) 資源授權與 [ADR-051](ADR-051-projed-owned-meeting-analysis-pipeline.md) 管線責任。不把「需要重裝」解讀為可清除舊內容或共享 token。

## Re-entry and Acceptance

本輪依 SPEC §3.3 實作本機記事與必要驗證，直接回填 DEV-139，不新增任務或 required gate。Quick 重用原 DB／outbox、capture ID／receipt；主程式備註 checkpoint 是 task／board／workspace scope 的獨立編輯生命週期，沿現有 canonical readback／CAS，不另建同步 worker。後續仍有正式主／Quick origin／Session 綁定、跨 origin 恢復證明／傳輸、舊連結相容及 A06／A11、T05／T07／T08 的正式環境案例。本機記事切片未觸發部署或正式變更；後續候選依 D5／§47.2 接續，不從本機 PASS 推定正式資格。

本機驗證只支持對應 source／合成身分與資料，不宣稱新目標費用、provider 或正式驗收 PASS。公開文件只放架構與遷移設計，實際營運資料與 IAM 讀回保留本機證據；不新增 COO／QA／QC 簽核或 SaaS 條件。
