# QA-DEV-137 正式部署與驗證

日期：2026-10-06（UTC）  
範圍：[DEV-137](../dev_task.md#dev-137-ai-整理任務路徑補正與失敗診斷---2026-10-06) 正式 Hosting 與 Edge Function 部署。使用合成任務資料，未存取真實會議草稿或建立業務資料。

## 發布來源與正式版本

- 產品來源 commit：`fd0c2256212169326c8bd6a932327854edabd0ef`，branch `持續優化3`，建置時 clean。
- Sealed artifact：`20261005231837-de651b`；manifest `output/release/dev-083/20261005231837-de651b/manifest.json`；tree SHA-256 `49014a202966cdb2edf35e0faff26449f450b2d9563abececac11daee368cc88`。
- Firebase Hosting：project/site `projed-cc78d`，live release `1791248410504000`，version `275451cd3513e687`，狀態 `FINALIZED`；版本列出 82 個檔案。
- Supabase Edge Function：project `knodlkxqpcqyrtgwpdst`，`synthesize_meeting_record` 第 6 版 `ACTIVE`，`verify_jwt=true`，source marker `synthesize_meeting_record-2026-10-06-v4`。
- 回復錨點：部署前 Hosting release `1791209475419000`／version `ae0e7e4538ce30bd`。部署收據保存於 sealed artifact 目錄的 `direct-evidence.json`。

## 驗證結果

| 項目 | 結果 | 證據 |
|---|---|---|
| Sealed artifact 本機完整性 | PASS | manifest 無錯誤，80 個 artifact entries。 |
| 正式 Hosting provenance | PASS | canonical `https://projed-cc78d.web.app` 的 80/80 entries 位元組大小與 SHA-256 符合 manifest；remote release ID/tree hash 相符。 |
| 正式匿名 browser shell smoke | PASS | browser receipt `ok=true`，預期 release ID `20261005231837-de651b` 相符。 |
| 正式 Edge Function readback | PASS | 第 6 版 ACTIVE、JWT verification enabled、v4 source marker 存在，部署檔案包含任務路徑 helper。 |
| 正式合成 API 功能 smoke | PASS | HTTP 200；function v4、contract v2、quality passed；結果包含合成父／子 ID `dev137-root-20261006`、`dev137-child-20261006`，正文標籤含完整路徑。沒有保存生成正文。 |
| 登入後正式會議 UI／草稿生命週期 | 使用者回報 PASS | 2026-10-06，使用者回覆「測過OK」。此列記錄使用者的正式環境驗收結果；本紀錄未附獨立 UI smoke 收據或逐項案例結果。 |

Hosting direct receipt 仍標示 `feature-pending`／`complete=false`，因 DEV-083 receipt 未包含專用 authenticated feature-smoke；這是收據欄位狀態，與使用者本輪回報的 UI／草稿驗收結果分開記錄。首次部署後自動 provenance 讀回中斷並記為 `terminated`；本輪以同一 receipt 執行 `--verify-only`，未再次部署，80/80 provenance 與 browser shell smoke 均通過。正式功能 API smoke 另以合成資料完成。

## 邊界與清理

- 未執行 migration、schema、Auth、IAM、Secret 或正式業務資料變更。
- Hosting 發布前保留既有 live version 作 recovery anchor；本輪未執行 rollback。
- task-owned browser smoke session 已關閉；沒有留下本機測試 server 或 listening port。resource governor browser lease/session 已釋放。
