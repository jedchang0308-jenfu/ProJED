import type { TaskNode } from '../../types';
import type {
  BoardTaskOrderIntent as SharedIntent,
  BoardTaskOrderCommand as SharedCommand,
} from '../../../shared/boardTaskOrder';

export {
  compareBoardTaskOrder,
  projectBoardTaskOrder,
  type BoardTaskOrderDestination,
  type BoardTaskOrderPatch,
  type BoardTaskOrderResult,
} from '../../../shared/boardTaskOrder';
export type BoardTaskOrderIntent = SharedIntent<TaskNode>;
export type BoardTaskOrderCommand = SharedCommand<TaskNode>;
