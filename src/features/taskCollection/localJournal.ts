export type LocalJournalEntry = {
  id: string;
  operationId: string;
  state: 'prepared' | 'committed';
  createdAt: number;
  before: Record<string, unknown>;
  after?: Record<string, unknown>;
};

const JOURNAL_KEY = 'projed-local-test.taskCollectionJournal.v1';
const getStorage = () => {
  if (typeof localStorage === 'undefined') throw new Error('Local storage is unavailable.');
  return localStorage;
};

export const readTaskCollectionJournal = (): LocalJournalEntry[] => {
  const raw = getStorage().getItem(JOURNAL_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Task collection journal is invalid.');
  return parsed as LocalJournalEntry[];
};

export const writeTaskCollectionJournal = (entries: LocalJournalEntry[]): void => {
  getStorage().setItem(JOURNAL_KEY, JSON.stringify(entries));
};

export const prepareTaskCollectionJournal = (operationId: string, before: Record<string, unknown>): LocalJournalEntry => {
  const entry = { id: `${operationId}:${Date.now()}`, operationId, state: 'prepared' as const, createdAt: Date.now(), before };
  writeTaskCollectionJournal([...readTaskCollectionJournal(), entry]);
  return entry;
};

export const completeTaskCollectionJournal = (operationId: string): void => {
  writeTaskCollectionJournal(readTaskCollectionJournal().map(entry => entry.operationId === operationId ? { ...entry, state: 'committed' } : entry));
};

export const setTaskCollectionJournalAfter = (operationId: string, after: Record<string, unknown>): void => {
  writeTaskCollectionJournal(readTaskCollectionJournal().map(entry => entry.operationId === operationId ? { ...entry, after } : entry));
};

export const clearTaskCollectionJournal = (operationId: string): void => {
  writeTaskCollectionJournal(readTaskCollectionJournal().filter(entry => entry.operationId !== operationId));
};

export const TASK_COLLECTION_JOURNAL_KEY = JOURNAL_KEY;
