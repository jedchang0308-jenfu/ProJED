import type { Board } from '../types';

// The workspace list can refresh between the optimistic insert and the POST response.
export function reconcileCreatedBoard(boards: Board[], pendingId: string, created: Board): Board[] {
  if (boards.some(board => board.id === created.id)) {
    // The list already contains the committed row, including current Session capabilities.
    return boards.filter(board => board.id !== pendingId);
  }
  if (boards.some(board => board.id === pendingId)) {
    return boards.map(board => board.id === pendingId ? created : board);
  }
  return [...boards, created];
}
