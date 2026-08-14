import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempRoot = join(process.cwd(), 'node_modules', '.cache', 'verify-dev-066');
const sources = [
  'src/utils/taskNoteRichContent.ts',
  'src/services/rag/ragContract.ts',
  'src/services/rag/chunking.ts',
  'src/services/rag/wbsRagAdapter.ts',
];

rmSync(tempRoot, { recursive: true, force: true });

const rewriteImports = outputText => outputText
  .replaceAll("from '../../utils/taskNoteRichContent'", "from '../../utils/taskNoteRichContent.js'")
  .replaceAll("from './ragContract'", "from './ragContract.js'")
  .replaceAll("from './chunking'", "from './chunking.js'");

for (const sourcePath of sources) {
  const source = readFileSync(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
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

const richText = await import(pathToFileURL(join(tempRoot, 'utils', 'taskNoteRichContent.js')).href);
const rag = await import(pathToFileURL(join(tempRoot, 'services', 'rag', 'wbsRagAdapter.js')).href);

const failures = [];
const assert = (label, condition) => {
  if (!condition) failures.push(label);
};
const assertEqual = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
};

const textNode = (text, format = 0) => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});
const element = (type, children, extra = {}) => ({
  children,
  direction: null,
  format: '',
  indent: 0,
  type,
  version: 1,
  ...extra,
});
const richContent = {
  schema: 'task-note.lexical-v1',
  editorState: {
    root: element('root', [
      element('heading', [textNode('重要決策')], { tag: 'h3' }),
      element('paragraph', [
        textNode('粗體重點', 1),
        textNode(' 與 '),
        element('link', [textNode('安全連結')], { url: 'https://example.com/spec' }),
      ]),
      element('list', [
        element('listitem', [element('paragraph', [textNode('第一項')])], { value: 1 }),
        element('listitem', [element('paragraph', [textNode('第二項', 4)])], { value: 2 }),
      ], { listType: 'bullet', start: 1, tag: 'ul' }),
    ]),
  },
};

assert('versioned rich content accepted', richText.isTaskNoteRichContent(richContent));
assertEqual(
  'plain projection preserves readable structure',
  richText.taskNoteRichContentToPlainText(richContent),
  '重要決策\n粗體重點 與 安全連結\n第一項\n第二項',
);
const markdown = richText.taskNoteRichContentToMarkdown(richContent);
assert('markdown preserves heading', markdown.includes('### 重要決策'));
assert('markdown preserves bold', markdown.includes('**粗體重點**'));
assert('markdown preserves safe link', markdown.includes('[安全連結](https://example.com/spec)'));
assert('markdown preserves bullet list', markdown.includes('- 第一項'));
assert('markdown preserves strikethrough', markdown.includes('~~第二項~~'));

const emphasisContent = {
  schema: 'task-note.lexical-v1',
  editorState: {
    root: element('root', [
      element('paragraph', [textNode('斜體', 2), textNode(' '), textNode('底線強調', 8)]),
    ]),
  },
};
const emphasisMarkdown = richText.taskNoteRichContentToMarkdown(emphasisContent);
assert('markdown preserves italic emphasis', emphasisMarkdown.includes('*斜體*'));
assert('markdown maps underline to safe AI-readable emphasis', emphasisMarkdown.includes('**底線強調**'));

const unsafeContent = {
  schema: 'task-note.lexical-v1',
  editorState: {
    root: element('root', [
      element('paragraph', [
        element('link', [textNode('不可執行')], { url: 'javascript:alert(1)' }),
      ]),
    ]),
  },
};
assertEqual('unsafe link degrades to text', richText.taskNoteRichContentToMarkdown(unsafeContent), '不可執行');
assertEqual('unsafe URL protocol rejected', richText.sanitizeTaskNoteUrl('javascript:alert(1)'), null);

const originalNote = {
  id: 'note_a',
  title: '決策',
  content: richText.taskNoteRichContentToPlainText(richContent),
  richContent,
};
const originalChildren = JSON.stringify(richContent.editorState.root.children);
const appended = richText.appendPlainTextToTaskNote(originalNote, '手機補記\n下一段');
const appendedChildren = appended.richContent.editorState.root.children;
assertEqual(
  'mobile append preserves every original rich node',
  JSON.stringify(appendedChildren.slice(0, richContent.editorState.root.children.length)),
  originalChildren,
);
assertEqual(
  'mobile append adds two paragraphs only',
  appendedChildren.length,
  richContent.editorState.root.children.length + 2,
);
assert('mobile append keeps original bold format bit', appendedChildren[1].children[0].format === 1);
assert('mobile append updates plain compatibility alias', appended.content.endsWith('手機補記\n下一段'));

