import type { TaskFilterQuery } from '../../features/taskFilters';
import type { AccountLayoutPreferences } from '../accountPreferencesService';
import type { TaskFilterPreferenceRemoteRow } from '../supabase/taskFilterPreferenceService';
import { HttpApiClient } from './httpApiClient';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const boardPath = (boardId: string) => {
  if (!boardId) throw new Error('HTTP_API_INVALID_BOARD_ID');
  return `/api/v1/preferences/task-filters/${encodeURIComponent(boardId)}`;
};

const dataOf = (value: unknown): unknown => {
  if (!isRecord(value) || !('data' in value)) throw new Error('HTTP_API_INVALID_PREFERENCE_RESPONSE');
  return value.data;
};

const parseLayout = (value: unknown): AccountLayoutPreferences => {
  if (!isRecord(value)) throw new Error('HTTP_API_INVALID_LAYOUT_PREFERENCES');
  return value as AccountLayoutPreferences;
};

const parseTaskFilterRow = (value: unknown): TaskFilterPreferenceRemoteRow | null => {
  if (value === null) return null;
  if (!isRecord(value)
      || typeof value.accountId !== 'string'
      || typeof value.projectId !== 'string'
      || !Number.isInteger(value.preferenceVersion)
      || !isRecord(value.filters)
      || typeof value.createdAt !== 'string'
      || typeof value.updatedAt !== 'string') {
    throw new Error('HTTP_API_INVALID_TASK_FILTER_PREFERENCE');
  }
  return value as TaskFilterPreferenceRemoteRow;
};

export function createHttpPreferencesAdapter(client: HttpApiClient) {
  return {
    async readLayout(): Promise<AccountLayoutPreferences> {
      return parseLayout(dataOf(await client.request<unknown>('/api/v1/preferences/layout')));
    },

    async updateLayout(updates: AccountLayoutPreferences): Promise<AccountLayoutPreferences> {
      return parseLayout(dataOf(await client.request<unknown>('/api/v1/preferences/layout', {
        method: 'PATCH',
        body: { updates },
      })));
    },

    async readTaskFilter(boardId: string): Promise<TaskFilterPreferenceRemoteRow | null> {
      return parseTaskFilterRow(dataOf(await client.request<unknown>(boardPath(boardId))));
    },

    async compareAndSetTaskFilter(
      boardId: string,
      expectedVersion: 4 | 5 | 6 | null,
      filters: TaskFilterQuery,
      expectedUpdatedAt?: string,
    ): Promise<void> {
      dataOf(await client.request<unknown>(boardPath(boardId), {
        method: 'PUT',
        body: { expectedVersion, filters, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
      }));
    },

    async removeTaskFilter(boardId: string, expectedVersion?: 6): Promise<void> {
      const suffix = expectedVersion === undefined ? '' : `?expectedVersion=${expectedVersion}`;
      dataOf(await client.request<unknown>(`${boardPath(boardId)}${suffix}`, { method: 'DELETE' }));
    },
  };
}
