import React from 'react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type EditorState,
  type TextFormatType,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  $createHeadingNode,
  $isHeadingNode,
  HeadingNode,
} from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { mergeRegister } from '@lexical/utils';
import {
  ALargeSmall,
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Undo2,
  Underline,
} from 'lucide-react';
import type { TaskDetailNote } from '../../types';
import {
  createTaskNoteRichContent,
  getTaskNoteEditorStateJson,
  sanitizeTaskNoteUrl,
  taskNoteRichContentToPlainText,
} from '../../utils/taskNoteRichContent';

interface TaskDetailNoteDesktopEditorProps {
  canEdit: boolean;
  note: TaskDetailNote;
  noteIndex: number;
  onAdd: () => void;
  onDelete: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<TaskDetailNote>) => void;
}

const editorTheme = {
  heading: {
    h3: 'mb-1 mt-2 text-sm font-semibold leading-6 text-slate-900',
  },
  link: 'break-all text-blue-600 underline decoration-blue-300 underline-offset-2',
  list: {
    listitem: 'ml-5 pl-0.5',
    ol: 'list-decimal',
    ul: 'list-disc',
  },
  paragraph: 'min-h-6',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    strikethrough: 'line-through',
    underline: 'underline underline-offset-2',
    underlineStrikethrough: 'underline line-through underline-offset-2',
  },
};

const initializeLegacyContent = (content: string) => () => {
  const root = $getRoot();
  root.clear();
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach(line => {
    const paragraph = $createParagraphNode();
    if (line) paragraph.append($createTextNode(line));
    root.append(paragraph);
  });
};

const EditorEditablePlugin: React.FC<{ editable: boolean }> = ({ editable }) => {
  const [editor] = useLexicalComposerContext();
  React.useEffect(() => editor.setEditable(editable), [editable, editor]);
  return null;
};

const LinkSafetyPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => editor.registerNodeTransform(LinkNode, linkNode => {
    if (sanitizeTaskNoteUrl(linkNode.getURL())) return;
    linkNode.getChildren().forEach(child => linkNode.insertBefore(child));
    linkNode.remove();
  }), [editor]);

  return null;
};

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  heading: boolean;
  bullet: boolean;
  number: boolean;
  link: boolean;
}

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  heading: false,
  bullet: false,
  number: false,
  link: false,
};

const ToolbarButton: React.FC<{
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  wide?: boolean;
}> = ({ active = false, children, label, onClick, wide = false }) => (
  <button
    type="button"
    onMouseDown={event => event.preventDefault()}
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={[
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border text-slate-600 transition',
      wide ? 'min-w-10 px-2 text-xs font-medium' : 'w-8',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200',
      active
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-transparent bg-transparent hover:bg-slate-100 hover:text-slate-900',
    ].join(' ')}
  >
    {children}
  </button>
);

const StrikethroughFormatIcon: React.FC = () => (
  <span
    className="relative inline-flex h-4 w-4 items-center justify-center"
    aria-hidden="true"
    data-task-note-strikethrough-icon="aa-line"
  >
    <ALargeSmall size={17} strokeWidth={1.8} />
    <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-current" />
  </span>
);

const findSelectionState = (): ToolbarState => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return EMPTY_TOOLBAR_STATE;

  let currentNode = selection.anchor.getNode();
  let heading = false;
  let bullet = false;
  let number = false;
  let link = false;
  while (currentNode && currentNode.getType() !== 'root') {
    if ($isHeadingNode(currentNode)) heading = currentNode.getTag() === 'h3';
    if ($isListNode(currentNode)) {
      bullet = currentNode.getListType() === 'bullet';
      number = currentNode.getListType() === 'number';
    }
    if ($isLinkNode(currentNode)) link = true;
    const parent = currentNode.getParent();
    if (!parent) break;
    currentNode = parent;
  }

  return {
    bold: selection.hasFormat('bold'),
    italic: selection.hasFormat('italic'),
    underline: selection.hasFormat('underline'),
    strikethrough: selection.hasFormat('strikethrough'),
    heading,
    bullet,
    number,
    link,
  };
};

const unwrapSelectedLinks = () => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  const links = new Map<string, LinkNode>();
  selection.getNodes().forEach(node => {
    let current = node;
    while (current && current.getType() !== 'root') {
      if ($isLinkNode(current)) links.set(current.getKey(), current);
      const parent = current.getParent();
      if (!parent) break;
      current = parent;
    }
  });
  links.forEach(linkNode => {
    linkNode.getChildren().forEach(child => linkNode.insertBefore(child));
    linkNode.remove();
  });
};

