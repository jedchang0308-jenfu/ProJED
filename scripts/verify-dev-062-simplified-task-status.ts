import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dayjs from 'dayjs';
import { TASK_STATUS_OPTIONS, createDefaultTaskFilters } from '../src/features/taskFilters/defaults';
import { matchesTaskFilters } from '../src/features/taskFilters/predicates';
import { isTaskOverdue, normalizeManualTaskStatus } from '../src/utils/taskStatus';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(`${repoRoot}${path}`, 'utf8');

assert.deepEqual(
  TASK_STATUS_OPTIONS.map(option => [option.key, option.label]),
  [
    ['todo', '待辦'],
    ['in_progress', '進行中'],
    ['onhold', '暫緩'],
    ['completed', '完成'],
  ],
  '人工狀態必須只保留四種',
);

assert.equal(normalizeManualTaskStatus('delayed'), 'todo', '舊 delayed 必須相容收斂為待辦');
assert.equal(normalizeManualTaskStatus('unsure'), 'todo', '舊 unsure 必須相容收斂為待辦');

const now = dayjs('2026-08-04T12:00:00+08:00');
const task = (status: 'todo' | 'in_progress' | 'onhold' | 'completed', endDate?: string) => ({
  id: `${status}-${endDate}`,
  title: status,
  status,
  endDate,
});

for (const status of ['todo', 'in_progress', 'onhold'] as const) {
  assert.equal(isTaskOverdue(task(status, '2026-08-03'), now), true, `${status} 截止日已過必須逾期`);
}
assert.equal(isTaskOverdue(task('completed', '2026-08-03'), now), false, '完成任務不得逾期');
assert.equal(isTaskOverdue(task('todo', '2026-08-04'), now), false, '截止日當天不得提前逾期');
assert.equal(isTaskOverdue(task('todo', '2026-08-05'), now), false, '未到截止日不得逾期');
assert.equal(isTaskOverdue(task('todo'), now), false, '沒有截止日不得逾期');

const overdueFilters = { ...createDefaultTaskFilters(), overdueOnly: true };
assert.equal(matchesTaskFilters(task('todo', '2026-08-03'), overdueFilters), true, '逾期篩選必須命中未完成逾期任務');
assert.equal(matchesTaskFilters(task('completed', '2026-08-03'), overdueFilters), false, '逾期篩選不得命中完成任務');

const details = read('src/components/TaskDetailsModal.tsx');
const listItem = read('src/components/Wbs/WbsNodeItem.tsx');
const filterBar = read('src/components/ui/StatusFilterBar.tsx');
const conditionFilters = read('src/components/ui/TaskConditionFilterControls.tsx');
const store = read('src/store/useWbsStore.ts');
const dateBadge = read('src/components/Wbs/TaskDateBadge.tsx');
const css = read('src/index.css');

assert(!details.includes("value: 'delayed'"), '詳情選單不得提供延遲');
assert(!details.includes("value: 'unsure'"), '詳情選單不得提供未定');
assert(!listItem.includes('<option value="delayed">'), '清單選單不得提供延遲');
assert(!listItem.includes('<option value="unsure">'), '清單選單不得提供未定');
assert(!filterBar.includes('status.color'), '狀態篩選不得顯示彩色圓點');
assert(!conditionFilters.includes('status.color'), '共用條件篩選不得顯示彩色圓點');
assert(!existsSync(`${repoRoot}src/components/ui/TaskStatusIndicator.tsx`), '不得保留狀態圖示元件');
assert(!store.includes("status: 'delayed'"), '截止日不得再改寫為 delayed 狀態');
assert(dateBadge.includes('data-task-overdue'), '日期摘要必須暴露衍生逾期證據');
assert(!dateBadge.includes('>逾期<'), '日期摘要不得顯示「逾期」文字');
assert(dateBadge.includes('bg-orange-50') && dateBadge.includes('text-orange-700'), '逾期日期仍需保留橘色警示');
assert(css.includes('--color-status-todo: #475569'), '待辦必須使用深灰');
assert(
  css.includes('--color-status-in-progress: var(--color-primary-600)') &&
    css.includes('--color-primary-600: #4f46e5'),
  '進行中必須使用品牌藍',
);
assert(css.includes('--color-status-completed: #cbd5e1'), '完成必須使用淺灰');
assert(css.includes('--color-status-onhold: #cbd5e1'), '暫緩必須使用淺灰');

console.log('DEV-062 simplified task status: PASS');
