# CAPA Register

本 Register 是 ProJED 新 CAPA-NNN 編號序列的唯一權威來源。編號不因年度重置；已核發、取消或關閉的編號不得回收。

## Active CAPA

| CAPA ID | 顯示名稱 | 建立日期 | 狀態 | 主文件 | Register evidence |
|---|---|---|---|---|---|
| `CAPA-001` | `[CAPA-001] 正式環境任務永久儲存中與重試重複` | 2026-09-02 | Open／Incident Trigger Linkage Pending／CA-01～CA-02 Candidate Implemented／Effectiveness Pending | `ai-doc/reports/CAPA-20260902-task-save-stuck-and-retry-duplicate.md` | 使用者於 2026-09-02 明確指定「這個 CAPA 當新編號的第一個，開始編」；本列為新序列第一筆；candidate 與獨立 QC 已建立但未部署，CAPA 尚未關閉 |
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
- `CAPA-20260902-01` 僅為 CAPA-001 的 legacy event/file key；正式引用一律使用 `CAPA-001`。
