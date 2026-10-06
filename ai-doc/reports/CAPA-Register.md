# CAPA Register

本 Register 是 ProJED 新 CAPA-NNN 編號序列的唯一權威來源。編號不因年度重置；已核發、取消或關閉的編號不得回收。

## Active CAPA

| CAPA ID | 顯示名稱 | 建立日期 | 狀態 | 主文件 | Register evidence |
|---|---|---|---|---|---|
| `CAPA-001` | `[CAPA-001] 正式環境任務儲存可靠性` | 2026-09-02 | Cancelled／舊實作與證據已放棄／重新開發另行啟動 | 無；只保留 `ai-doc/dev_task.md` 的 DEV-099 最小重開發 capsule | 使用者於 2026-09-10 明確決定放棄舊實作、設計與驗證資料；編號不回收，舊資料不得作為新開發依據 |
| `CAPA-002` | `[CAPA-002] 空白新增任務誤填說明與建立契約分歧` | 2026-09-09 | Open／Root Cause Confirmed／CA-01～02 + PA-01～03 Implemented／DEV-115 QA-QC Targeted PASS／Effectiveness Pending | `ai-doc/reports/CAPA-20260909-blank-task-description-prefill.md` | 使用者於 2026-09-09 明確要求「制定CAPA」；發號前已核對本 Register、專案全文與 Git 歷史，確認 `CAPA-002` 未核發；既有未編號草稿不占號，本列先寫入後才建立主文件；DEV-115 local correction 與 targeted QA/QC 已完成，歷史 dry-run、release 與 effectiveness 仍待 gate |

## Legacy date-key records（不占用新 CAPA-NNN 序列）

下列既有報告是在本 Register 建立前，以日期型識別碼保存的歷史記錄；不重新解讀為 CAPA-NNN，也不占用 `CAPA-001`。

| Legacy key | 文件 |
|---|---|
| `CAPA-20260610` | `ai-doc/reports/CAPA-20260610-production-records-schema-gap.md` |
| `CAPA-20260615` | `ai-doc/reports/CAPA-20260615-project-change-double-meeting-content.md` |
| `CAPA-20260807` | `ai-doc/reports/CAPA-20260807-dev-012-ai-synthesis-verification-gap.md` |
| `CAPA-20260825-01` | `ai-doc/reports/CAPA-20260825-task-placement-disappears-on-mobile.md` |

### Register control

- 下一個可核發正式號碼為 `CAPA-003`。
- 新 CAPA 發號前必須先讀取本 Register，確認無重複，再寫入本表後才可對外宣稱正式編號。
- `CAPA-20260902-01` 已隨 CAPA-001 舊資料放棄，不再作為有效文件引用。
