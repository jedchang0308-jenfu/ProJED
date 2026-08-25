export const persistTaskCreationBeforeActivity = async (
  persistTask: () => Promise<unknown>,
  logActivity: () => void | Promise<void>,
): Promise<void> => {
  await persistTask();
  await logActivity();
};
