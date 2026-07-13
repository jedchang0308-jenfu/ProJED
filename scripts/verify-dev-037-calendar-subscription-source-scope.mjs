import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  databaseTypes: 'src/services/supabase/database.types.ts',
  service: 'src/services/supabase/calendarSubscriptionService.ts',
  view: 'src/components/CalendarSubscriptionsView.tsx',
  edgeFunction: 'supabase/functions/calendar-feed/index.ts',
  migration: 'supabase/migrations/20260706091804_calendar_subscription_source_scope.sql',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-037-calendar-subscription-source-scope-clarity.md',
  qa: 'ai-doc/qa/QA-DEV-037-calendar-subscription-source-scope-clarity.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  backlog: 'ai-doc/backlog.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'CalendarSubscriptionFilters supports scope_type and project_ids',
  source.databaseTypes.includes("export type CalendarSubscriptionScopeType = 'board' | 'workspace' | 'custom';") &&
    source.databaseTypes.includes('project_ids?: string[];') &&
    source.databaseTypes.includes('scope_type?: CalendarSubscriptionScopeType;'),
);

assert(
  'Service normalizer resolves workspaces and boards without dropping source scope',
  source.service.includes('normalizeScopeType') &&
    source.service.includes('resolveBoardRef') &&
    source.service.includes('listBoardRefs') &&
    source.service.includes("scope_type: 'board'") &&
    source.service.includes("scope_type: 'workspace'") &&
    source.service.includes("scope_type: 'custom'") &&
    source.service.includes('project_ids: [project.id]') &&
    source.service.includes('project_ids: resolvedProjectIds'),
);

assert(
  'Calendar UI exposes v3 per-board source controls and summaries',
  source.view.includes('<CalendarSubscriptionBuilderPreview') &&
    source.view.includes('boardOptions') &&
    source.view.includes('builderPayload?.project_ids') &&
    !source.view.includes('data-calendar-subscription-scope-form="true"') &&
    source.view.includes('來源：') &&
    source.view.includes('條件：') &&
    source.view.includes('describeSourceFilter') &&
    source.view.includes('describeConditionFilters') &&
    source.view.includes('逐看板設定'),
);

assert(
  'Calendar UI keeps v1 active-board defaults and materializes the v3 Builder payload',
  source.view.includes('emptyFilters(activeWorkspace?.id, activeBoard?.id)') &&
    source.view.includes("scope_type: 'board'") &&
    source.view.includes('project_ids: [boardId]') &&
    source.view.includes('initialFilters={filters}') &&
    source.view.includes('onPayloadChange={setBuilderPayload}'),
);

assert(
  'Edge Function recomputes project scope and filters wbs_items by project_id',
  source.edgeFunction.includes('getAllowedTenantAndProjectScope') &&
    source.edgeFunction.includes('project_members') &&
    source.edgeFunction.includes('scopeType === "board"') &&
    source.edgeFunction.includes('scopeType === "custom"') &&
    source.edgeFunction.includes('.in("tenant_id", allowedScope.tenantIds)') &&
    source.edgeFunction.includes('.in("project_id", allowedScope.projectIds)') &&
    !source.edgeFunction.includes('const allowedTenantIds = await getAllowedTenantIds'),
);

assert(
  'Database validation checks scope_type, project_ids, project workspace, and project permission',
  source.migration.includes('calendar_subscription_filter_allowed(filters jsonb)') &&
    source.migration.includes("scope_type not in ('board', 'workspace', 'custom')") &&
    source.migration.includes("filters ? 'project_ids'") &&
    source.migration.includes('cardinality(project_ids) <> 1') &&
    source.migration.includes('p.tenant_id <> all(workspace_ids)') &&
    source.migration.includes('private.current_user_can_read_project') &&
    source.migration.includes('private.current_user_can_manage_project') &&
    source.migration.includes('grant execute on function public.calendar_subscription_filter_allowed(jsonb) to authenticated;'),
);

assert(
  'Token regeneration remains source-scope neutral',
  source.service.includes('regenerateToken: async (subscriptionId: string): Promise<string>') &&
    source.service.includes("supabase.rpc('rotate_calendar_subscription_token'") &&
    source.service.includes('target_token_hash: tokenHash') &&
    !source.service.includes('regenerateToken: async (subscriptionId: string, input'),
);

assert(
  'Package scripts expose DEV-037 static and browser gates',
  source.packageJson.includes('"verify:dev-037-calendar-subscription-source-scope"') &&
    source.packageJson.includes('"verify:dev-037-calendar-subscription-source-scope-browser"'),
);

assert(
  'DEV-037 governance docs remain discoverable',
  source.spec.includes('Board scope 的 `.ics` feed 不包含其他看板任務') &&
    source.qa.includes('QA-037-F01') &&
    source.devTask.includes('DEV-037: 行事曆訂閱來源範圍清晰化') &&
    source.documentationMap.includes('DEV-037: 行事曆訂閱來源範圍清晰化') &&
    source.backlog.includes('DEV-037: 行事曆訂閱來源範圍清晰化'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
