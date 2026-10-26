export type KernelErrorCode =
  | 'CONFIG_INVALID'
  | 'ACTOR_INVALID'
  | 'IDENTITY_CONTRACT_UNAVAILABLE'
  | 'IDENTITY_INVALID'
  | 'IDENTITY_STATE_UNAVAILABLE'
  | 'IDENTITY_MAPPING_CONFLICT'
  | 'ACCESS_DENIED'
  | 'TRANSACTION_USAGE_INVALID'
  | 'DB_BOUNDARY_INVALID'
  | 'DB_BUSY'
  | 'DB_UNAVAILABLE'
  | 'DB_COMMIT_UNKNOWN';

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
