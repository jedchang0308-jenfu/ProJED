/**
 * Decides whether the visible login action must start a fresh SSO flow.
 * Mapping conflicts mean the old Session was safely fenced after an identity
 * revision changed; retrying that Session can never repair it.
 */
export function shouldStartFreshLogin(status: number, code: string): boolean {
  return status === 401
    || status === 404
    || (status === 409 && code === 'IDENTITY_MAPPING_CONFLICT');
}
