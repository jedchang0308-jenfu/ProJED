import type { FirestoreUser } from '../../types';
import { HttpApiClient } from './httpApiClient';

export interface HttpSessionProfile extends FirestoreUser {
  expiresAt: number;
  authContextId: string;
  entry: 'main' | 'quick';
}

export interface ProjedSessionAdapter {
  getSession(signal?: AbortSignal): Promise<HttpSessionProfile>;
  updateDisplayName(displayName: string, signal?: AbortSignal): Promise<HttpSessionProfile>;
  logout(signal?: AbortSignal): Promise<void>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function parseSession(value: unknown): HttpSessionProfile {
  const envelope = record(value, 'SESSION_ENVELOPE');
  const data = record(envelope.data, 'SESSION_DATA');
  if (typeof data.localUserId !== 'string' || data.localUserId === ''
      || (data.email !== null && typeof data.email !== 'string')
      || (data.displayName !== null && typeof data.displayName !== 'string')
      || !Number.isSafeInteger(data.createdAt) || Number(data.createdAt) < 0
      || !Number.isSafeInteger(data.expiresAt) || Number(data.expiresAt) <= Date.now()
      || typeof data.authContextId !== 'string' || data.authContextId === ''
      || (data.entry !== 'main' && data.entry !== 'quick')) {
    throw new Error('HTTP_API_INVALID_SESSION_DATA');
  }
  return {
    uid: data.localUserId,
    email: data.email,
    displayName: data.displayName,
    createdAt: Number(data.createdAt),
    expiresAt: Number(data.expiresAt),
    authContextId: data.authContextId,
    entry: data.entry,
  };
}

export function createHttpSessionAdapter(client: HttpApiClient): ProjedSessionAdapter {
  return {
    async getSession(signal) {
      return parseSession(await client.request<unknown>('/api/v1/session', { signal }));
    },
    async updateDisplayName(displayName, signal) {
      return parseSession(await client.request<unknown>('/api/v1/session/profile', {
        method: 'PATCH', body: { displayName }, signal,
      }));
    },
    async logout(signal) {
      await client.request<unknown>('/api/v1/session/logout', { method: 'POST', signal });
    },
  };
}
