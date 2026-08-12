import type { FirestoreUser } from '../types';

export const PROFILE_UPDATED_EVENT = 'projed-profile-updated';

export type ProfileUpdatedDetail = Pick<FirestoreUser, 'uid' | 'email' | 'displayName'>;

export const emitProfileUpdated = (user: ProfileUpdatedDetail): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProfileUpdatedDetail>(PROFILE_UPDATED_EVENT, {
    detail: user,
  }));
};
