export const BOARD_INVITE_TOKEN_PARAM = 'boardInviteToken';
const LOCAL_INVITE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const generateBoardInviteToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const hashBoardInviteToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const getConfiguredInviteBaseUrl = () => {
  const configuredBase = import.meta.env.VITE_PROJED_APP_URL?.trim();
  if (!configuredBase) return null;
  try {
    const url = new URL(configuredBase);
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    console.warn('[BoardInvite] VITE_PROJED_APP_URL 不是有效網址，改用目前頁面網址。');
    return null;
  }
};

export const isLocalBoardInviteUrl = (urlValue: string) => {
  try {
    return LOCAL_INVITE_HOSTS.has(new URL(urlValue).hostname);
  } catch {
    return false;
  }
};

export const buildBoardInviteUrl = (token: string) => {
  const url = getConfiguredInviteBaseUrl() ?? new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(BOARD_INVITE_TOKEN_PARAM, token);
  return url.toString();
};
