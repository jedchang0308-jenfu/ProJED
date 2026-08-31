import { useEffect, useRef } from 'react';
import {
  registerPwaReloadSafetyOwner,
  type PwaReloadSafetyOwner,
} from '../services/pwaReloadSafety';

type PwaReloadSafetyOwnerInput = PwaReloadSafetyOwner;

/** React-to-domain adapter; components never call a worker or navigate. */
export const usePwaReloadSafetyOwner = (owner: PwaReloadSafetyOwnerInput) => {
  const ownerRef = useRef(owner);

  useEffect(() => {
    ownerRef.current = owner;
  }, [owner]);

  useEffect(() => {
    const registeredOwner: PwaReloadSafetyOwner = {
      ownerId: owner.ownerId,
      getSnapshot: () => ownerRef.current.getSnapshot(),
      prepareForReload: () => ownerRef.current.prepareForReload(),
    };
    try {
      return registerPwaReloadSafetyOwner(registeredOwner);
    } catch (error) {
      console.warn('[PWA] Failed to register reload-safety owner:', error);
      return undefined;
    }
  }, [owner.ownerId]);
};
