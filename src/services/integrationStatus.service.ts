import { getRuntimeConfigSnapshot } from './runtimeConfig.service';

export type ProviderVerificationState = 'unverified' | 'connected' | 'verified' | 'failed';
export interface ProviderStatus { configured: boolean; state: ProviderVerificationState }

export interface IntegrationStatusSnapshot {
  backendReachable: boolean;
  apiBaseUrl: string;
  googleConfigured: boolean;
  googleClientIdPresent: boolean;
  smtpConfigured: boolean;
  smsConfigured: boolean;
  smsProvider: string | null;
  plaidConfigured: boolean;
  integrationStates: Record<'plaid' | 'smtp' | 'sms', ProviderStatus>;
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
        integrationStates?: Partial<Record<'plaid' | 'smtp' | 'sms', ProviderStatus>>;
      };
    };

    const unverified = (configured: boolean): ProviderStatus => ({ configured, state: 'unverified' });
    return {
      integrationStates: {
        plaid: payload.status.integrationStates?.plaid ?? unverified(payload.status.plaidConfigured),
        smtp: payload.status.integrationStates?.smtp ?? unverified(payload.status.smtpConfigured),
        sms: payload.status.integrationStates?.sms ?? unverified(payload.status.smsConfigured),
      },
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
      integrationStates: {
        plaid: { configured: false, state: 'unverified' },
        smtp: { configured: false, state: 'unverified' },
        sms: { configured: false, state: 'unverified' },
      },
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
