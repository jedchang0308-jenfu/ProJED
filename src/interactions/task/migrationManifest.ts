export type TaskInteractionMigrationState = 'legacy-only' | 'shadow-resolve' | 'kernel-authoritative' | 'legacy-removed';

export type TaskInteractionMigrationEntry = {
  id: string;
  surface: string;
  trigger: string;
  state: TaskInteractionMigrationState;
};

export const TASK_INTERACTION_MIGRATION_MANIFEST: readonly TaskInteractionMigrationEntry[] = Object.freeze([
  { id: 'list-primary', surface: 'list.row', trigger: 'pointer.primary', state: 'kernel-authoritative' },
  { id: 'mindmap-primary', surface: 'mindmap.node', trigger: 'pointer.primary', state: 'kernel-authoritative' },
  { id: 'board-primary', surface: 'board.card', trigger: 'pointer.primary', state: 'kernel-authoritative' },
  { id: 'gantt-primary', surface: 'gantt.task-bar', trigger: 'pointer.primary', state: 'kernel-authoritative' },
  { id: 'task-menu', surface: 'shared-task-sidebar.row', trigger: 'pointer.secondary', state: 'kernel-authoritative' },
  { id: 'mindmap-keyboard', surface: 'mindmap.node', trigger: 'keyboard.enter', state: 'kernel-authoritative' },
  { id: 'mobile-post-create', surface: 'board.card', trigger: 'task.post-create', state: 'shadow-resolve' },
]);

const ALLOWED_TRANSITIONS: Readonly<Record<TaskInteractionMigrationState, readonly TaskInteractionMigrationState[]>> = {
  'legacy-only': ['shadow-resolve'],
  'shadow-resolve': ['kernel-authoritative'],
  'kernel-authoritative': ['legacy-removed'],
  'legacy-removed': [],
};

export const canAdvanceTaskInteractionMigration = (
  from: TaskInteractionMigrationState,
  to: TaskInteractionMigrationState,
): boolean => ALLOWED_TRANSITIONS[from].includes(to);

export const assertTaskInteractionMigrationManifest = (): void => {
  const ids = new Set<string>();
  for (const entry of TASK_INTERACTION_MIGRATION_MANIFEST) {
    if (ids.has(entry.id)) throw new Error(`Duplicate migration entry: ${entry.id}`);
    ids.add(entry.id);
  }
};
