import {
  createDefaultTaskFilters,
  normalizeTaskFilters,
  UNASSIGNED_ASSIGNEE_FILTER,
  type TaskFilterState,
} from '../taskFilters';
import type {
  CalendarSubscriptionBoardFilterSnapshot,
  CalendarSubscriptionDateType,
  CalendarSubscriptionFilters,
} from '../../services/supabase/database.types';

export type CalendarFilterBoardIdentity = {
  id: string;
  storageId?: string;
  workspaceId: string;
  storageWorkspaceId?: string;
};

const cloneFilters = (filters: TaskFilterState): TaskFilterState => ({
  ...filters,
  statusFilters: { ...filters.statusFilters },
  selectedAssigneeIds: [...filters.selectedAssigneeIds],
  selectedTagIds: [...filters.selectedTagIds],
});

const normalizeDateTypes = (
  dateTypes: CalendarSubscriptionDateType[] | undefined,
): CalendarSubscriptionDateType[] => {
  const normalized = Array.from(new Set((dateTypes ?? []).filter(
    (dateType): dateType is CalendarSubscriptionDateType => dateType === 'start_date' || dateType === 'due_date',
  )));
  return normalized.length > 0 ? normalized : ['due_date'];
};

export const createCalendarSafeDefaultTaskFilters = (currentUserId?: string | null): TaskFilterState => ({
  ...createDefaultTaskFilters(),
  selectedAssigneeIds: currentUserId ? [currentUserId] : [],
});

const createLegacyTaskFilters = (
  filters: CalendarSubscriptionFilters,
  currentUserId?: string | null,
): TaskFilterState => {
  const selectedAssigneeIds = (() => {
    const assignee = filters.assignee ?? { type: 'me' as const };
    if (assignee.type === 'user') return assignee.user_id ? [assignee.user_id] : [];
    if (assignee.type === 'selected') {
      return [
        ...assignee.user_ids,
        ...(assignee.include_unassigned ? [UNASSIGNED_ASSIGNEE_FILTER] : []),
      ];
    }
    return currentUserId ? [currentUserId] : [];
  })();

  const defaults = createDefaultTaskFilters();
  return {
    ...defaults,
    statusFilters: Object.fromEntries(
      Object.keys(defaults.statusFilters).map(status => [status, true]),
    ) as TaskFilterState['statusFilters'],
    selectedAssigneeIds,
  };
};

const boardAliases = (board: CalendarFilterBoardIdentity) =>
  Array.from(new Set([board.id, board.storageId].filter((value): value is string => Boolean(value))));

const workspaceAliases = (board: CalendarFilterBoardIdentity) =>
  Array.from(new Set([board.workspaceId, board.storageWorkspaceId].filter((value): value is string => Boolean(value))));

const hasAlias = (ids: string[] | undefined, aliases: string[]) =>
  Boolean(ids?.some(id => aliases.includes(id)));

const findRecordByAlias = <T>(record: Record<string, T> | undefined, aliases: string[]): T | undefined => {
  if (!record) return undefined;
  for (const alias of aliases) {
    if (record[alias]) return record[alias];
  }
  return undefined;
};

export const materializeCalendarBoardFilters = (
  boards: CalendarFilterBoardIdentity[],
  filters: CalendarSubscriptionFilters | null | undefined,
  currentUserId?: string | null,
): Record<string, CalendarSubscriptionBoardFilterSnapshot> => {
  const safeDefault = createCalendarSafeDefaultTaskFilters(currentUserId);

  if (!filters) {
    return Object.fromEntries(boards.map(board => [board.id, {
      included: true,
      date_types: ['due_date'],
      filters: cloneFilters(safeDefault),
    }]));
  }

  const isV3 = filters.version === 3 || filters.v3_scope_type === 'per_board_filter_snapshot';
  const isV2 = filters.version === 2 || filters.v2_scope_type === 'all_accessible_boards_snapshot';
  const legacyFilters = createLegacyTaskFilters(filters, currentUserId);
  const legacyDateTypes = normalizeDateTypes(filters.date_types);

  return Object.fromEntries(boards.map(board => {
    const aliases = boardAliases(board);
    const projectIncluded = hasAlias(filters.project_ids, aliases);

    if (isV3) {
      const snapshot = findRecordByAlias(filters.board_filters, aliases);
      return [board.id, snapshot
        ? {
          included: snapshot.included,
          date_types: normalizeDateTypes(snapshot.date_types ?? filters.date_types),
          filters: cloneFilters(normalizeTaskFilters(snapshot.filters)),
        }
        : { included: false, date_types: ['due_date'], filters: cloneFilters(safeDefault) }];
    }

    if (isV2) {
      const override = findRecordByAlias(filters.board_overrides, aliases);
      const included = projectIncluded && override?.enabled !== false;
      const effectiveFilters = override?.enabled !== false && override
        ? normalizeTaskFilters(override)
        : normalizeTaskFilters(filters.global_filter);
      return [board.id, { included, date_types: [...legacyDateTypes], filters: cloneFilters(effectiveFilters) }];
    }

    const scopeType = filters.scope_type ?? 'workspace';
    const included = scopeType === 'workspace'
      ? hasAlias(filters.workspace_ids, workspaceAliases(board))
      : projectIncluded;
    return [board.id, { included, date_types: [...legacyDateTypes], filters: cloneFilters(legacyFilters) }];
  }));
};

export const cloneCalendarBoardFilterSnapshot = (
  snapshot: CalendarSubscriptionBoardFilterSnapshot,
): CalendarSubscriptionBoardFilterSnapshot => ({
  included: snapshot.included,
  date_types: [...snapshot.date_types],
  filters: cloneFilters(snapshot.filters),
});
