export type AppIconIdentity = 'main' | 'quick-task';

const ICON_PATHS: Record<AppIconIdentity, string> = {
  main: '/icons/projed-main-icon-brand-20260921.png',
  'quick-task': '/icons/projed-quick-task-icon-brand-20260921.png',
};

const iconVersion = import.meta.env.VITE_PROJED_RELEASE_ID?.trim() || 'local';

const versionedIconUrl = (identity: AppIconIdentity) => {
  const iconUrl = new URL(ICON_PATHS[identity], window.location.origin);
  iconUrl.searchParams.set('projed_icon', iconVersion);
  return iconUrl.toString();
};

const upsertIconLink = (rel: 'icon' | 'apple-touch-icon', href: string) => {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.append(link);
  }
  if (rel === 'icon') link.type = 'image/png';
  if (link.href !== href) link.href = href;
};

export const refreshAppIconLinks = (identity: AppIconIdentity) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const href = versionedIconUrl(identity);
  upsertIconLink('icon', href);
  upsertIconLink('apple-touch-icon', href);
};

export const installAppIconRefresh = (identity: AppIconIdentity) => {
  if (typeof document === 'undefined') return () => undefined;

  const refreshWhenVisible = () => {
    if (document.visibilityState !== 'hidden') refreshAppIconLinks(identity);
  };

  refreshWhenVisible();
  document.addEventListener('visibilitychange', refreshWhenVisible);
  return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
};
