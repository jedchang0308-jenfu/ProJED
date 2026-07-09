const PANEL_PREFS_KEY = 'projed-task-workbench-panel:v1';

export const OPEN_PANEL_EVENT = 'projed:open-task-workbench-panel';
export const TOGGLE_PANEL_EVENT = 'projed:toggle-task-workbench-panel';
export const CLOSE_PANEL_EVENT = 'projed:close-task-workbench-panel';

type PanelPrefs = {
  open: boolean;
  filtersOpen: boolean;
  showContainersInAllTasks: boolean;
};

const writePanelOpenPrefs = (updates: Pick<PanelPrefs, 'open' | 'filtersOpen'>) => {
  try {
    const current = JSON.parse(window.localStorage.getItem(PANEL_PREFS_KEY) || '{}') as Partial<PanelPrefs>;
    window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify({
      ...current,
      ...updates,
      showContainersInAllTasks: Boolean(current.showContainersInAllTasks),
    }));
  } catch {
    // Best-effort UI preference.
  }
};

export const openTaskWorkbenchPanel = () => {
  writePanelOpenPrefs({ open: true, filtersOpen: false });
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT));
};

export const toggleTaskWorkbenchPanel = () => {
  try {
    const current = JSON.parse(window.localStorage.getItem(PANEL_PREFS_KEY) || '{}') as Partial<PanelPrefs>;
    window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify({
      ...current,
      open: current.open !== true,
      filtersOpen: false,
      showContainersInAllTasks: Boolean(current.showContainersInAllTasks),
    }));
  } catch {
    // Best-effort UI preference.
  }
  window.dispatchEvent(new CustomEvent(TOGGLE_PANEL_EVENT));
};

export const closeTaskWorkbenchPanel = () => {
  writePanelOpenPrefs({ open: false, filtersOpen: false });
  window.dispatchEvent(new CustomEvent(CLOSE_PANEL_EVENT));
};
