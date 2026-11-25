import { HttpApiClient } from '../../services/httpApi/httpApiClient';
import { createHttpSessionAdapter, type ProjedAppEntry } from '../../services/httpApi/sessionAdapter';
import { createHttpQuickTaskAdapter } from '../../services/httpApi/quickTaskAdapter';
import { inspectLocalDrafts, type LocalInventoryPorts, type LocalInventoryScope } from './localDraftInventory';
import type { GuidePorts } from './guide';

/** Attach to GuidePorts.inspectDrafts. Session entry is independent of guide
 * entry: existing same-origin Quick may legitimately use the Main Session. */
export function createHttpGuideDraftInspector(scope: LocalInventoryScope, sessionEntry: ProjedAppEntry,
  client: HttpApiClient, activity: LocalInventoryPorts['activity'],
  inventory: typeof inspectLocalDrafts = inspectLocalDrafts): GuidePorts['inspectDrafts'] {
  const frozen = client.snapshotExpectedActor();
  if (frozen.accountId !== scope.accountId) throw new Error('ORIGIN_SWITCH_ACTOR_CHANGED');
  const session = createHttpSessionAdapter(client);
  const quick = createHttpQuickTaskAdapter(client);
  const current = (): boolean => {
    try {
      const latest = client.snapshotExpectedActor();
      return latest.accountId === frozen.accountId && latest.contextId === frozen.contextId;
    } catch { return false; }
  };
  const readActivity = () => {
    const state = activity();
    return { ...state, current: state.current && current(), revision: `${frozen.contextId}:${state.revision}` };
  };
  return async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const start = readActivity();
      if (start.online && start.current) {
        await session.verifyBoundActor(scope.accountId, sessionEntry, controller.signal);
        if (!current()) throw new Error('ORIGIN_SWITCH_ACTOR_CHANGED');
      }
      const result = await inventory(scope, {
        activity: readActivity,
        readQuickReceipt: async captureId => {
          if (!readActivity().current || !readActivity().online) throw new Error('ORIGIN_SWITCH_ACTOR_UNAVAILABLE');
          const receipt = await quick.readReceipt(captureId, controller.signal, frozen);
          if (!readActivity().current) throw new Error('ORIGIN_SWITCH_ACTOR_CHANGED');
          return receipt;
        },
      });
      const end = readActivity();
      return { ...result, online: end.online, editing: result.editing || end.editing,
        complete: result.complete && end.current && start.revision === end.revision && !controller.signal.aborted };
    } finally { clearTimeout(timer); }
  };
}