const legacy = { id: 'legacy', title: '舊備註', content: '舊純文字' };
const upgraded = richText.appendPlainTextToTaskNote(legacy, '新補記');
assert('legacy note lazy upgrades', richText.isTaskNoteRichContent(upgraded.richContent));
assertEqual('legacy note keeps old and appended text', upgraded.content, '舊純文字\n新補記');

const node = {
  id: 'task_a',
  workspaceId: 'workspace_a',
  boardId: 'board_a',
  parentId: null,
  title: 'AI 任務',
  description: originalNote.content,
  detailNotes: [originalNote],
  status: 'todo',
  order: 1,
  updatedAt: 123,
};
const ragResult = rag.buildWbsRagDocuments({
  tenantId: 'tenant_a',
  projectId: 'project_a',
  nodes: [node],
});
const document = ragResult.documents[0];
const duplicateNeedle = '粗體重點 與 安全連結';
assertEqual(
  'RAG does not duplicate first note through description alias',
  document.content.split(duplicateNeedle).length - 1,
  0,
);
assert('RAG reads semantic markdown instead of plain alias', document.content.includes('**粗體重點**'));
assert('RAG omits the legacy description section when detail notes exist', !document.content.includes('描述：'));
assert('RAG includes note heading', document.content.includes('## 備註：決策'));
assert('RAG includes note id', document.content.includes('備註 ID：note_a'));
assertEqual('RAG metadata includes task id', document.metadata.detailNotes[0].taskId, 'task_a');
assertEqual('RAG metadata includes note id', document.metadata.detailNotes[0].noteId, 'note_a');
assertEqual('RAG metadata includes note title', document.metadata.detailNotes[0].noteTitle, '決策');
assertEqual('RAG metadata includes available update time', document.metadata.detailNotes[0].updatedAt, 123);

const legacyRag = rag.buildWbsRagDocuments({
  tenantId: 'tenant_a',
  projectId: 'project_a',
  nodes: [{ ...node, detailNotes: undefined, description: 'legacy fallback' }],
});
assert('RAG keeps description fallback when notes are absent', legacyRag.documents[0].content.includes('legacy fallback'));

const fieldSource = readFileSync('src/components/TaskNotes/TaskDetailNoteField.tsx', 'utf8');
const desktopSource = readFileSync('src/components/TaskNotes/TaskDetailNoteDesktopEditor.tsx', 'utf8');
assert('mobile field lazy-loads desktop editor', fieldSource.includes("React.lazy(() => import('./TaskDetailNoteDesktopEditor'))"));
assert('mobile branch has no contenteditable', !fieldSource.toLowerCase().includes('contenteditable'));
assert('mobile branch exposes append-only hooks', fieldSource.includes('data-task-note-mobile-append-input') && fieldSource.includes('appendPlainTextToTaskNote'));
assert('desktop toolbar is anchored left of its header toggle', desktopSource.includes('data-task-note-toolbar-placement="header-left"') && desktopSource.includes('absolute right-8 top-1/2') && desktopSource.includes('-translate-y-1/2'));
assert('desktop toolbar stays open until its toggle is clicked again', desktopSource.includes('data-task-note-toolbar-persistence="toggle-only"') && !desktopSource.includes("document.addEventListener('pointerdown', handlePointerDown") && !desktopSource.includes("setIsOpen(false)"));
assert('ambiguous paragraph and heading glyphs are replaced by visible labels', desktopSource.includes('wide>\n              本文') && desktopSource.includes('wide>\n              小標題'));
assert('bold italic and underline restore familiar icons', desktopSource.includes('<Bold size={15} />') && desktopSource.includes('<Italic size={15} />') && desktopSource.includes('<Underline size={15} />'));
assert('strikethrough uses an Aa line icon instead of an ambiguous S glyph', desktopSource.includes('data-task-note-strikethrough-icon="aa-line"') && desktopSource.includes('<ALargeSmall size={17}') && !desktopSource.includes('  Strikethrough,'));
assert('renderer does not use raw HTML', !fieldSource.includes('dangerouslySetInnerHTML') && !desktopSource.includes('dangerouslySetInnerHTML'));
assert('readonly desktop hides formatting and disables Lexical editing', desktopSource.includes('if (!canEdit) return null') && desktopSource.includes('<EditorEditablePlugin editable={canEdit}'));
assert('readonly mobile omits the append controls', fieldSource.includes('{canEdit ? (') && fieldSource.includes('data-task-note-mobile-append="true"'));

if (failures.length > 0) {
  console.error('DEV-066 task note rich-text verification failed:');
  failures.forEach(failure => console.error('- ' + failure));
  process.exit(1);
}

console.log('DEV-066 task note rich-text verification passed: semantic, mobile-append, safety, AI and UI-boundary contract suite.');
