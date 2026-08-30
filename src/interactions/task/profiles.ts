import type {
  InteractionContext,
  TaskInteractionLocation,
  TaskInteractionProfile,
  TaskInteractionProfileLayer,
  TaskNodeRole,
  TaskHostMode,
} from './types';

const TASK_DEFAULT_PROFILE: TaskInteractionProfile = Object.freeze({
  triggers: Object.freeze({
    'pointer.primary': 'task.open-details',
    'pointer.double': 'task.open-details',
    'pointer.secondary': 'task.open-menu',
    'gesture.tap': 'task.open-details',
    'task.post-create': 'task.open-details-for-naming',
    'keyboard.escape': 'task.clear-selection',
    'keyboard.space': 'task.open-details',
  }),
});

const HOST_MODE_PROFILES: Readonly<Record<TaskHostMode, TaskInteractionProfile>> = Object.freeze({
  list: Object.freeze({
    menu: Object.freeze({ include: ['task.dependency-start', 'task.dependency-end'] as const, exclude: ['task.create-relationship'] as const }),
    triggers: Object.freeze({ 'keyboard.enter': 'task.open-details' }),
  }),
  mindmap: Object.freeze({
    menu: Object.freeze({
      include: ['task.open-details', 'task.create-relationship'] as const,
      exclude: ['task.dependency-start', 'task.dependency-end'] as const,
    }),
    triggers: Object.freeze({
      'pointer.primary': 'task.select',
      'pointer.double': 'task.open-details',
      'keyboard.enter': 'task.create-sibling',
      'keyboard.tab': 'task.create-child',
      'keyboard.arrow-up': 'mindmap.select-parent',
      'keyboard.arrow-down': 'mindmap.select-first-child',
      'keyboard.arrow-left': 'mindmap.select-previous',
      'keyboard.arrow-right': 'mindmap.select-next',
    }),
  }),
  board: Object.freeze({
    menu: Object.freeze({ include: ['task.dependency-start', 'task.dependency-end'] as const, exclude: ['task.create-relationship'] as const }),
    triggers: Object.freeze({ 'keyboard.enter': 'task.open-details' }),
  }),
  gantt: Object.freeze({
    menu: Object.freeze({ exclude: ['task.dependency-start', 'task.dependency-end', 'task.create-relationship'] as const }),
    triggers: Object.freeze({ 'keyboard.enter': 'task.open-details' }),
  }),
  calendar: Object.freeze({
    menu: Object.freeze({ exclude: ['task.dependency-start', 'task.dependency-end', 'task.create-relationship'] as const }),
    triggers: Object.freeze({
      'pointer.primary': 'task.open-details',
      'gesture.tap': 'task.open-details',
    }),
  }),
});

const ORIGIN_PROFILES: Readonly<Record<TaskInteractionLocation['origin'], TaskInteractionProfile>> = Object.freeze({
  'mode-primary': Object.freeze({}),
  'task-workbench': Object.freeze({
    triggers: Object.freeze({
      'pointer.primary': 'task.open-details',
      'gesture.tap': 'task.open-details',
    }),
  }),
  'shared-task-sidebar': Object.freeze({
    // Calendar and Gantt use the shared sidebar's primary task action: open details.
  }),
  'calendar-segment': Object.freeze({
    triggers: Object.freeze({
      'pointer.primary': 'task.open-details',
      'gesture.tap': 'task.open-details',
    }),
  }),
});

// Node role is an explicit cascade layer even when Phase 1 has no role-specific
// override. Keeping the empty profiles here makes the precedence observable and
// gives later L1/L2/L3+ changes a narrow, sparse extension point without copying
// host-mode handlers.
const EMPTY_NODE_ROLE_PROFILE: TaskInteractionProfile = Object.freeze({});
const NODE_ROLE_PROFILES: Readonly<Record<TaskNodeRole, TaskInteractionProfile>> = Object.freeze({
  group: EMPTY_NODE_ROLE_PROFILE,
  milestone: EMPTY_NODE_ROLE_PROFILE,
  task: EMPTY_NODE_ROLE_PROFILE,
  unplaced: EMPTY_NODE_ROLE_PROFILE,
});

export const getNodeRoleProfile = (nodeRole: TaskNodeRole = 'task'): TaskInteractionProfile => (
  NODE_ROLE_PROFILES[nodeRole] || EMPTY_NODE_ROLE_PROFILE
);

export const getInteractionProfileLayers = (
  location: TaskInteractionLocation,
  nodeRole: TaskNodeRole = 'task',
): readonly TaskInteractionProfileLayer[] => [
  { layer: 'task-default', profile: TASK_DEFAULT_PROFILE },
  { layer: 'host-mode', profile: HOST_MODE_PROFILES[location.hostMode] },
  { layer: 'origin', profile: ORIGIN_PROFILES[location.origin] },
  { layer: 'node-role', profile: getNodeRoleProfile(nodeRole) },
];

export const getTaskInteractionLocation = (context: Pick<InteractionContext, 'location'>): TaskInteractionLocation => ({
  hostMode: context.location.hostMode,
  origin: context.location.origin,
});

export const getTaskDefaultProfile = (): TaskInteractionProfile => TASK_DEFAULT_PROFILE;

export const getHostModeProfile = (hostMode: TaskHostMode): TaskInteractionProfile => HOST_MODE_PROFILES[hostMode];

export const getOriginProfile = (origin: TaskInteractionLocation['origin']): TaskInteractionProfile => ORIGIN_PROFILES[origin];
