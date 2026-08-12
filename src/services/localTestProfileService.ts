import type { CollaborationMemberProfile } from '../types';

const LOCAL_TEST_PROFILE_OVERRIDES_KEY = 'projed-local-test.profile-overrides';

type LocalTestProfileOverrides = Record<string, Pick<CollaborationMemberProfile, 'displayName'>>;

const readOverrides = (): LocalTestProfileOverrides => {
  if (typeof localStorage === 'undefined') return {};

  try {
    const stored = localStorage.getItem(LOCAL_TEST_PROFILE_OVERRIDES_KEY);
    return stored ? JSON.parse(stored) as LocalTestProfileOverrides : {};
  } catch {
    return {};
  }
};

export const getLocalTestProfileOverride = (userId: string) => readOverrides()[userId];

export const saveLocalTestProfileOverride = (userId: string, displayName: string): void => {
  if (typeof localStorage === 'undefined') return;

  const overrides = readOverrides();
  localStorage.setItem(
    LOCAL_TEST_PROFILE_OVERRIDES_KEY,
    JSON.stringify({
      ...overrides,
      [userId]: { displayName },
    }),
  );
};
