import React from 'react';
import useBoardStore from '../../store/useBoardStore';
import useDialogStore from '../../store/useDialogStore';
import { useWbsStore } from '../../store/useWbsStore';

export const useTableDependencySelection = (boardId: string, canCreateDependency: boolean) => {
  const selection = useBoardStore(state => state.dependencySelection);
  const close = React.useCallback(() => useBoardStore.getState().setDependencySelection(null), []);
  const showMarkers = useBoardStore(state => state.showDependencies);
  const dependencies = useWbsStore(state => state.dependencies);
  const markers = React.useMemo(
    () => useWbsStore.getState().getDependencyMarkers(),
    // Markers are derived from the current dependency set.
    [dependencies],
  );

  React.useEffect(() => close, [boardId, close]);
  React.useEffect(() => {
    if (!selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isComposing && event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, selection]);

  const selectTarget = async (taskId: string, side: 'start' | 'end', title: string) => {
    if (!canCreateDependency || !selection) return;
    const isSelf = taskId === selection.id;
    if (isSelf && side === selection.side) {
      close();
      return;
    }
    if (isSelf && selection.side === 'start') {
      close();
      await useDialogStore.getState().showConfirm('請從任務的結束日開始設定工期。');
      return;
    }
    const message = isSelf
      ? `請設定任務 [${title}] 的工作天數（0 為同日）。`
      : `請設定 [${selection.title}] 依賴於 [${title}] 的間隔工作天數（0 為銜接，負數為重疊，正數為延遲）。`;
    const input = await useDialogStore.getState().showPrompt(message, '0');
    const state = useBoardStore.getState();
    if (state.dependencySelection !== selection || state.activeBoardId !== boardId) return;
    close();
    if (input === null || !/^-?\d+$/.test(input.trim())) return;
    const offset = Number(input);
    if (!Number.isSafeInteger(offset) || (isSelf && offset < 0)) return;
    useWbsStore.getState().addDependency({
      id: `dep_${crypto.randomUUID()}`,
      fromId: taskId,
      fromSide: side,
      toId: selection.id,
      toSide: selection.side,
      offset,
    });
  };

  return { selection, close, showMarkers, markers, selectTarget };
};
