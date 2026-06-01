import React from 'react';
import { StatusFilterBar } from './StatusFilterBar';
import { compactClassNames } from './compactTokens';

type ViewToolbarProps = {
  rightControls?: React.ReactNode;
  zIndex?: number;
};

export const ViewToolbar: React.FC<ViewToolbarProps> = ({ rightControls, zIndex = 110 }) => (
  <div
    className={compactClassNames.toolbar}
    style={{ zIndex }}
  >
    <div className={compactClassNames.toolbarLeft}>
      <StatusFilterBar />
    </div>

    {rightControls && (
      <div className={compactClassNames.toolbarRight}>
        {rightControls}
      </div>
    )}
  </div>
);
