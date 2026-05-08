function getRuntimeEnv() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string | undefined>;
  }

  return ((window as any).process?.env || {}) as Record<string, string | undefined>;
}

function getBuildEnv() {
  return (import.meta.env || {}) as Record<string, string | undefined>;
}

export const API_BASE_OVERRIDE_STORAGE_KEY = 'clearflow-api-base-override-v1';

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
    '%VITE_GEMINI_API_KEY%',
  ].includes(normalized);
}

function normalizeBaseUrl(value?: string) {
  if (!hasRealValue(value)) {
    return '';
  }

  return value!.trim().replace(/\/$/, '');
}

function readApiBaseOverride() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return normalizeBaseUrl(window.localStorage.getItem(API_BASE_OVERRIDE_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

function buildApiSubdomainCandidate() {
  if (typeof window === 'undefined' || !window.location?.hostname || !window.location?.protocol) {
    return '';
  }

  const { hostname, protocol } = window.location;
  const normalizedHost = hostname.trim().toLowerCase();

  if (
    !normalizedHost ||
    normalizedHost === 'localhost' ||
    normalizedHost.endsWith('.localhost') ||
    /^[\d.]+$/.test(normalizedHost) ||
    normalizedHost.endsWith('.vercel.app') ||
    normalizedHost.startsWith('api.')
  ) {
    return '';
  }

  const rootHost = normalizedHost.startsWith('www.')
    ? normalizedHost.slice(4)
    : normalizedHost;

  return `${protocol}//api.${rootHost}`;
}

export function getConfiguredApiBaseUrl() {
  const override = readApiBaseOverride();
  if (override) {
    return override;
  }

  const env = getRuntimeEnv();
  const buildEnv = getBuildEnv();
  return (
    normalizeBaseUrl(env.REACT_APP_API_BASE_URL) ||
    normalizeBaseUrl(env.VITE_API_BASE_URL) ||
    normalizeBaseUrl(buildEnv.VITE_API_BASE_URL)
  );
}

export function getApiBaseCandidates() {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (value?: string) => {
    const normalized = normalizeBaseUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(getConfiguredApiBaseUrl());

  if (typeof window !== 'undefined' && window.location?.origin) {
    pushCandidate(buildApiSubdomainCandidate());

    if (window.location.origin.includes('localhost')) {
      pushCandidate('http://localhost:8000');
    }

    pushCandidate(window.location.origin);
  }

  if (!candidates.length) {
    pushCandidate('http://localhost:8000');
  }

  return candidates;
}

export function setApiBaseOverride(baseUrl?: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeBaseUrl(baseUrl || '');

  try {
    if (normalized) {
      window.localStorage.setItem(API_BASE_OVERRIDE_STORAGE_KEY, normalized);
      return;
    }

    window.localStorage.removeItem(API_BASE_OVERRIDE_STORAGE_KEY);
  } catch {
    // ignore local storage errors
  }
}

export function getGoogleClientId() {
  const env = getRuntimeEnv();
  const buildEnv = getBuildEnv();
  const clientId =
    env.GOOGLE_CLIENT_ID ||
    env.VITE_GOOGLE_CLIENT_ID ||
    buildEnv.VITE_GOOGLE_CLIENT_ID;
  return hasRealValue(clientId) ? clientId! : '';
}

export function isGoogleConfiguredFromEnv() {
  return Boolean(getGoogleClientId());
}

export function getApiBaseUrl() {
  const configuredBase = getConfiguredApiBaseUrl();
  if (configuredBase) {
    return configuredBase;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const apiSubdomainCandidate = buildApiSubdomainCandidate();
    if (apiSubdomainCandidate) {
      return apiSubdomainCandidate;
    }

    return window.location.origin.includes('localhost')
      ? 'http://localhost:8000'
      : window.location.origin.replace(/\/$/, '');
  }

  return 'http://localhost:8000';
}

export function getGeminiApiKey() {
  const env = getRuntimeEnv();
  const buildEnv = getBuildEnv();
  const apiKey = env.API_KEY || env.VITE_GEMINI_API_KEY || buildEnv.VITE_GEMINI_API_KEY;
  return hasRealValue(apiKey) ? apiKey! : '';
}

export function getRuntimeConfigSnapshot() {
  return {
    googleClientId: getGoogleClientId(),
    googleConfigured: isGoogleConfiguredFromEnv(),
    apiBaseUrl: getApiBaseUrl(),
    geminiConfigured: Boolean(getGeminiApiKey()),
  };
}
