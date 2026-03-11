const configuredBaseUrlRaw = (import.meta.env.VITE_API_URL
  ?? import.meta.env.VITE_API_BASE_URL) as string | undefined;
const configuredBaseUrl = configuredBaseUrlRaw?.trim();

const resolveDefaultApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:5000';
  }

  const { protocol, hostname, port, origin } = window.location;
  if (!hostname || protocol === 'file:') {
    return 'http://localhost:5000';
  }

  // Vite dev server usually runs on 5173/4173 while backend runs on 5000.
  if (port === '5173' || port === '4173') {
    return `${protocol}//${hostname}:5000`;
  }

  // In deployed setups, default to same-origin API unless explicitly overridden.
  return origin;
};

export const API_BASE_URL = (configuredBaseUrl || resolveDefaultApiBaseUrl()).replace(/\/+$/, '');

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
