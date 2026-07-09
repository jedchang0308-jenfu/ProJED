export type LeftPanelId = 'workspace-sidebar' | 'task-workbench';

const leftPanelStack: LeftPanelId[] = [];

const removePanel = (panelId: LeftPanelId) => {
  const index = leftPanelStack.indexOf(panelId);
  if (index >= 0) leftPanelStack.splice(index, 1);
};

export const markLeftPanelOpened = (panelId: LeftPanelId) => {
  removePanel(panelId);
  leftPanelStack.push(panelId);
};

export const markLeftPanelClosed = (panelId: LeftPanelId) => {
  removePanel(panelId);
};

export const getTopOpenLeftPanel = () => leftPanelStack[leftPanelStack.length - 1] ?? null;
