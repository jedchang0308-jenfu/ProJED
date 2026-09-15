import type { ViewMode } from '../types';

export type PwaReloadSurface = ViewMode | 'quick-task';

export type PwaReloadSafetyOwnerId =
  | 'record-draft'
  | 'task-details'
  | 'calendar-subscription-form'
  | 'backup-import'
  | 'rag-query'
  | 'board-member-invite'
  | 'inline-editor'
  | 'dirty-dialog'
  | 'task-drag'
  | 'quick-task-capture';

export type PwaReloadSafetyReadinessProducer =
  | 'app-content'
  | 'auth-gate'
  | 'pwa-update-service';

export type PwaReloadSafetyOwnerManifestEntry = {
  ownerId: PwaReloadSafetyOwnerId;
  authority: string;
  surfaces: readonly PwaReloadSurface[];
  readiness: readonly PwaReloadSafetyReadinessProducer[];
};

const APP_SURFACES: readonly ViewMode[] = [
  'home',
  'list',
  'mindmap',
  'board',
  'goal',
  'gantt',
  'calendar',
  'records',
  'calendar_subscriptions',
  'settings',
  'recycle_bin',
];

/**
 * This is a deliberately small, typed contract. It is not a registry of
 * live tabs and must never be used as an all-client safety consensus.
 */
export const PWA_RELOAD_SAFETY_OWNER_MANIFEST = [
  {
    ownerId: 'quick-task-capture',
    authority: 'quick-task/main.ts local title, voice, claim and commit controller',
    surfaces: ['quick-task'],
    readiness: ['pwa-update-service'],
  },
  {
    ownerId: 'record-draft',
    authority: 'RecordSidebar / useMeetingDraftRecovery / useRecordStore',
    surfaces: APP_SURFACES,
    readiness: ['auth-gate', 'app-content'],
  },
  {
    ownerId: 'task-details',
    authority: 'TaskDetailsModal',
    surfaces: APP_SURFACES,
    readiness: ['app-content'],
  },
  {
    ownerId: 'calendar-subscription-form',
    authority: 'CalendarSubscriptionsView',
    surfaces: ['calendar_subscriptions'],
    readiness: ['app-content'],
  },
  {
    ownerId: 'backup-import',
    authority: 'BackupSettings',
    surfaces: ['settings'],
    readiness: ['app-content'],
  },
  {
    ownerId: 'rag-query',
    authority: 'RagSidebar / useRagStore',
    surfaces: APP_SURFACES,
    readiness: ['app-content'],
  },
  {
    ownerId: 'board-member-invite',
    authority: 'BoardMembersPanel',
    surfaces: APP_SURFACES,
    readiness: ['app-content'],
  },
  {
    ownerId: 'inline-editor',
    authority: 'Sidebar / TagPicker / MindMapNode / MindMapView / GoalCellSessionProvider',
    surfaces: APP_SURFACES,
    readiness: ['app-content'],
  },
  {
    ownerId: 'dirty-dialog',
    authority: 'GlobalDialog',
    surfaces: APP_SURFACES,
    readiness: ['app-content'],
  },
  {
    ownerId: 'task-drag',
    authority: 'BoardView / WbsListView / GoalView / SharedTaskSidebar / GanttTaskBar / MindMapView / useTaskDragSession',
    surfaces: ['list', 'mindmap', 'board', 'goal', 'gantt', 'calendar'],
    readiness: ['app-content'],
  },
] as const satisfies readonly PwaReloadSafetyOwnerManifestEntry[];

export const PWA_RELOAD_SAFETY_OWNER_IDS = PWA_RELOAD_SAFETY_OWNER_MANIFEST.map(entry => entry.ownerId);

export const getPwaReloadSafetyOwnerManifest = (currentView: PwaReloadSurface | null) => {
  // null means AuthGate is the complete visible shell and AppContent has not
  // mounted yet. Authenticated business owners do not exist at this boundary.
  if (currentView === null) return [];
  return PWA_RELOAD_SAFETY_OWNER_MANIFEST.filter(entry => (
    (entry.surfaces as readonly PwaReloadSurface[]).includes(currentView)
  ));
};
