import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(path), 'utf8');

const checks = [
  {
    path: 'supabase/migrations/20260604100000_meeting_work_records.sql',
    label: 'record schema migration',
    snippets: [
      'create table public.knowledge_records',
      'create table public.record_task_links',
      "alter type public.document_source_type add value if not exists 'work_log'",
      'alter table public.knowledge_records enable row level security',
      'alter table public.record_task_links enable row level security',
      'private.current_user_can_read_project',
      "visibility <> 'private'",
      'or rag_enabled = false',
    ],
  },
  {
    path: 'supabase/migrations/20260604103000_record_rag_visibility_guard.sql',
    label: 'record RAG visibility guard migration',
    snippets: [
      'private.current_user_can_read_document',
      "d.source_table = 'knowledge_records'",
      "kr.status = 'published'",
      'kr.rag_enabled = true',
      'drop policy if exists "members read documents"',
      'authorized users read document chunks',
      'private.current_user_can_read_document(d.tenant_id, d.id)',
      'create or replace function public.match_project_knowledge',
    ],
  },
  {
    path: 'supabase/migrations/20260604104000_record_rag_sync_jobs.sql',
    label: 'record RAG sync job policy migration',
    snippets: [
      'private.current_user_can_index_record_document',
      "d.source_table = 'knowledge_records'",
      "kr.status = 'published'",
      "kr.visibility <> 'private'",
      'private.current_user_can_write_project',
      'record writers create pending rag sync jobs',
      "provider = 'google'",
      "status = 'pending'",
    ],
  },
  {
    path: 'src/store/useRecordStore.ts',
    label: 'record store workflow',
    snippets: [
      'end.subtract(7,',
      'isPanelCollapsed: true',
      'isTaskSelectionMode: true',
      'restoreCollapsedAfterSelection',
      'returnViewAfterSelection',
      "setView('board')",
      "visibility: type === 'work_log' ? 'private' : 'project'",
      'insertTaskMentionAtCursor',
      'syncTaskLinksFromRecordContent',
    ],
  },
  {
    path: 'src/services/supabase/projedService.ts',
    label: 'record Supabase RAG mirror service',
    snippets: [
      'syncRecordRagDocument',
      "record.status === 'published' && record.visibility !== 'private'",
      "source_table: 'knowledge_records'",
      "record.record_type === 'meeting' ? 'meeting_note' : 'work_log'",
      ".from('rag_sync_jobs')",
      "status: 'pending'",
      'RAG_EMBEDDING_PROVIDER',
    ],
  },
  {
    path: 'src/components/Records/RecordSidebar.tsx',
    label: 'record right sidebar',
    snippets: [
      'PanelRightClose',
      'RecordContentEditor',
      'openNewRecord',
      'enterTaskSelectionMode',
      'selectedLinks.length',
      'saveDraft',
    ],
  },
  {
    path: 'src/components/BoardView.tsx',
    label: 'record task picker board mode',
    snippets: [
      'isRecordTaskSelectionMode',
      '選取紀錄關聯任務',
      '直接點選看板上的任務',
      'exitRecordTaskSelectionMode(true)',
    ],
  },
  {
    path: 'src/components/Wbs/KanbanCard.tsx',
    label: 'record task picker kanban cards',
    snippets: [
      'isRecordSelectionMode',
      'insertRecordTaskMention(nodeId',
      'isRecordSelected',
      'border-blue-500 bg-blue-500',
    ],
  },
  {
    path: 'src/components/Wbs/KanbanChecklist.tsx',
    label: 'record task picker checklist items',
    snippets: [
      'isRecordSelectionMode',
      'insertRecordTaskMention(child.id',
      'isRecordSelected',
      'border-blue-500 bg-blue-500',
    ],
  },
  {
    path: 'src/components/Records/RecordContentEditor.tsx',
    label: 'record inline task tag editor',
    snippets: [
      'contentEditable',
      'data-record-task-mention',
      'serializeTaskMention',
      'onCursorOffsetChange',
    ],
  },
  {
    path: 'src/utils/recordContentMentions.ts',
    label: 'record content mention helpers',
    snippets: [
      'TASK_MENTION_PATTERN',
      'parseRecordContentMentions',
      'insertTaskMention',
      'syncTaskLinksFromRecordContent',
    ],
  },
  {
    path: 'src/components/Rag/CitationCard.tsx',
    label: 'record citation handling',
    snippets: [
      'knowledge_records',
      'open-knowledge-record',
    ],
  },
  {
    path: 'supabase/functions/match_project_knowledge/index.ts',
    label: 'edge function local test CORS and citation passthrough',
    snippets: [
      'http://127.0.0.1:4174',
      'sourceTable: row.source_table',
      'sourceId: row.source_id',
      'sourceType: row.source_type',
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = read(check.path);
  for (const snippet of check.snippets) {
    if (!content.includes(snippet)) {
      failures.push(`${check.label} missing: ${snippet}`);
    }
  }
}

if (failures.length > 0) {
  console.error('DEV-002 records verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`DEV-002 records verification passed: ${checks.length} file groups checked.`);
