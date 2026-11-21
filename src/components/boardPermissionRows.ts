import type { PermissionCapability } from '../types';

/** Every configurable board capability must remain reachable in the settings UI. */
export const BOARD_PERMISSION_ROWS: ReadonlyArray<{ capability: PermissionCapability; label: string }> = [
  { capability: 'read_board', label: '查看看板' },
  { capability: 'create_task', label: '建立任務' },
  { capability: 'edit_task', label: '編輯任務' },
  { capability: 'move_task', label: '移動任務' },
  { capability: 'delete_task', label: '封存／永久刪除任務' },
  { capability: 'manage_task_reference', label: '管理任務參照' },
  { capability: 'assign_task', label: '指派任務' },
  { capability: 'create_dependency', label: '建立相依關係' },
  { capability: 'delete_dependency', label: '刪除相依關係' },
  { capability: 'manage_board_members', label: '管理看板成員' },
  { capability: 'edit_board_settings', label: '編輯看板設定' },
  { capability: 'move_board_between_workspaces', label: '跨工作區移動看板' },
  { capability: 'read_activity', label: '查看活動紀錄' },
  { capability: 'write_activity', label: '寫入活動紀錄' },
  { capability: 'read_audit', label: '查看稽核紀錄' },
  { capability: 'write_audit', label: '寫入稽核紀錄' },
];
