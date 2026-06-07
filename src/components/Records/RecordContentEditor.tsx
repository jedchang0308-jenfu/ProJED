import React from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  TextNode,
  type EditorState,
  type LexicalEditor,
} from 'lexical';
import type { TaskNode } from '../../types';
import { TaskMentionNode } from './TaskMentionNode';
import {
  $getRecordCursorOffset,
  $replaceTextNodeTaskMentionTokens,
  $serializeEditorContentToRecordString,
  $setEditorContentFromRecordString,
  normalizeRecordContentNewlines,
} from '../../utils/recordLexicalContent';

interface RecordContentEditorProps {
  value: string;
  nodes: Record<string, TaskNode>;
  placeholder?: string;
  editorClassName?: string;
  cursorOffset: number | null;
  onChange: (value: string) => void;
  onCursorOffsetChange: (offset: number) => void;
}

const editorTheme = {
  paragraph: 'mb-0 min-h-6',
};

const editorConfig = {
  namespace: 'ProJEDRecordContentEditor',
  nodes: [TaskMentionNode],
  onError(error: Error) {
    throw error;
  },
  theme: editorTheme,
};

const EditorContentSyncPlugin: React.FC<{
  value: string;
  onCursorOffsetChange: (offset: number) => void;
}> = ({ value, onCursorOffsetChange }) => {
  const [editor] = useLexicalComposerContext();
  const normalizedValue = normalizeRecordContentNewlines(value);

  React.useEffect(() => {
    editor.update(() => {
      const currentValue = $serializeEditorContentToRecordString();
      if (currentValue !== normalizedValue) {
        $setEditorContentFromRecordString(normalizedValue);
      }
      const nextOffset = $getRecordCursorOffset();
      if (nextOffset !== null) onCursorOffsetChange(nextOffset);
    });
  }, [editor, normalizedValue, onCursorOffsetChange]);

  return null;
};

const TaskMentionTokenTransformPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => (
    editor.registerNodeTransform(TextNode, textNode => {
      if (editor.isComposing()) return;
      $replaceTextNodeTaskMentionTokens(textNode);
    })
  ), [editor]);

  return null;
};

const ScopedKeyboardPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const selectAllBaselineRef = React.useRef<string | null>(null);
  const replacementRedoRef = React.useRef<string | null>(null);

  const readCurrentValue = React.useCallback(() => {
    let currentValue = '';
    editor.getEditorState().read(() => {
      currentValue = $serializeEditorContentToRecordString();
    });
    return currentValue;
  }, [editor]);

  const replaceEditorValue = React.useCallback((value: string) => {
    editor.update(() => {
      $setEditorContentFromRecordString(value);
    });
  }, [editor]);

  React.useEffect(() => (
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      event => {
        const target = event.target as HTMLElement | null;
        if (!target || !editor.getRootElement()?.contains(target)) return false;
        const shortcutKey = event.key.toLowerCase();
        const isSystemShortcut = event.ctrlKey || event.metaKey;

        if (isSystemShortcut && shortcutKey === 'a') {
          selectAllBaselineRef.current = readCurrentValue();
          replacementRedoRef.current = null;
        }

        if (isSystemShortcut && shortcutKey === 'z' && !event.shiftKey) {
          const baseline = selectAllBaselineRef.current;
          const currentValue = readCurrentValue();
          if (baseline !== null && baseline !== currentValue) {
            event.preventDefault();
            event.stopPropagation();
            replacementRedoRef.current = currentValue;
            selectAllBaselineRef.current = null;
            replaceEditorValue(baseline);
            return true;
          }
        }

        if (isSystemShortcut && shortcutKey === 'y') {
          const redoValue = replacementRedoRef.current;
          if (redoValue !== null) {
            event.preventDefault();
            event.stopPropagation();
            selectAllBaselineRef.current = readCurrentValue();
            replacementRedoRef.current = null;
            replaceEditorValue(redoValue);
            return true;
          }
        }

        // Keep editor-level shortcuts such as Ctrl+A/Z/Y from leaking into app-level handlers.
        event.stopPropagation();
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    )
  ), [editor, readCurrentValue, replaceEditorValue]);

  return null;
};

const RecordContentOnChangePlugin: React.FC<{
  onChange: (value: string) => void;
  onCursorOffsetChange: (offset: number) => void;
}> = ({ onChange, onCursorOffsetChange }) => {
  const lastContentRef = React.useRef<string | null>(null);

  const handleChange = React.useCallback((editorState: EditorState, editor: LexicalEditor) => {
    editorState.read(() => {
      const nextValue = $serializeEditorContentToRecordString();
      if (lastContentRef.current !== nextValue) {
        lastContentRef.current = nextValue;
        onChange(nextValue);
      }
      const nextOffset = $getRecordCursorOffset();
      if (nextOffset !== null) onCursorOffsetChange(nextOffset);
    });

  }, [onChange, onCursorOffsetChange]);

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange={false}
      onChange={handleChange}
    />
  );
};

const RecordContentEditor: React.FC<RecordContentEditorProps> = ({
  value,
  placeholder,
  editorClassName,
  onChange,
  onCursorOffsetChange,
}) => (
  <LexicalComposer initialConfig={editorConfig}>
    <div className="relative mt-1">
      {!value ? (
        <div className="pointer-events-none absolute left-3 top-2 z-10 text-sm leading-6 text-slate-400">
          {placeholder}
        </div>
      ) : null}
      <RichTextPlugin
        contentEditable={(
          <ContentEditable
            className={`${editorClassName || 'min-h-[150px]'} w-full resize-y overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100`}
            aria-placeholder={placeholder || ''}
            placeholder={null}
          />
        )}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <TaskMentionTokenTransformPlugin />
      <ScopedKeyboardPlugin />
      <EditorContentSyncPlugin value={value} onCursorOffsetChange={onCursorOffsetChange} />
      <RecordContentOnChangePlugin onChange={onChange} onCursorOffsetChange={onCursorOffsetChange} />
    </div>
  </LexicalComposer>
);

export default RecordContentEditor;
