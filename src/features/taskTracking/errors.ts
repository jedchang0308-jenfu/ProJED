export type TaskTrackingErrorCode =
  | 'BACKEND_UNSUPPORTED'
  | 'SCHEMA_NOT_READY'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'REVISION_CONFLICT'
  | 'INVALID_PARENT'
  | 'CYCLE_DETECTED'
  | 'DUPLICATE_REFERENCE'
  | 'CROSS_WORKSPACE_UNSUPPORTED'
  | 'TRACKING_REFERENCE_BLOCKS_UNPLACED'
  | 'OPERATION_ID_CONFLICT';

export class TaskTrackingError extends Error {
  readonly code: TaskTrackingErrorCode;

  constructor(code: TaskTrackingErrorCode, message: string) {
    super(message);
    this.name = 'TaskTrackingError';
    this.code = code;
  }
}
