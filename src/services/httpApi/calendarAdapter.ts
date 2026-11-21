import type {
  CalendarBoardRef,
  CalendarSubscription,
  CalendarSubscriptionInput,
  CalendarSubscriptionWithUrl,
  CalendarWorkspaceMember,
  CalendarWorkspaceRef,
} from '../supabase/calendarSubscriptionService';
import type { ProjedDomainReadAdapter } from './domainReadAdapter';
import { HttpApiClient } from './httpApiClient';

type References = { workspaces: CalendarWorkspaceRef[]; boards: CalendarBoardRef[] };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function dataOf(value: unknown): unknown {
  if (!isRecord(value) || !('data' in value)) throw new Error('HTTP_API_INVALID_CALENDAR_RESPONSE');
  return value.data;
}

function parseSubscription(value: unknown): CalendarSubscription {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
      || !isRecord(value.filters) || typeof value.isActive !== 'boolean'
      || (value.expiresAt !== null && typeof value.expiresAt !== 'string')
      || (value.lastAccessedAt !== null && typeof value.lastAccessedAt !== 'string')
      || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('HTTP_API_INVALID_CALENDAR_SUBSCRIPTION');
  }
  return value as unknown as CalendarSubscription;
}

function parseReferences(value: unknown): References {
  if (!isRecord(value) || !Array.isArray(value.workspaces) || !Array.isArray(value.boards)) {
    throw new Error('HTTP_API_INVALID_CALENDAR_REFERENCES');
  }
  const workspaces = value.workspaces.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.appWorkspaceId !== 'string'
        || typeof item.name !== 'string') throw new Error('HTTP_API_INVALID_CALENDAR_WORKSPACE');
    return item as unknown as CalendarWorkspaceRef;
  });
  const boards = value.boards.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.appBoardId !== 'string'
        || typeof item.name !== 'string' || typeof item.workspaceId !== 'string'
        || typeof item.appWorkspaceId !== 'string' || typeof item.workspaceName !== 'string'
        || typeof item.path !== 'string') throw new Error('HTTP_API_INVALID_CALENDAR_BOARD');
    return item as unknown as CalendarBoardRef;
  });
  return { workspaces, boards };
}

function absoluteFeedUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/api/v1/calendar-feeds/')) {
    throw new Error('HTTP_API_INVALID_CALENDAR_FEED_URL');
  }
  return typeof globalThis.location?.origin === 'string'
    ? new URL(value, globalThis.location.origin).toString()
    : value;
}

export function createHttpCalendarAdapter(client: HttpApiClient, reads: ProjedDomainReadAdapter) {
  // Do not share in-flight actor-bound directory data across Session changes.
  const references = async () => parseReferences(dataOf(await client.request<unknown>('/api/v1/calendar-subscriptions/references')));
  const idPath = (id: string, suffix = '') => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('HTTP_API_INVALID_CALENDAR_ID');
    return `/api/v1/calendar-subscriptions/${encodeURIComponent(id)}${suffix}`;
  };
  return {
    async list(): Promise<CalendarSubscription[]> {
      const data = dataOf(await client.request<unknown>('/api/v1/calendar-subscriptions'));
      if (!Array.isArray(data)) throw new Error('HTTP_API_INVALID_CALENDAR_LIST');
      return data.map(parseSubscription);
    },
    async listWorkspaceRefs(): Promise<CalendarWorkspaceRef[]> {
      return (await references()).workspaces;
    },
    async listBoardRefs(workspaceIds: string[] = []): Promise<CalendarBoardRef[]> {
      const all = (await references()).boards;
      if (workspaceIds.length === 0) return all;
      const selected = new Set(workspaceIds);
      return all.filter(board => selected.has(board.workspaceId) || selected.has(board.appWorkspaceId));
    },
    async listWorkspaceMembers(workspaceIds: string[], boardIds?: string[]): Promise<CalendarWorkspaceMember[]> {
      const refs = await references();
      const selectedWorkspaces = new Set(workspaceIds);
      const selectedBoards = boardIds ? new Set(boardIds) : null;
      const boards = refs.boards.filter(board => (selectedWorkspaces.has(board.workspaceId) || selectedWorkspaces.has(board.appWorkspaceId))
        && (!selectedBoards || selectedBoards.has(board.id) || selectedBoards.has(board.appBoardId)));
      const rows = await Promise.all(boards.map(async board => ({ board,
        members: await reads.listBoardMembers(board.appWorkspaceId, board.appBoardId),
      })));
      return rows.flatMap(({ board, members }) => members.map(member => ({
        workspaceId: member.workspaceId,
        boardIds: [board.id, board.appBoardId],
        userId: member.userId,
        role: member.role,
        email: member.profile?.email ?? null,
        displayName: member.profile?.displayName ?? null,
      })));
    },
    async create(input: CalendarSubscriptionInput): Promise<CalendarSubscriptionWithUrl> {
      const data = dataOf(await client.request<unknown>('/api/v1/calendar-subscriptions', { method: 'POST', body: input }));
      if (!isRecord(data)) throw new Error('HTTP_API_INVALID_CALENDAR_CREATE');
      return { subscription: parseSubscription(data.subscription), feedUrl: absoluteFeedUrl(data.feedUrl) };
    },
    async update(id: string, input: CalendarSubscriptionInput): Promise<CalendarSubscription> {
      return parseSubscription(dataOf(await client.request<unknown>(idPath(id), { method: 'PATCH', body: input })));
    },
    async setActive(id: string, active: boolean): Promise<void> {
      dataOf(await client.request<unknown>(idPath(id, active ? '/enable' : '/disable'), { method: 'POST' }));
    },
    async rotate(id: string): Promise<string> {
      return absoluteFeedUrl(dataOf(await client.request<unknown>(idPath(id, '/rotate-token'), { method: 'POST' })));
    },
    async delete(id: string): Promise<void> {
      dataOf(await client.request<unknown>(idPath(id), { method: 'DELETE' }));
    },
  };
}
