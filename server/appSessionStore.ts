import type { ServerActorV1 } from './actorTransaction.js';
import type { AppEntry } from './config.js';
import type { ProducerVerifiedIdentity } from './identityConsumer.js';

export type LoginIntentStatus = 'pending' | 'processing' | 'consumed' | 'cancelled' | 'rejected';

export interface StoredLoginIntent {
  readonly tokenHash: string;
  readonly stateHash: string;
  readonly entry: AppEntry;
  readonly publicOrigin: string;
  readonly returnPath: string;
  readonly oldSessionHash: string | null;
  readonly codeVerifier: string | null;
  readonly status: LoginIntentStatus;
  readonly claimHash: string | null;
  readonly completedSessionHash: string | null;
  readonly expiresAtMs: number;
}

export interface StoredAppSession {
  readonly tokenHash: string;
  readonly publicOrigin: string;
  readonly entry: AppEntry;
  readonly localUserId: string;
  readonly contextId: string;
  readonly accountGuardRevision: string;
  /** Original verified proof, retained for epoch/revision comparison, never re-exchanged. */
  readonly identity: ProducerVerifiedIdentity;
  readonly expiresAtMs: number;
  readonly revokedAtMs: number | null;
}

export interface CompleteLoginInput {
  readonly tokenHash: string;
  readonly stateHash: string;
  readonly claimHash: string;
  readonly sessionTokenHash: string;
  readonly contextId: string;
  readonly verified: Readonly<{ actor: ServerActorV1; identity: ProducerVerifiedIdentity }>;
  readonly nowMs: number;
}

export interface AppSessionStore {
  begin(intent: StoredLoginIntent): Promise<void>;
  readLogin(tokenHash: string): Promise<StoredLoginIntent | null>;
  claim(tokenHash: string, stateHash: string, claimHash: string, nowMs: number): Promise<StoredLoginIntent>;
  cancel(tokenHash: string, publicOrigin: string, nowMs: number): Promise<StoredLoginIntent | null>;
  reject(tokenHash: string, claimHash: string): Promise<void>;
  complete(input: CompleteLoginInput): Promise<StoredAppSession>;
  readSession(tokenHash: string): Promise<StoredAppSession | null>;
  revokeSession(tokenHash: string, publicOrigin: string, nowMs: number): Promise<boolean>;
}
