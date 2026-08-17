import type {
  InteractionContext,
  TaskInteractionLocation,
  TaskInteractionProfile,
  TaskInteractionProfileLayer,
  TaskHostMode,
} from './types';

const TASK_DEFAULT_PROFILE: TaskInteractionProfile = Object.freeze({
  triggers: Object.freeze({
    'pointer.primary': 'task.open-details',
    'pointer.secondary': 'task.open-menu',
    'gesture.tap': 'task.open-details',
    'task.post-create': 'task.open-details-for-naming',
    'keyboard.escape': 'task.clear-selection',
  }),
});

const HOST_MODE_PROFILES: Readonly<Record<TaskHostMode, TaskInteractionProfile>> = Object.freeze({
  list: Object.freeze({
    menu: Object.freeze({ include: ['task.dependency-start', 'task.dependency-end'] as const }),
    triggers: Object.freeze({ 'keyboard.enter': 'task.open-details' }),
  }),
  mindmap: Object.freeze({
    menu: Object.freeze({ exclude: ['task.dependency-start', 'task.dependency-end'] as const }),
    triggers: Object.freeze({
      'pointer.primary': 'task.open-details',
      'keyboard.enter': 'task.create-sibling',
      'keyboard.tab': 'task.create-child',
      'keyboard.arrow-up': 'mindmap.select-parent',
      'keyboard.arrow-down': 'mindmap.select-first-child',
      'keyboard.arrow-left': 'mindmap.select-previous',
      'keyboard.arrow-right': 'mindmap.select-next',
    }),
  }),
  board: Object.freeze({
    menu: Object.freeze({ include: ['task.dependency-start', 'task.dependency-end'] as const }),
    triggers: Object.freeze({ 'keyboard.enter': 'task.open-details' }),
  }),
  gantt: Object.freeze({
    menu: Object.freeze({ exclude: ['task.dependency-start', 'task.dependency-end'] as const }),
    triggers: Object.freeze({ 'keyboard.enter': 'task.open-details' }),
  }),
  calendar: Object.freeze({
    menu: Object.freeze({ exclude: ['task.dependency-start', 'task.dependency-end'] as const }),
    triggers: Object.freeze({
      'pointer.primary': 'task.switch-to-list',
      'gesture.tap': 'task.switch-to-list',
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
    // Host mode remains authoritative: Gantt opens details, Calendar switches to List.
  }),
  'calendar-segment': Object.freeze({
    triggers: Object.freeze({
      'pointer.primary': 'task.switch-to-list',
      'gesture.tap': 'task.switch-to-list',
    }),
  }),
});

export const getInteractionProfileLayers = (location: TaskInteractionLocation): readonly TaskInteractionProfileLayer[] => [
  { layer: 'task-default', profile: TASK_DEFAULT_PROFILE },
  { layer: 'host-mode', profile: HOST_MODE_PROFILES[location.hostMode] },
  { layer: 'origin', profile: ORIGIN_PROFILES[location.origin] },
];

export const getTaskInteractionLocation = (context: Pick<InteractionContext, 'location'>): TaskInteractionLocation => ({
  hostMode: context.location.hostMode,
  origin: context.location.origin,
});

export const getTaskDefaultProfile = (): TaskInteractionProfile => TASK_DEFAULT_PROFILE;

export const getHostModeProfile = (hostMode: TaskHostMode): TaskInteractionProfile => HOST_MODE_PROFILES[hostMode];

export const getOriginProfile = (origin: TaskInteractionLocation['origin']): TaskInteractionProfile => ORIGIN_PROFILES[origin];
