# DEV-008 QA 驗證計畫：Ontology/Trello 協作規格文件

Last updated: 2026-05-27

## 驗證目標

確認協作規格文件足以支援後續 RD/QA/QC 判斷功能是否符合 Supabase-first、Board-level permission、Ontology core、Trello-style UI 的方向。

## 驗證範圍

### 包含

- `.ai-docs/ontology-trello-collaboration-spec.md`。
- `.ai-docs/ontology-collaboration-model.md` cross-link。
- object/link/action model。
- role/permission model。
- RLS/RPC model。
- UI guard model。
- activity/audit model。
- Trello 對照。
- 不做 Task-level private permission 的理由。
- V1 不支援項目。

### 不包含

- 不新增使用者教學頁。
- 不寫市場文案。
- 不新增 UI。

## FMEA 驗證重點

| 風險 | 可能失效模式 | 影響 | 驗證方式 |
| --- | --- | --- | --- |
| 文件與實作矛盾 | table/type/event 名稱不一致 | QA/QC 驗證失準 | `rg` 對照 schema/type/migration |
| assignee 語意錯誤 | 文件暗示 assignee 授權 | 權限設計偏離 | 搜尋 assignment permission 敘述 |
| scope 膨脹 | 文件暗示要做 Guest/comment/watch | 任務範圍失控 | 檢查 V1 不支援項目 |
| Trello 對照不清 | RD 無法判斷差異 | 功能實作歧義 | 檢查 Trello 對照表 |
| action log 定義不足 | event payload 無法驗證 | 稽核不可追溯 | 檢查 activity/audit model |

## QC 檢查清單

- [x] 文件可解釋 ProJED 採 Supabase-first 的原因。
- [x] 文件可解釋 Board role 與 task assignment 差異。
- [x] 文件可解釋 activity/audit log 與 action log 的關係。
- [x] 文件明確列出第一版不支援 Guest、comment、notification、watch、Task-level private permission。
- [x] 文件包含 object/link/action model。
- [x] 文件包含 RLS/RPC helper 與 migration 名稱。
- [x] 文件沒有把 `assignee_id` 或 `collaborator_ids` 放入授權條件。
- [x] `.ai-docs/ontology-collaboration-model.md` 已連到完整規格文件。
- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過，無 lint error。

## QC 指令紀錄

```powershell
rg -n "Ontology|Trello|Task-level|Guest|watch|activity|audit|project_members|assignee" .ai-docs src supabase/migrations/202605270001_board_level_collaboration_rls.sql supabase/migrations/202605270002_activity_audit_logging.sql
npx.cmd tsc --noEmit
npm.cmd run lint
```

## 驗證結果

狀態：通過。

- 規格文件已建立。
- 文件與 DEV-001 至 DEV-007 的資料表、型別、migration、event type 對齊。
- 文件明確排除 V1 不支援項目。

## 2026-05-28 本輪 QA/QC 更新

- QA 計畫：擴充 `scripts/ontology-collaboration-qc.mjs`，覆蓋 invite UI/service/migration/audit 靜態守門與可選 DB smoke。
- QC 已執行：`node --check scripts/ontology-collaboration-qc.mjs`、`npx.cmd tsc --noEmit`、`npm.cmd run build:test`、`npm.cmd run lint`、`npm.cmd run verify:ontology-collaboration`、`npx.cmd supabase migration list --local`。
- QC 結果：static QC 16 pass、1 pending DB smoke、0 fail；typecheck/build/lint 通過；local Supabase 連線 `127.0.0.1:54322` 被拒。
- 阻塞：`npm.cmd run verify:ontology-collaboration:db` 未執行，需本機 Supabase 或明確測試專案 service role 才能驗證 RLS/DB smoke。
