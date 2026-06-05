# PM Report: DEV-002 Meeting And Work Records

Date: 2026-06-04
Status: Done
Task type: delivery
Related spec: `ai-doc/specs/SPEC-003-meeting-work-records-workflow.md`

## Scope

DEV-002 implements meeting records and personal work records inside ProJED. Records can link to task nodes, appear in task detail context, and non-private published records can be mirrored into RAG document tables for later AI retrieval.

## Implemented

- Added Supabase migration `20260604100000_meeting_work_records.sql`.
- Added Supabase migration `20260604103000_record_rag_visibility_guard.sql`.
- Added Supabase migration `20260604104000_record_rag_sync_jobs.sql`.
- Added `knowledge_records` and `record_task_links` with project/board RLS boundaries.
- Added document/chunk/embedding read guards for record-backed RAG documents.
- Updated `match_project_knowledge` RPC to call `private.current_user_can_read_document`.
- Added a guarded `rag_sync_jobs` insert policy for published, non-private record documents.
- Added frontend types for records, record visibility, status, and task-link roles.
- Added Supabase, Firestore, and local-test record services.
- Added `useRecordStore` for right-side panel, draft editing, task selection mode, and save/archive flow.
- Added collapsible right-side record panel.
- Entering task selection mode automatically collapses the panel; completing/canceling restores the previous collapsed state.
- Task selection mode now switches into the existing board view and lets users click existing Kanban tasks directly.
- Kanban cards and checklist items show selected state while linking records to task nodes.
- Added records list view and navigation mode.
- Added task detail related-record timeline and quick-create actions.
- Added RAG citation support for `knowledge_records`.
- Published non-private records mirror to `documents`, `document_versions`, and `document_chunks`.
- Published non-private records enqueue pending `rag_sync_jobs` for the trusted embedding pipeline.
- Private records do not mirror to RAG documents.

## Spec Adjustments Honored

- Work-log default interval: end is today, start is one week before the end date.
- The record filling page is a collapsible right-side panel.
- When entering task selection mode, the panel auto-collapses.
- Task selection uses the familiar board mode instead of a separate picker page.

## Verification

- PASS: `npx.cmd tsc --noEmit`
- PASS: `npm.cmd run build`
- PASS: `npm.cmd run lint` with existing warnings only and no errors.
- PASS: `npm.cmd run verify:dev-002-records`
- PASS: `npm.cmd run verify:p9-edge-function`
- PASS: `npm.cmd run verify:supabase:static`
- PASS: `git diff --check`
- PASS: local HTTP smoke check returned `200` at `http://127.0.0.1:4174/`.
- PASS: Playwright CLI smoke check verified login, records mode, meeting record panel, task selection mode, and automatic panel collapse.
- PASS: RAG sync job policy statically verified for published, non-private `knowledge_records`.

## Residual Risks

- Supabase CLI is not available in PATH, so migration files were not applied locally.
- RAG embedding creation remains delegated to the existing trusted embedding pipeline; this DEV creates a pending sync job but does not create embeddings in the browser.

## Follow-Up UX Change

使用者於 2026-06-04 對 DEV-002 交付後的 task-linking workflow 提出 UX refinement：

- 從看板選取任務後，任務應插入紀錄 `Content` 欄位目前游標位置。
- 插入任務應顯示為 Codex-like tag/chip，不只是關聯任務面板中的一列。
- 任務選取仍使用熟悉的看板模式，不改成另一個 task picker page。

此變更以 DEV-003 追蹤，規格文件為 `ai-doc/specs/SPEC-004-record-content-inline-task-tags.md`。DEV-002 維持 Done，因為此項是已交付會議/工作紀錄 MVP 之上的 UX refinement。
