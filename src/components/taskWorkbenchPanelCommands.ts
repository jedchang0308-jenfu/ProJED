import useAuthStore from '../store/useAuthStore';
import {
  readTaskWorkbenchPanelPrefs,
  writeTaskWorkbenchPanelPrefs,
  type TaskWorkbenchPanelPrefs,
} from '../features/taskWorkbench/preferences';

export const OPEN_PANEL_EVENT = 'projed:open-task-workbench-panel';
export const TOGGLE_PANEL_EVENT = 'projed:toggle-task-workbench-panel';
export const CLOSE_PANEL_EVENT = 'projed:close-task-workbench-panel';

const getCurrentAccountId = () => useAuthStore.getState().user?.uid ?? null;

const writePanelOpenPrefs = (updates: Pick<TaskWorkbenchPanelPrefs, 'open' | 'filtersOpen'>) => {
  const accountId = getCurrentAccountId();
  const current = readTaskWorkbenchPanelPrefs(accountId);
  writeTaskWorkbenchPanelPrefs({
    ...current,
    ...updates,
  }, accountId);
};

export const openTaskWorkbenchPanel = () => {
  writePanelOpenPrefs({ open: true, filtersOpen: false });
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT));
};

export const toggleTaskWorkbenchPanel = () => {
  const accountId = getCurrentAccountId();
  const current = readTaskWorkbenchPanelPrefs(accountId);
  writeTaskWorkbenchPanelPrefs({
    ...current,
    open: !current.open,
    filtersOpen: false,
  }, accountId);
  window.dispatchEvent(new CustomEvent(TOGGLE_PANEL_EVENT));
};

export const closeTaskWorkbenchPanel = () => {
  writePanelOpenPrefs({ open: false, filtersOpen: false });
  window.dispatchEvent(new CustomEvent(CLOSE_PANEL_EVENT));
};
