import type { TaskNode } from '../types';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../features/taskWorkbench/placementModel';

export type TaskMeetingRecordUnsupportedReason =
  | 'account-unplaced'
  | 'meeting-board-mismatch'
  | 'identity-incomplete';

export type TaskMeetingRecordReadCapability =
  | {
      status: 'supported';
      workspaceId: string;
      boardId: string;
      taskId: string;
    }
  | { status: 'unsupported'; reason: 'account-unplaced' | 'identity-incomplete' };

export type TaskMeetingRecordAppendCapability =
  | { status: 'supported' }
  | { status: 'unsupported'; reason: TaskMeetingRecordUnsupportedReason };

export type TaskMeetingRecordCapability = {
  read: TaskMeetingRecordReadCapability;
  append: TaskMeetingRecordAppendCapability;
};

type TaskMeetingRecordNode = Pick<TaskNode, 'id' | 'workspaceId' | 'boardId'>;

export const resolveTaskMeetingRecordCapability = (
  node: TaskMeetingRecordNode | null | undefined,
  activeMeetingBoardId: string | null | undefined,
): TaskMeetingRecordCapability => {
  if (!node?.id || !node.workspaceId || !node.boardId) {
    return {
      read: { status: 'unsupported', reason: 'identity-incomplete' },
      append: { status: 'unsupported', reason: 'identity-incomplete' },
    };
  }

  if (node.boardId === TASK_WORKBENCH_UNPLACED_BOARD_ID) {
    return {
      read: { status: 'unsupported', reason: 'account-unplaced' },
      append: { status: 'unsupported', reason: 'account-unplaced' },
    };
  }

  const read: TaskMeetingRecordReadCapability = {
    status: 'supported',
    workspaceId: node.workspaceId,
    boardId: node.boardId,
    taskId: node.id,
  };

  return {
    read,
    append: activeMeetingBoardId === node.boardId
      ? { status: 'supported' }
      : { status: 'unsupported', reason: 'meeting-board-mismatch' },
  };
};

export const taskMeetingRecordScopeKey = (capability: TaskMeetingRecordReadCapability) => (
  capability.status === 'supported'
    ? `${capability.workspaceId}:${capability.boardId}:${capability.taskId}`
    : `unsupported:${capability.reason}`
);

export const taskMeetingRecordAvailabilityMessage = (
  capability: TaskMeetingRecordAppendCapability,
): string | null => {
  if (capability.status === 'supported') return null;
  if (capability.reason === 'account-unplaced') {
    return '請先將任務放入目前會議的看板，再新增會議紀錄。';
  }
  if (capability.reason === 'meeting-board-mismatch') {
    return '此任務屬於其他看板；請在原看板的會議中新增紀錄。';
  }
  return '目前任務無法載入會議紀錄。';
};
