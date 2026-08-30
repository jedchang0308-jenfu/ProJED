import type { EditableKnowledgeRecord, KnowledgeRecordInput } from '../../src/types';

const invalidInput: KnowledgeRecordInput = {
  id: 'collection-input',
  // @ts-expect-error task_collection is not an editable record input
  type: 'task_collection',
  title: 'invalid',
  content: 'invalid',
  status: 'published',
  visibility: 'project',
  taskLinks: [],
};

const invalidEditable: EditableKnowledgeRecord = {
  id: 'editable',
  workspaceId: 'workspace',
  boardId: 'board',
  type: 'meeting',
  title: 'invalid',
  content: 'invalid',
  status: 'published',
  visibility: 'project',
  taskLinks: [],
  // @ts-expect-error collection metadata is never valid on editable records
  collectionOperationId: 'operation',
};

void invalidInput;
void invalidEditable;
