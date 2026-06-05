import { readFileSync } from 'node:fs';
import ts from 'typescript';

const sourcePath = 'src/utils/recordContentMentions.ts';
const source = readFileSync(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: false,
  },
  fileName: sourcePath,
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
const helpers = await import(moduleUrl);

const failures = [];

const assertEqual = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const assertDeepEqual = (label, actual, expected) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    failures.push(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
};

const tokenA = helpers.serializeTaskMention('task_a', 'Task A');
const tokenB = helpers.serializeTaskMention('task_b', 'Task B');

assertEqual('serialize task mention', tokenA, '@[Task A](task:task_a)');
assertEqual(
  'normalize unsafe title text',
  helpers.serializeTaskMention('task_c', 'Line\n[unsafe](title)'),
  '@[Line unsafe title](task:task_c)'
);

const middleInsert = helpers.insertTaskMention('Alpha omega', 6, 'task_a', 'Task A');
assertEqual('insert mention at cursor position', middleInsert.content, `Alpha ${tokenA} omega`);
assertEqual('cursor after inserted mention', middleInsert.cursorOffset, `Alpha ${tokenA} `.length);

const wordInsert = helpers.insertTaskMention('Alphaomega', 5, 'task_a', 'Task A');
assertEqual('insert mention inside word adds spacing', wordInsert.content, `Alpha ${tokenA} omega`);

const duplicateContent = `${tokenA} discussed again ${tokenA} and ${tokenB}`;
assertDeepEqual(
  'extract mention ids is unique and ordered',
  helpers.extractTaskMentionIds(duplicateContent),
  ['task_a', 'task_b']
);

assertDeepEqual(
  'parse duplicate task mentions preserves task segments',
  helpers.parseRecordContentMentions(duplicateContent)
    .filter(segment => segment.type === 'task')
    .map(segment => segment.nodeId),
  ['task_a', 'task_a', 'task_b']
);

assertDeepEqual(
  'sync content mentions to unique task links',
  helpers.syncTaskLinksFromRecordContent(duplicateContent, []),
  [
    { nodeId: 'task_a', role: 'main' },
    { nodeId: 'task_b', role: 'related' },
  ]
);

assertDeepEqual(
  'sync preserves existing role',
  helpers.syncTaskLinksFromRecordContent(tokenA, [{ nodeId: 'task_a', role: 'blocker' }]),
  [{ nodeId: 'task_a', role: 'blocker' }]
);

assertDeepEqual(
  'deleting all content mentions removes non-legacy links',
  helpers.syncTaskLinksFromRecordContent('plain text only', [{ nodeId: 'task_a', role: 'main' }]),
  []
);

assertDeepEqual(
  'legacy structured links survive when content has no mention token',
  helpers.syncTaskLinksFromRecordContent(
    'plain text only',
    [{ nodeId: 'task_a', role: 'main' }],
    ['task_a']
  ),
  [{ nodeId: 'task_a', role: 'main' }]
);

assertDeepEqual(
  'unique links collapse same node across roles',
  helpers.uniqueRecordTaskLinks([
    { nodeId: 'task_a', role: 'main' },
    { nodeId: 'task_a', role: 'related' },
  ]),
  [{ nodeId: 'task_a', role: 'main' }]
);

assertEqual(
  'plain text preview strips raw token syntax',
  helpers.renderRecordContentAsPlainText(`Discuss ${tokenA} today`),
  'Discuss Task A today'
);

if (failures.length > 0) {
  console.error('DEV-003 record content tag verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-003 record content tag verification passed: helper behavior checked.');
