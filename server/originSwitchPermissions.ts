import { KernelError } from './errors.js';

type Capabilities = readonly string[];
export interface OriginSwitchPermissions {
  readonly version: 1;
  readonly workspaces: Readonly<Record<string, Capabilities>>;
  readonly boards: Readonly<Record<string, { readonly workspaceId: string; readonly capabilities: Capabilities }>>;
  readonly visibleWorkspaces: readonly string[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const object = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function invalid(): never { throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Session permission state cannot be confirmed', 503); }
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) invalid();
  return value.toLowerCase();
}
function capabilities(value: unknown): Capabilities {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/u.test(item))) invalid();
  return Object.freeze([...new Set(value as string[])].sort());
}

/** Input must already include created-resource rights via the existing SQL
 * session_effective_permissions_v1, not just the original login snapshot.
 * Compare effective actions/scopes, not role labels or capture timestamps. */
export function normalizeOriginSwitchPermissions(value: unknown): OriginSwitchPermissions {
  if (!object(value) || value.version !== 1 || !object(value.workspaces) || !object(value.boards)
    || !Array.isArray(value.visibleWorkspaces)) invalid();
  const visibleWorkspaces = Object.freeze([...new Set(value.visibleWorkspaces.map(id))].sort());
  const visible = new Set(visibleWorkspaces);
  const workspaceIds = new Set<string>();
  const workspaces = Object.freeze(Object.fromEntries(Object.entries(value.workspaces).map(([key, scope]) => {
    const workspaceId = id(key);
    if (!object(scope) || !visible.has(workspaceId) || workspaceIds.has(workspaceId)) invalid();
    workspaceIds.add(workspaceId);
    return [workspaceId, capabilities(scope.capabilities)] as const;
  }).sort(([left], [right]) => left.localeCompare(right))));
  const boardIds = new Set<string>();
  const boards = Object.freeze(Object.fromEntries(Object.entries(value.boards).map(([key, scope]) => {
    const boardId = id(key);
    if (!object(scope) || boardIds.has(boardId)) invalid();
    boardIds.add(boardId);
    const workspaceId = id(scope.workspaceId);
    if (!visible.has(workspaceId)) invalid();
    return [boardId, Object.freeze({ workspaceId, capabilities: capabilities(scope.capabilities) })] as const;
  }).sort(([left], [right]) => left.localeCompare(right))));
  return Object.freeze({ version: 1, workspaces, boards, visibleWorkspaces });
}

export function compareOriginSwitchPermissions(sourceValue: unknown, targetValue: unknown) {
  const source = normalizeOriginSwitchPermissions(sourceValue);
  const target = normalizeOriginSwitchPermissions(targetValue);
  const workspaceMatched = source.visibleWorkspaces.every(value => target.visibleWorkspaces.includes(value))
    && Object.keys(source.workspaces).every(value => Object.hasOwn(target.workspaces, value))
    && Object.entries(source.boards).every(([key, board]) => target.boards[key]?.workspaceId === board.workspaceId);
  const contains = (required: Capabilities, actual: Capabilities | undefined) => actual !== undefined
    && required.every(value => actual.includes(value));
  const permissionsMatched = workspaceMatched
    && Object.entries(source.workspaces).every(([key, required]) => contains(required, target.workspaces[key]))
    && Object.entries(source.boards).every(([key, required]) => contains(required.capabilities, target.boards[key]?.capabilities));
  return { workspaceMatched, permissionsMatched };
}

export function originSwitchPermissionsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeOriginSwitchPermissions(left)) === JSON.stringify(normalizeOriginSwitchPermissions(right));
}
