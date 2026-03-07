const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

export const API_BASE_URL = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/+$/, '')
  : 'http://localhost:3000';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const resolveApiHostname = (baseUrl: string) => {
  try {
    const fallbackOrigin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return new URL(baseUrl, fallbackOrigin).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const isLocalApiTarget = LOCAL_HOSTNAMES.has(resolveApiHostname(API_BASE_URL));
