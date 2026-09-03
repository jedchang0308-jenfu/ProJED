import type { TaskActionDefinition, TaskActionId, TaskInteractionProfile } from './types';

const ACTION_CATALOG: readonly TaskActionDefinition[] = Object.freeze([
  { id: 'task.create-sibling', label: '新增同階任務', icon: 'plus', section: 'create', kind: 'mutation', capability: 'create' },
  { id: 'task.create-child', label: '新增子任務', icon: 'git-branch', section: 'create', kind: 'mutation', capability: 'create' },
  { id: 'task.create-relationship', label: '建立關聯線', icon: 'link-2', section: 'create', kind: 'transient', capability: 'edit' },
  { id: 'task.duplicate', label: '複製任務', icon: 'copy', section: 'create', kind: 'mutation', capability: 'create' },
  { id: 'task.create-tracking-reference', label: '建立追蹤副本', icon: 'link-2', section: 'create', kind: 'mutation', capability: 'tracking-reference' },
  { id: 'task.remove-tracking-reference', label: '移除此處追蹤', icon: 'unlink', section: 'danger', kind: 'danger', capability: 'tracking-reference' },
  { id: 'task.assign', label: '指派成員', icon: 'user-round', section: 'assignment', kind: 'mutation', capability: 'assign' },
  { id: 'task.dependency-start', label: '建立開始依賴', icon: 'arrow-right-left', section: 'dependency', kind: 'transient', capability: 'dependency' },
  { id: 'task.dependency-end', label: '建立結束依賴', icon: 'arrow-right-left', section: 'dependency', kind: 'transient', capability: 'dependency' },
  { id: 'task.promote', label: '提升階層', icon: 'corner-left-up', section: 'hierarchy', kind: 'mutation', capability: 'move' },
  { id: 'task.demote', label: '降為子任務', icon: 'corner-right-down', section: 'hierarchy', kind: 'mutation', capability: 'move' },
  { id: 'task.archive', label: '封存任務', icon: 'archive', section: 'lifecycle', kind: 'mutation', capability: 'delete' },
  { id: 'task.collect', label: '收藏任務', icon: 'archive-box', section: 'lifecycle', kind: 'mutation', capability: 'collect' },
  { id: 'task.select', label: '選取任務', icon: 'mouse-pointer-2', section: null, kind: 'selection' },
  { id: 'task.open-details', label: '開啟詳情', icon: 'panel-right', section: null, kind: 'navigation' },
  { id: 'task.open-details-for-naming', label: '開啟詳情並命名', icon: 'panel-right', section: null, kind: 'navigation' },
  { id: 'task.switch-to-list', label: '切換至清單', icon: 'list-checks', section: null, kind: 'navigation' },
  { id: 'task.open-menu', label: '開啟操作選單', icon: 'menu', section: null, kind: 'presentation' },
  { id: 'task.clear-selection', label: '清除選取', icon: 'x', section: null, kind: 'selection' },
  { id: 'task.toggle-complete', label: '切換完成狀態', icon: 'check', section: null, kind: 'mutation', capability: 'edit' },
  { id: 'mindmap.select-parent', label: '選取父節點', icon: 'arrow-up', section: null, kind: 'selection' },
  { id: 'mindmap.select-first-child', label: '選取第一個子節點', icon: 'arrow-down', section: null, kind: 'selection' },
  { id: 'mindmap.select-previous', label: '選取上一個節點', icon: 'arrow-left', section: null, kind: 'selection' },
  { id: 'mindmap.select-next', label: '選取下一個節點', icon: 'arrow-right', section: null, kind: 'selection' },
]);

export const getTaskActionCatalog = (): readonly TaskActionDefinition[] => ACTION_CATALOG;

export const getTaskActionDefinition = (actionId: TaskActionId): TaskActionDefinition | undefined => (
  ACTION_CATALOG.find(action => action.id === actionId)
);

const menuActionIds = ACTION_CATALOG
  .filter(action => action.section !== null)
  .map(action => action.id);

export const getTaskMenuActionIds = (profiles: readonly TaskInteractionProfile[] = []): readonly TaskActionId[] => {
  const included = new Set<TaskActionId>(menuActionIds);
  const explicitlyIncluded = new Set<TaskActionId>();
  const excluded = new Set<TaskActionId>();
  for (const profile of profiles) {
    for (const actionId of profile.menu?.include || []) {
      included.add(actionId);
      explicitlyIncluded.add(actionId);
    }
    for (const actionId of profile.menu?.exclude || []) excluded.add(actionId);
  }
  return ACTION_CATALOG
    .filter(action => (action.section !== null || explicitlyIncluded.has(action.id)) && included.has(action.id) && !excluded.has(action.id))
    .map(action => action.id);
};

export const assertTaskActionCatalog = (): void => {
  const seen = new Set<TaskActionId>();
  for (const action of ACTION_CATALOG) {
    if (seen.has(action.id)) throw new Error(`Duplicate task action id: ${action.id}`);
    seen.add(action.id);
  }
};
