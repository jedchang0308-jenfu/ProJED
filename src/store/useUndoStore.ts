/**
 * useUndoStore — 全域 Undo / Redo 狀態管理（Command Pattern）
 *
 * 設計意圖：
 * 採用「指令堆疊」而非「狀態快照」，原因是：
 * 1. 記憶體效率高 — 只儲存反向操作函式，不複製整份看板狀態
 * 2. 與 Firestore 同步完美相容 — Undo 就是再執行一次反向的正常操作，
 *    自然觸發 Firestore 樂觀寫入，不干擾 onSnapshot 監聽器
 *
 * 使用方式：
 *   const { pushUndo } = useUndoStore.getState();
 *   pushUndo({
 *     label: '修改卡片標題',
 *     undo: () => updateCard(wsId, bId, lId, cId, { title: oldTitle }),
 *     redo: () => updateCard(wsId, bId, lId, cId, { title: newTitle }),
 *   });
 *
 * 堆疊上限：MAX_STACK_SIZE = 50 步
 */
import { create } from 'zustand';
import type { UndoStore, UndoCommand } from '../types';

/** 最多保留 50 步 */
const MAX_STACK_SIZE = 50;

const useUndoStore = create<UndoStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  /**
   * pushUndo — 推入一筆可復原指令
   * 設計意圖：
   * - 任何新操作發生時，清空 redoStack（不可再「下一步」已被覆蓋的操作）
   * - 超過上限時，從底部移除最舊的指令
   */
  pushUndo: (command: UndoCommand) => {
    set((state) => {
      const newStack = [...state.undoStack, command];
      // 超過上限時，移除最舊的紀錄（從頭部 shift）
      if (newStack.length > MAX_STACK_SIZE) {
        newStack.shift();
      }
      return {
        undoStack: newStack,
        redoStack: [], // 任何新操作都清空 redoStack
      };
    });
  },

  /**
   * undo — 執行上一步
   * 設計意圖：
   * - 從 undoStack 頂部取出指令
   * - 執行其 undo() 函式（觸發反向的 Store action，自動寫入 Firestore）
   * - 將該指令推入 redoStack 以供重做
   */
  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return;

    const command = undoStack[undoStack.length - 1];
    command.undo(); // 執行反向操作

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, command],
    });
  },

  /**
   * redo — 執行下一步
   * 設計意圖：
   * - 從 redoStack 頂部取出指令
   * - 執行其 redo() 函式（重新執行正向操作）
   * - 將該指令推回 undoStack
   */
  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return;

    const command = redoStack[redoStack.length - 1];
    command.redo(); // 重新執行正向操作

    set({
      undoStack: [...undoStack, command],
      redoStack: redoStack.slice(0, -1),
    });
  },

  /**
   * clear — 清空所有堆疊
   * 設計意圖：切換看板時應清空 Undo 歷史，
   * 避免在不同看板之間混用操作紀錄，造成資料錯亂。
   */
  clear: () => set({ undoStack: [], redoStack: [] }),

  /** canUndo — 供 UI 決定按鈕是否可點擊 */
  canUndo: () => get().undoStack.length > 0,

  /** canRedo — 供 UI 決定按鈕是否可點擊 */
  canRedo: () => get().redoStack.length > 0,
}));

export default useUndoStore;
