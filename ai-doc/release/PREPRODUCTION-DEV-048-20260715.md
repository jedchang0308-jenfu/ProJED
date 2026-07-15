# PREPRODUCTION-DEV-048-20260715

狀態：Production Released / Level 4 Post-deploy Smoke Passed

## Scope

- Branch：`持續優化1`
- Source commit：`53b964b49abdec36565e0a8513e9379415989ba4`
- Feature：多位主責、多位協作；主責與協作互斥；不新增「最終負責人」
- PR：[GitHub PR #4](https://github.com/jedchang0308-jenfu/ProJED/pull/4)

## TEST Level 3 evidence

- Supabase project：`ProJED-TEST` (`fhisnnufoeulxqrchldf`)
- Baseline：`output/release/dev048-test-wbs-items-assignment-baseline.json`
- Migration `20260715143000_task_multi_person_assignment.sql` applied successfully.
- Baseline had 158 rows, 0 legacy assignee rows and 0 overlap rows.
- Post-migration schema: `assignee_ids` column, trigger, function, disjoint check and GIN index present; alias mismatch 0; overlap 0.
- Rollback-only trigger probe: duplicate/order-preserving primary IDs, first-primary legacy alias and collaborator overlap removal all passed; transaction rolled back.
- Authenticated preview: `https://projed-cc78d--level3-smoke-o1na5wft.web.app`; signed-in board loaded 158 tasks, task drawer opened, primary/collaborator multi-select sections appeared, two primary checkboxes were selectable, and the fixture was restored to `未指派`. The preview initially exposed a stale chunk cache mismatch; a cache-busted reload recovered the app and the final interaction completed.

## Production migration evidence

- Supabase project：`ProJED` (`knodlkxqpcqyrtgwpdst`)
- Baseline：`output/release/dev048-production-wbs-items-assignment-baseline.csv`
- Pre-migration: 461 rows, 53 non-null `assignee_id`, 4 collaborator rows, overlap 0, no `assignee_ids` column.
- Migration applied successfully with `psql` using the production DB connection.
- Post-migration: 461 rows, 53 non-empty `assignee_ids`, legacy alias mismatches 0, overlap 0; trigger, function, disjoint check and GIN index present.
- Production REST schema probe: HTTP 200 for `select=id,assignee_ids`; anonymous RLS result returned 0 rows without exposing data.
- Rollback SQL, only if post-release recovery is required after impact assessment:

```sql
drop trigger if exists sync_wbs_item_assignment_roles on public.wbs_items;
drop constraint if exists wbs_items_assignment_roles_disjoint;
drop index if exists wbs_items_assignee_ids_gin_idx;
drop function if exists public.sync_wbs_item_assignment_roles();
alter table public.wbs_items drop column if exists assignee_ids;
```

The CSV baseline preserves the pre-migration `id`, `assignee_id` and `collaborator_ids` values. No data restoration payload was required because the migration backfilled `assignee_ids` from the unchanged legacy alias and the baseline overlap count was 0.

## Production release evidence

- Firebase Hosting project：`projed-cc78d`
- URL：`https://projed-cc78d.web.app`
- Production build artifact: `assets/index-DAto0SmC.js`, `assets/index-B-bQaRgu.css`
- Level 4 smoke passed: root non-empty, hashed JS/CSS loaded, service worker ready at `/sw.js`, critical console/page/request errors 0.

## Residuals

- `verify:supabase:migration-aliases` retains five pre-existing, unmodified production source hash mismatches (`20260630060610`, `20260630060727`, `20260701005406`, `20260701010144`, `20260702094146`). This release did not rewrite those baselines.
- DEV-047 remote backup RPC full multi-primary persistence remains outside this release and is treated as a frozen boundary until separately upgraded.
