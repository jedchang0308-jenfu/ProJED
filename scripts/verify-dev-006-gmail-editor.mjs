import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-006');

const sources = [
  'src/utils/recordContentMentions.ts',
  'src/utils/recordLexicalContent.ts',
  'src/components/Records/TaskMentionNode.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = (outputText) =>
  outputText
    .replaceAll("from './recordContentMentions'", "from './recordContentMentions.js'")
    .replaceAll("from '../components/Records/TaskMentionNode'", "from '../components/Records/TaskMentionNode.js'")
    .replaceAll("from '../../utils/recordContentMentions'", "from '../../utils/recordContentMentions.js'");

for (const sourcePath of sources) {
  const source = readFileSync(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
    },
    fileName: sourcePath,
  });
  const outPath = join(tempRoot, sourcePath.replace(/^src[\\/]/, '').replace(/\.tsx?$/, '.js'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rewriteImports(outputText));
}

const lexicalHelpers = await import(pathToFileURL(join(tempRoot, 'utils', 'recordLexicalContent.js')).href);
const mentionNode = await import(pathToFileURL(join(tempRoot, 'components', 'Records', 'TaskMentionNode.js')).href);
const mentions = await import(pathToFileURL(join(tempRoot, 'utils', 'recordContentMentions.js')).href);
const lexical = await import('lexical');

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

const createTestEditor = () => lexical.createEditor({
  namespace: 'verify-dev-006',
  nodes: [mentionNode.TaskMentionNode],
  onError(error) {
    throw error;
  },
});

const roundTrip = async (content) => {
  const editor = createTestEditor();
  await editor.update(() => {
    lexicalHelpers.$setEditorContentFromRecordString(content);
  }, { discrete: true });
  let output = '';
  editor.getEditorState().read(() => {
    output = lexicalHelpers.$serializeEditorContentToRecordString();
  });
  return output;
};

const tokenA = mentions.serializeTaskMention('task_a', 'Task A');
assertEqual(
  'round trip plain multiline content normalizes newline',
  await roundTrip('Alpha\r\nBeta\rGamma'),
  'Alpha\nBeta\nGamma',
);
assertEqual(
  'round trip task mention token stays stable',
  await roundTrip(`Discuss ${tokenA} today`),
  `Discuss ${tokenA} today`,
);

const editor = createTestEditor();
await editor.update(() => {
  lexicalHelpers.$setEditorContentFromRecordString(`Before ${tokenA} after`);
}, { discrete: true });

let taskNodeText = '';
let taskNodeJson = null;
editor.getEditorState().read(() => {
  const root = lexical.$getRoot();
  const paragraph = root.getFirstChild();
  const taskNode = paragraph.getChildren().find(node => mentionNode.$isTaskMentionNode(node));
  taskNodeText = taskNode?.getTextContent() || '';
  taskNodeJson = taskNode?.exportJSON() || null;
});
assertEqual('task mention node plain text copy token', taskNodeText, tokenA);
assertDeepEqual('task mention node JSON contract', taskNodeJson && {
  nodeId: taskNodeJson.nodeId,
  title: taskNodeJson.title,
  type: taskNodeJson.type,
}, {
  nodeId: 'task_a',
  title: 'Task A',
  type: 'task-mention',
});

await editor.update(() => {
  lexicalHelpers.$setEditorContentFromRecordString('');
  const root = lexical.$getRoot();
  const paragraph = root.getFirstChild();
  const textNode = paragraph.getFirstChild();
  const editableTextNode = textNode || lexical.$createTextNode('');
  if (!textNode) paragraph.append(editableTextNode);
  editableTextNode.setTextContent(`Paste ${tokenA} here`);
  lexicalHelpers.$replaceTextNodeTaskMentionTokens(editableTextNode);
}, { discrete: true });

let transformedChildren = [];
editor.getEditorState().read(() => {
  const root = lexical.$getRoot();
  transformedChildren = root.getFirstChild().getChildren().map(node => node.getType());
});
assertDeepEqual('plain text token paste transforms to task mention node', transformedChildren, ['text', 'task-mention', 'text']);

assertEqual(
  'create pasted record text keeps line break token',
  await roundTrip('Paste A\nPaste B'),
  'Paste A\nPaste B',
);

const requiredEditorSnippets = [
  'LexicalComposer',
  'RichTextPlugin',
  'HistoryPlugin',
  'TaskMentionTokenTransformPlugin',
  'KEY_DOWN_COMMAND',
];
const editorSource = readFileSync('src/components/Records/RecordContentEditor.tsx', 'utf8');
for (const snippet of requiredEditorSnippets) {
  if (!editorSource.includes(snippet)) failures.push(`RecordContentEditor missing snippet: ${snippet}`);
}

if (failures.length > 0) {
  console.error('DEV-006 Gmail-like editor verification failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('DEV-006 Gmail-like editor verification passed: Lexical round trip and task chip behavior checked.');
