import React from 'react';
import { isCoarsePointer as getIsCoarsePointer } from '../utils/taskInteractions';

export const useCoarsePointer = () => {
  const [isCoarsePointer, setIsCoarsePointer] = React.useState(() => getIsCoarsePointer());

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(pointer: coarse)');
    const updatePointerMode = () => setIsCoarsePointer(query.matches);
    updatePointerMode();
    query.addEventListener?.('change', updatePointerMode);
    return () => query.removeEventListener?.('change', updatePointerMode);
  }, []);

  return isCoarsePointer;
};

