import { getInteractionProfileLayers } from './profiles';
import type {
  InteractionContext,
  InteractionTrigger,
  ResolvedInteraction,
  TaskActionId,
  TaskInteractionBinding,
  TaskInteractionProfile,
  TaskInteractionProfileLayer,
} from './types';
import { getTaskActionCatalog, getTaskMenuActionIds } from './taskActionCatalog';

const KNOWN_HOST_MODES = new Set(['list', 'mindmap', 'board', 'gantt', 'calendar']);
const KNOWN_ORIGINS = new Set(['mode-primary', 'task-workbench', 'shared-task-sidebar', 'calendar-segment']);

const SYSTEM_BASE_PROFILE: TaskInteractionProfile = Object.freeze({
  triggers: Object.freeze({ 'keyboard.shift-f10': 'disabled' }),
});

const getBinding = (profile: TaskInteractionProfile | undefined, trigger: InteractionTrigger): TaskInteractionBinding | undefined => (
  profile?.triggers?.[trigger]
);

const getSourceLayer = (layers: readonly TaskInteractionProfileLayer[], trigger: InteractionTrigger): ResolvedInteraction['sourceLayer'] => {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (getBinding(layers[index].profile, trigger) !== undefined) return layers[index].layer;
  }
  return 'task-default';
};

const resolveBinding = (layers: readonly TaskInteractionProfileLayer[], trigger: InteractionTrigger): TaskActionId | null => {
  let binding: TaskInteractionBinding | undefined;
  for (const layer of layers) {
    const nextBinding = getBinding(layer.profile, trigger);
    if (nextBinding !== undefined) binding = nextBinding;
  }
  return binding && binding !== 'disabled' ? binding : null;
};

const hasExclusiveTransientConflict = (owners: readonly InteractionContext['transientOwners'][number][]) => (
  owners.length > 1
);

export const resolveTaskInteraction = (
  context: InteractionContext,
  trigger: InteractionTrigger,
): ResolvedInteraction => {
  if (
    !context.location
    || !KNOWN_HOST_MODES.has(context.location.hostMode)
    || !KNOWN_ORIGINS.has(context.location.origin)
  ) {
    return { actionId: null, sourceLayer: 'base', suppressedReason: 'unknown-location' };
  }
  if (context.blockers.length > 0) {
    return { actionId: null, sourceLayer: 'transient', suppressedReason: context.blockers[0] };
  }
  if (hasExclusiveTransientConflict(context.transientOwners)) {
    return { actionId: null, sourceLayer: 'transient', suppressedReason: 'transient-owner-conflict' };
  }
  if (context.transientOwners.length > 0) {
    const owner = context.transientOwners[0];
    if (owner === 'mobile-action-mode' && trigger === 'task.post-create') {
      return { actionId: 'task.open-details', sourceLayer: 'transient' };
    }
    return { actionId: null, sourceLayer: 'transient', suppressedReason: `transient-owner:${owner}` };
  }

  const layers: readonly TaskInteractionProfileLayer[] = [
    { layer: 'base', profile: SYSTEM_BASE_PROFILE },
    ...getInteractionProfileLayers(context.location, context.nodeRole),
  ];
  const binding = resolveBinding(layers, trigger);
  if (binding === null) {
    const sourceLayer = getSourceLayer(layers, trigger);
    return {
      actionId: null,
      sourceLayer,
      suppressedReason: getBinding(layers.find(layer => layer.layer === sourceLayer)?.profile, trigger) === 'disabled'
        ? 'disabled'
        : 'unbound-trigger',
    };
  }
  if (!getTaskActionCatalog().some(action => action.id === binding)) {
    return { actionId: null, sourceLayer: 'base', suppressedReason: 'unknown-action' };
  }
  return { actionId: binding, sourceLayer: getSourceLayer(layers, trigger) };
};

export const resolveTaskMenu = (context: InteractionContext): readonly TaskActionId[] => {
  if (!KNOWN_HOST_MODES.has(context.location.hostMode) || !KNOWN_ORIGINS.has(context.location.origin)) return [];
  if (context.transientOwners.length > 0 || context.blockers.length > 0) return [];
  if (hasExclusiveTransientConflict(context.transientOwners)) return [];
  const layers = getInteractionProfileLayers(context.location, context.nodeRole);
  const actionIds = getTaskMenuActionIds(layers.map(layer => layer.profile));
  // A task-details child row is already inside the details host, so expose the
  // navigation action in its contextual menu without changing Board's compact
  // menu contract.
  if (context.surfaceId === 'task-details.subtask-row' && !actionIds.includes('task.open-details')) {
    return ['task.open-details', ...actionIds];
  }
  return actionIds;
};
