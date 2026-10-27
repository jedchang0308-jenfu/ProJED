export type KernelErrorCode =
  | 'CONFIG_INVALID'
  | 'ACTOR_INVALID'
  | 'IDENTITY_CONTRACT_UNAVAILABLE'
  | 'IDENTITY_INVALID'
  | 'IDENTITY_STATE_UNAVAILABLE'
  | 'IDENTITY_MAPPING_CONFLICT'
  | 'RESOURCE_NOT_FOUND'
  | 'DOMAIN_DATA_INVALID'
  | 'ACCESS_DENIED'
  | 'TRANSACTION_USAGE_INVALID'
  | 'DB_BOUNDARY_INVALID'
  | 'DB_BUSY'
  | 'DB_UNAVAILABLE'
  | 'DB_COMMIT_UNKNOWN'
  | 'QUICK_TASK_INVALID_CAPTURE'
  | 'QUICK_TASK_INVALID_TITLE'
  | 'QUICK_TASK_IDEMPOTENCY_CONFLICT'
  | 'QUICK_TASK_EXISTING_ROW_INVALID'
  | 'QUICK_TASK_NO_AVAILABLE_WORKSPACE'
  | 'QUICK_TASK_ORDER_EXHAUSTED'
  | 'TASK_PLACEMENT_IDEMPOTENCY_CONFLICT'
  | 'TASK_PLACEMENT_IDENTITY_CONFLICT'
  | 'TASK_PLACEMENT_LINKED'
  | 'ACTOR_CHANGED';

export class KernelError extends Error {
  constructor(
    readonly code: KernelErrorCode,
    message: string,
    readonly httpStatus = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'KernelError';
  }
}

export function asKernelError(error: unknown): KernelError {
  return error instanceof KernelError
    ? error
    : new KernelError('DB_UNAVAILABLE', 'Database operation failed', 503, { cause: error });
}
