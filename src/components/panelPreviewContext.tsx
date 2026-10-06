import React from 'react';

export type PanelPreviewId = 'workspace-sidebar' | 'task-workbench';

type PanelPreviewContextValue = {
  previewedPanel: PanelPreviewId | null;
  setPreviewedPanel: (panelId: PanelPreviewId | null) => void;
};

const PanelPreviewContext = React.createContext<PanelPreviewContextValue>({
  previewedPanel: null,
  setPreviewedPanel: () => undefined,
});

export const PanelPreviewProvider = PanelPreviewContext.Provider;

// The hook intentionally stays next to its context so panel consumers share one preview state.
// eslint-disable-next-line react-refresh/only-export-components
export const usePanelPreview = () => React.useContext(PanelPreviewContext);
