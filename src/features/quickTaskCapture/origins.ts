const MAIN_PRODUCTION_ORIGIN = 'https://projed-cc78d.web.app';
const QUICK_PRODUCTION_ORIGIN = 'https://projed-cc78d.firebaseapp.com';
const CLOUD_MAIN_ORIGIN = 'https://projed-prod-9536592944.asia-east1.run.app';
const CLOUD_QUICK_ORIGIN = 'https://projed-prod-56gnizku7q-de.a.run.app';
const entryPairs = [
  { main: MAIN_PRODUCTION_ORIGIN, quick: QUICK_PRODUCTION_ORIGIN },
  { main: CLOUD_MAIN_ORIGIN, quick: CLOUD_QUICK_ORIGIN },
] as const;

export const getQuickCaptureUrl = (origin: string): string => {
  const pair = entryPairs.find(value => value.main === origin);
  return pair ? `${pair.quick}/quick-task/` : '/quick-task/';
};

export const getQuickInstallUrl = (origin: string): string => `${getQuickCaptureUrl(origin)}?install=1`;

export const getMainInstallUrl = (origin: string): string => {
  const pair = entryPairs.find(value => value.quick === origin);
  return pair ? `${pair.main}/` : '/';
};

export const getWorkbenchUrl = (origin: string): string => {
  const pair = entryPairs.find(value => value.quick === origin);
  return pair ? `${pair.main}/?quick_workbench=1` : '/?quick_workbench=1';
};

export const isMainProductionOrigin = (origin: string): boolean => entryPairs.some(value => value.main === origin);
export const isQuickProductionOrigin = (origin: string): boolean => entryPairs.some(value => value.quick === origin);
