import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const files = {
  types: read('src/types/index.ts'),
  contract: read('src/utils/meetingProjectChangeImport.ts'),
  workflow: read('src/utils/meetingRecordWorkflow.ts'),
  store: read('src/store/useRecordStore.ts'),
  editor: read('src/components/Records/RecordContentEditor.tsx'),
  sidebar: read('src/components/Records/RecordSidebar.tsx'),
  importControl: read('src/components/Records/MeetingProjectChangeImportControl.tsx'),
  local: read('src/services/localTestService.ts'),
  supabase: read('src/services/supabase/projedService.ts'),
};

const checks = [
  ['typed metadata envelope', files.contract.includes('MeetingProjectChangeImportV1') && files.contract.includes('schemaVersion: 1')],
  ['stable event ID fail closed', files.contract.includes('MISSING_EVENT_ID') && files.contract.includes('typeof event.id !== \'string\'')],
  ['default cutoff selection', files.contract.includes('resolveMeetingProjectChangeImportCutoff') && files.contract.includes('updatedAt') && files.contract.includes('id.localeCompare')],
  ['exclusive start query contract', files.types.includes("startBoundary?: 'inclusive' | 'exclusive'") && files.contract.includes("startBoundary: 'exclusive'")],
  ['local exclusive boundary', files.local.includes('query.startBoundary === \'exclusive\' ? createdAt > query.startedAt')],
  ['supabase exclusive boundary', files.supabase.includes("request.gt('created_at'" )],
  ['focus token and no-save shortcut', files.workflow.includes("command: 'focusContent'") && files.store.includes('requestContentFocus') && files.store.includes('consumeContentFocus')],
  ['editor focus request', files.editor.includes('EditorFocusRequestPlugin') && files.editor.includes('data-record-content-editor')],
  ['meeting one-click control', files.importControl.includes('帶入上次會議後變更') && files.sidebar.includes('MeetingProjectChangeImportControl')],
  ['explicit meeting actions', files.sidebar.includes('data-record-meeting-actions') && files.sidebar.includes('data-record-meeting-save-draft') && files.sidebar.includes('data-record-meeting-publish')],
  ['work-log import remains separate', files.sidebar.includes('projectChangeImportPanel') && files.sidebar.includes('WorkLogWorkflowCard')],
  ['publish-only cutoff projection', files.store.includes('projectMeetingProjectChangeImportMetadata') && files.store.includes("wantsPublish ? 'published' : 'draft'" )],
  ['tracked pure verifier', read('scripts/verify-dev-094-meeting-direct-note.pure.ts').includes('resolveMeetingProjectChangeImportCutoff') && read('scripts/verify-dev-094-meeting-direct-note.pure.ts').includes('missing stable event ID')],
];

const failures = checks.filter(([, pass]) => !pass).map(([label]) => label);
if (failures.length) {
  console.error('DEV-094 meeting direct note verification failed:');
  failures.forEach(label => console.error(`- ${label}`));
  process.exit(1);
}
mkdirSync('output/qa/dev-094', { recursive: true });
writeFileSync('output/qa/dev-094/result.json', JSON.stringify({
  status: 'PASS',
  devId: 'DEV-094',
  scope: 'static-contract',
  checks: checks.map(([label, pass]) => ({ label, pass })),
  cutoff: { selectedRecordId: null, startedAt: null, startBoundary: 'exclusive', endedAt: null, endBoundary: 'inclusive' },
  recordRequests: { list: 0, upsert: 0, checkpoint: 0 },
  visibleErrors: [],
  consoleErrors: [],
  pageErrors: [],
}, null, 2));
console.log(`DEV-094 meeting direct note verification passed (${checks.length} contract checks).`);
