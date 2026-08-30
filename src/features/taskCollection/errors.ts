export type TaskCollectionErrorCode =
  | 'BACKEND_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'OPERATION_CONFLICT'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_ARCHIVED'
  | 'SOURCE_BUSY'
  | 'SOURCE_INVALID_TREE'
  | 'SOURCE_CHANGED'
  | 'LIMIT_EXCEEDED'
  | 'SNAPSHOT_INVALID'
  | 'TRANSIENT'
  | 'UNKNOWN';

export class TaskCollectionError extends Error {
  constructor(public readonly code: TaskCollectionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) (this as Error & { cause?: unknown }).cause = options.cause;
    this.name = 'TaskCollectionError';
  }
}
