# DEV-006 QA 驗證計畫：Activity / Audit event logging

Last updated: 2026-05-27

## 驗證目標

確認一般協作操作寫入 `activity_events`，敏感權限操作寫入 `audit_logs`，且事件讀寫權限與 Board-level role 一致。

## 驗證範圍

### 包含

- `202605270002_activity_audit_logging.sql`。
- `log_activity_event` RPC。
- `log_audit_event` RPC。
- `eventLogService` 與 `supabaseEventLogService`。
- 任務指派、collaborator、status、move、date、archive、tag、dependency 事件。
- Board/Workspace delete 與 Board member invite/remove/role change audit path。

### 不包含

- activity feed UI。
- comment、watch、notification。

## 使用者角度驗證

- [x] 成員更新任務時，不因 event logging 失敗阻斷主要流程。
- [x] viewer 可讀授權 Board 的 activity event。
- [x] viewer 不可寫 activity event。
- [x] owner 可讀 audit log。
- [x] member 不可讀或寫 audit log。

## RD FMEA

| 風險 | 可能原因 | 影響 | 驗證方式 |
| --- | --- | --- | --- |
| activity event 外洩 | read policy 未綁 Board membership | 協作紀錄外洩 | viewer/member/nonmember read smoke |
| viewer 可寫 event | RPC permission 過寬 | 假事件或污染 audit trail | viewer RPC denied |
| audit log 被一般成員讀取 | audit read policy 過寬 | 權限變更外洩 | member read audit 0 rows |
| logging 阻斷主流程 | service 未 best-effort | 任務更新失敗 | code path 檢查與 smoke |

## QC 檢查項

- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過，0 error。
- [x] `npm.cmd run verify:supabase:static` 通過。
- [x] `ProJED_TEST` DB smoke：member `log_activity_event` pass。
- [x] `ProJED_TEST` DB smoke：viewer read activity pass。
- [x] `ProJED_TEST` DB smoke：viewer write activity denied pass。
- [x] `ProJED_TEST` DB smoke：project_manager `log_audit_event` pass。
- [x] `ProJED_TEST` DB smoke：owner read audit pass。
- [x] `ProJED_TEST` DB smoke：member read/write audit denied pass。

## 執行紀錄

- 2026-05-27：套用 `202605270002_activity_audit_logging.sql` 至 `ProJED_TEST`。
- 2026-05-27：透過 Supabase MCP SQL smoke 驗證 activity/audit read/write policy 與 RPC 行為通過。

## 結論

通過。DEV-006 可標記完成。
