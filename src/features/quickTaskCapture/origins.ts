const MAIN_PRODUCTION_ORIGIN = 'https://projed-cc78d.web.app';
const QUICK_PRODUCTION_ORIGIN = 'https://projed-cc78d.firebaseapp.com';

export const getQuickInstallUrl = (origin: string): string => origin === MAIN_PRODUCTION_ORIGIN
  ? `${QUICK_PRODUCTION_ORIGIN}/quick-task/?install=1`
  : '/quick-task/?install=1';

export const getWorkbenchUrl = (origin: string): string => origin === QUICK_PRODUCTION_ORIGIN
  ? `${MAIN_PRODUCTION_ORIGIN}/?quick_workbench=1`
  : '/?quick_workbench=1';

export const isMainProductionOrigin = (origin: string): boolean => origin === MAIN_PRODUCTION_ORIGIN;
export const isQuickProductionOrigin = (origin: string): boolean => origin === QUICK_PRODUCTION_ORIGIN;
