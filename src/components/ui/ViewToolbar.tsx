import React from 'react';
import { compactClassNames } from './compactTokens';

type ViewToolbarProps = {
  rightControls?: React.ReactNode;
  zIndex?: number;
};

export const ViewToolbar: React.FC<ViewToolbarProps> = ({ rightControls, zIndex = 110 }) => {
  if (!rightControls) return null;

  return (
    <div
      className={compactClassNames.toolbar}
      style={{ zIndex }}
    >
      <div className="flex flex-1" />
      <div className={compactClassNames.toolbarRight}>
        {rightControls}
      </div>
    </div>
  );
};