const NoteToolbarPlugin: React.FC<{
  canEdit: boolean;
  noteTitle: string;
  onSave: () => void;
}> = ({ canEdit, noteTitle, onSave }) => {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = React.useState(false);
  const [state, setState] = React.useState<ToolbarState>(EMPTY_TOOLBAR_STATE);
  const [linkError, setLinkError] = React.useState('');

  const updateToolbar = React.useCallback(() => {
    setState(findSelectionState());
  }, []);

  React.useEffect(() => mergeRegister(
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbar);
    }),
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  ), [editor, updateToolbar]);

  const requestLink = React.useCallback(() => {
    const enteredUrl = window.prompt('輸入連結網址；留空可移除連結', 'https://');
    if (enteredUrl === null) return;
    if (!enteredUrl.trim()) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      setLinkError('');
      return;
    }
    const safeUrl = sanitizeTaskNoteUrl(enteredUrl);
    if (!safeUrl) {
      setLinkError('僅支援 http、https、mailto 或 tel 連結。');
      return;
    }
    setLinkError('');
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, safeUrl);
  }, [editor]);

  React.useEffect(() => editor.registerCommand(
    KEY_DOWN_COMMAND,
    event => {
      const target = event.target as HTMLElement | null;
      if (!target || !editor.getRootElement()?.contains(target)) return false;
      const systemKey = event.ctrlKey || event.metaKey;
      const shortcut = event.key.toLowerCase();

      if (systemKey && shortcut === 'k') {
        event.preventDefault();
        event.stopPropagation();
        requestLink();
        return true;
      }
      if (systemKey && shortcut === 's') {
        event.preventDefault();
        event.stopPropagation();
        onSave();
        return true;
      }
      if (systemKey && ['a', 'b', 'i', 'u', 'z', 'y'].includes(shortcut)) {
        event.stopPropagation();
      }
      return false;
    },
    COMMAND_PRIORITY_HIGH,
  ), [editor, onSave, requestLink]);

  const formatText = (format: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  const setParagraph = () => {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => $setBlocksType($getSelection(), () => $createParagraphNode()));
  };
  const setHeading = () => {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => $setBlocksType(
      $getSelection(),
      () => state.heading ? $createParagraphNode() : $createHeadingNode('h3'),
    ));
  };
  const setList = (kind: 'bullet' | 'number') => {
    const active = kind === 'bullet' ? state.bullet : state.number;
    editor.dispatchCommand(
      active
        ? REMOVE_LIST_COMMAND
        : kind === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
      undefined,
    );
  };
  const clearFormatting = () => {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      selection.getNodes().forEach(node => {
        if ($isTextNode(node)) {
          node.setFormat(0);
          node.setStyle('');
        }
      });
      unwrapSelectedLinks();
      $setBlocksType(selection, () => $createParagraphNode());
    });
  };

  if (!canEdit) return null;

  return (
    <div className="relative shrink-0" data-task-note-format-control="true">
      <button
        type="button"
        onMouseDown={event => event.preventDefault()}
        onClick={() => {
          setLinkError('');
          setIsOpen(current => !current);
        }}
        aria-label={'文字格式：' + (noteTitle || '未命名備註')}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="文字格式"
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200',
          isOpen ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')}
        data-task-note-format-toggle="true"
      >
        <span aria-hidden="true" className="text-sm font-semibold leading-none underline decoration-1 underline-offset-2">A</span>
      </button>
      {isOpen ? (
        <div
          role="toolbar"
          aria-label={'文字格式工具：' + (noteTitle || '未命名備註')}
          className="absolute right-8 top-1/2 z-40 max-w-[calc(100vw-5rem)] -translate-y-1/2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
          data-task-note-toolbar-popover="true"
          data-task-note-toolbar-placement="header-left"
          data-task-note-toolbar-persistence="toggle-only"
        >
          <div className="flex w-max items-center gap-0.5">
            <ToolbarButton label="復原" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
              <Undo2 size={15} />
            </ToolbarButton>
            <ToolbarButton label="重做" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
              <Redo2 size={15} />
            </ToolbarButton>
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
            <ToolbarButton active={!state.heading && !state.bullet && !state.number} label="本文" onClick={setParagraph} wide>
              本文
            </ToolbarButton>
            <ToolbarButton active={state.heading} label="小標題" onClick={setHeading} wide>
              小標題
            </ToolbarButton>
            <ToolbarButton active={state.bold} label="粗體" onClick={() => formatText('bold')}>
              <Bold size={15} />
            </ToolbarButton>
            <ToolbarButton active={state.italic} label="斜體" onClick={() => formatText('italic')}>
              <Italic size={15} />
            </ToolbarButton>
            <ToolbarButton active={state.underline} label="底線" onClick={() => formatText('underline')}>
              <Underline size={15} />
            </ToolbarButton>
            <ToolbarButton active={state.strikethrough} label="刪除線" onClick={() => formatText('strikethrough')}>
              <StrikethroughFormatIcon />
            </ToolbarButton>
            <ToolbarButton active={state.bullet} label="項目清單" onClick={() => setList('bullet')}>
              <List size={15} />
            </ToolbarButton>
            <ToolbarButton active={state.number} label="編號清單" onClick={() => setList('number')}>
              <ListOrdered size={15} />
            </ToolbarButton>
            <ToolbarButton active={state.link} label="連結" onClick={requestLink}>
              <Link size={15} />
            </ToolbarButton>
            <ToolbarButton label="清除格式" onClick={clearFormatting}>
              <RemoveFormatting size={15} />
            </ToolbarButton>
          </div>
          {linkError ? (
            <p className="px-1 pt-1 text-xs text-red-600" role="alert">{linkError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const NoteChangePlugin: React.FC<{
  onUpdate: (updates: Partial<TaskDetailNote>) => void;
}> = ({ onUpdate }) => {
  const handleChange = React.useCallback((editorState: EditorState) => {
    const richContent = createTaskNoteRichContent(editorState.toJSON());
    onUpdate({
      richContent,
      content: taskNoteRichContentToPlainText(richContent),
    });
  }, [onUpdate]);

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={handleChange}
    />
  );
};

const TaskDetailNoteDesktopEditor: React.FC<TaskDetailNoteDesktopEditorProps> = ({
  canEdit,
  note,
  noteIndex,
  onAdd,
  onDelete,
  onSave,
  onUpdate,
}) => {
  const [initialConfig] = React.useState(() => ({
    namespace: 'ProJEDTaskDetailNote-' + note.id,
    editable: canEdit,
    nodes: [HeadingNode, ListNode, ListItemNode, LinkNode],
    editorState: getTaskNoteEditorStateJson(note) || initializeLegacyContent(note.content),
    onError(error: Error) {
      throw error;
    },
    theme: editorTheme,
  }));

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative min-w-0" data-task-detail-note-card="true" data-task-note-editor-loaded="true">
        <div className="mb-1 flex min-w-0 items-center gap-1" data-task-detail-note-header="true">
          <input
            type="text"
            value={note.title}
            onChange={event => onUpdate({ title: event.target.value })}
            disabled={!canEdit}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm font-semibold text-slate-800 outline-none transition hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:text-slate-400"
            placeholder="備註標題"
            data-task-detail-note-title-input="true"
          />
          <NoteToolbarPlugin canEdit={canEdit} noteTitle={note.title} onSave={onSave} />
          {noteIndex === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={!canEdit}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              title="新增備註欄"
              aria-label="新增備註欄"
              data-task-detail-note-add="true"
            >
              <span aria-hidden="true" className="text-lg leading-none">+</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            disabled={!canEdit}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="刪除此備註欄"
            aria-label={'刪除備註欄：' + (note.title || '未命名備註')}
            data-task-detail-note-delete="true"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        </div>
        <div className="relative">
          <RichTextPlugin
            contentEditable={(
              <ContentEditable
                className={[
                  'min-h-[96px] w-full overflow-auto whitespace-pre-wrap rounded-md border border-slate-200/70',
                  'bg-slate-50/70 px-2 py-1.5 text-sm leading-6 text-slate-700 outline-none transition',
                  'hover:border-slate-300/70 hover:bg-slate-50 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100',
                  'aria-disabled:cursor-default aria-disabled:border-slate-200/50 aria-disabled:bg-slate-100 aria-disabled:text-slate-400',
                ].join(' ')}
                aria-label={'備註內容：' + (note.title || '未命名備註')}
                aria-placeholder="輸入備註內容"
                placeholder={<span />}
                data-task-detail-note-content-input="true"
              />
            )}
            placeholder={(
              <div className="pointer-events-none absolute left-2 top-1.5 text-sm leading-6 text-slate-400">
                輸入備註內容
              </div>
            )}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={url => Boolean(sanitizeTaskNoteUrl(url))} />
        <LinkSafetyPlugin />
        <EditorEditablePlugin editable={canEdit} />
        <NoteChangePlugin onUpdate={onUpdate} />
      </div>
    </LexicalComposer>
  );
};

export default TaskDetailNoteDesktopEditor;
