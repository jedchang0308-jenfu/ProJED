export const MINDMAP_MESSAGES = {
  selectBoardPrompt: '請先選擇一個看板',
  noCreateTaskPermission: '目前沒有新增任務權限',
  noEditTaskPermission: '目前沒有編輯任務權限',
  noEditRelationshipPermission: '目前沒有編輯關聯線權限',
  relationshipSelfLinkBlocked: '關聯線不能連到同一個任務',
  dragWouldCreateChildCycle: '不能把任務拖到自己的子任務底下',
  dragWouldCreateHierarchyCycle: '這個拖曳會造成階層循環',
} as const;
