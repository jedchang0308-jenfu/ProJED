export type QuickAuthSnapshot = Readonly<{
  accountId: string;
  /** Legacy Supabase access token, or a non-secret HTTP Session context identity. */
  accessToken: string;
  authEpoch: number;
  contextRevision?: number;
  contextProjectRef?: string;
}>;

export type QuickTaskCreateResult = {
  status: 'committed';
  captureId: string;
  ownerId: string;
  titleHash: string;
  created: boolean;
  committedAt: number;
};
