# ADR-039: Supabase migration version aliases

狀態：Accepted / TEST Reconciliation Complete / Production Superseded by ADR-040
日期：2026-07-13
範圍：Supabase migration provenance、ProJED-TEST Level 3 release gate

## Context

`ProJED-TEST` 的 migration history保存四個repo沒有的version ID，但`supabase_migrations.schema_migrations.statements`仍保有完整SQL。Forensic確認這四份SQL分別對應repo既有canonical migration，只是早期從Dashboard或另一工作流套用時使用不同timestamp，造成CLI在`db push --dry-run`前停止。

## Decision

保留canonical migration作為fresh database唯一DDL來源，新增comment-only歷史alias migration讓repo辨識remote version。Alias不得包含可執行SQL；TEST只有在backup、remote statements、canonical hash、schema object probe與資料版本分布都保存後，才可將已證明等價的canonical version標記為`applied`。

| Remote alias | Canonical migration | Evidence |
|---|---|---|
| `20260526070442 calendar_subscriptions` | `20260527064347_calendar_subscriptions.sql` | 語意等價；差異只為`auth.uid()` scalar-subselect效能寫法 |
| `20260527102701 workspace_tags` | `20260527064316_workspace_tags.sql` | normalized MD5完全相同 |
| `20260527102808 board_level_collaboration_rls` | `20260528092643_board_level_collaboration_rls.sql` | normalized MD5完全相同 |
| `20260527102841 activity_audit_logging` | `20260528092711_activity_audit_logging.sql` | 只差依賴version註解 |

## Guardrails

- 不把remote-only版本標記`reverted`。
- 不用空alias取代canonical DDL；fresh database仍必須執行canonical migration。
- 不在未比對SQL時建立no-op alias。
- TEST history repair只處理上表四組已證明等價version。
- 修復後重新執行`migration list`與`db push --dry-run`；任何非預期DDL仍停止。
- Production migration history另有不同分歧；production reconciliation由`ADR-040`接管，本ADR不授權production repair或mutation。

## Recovery

TEST修復前已保存schema/data dump、migration statements、Edge version/hash與restore path。History repair失敗時停止，不刪除remote migration紀錄；若後續DDL失敗，依function/schema baseline採forward fix或TEST restore。
