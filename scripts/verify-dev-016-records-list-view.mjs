import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/Records/RecordsView.tsx', 'utf8');

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};

assert('records view uses row marker for list layout', source.includes('record-list-row'));
assert('records view uses a divided list container', source.includes('divide-y divide-slate-100'));
assert(
  'records view uses desktop row columns',
  source.includes('md:grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px_84px]'),
);
assert('records view keeps summary preview text', source.includes('renderRecordContentAsPlainText(record.content)'));
assert('records view keeps guarded existing record open action', source.includes('handleOpenRecord(record)'));
assert('records view keeps task count visible', source.includes('{record.taskLinks.length} 任務'));
assert('records view no longer uses multi-card grid', !source.includes('lg:grid-cols-2 xl:grid-cols-3'));
assert('records view no longer uses card row shadow buttons', !source.includes('hover:border-blue-300 hover:bg-blue-50/30'));

if (failures.length > 0) {
  console.error('DEV-016 records list view verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-016 records list view verification passed: records library uses a scan-friendly list layout.');
