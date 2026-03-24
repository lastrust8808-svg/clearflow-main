import { getRuntimeConfigSnapshot } from './runtimeConfig.service';

export interface IntegrationStatusSnapshot {
  backendReachable: boolean;
  apiBaseUrl: string;
  googleConfigured: boolean;
  googleClientIdPresent: boolean;
  smtpConfigured: boolean;
  smsConfigured: boolean;
  smsProvider: string | null;
  plaidConfigured: boolean;
}

export async function loadIntegrationStatus(): Promise<IntegrationStatusSnapshot> {
  const runtime = getRuntimeConfigSnapshot();

  try {
    const response = await fetch(`${runtime.apiBaseUrl}/api/auth/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Integration status endpoint unavailable.');
    }

    const payload = (await response.json()) as {
      success: boolean;
      status: {
        smtpConfigured: boolean;
        smsConfigured: boolean;
        smsProvider: string | null;
        plaidConfigured: boolean;
      };
    };

    return {
      backendReachable: true,
      apiBaseUrl: runtime.apiBaseUrl,
      googleConfigured: runtime.googleConfigured,
      googleClientIdPresent: Boolean(runtime.googleClientId),
      smtpConfigured: payload.status.smtpConfigured,
      smsConfigured: payload.status.smsConfigured,
      smsProvider: payload.status.smsProvider,
      plaidConfigured: payload.status.plaidConfigured,
    };
  } catch {
    return {
      backendReachable: false,
      apiBaseUrl: runtime.apiBaseUrl,
      googleConfigured: runtime.googleConfigured,
      googleClientIdPresent: Boolean(runtime.googleClientId),
      smtpConfigured: false,
      smsConfigured: false,
      smsProvider: null,
      plaidConfigured: false,
    };
  }
}
