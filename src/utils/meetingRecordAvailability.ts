import React from 'react';

const MOBILE_MEETING_MAX_WIDTH = 640;

export const isMeetingRecordUnavailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const smallViewport = typeof window.matchMedia === 'function'
    && window.matchMedia(`(max-width: ${MOBILE_MEETING_MAX_WIDTH}px)`).matches;
  return coarsePointer || smallViewport;
};

export const useMeetingRecordAvailability = () => {
  const [unavailable, setUnavailable] = React.useState(isMeetingRecordUnavailable);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const queries = [
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia(`(max-width: ${MOBILE_MEETING_MAX_WIDTH}px)`),
    ];
    const update = () => setUnavailable(isMeetingRecordUnavailable());
    queries.forEach(query => query.addEventListener?.('change', update));
    update();
    return () => queries.forEach(query => query.removeEventListener?.('change', update));
  }, []);

  return {
    isMeetingRecordUnavailable: unavailable,
    isMeetingRecordAvailable: !unavailable,
  };
};

