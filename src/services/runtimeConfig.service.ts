function getRuntimeEnv() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string | undefined>;
  }

  return ((window as any).process?.env || {}) as Record<string, string | undefined>;
}

function hasRealValue(value?: string) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  return ![
    '',
    'YOUR_GOOGLE_CLIENT_ID_HERE',
    'YOUR_NGROK_OR_SERVER_URL_HERE',
    '%VITE_GOOGLE_CLIENT_ID%',
    '%VITE_API_BASE_URL%',
  ].includes(normalized);
}

export function getGoogleClientId() {
  const env = getRuntimeEnv();
  const clientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID;
  return hasRealValue(clientId) ? clientId! : '';
}

export function isGoogleConfiguredFromEnv() {
  return Boolean(getGoogleClientId());
}

export function getApiBaseUrl() {
  const env = getRuntimeEnv();
  const configuredBase = env.REACT_APP_API_BASE_URL || env.VITE_API_BASE_URL;

  if (hasRealValue(configuredBase)) {
    return configuredBase!.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.includes('localhost')
      ? 'http://localhost:8000'
      : window.location.origin.replace(/\/$/, '');
  }

  return 'http://localhost:8000';
}

export function getRuntimeConfigSnapshot() {
  return {
    googleClientId: getGoogleClientId(),
    googleConfigured: isGoogleConfiguredFromEnv(),
    apiBaseUrl: getApiBaseUrl(),
  };
}
