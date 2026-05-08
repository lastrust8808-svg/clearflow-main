import { PlaidSignalResponse, PlaidAuthResponse, PlaidVerificationStatus, PlaidIdentityData, PlaidIdentityMatchScores, PlaidConnectionPayload, PlaidTransaction } from '../types/app.models';
import {
  getApiBaseCandidates,
  getConfiguredApiBaseUrl,
  setApiBaseOverride,
} from './runtimeConfig.service';

// In a real app, these would be more detailed models
interface PlaidUser { [key: string]: any; }
interface PlaidDevice { [key: string]: any; }

interface SignalEvaluatePayload {
  itemId: string;
  accountId: string;
  amount: number;
  clientTransactionId: string;
  clientUserId?: string;
  user?: PlaidUser;
  device?: PlaidDevice;
}

class PlaidService {
  private isLocalRuntime(): boolean {
    if (typeof window === 'undefined' || !window.location?.origin) {
      return false;
    }

    return window.location.origin.includes('localhost');
  }

  private shouldUseMockBackend(): boolean {
    return !getConfiguredApiBaseUrl() && this.isLocalRuntime();
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const failures: string[] = [];

    for (const baseUrl of getApiBaseCandidates()) {
      try {
        const response = await fetch(`${baseUrl}${path}`, init);
        const contentType = response.headers.get('content-type') || '';

        if (!response.ok) {
          let detail = `${response.status} ${response.statusText}`.trim();

          try {
            if (contentType.includes('application/json')) {
              const payload = await response.json();
              detail =
                payload?.error ||
                payload?.message ||
                payload?.detail ||
                detail;
            } else {
              const text = (await response.text()).trim();
              if (text) {
                detail = text.slice(0, 180);
              }
            }
          } catch {
            // keep status text detail
          }

          failures.push(`${baseUrl}: ${detail}`);
          continue;
        }

        if (!contentType.includes('application/json')) {
          failures.push(`${baseUrl}: non-JSON response returned from API route.`);
          continue;
        }

        const payload = (await response.json()) as T;
        setApiBaseOverride(baseUrl);
        return payload;
      } catch (error) {
        failures.push(
          `${baseUrl}: ${error instanceof Error ? error.message : 'request failed'}`
        );
      }
    }

    throw new Error(
      failures.length
        ? `ClearFlow could not reach the live banking service. ${failures[0]}`
        : 'ClearFlow could not reach the live banking service.'
    );
  }

  // ============== REAL API IMPLEMENTATIONS ==============

  async createLinkToken(userId: string): Promise<{ link_token: string }> {
    if (this.shouldUseMockBackend()) {
      console.warn('Backend not configured, using mock link token.');
      return Promise.resolve({ link_token: `link-sandbox-mock-${Date.now()}`});
    }

    return this.requestJson<{ link_token: string }>('/api/plaid/link_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
  }

  async exchangePublicToken(publicToken: string, userId: string, userName: string): Promise<PlaidConnectionPayload> {
    if (this.shouldUseMockBackend()) {
       console.warn('Backend not configured, using mock exchange.');
       const authResponse = await this.getMockAuth('mock-token');
       const identityData = await this.getMockIdentity('mock-token', userName);
       const bankOwnerName = identityData.accounts[0].owners[0].names[0] || '';
       const identityMatchScores = await this.getMockMatchIdentity(userName, bankOwnerName);
       return { authResponse, identityData, identityMatchScores, itemId: `mock-item-${Date.now()}` };
    }

    return this.requestJson<PlaidConnectionPayload>('/api/plaid/exchange_public_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken, userId, userName })
    });
  }

  async getTransactions(itemId: string): Promise<PlaidTransaction[]> {
     if (this.shouldUseMockBackend()) return Promise.resolve([]);
     return this.requestJson<PlaidTransaction[]>(`/api/plaid/transactions/${itemId}`);
  }
  
  async syncTransactions(itemId: string): Promise<PlaidTransaction[]> {
    if (this.shouldUseMockBackend()) return Promise.resolve([]);
    return this.requestJson<PlaidTransaction[]>('/api/plaid/transactions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
  }


  async getAuth(itemId: string, initialAmount?: number): Promise<PlaidAuthResponse> {
    if (this.shouldUseMockBackend()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for getAuth.');
      return this.getMockAuth(itemId, initialAmount);
    }
    return this.requestJson<PlaidAuthResponse>('/api/plaid/auth/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, initialAmount })
    });
  }

  async getIdentity(itemId: string, userName: string): Promise<PlaidIdentityData> {
     if (this.shouldUseMockBackend()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for getIdentity.');
      return this.getMockIdentity(itemId, userName);
    }
     return this.requestJson<PlaidIdentityData>('/api/plaid/identity/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, userName })
    });
  }

  async matchIdentity(userName: string, bankName: string): Promise<PlaidIdentityMatchScores> {
    if (this.shouldUseMockBackend()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for matchIdentity.');
      return this.getMockMatchIdentity(userName, bankName);
    }
    return this.requestJson<PlaidIdentityMatchScores>('/api/plaid/identity/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName, bankName }) // bankName is used for simulation on backend
    });
  }

  async signalPrepare(itemId: string): Promise<{ status: string }> {
    if (this.shouldUseMockBackend()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for signalPrepare.');
      return this.getMockSignalPrepare(itemId);
    }
    return this.requestJson<{ status: string }>('/api/plaid/signal/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
  }

  async signalEvaluate(payload: SignalEvaluatePayload): Promise<PlaidSignalResponse> {
    if (this.shouldUseMockBackend()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for signalEvaluate.');
      return this.getMockSignalEvaluate(payload);
    }
     return this.requestJson<PlaidSignalResponse>('/api/plaid/signal/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // ============== MOCK IMPLEMENTATIONS (FALLBACK) ==============

  private async getMockAuth(itemId: string, initialAmount?: number): Promise<PlaidAuthResponse> {
    await new Promise(resolve => setTimeout(resolve, 700));

    let verification_status: PlaidVerificationStatus = 'automatically_verified';
    let isTokenized = false;
    
    if (initialAmount) {
      const cents = Math.round((initialAmount - Math.floor(initialAmount)) * 100);
      if (cents === 88) verification_status = 'pending_manual_verification';
      if (cents === 77) isTokenized = true;
    }
    
    return {
      accounts: [{ account_id: 'Bx61bADbAsbAb61bADbAsbAb', verification_status }],
      numbers: { ach: [{ account: `xxxxxx${Math.floor(1000 + Math.random() * 9000)}`, routing: '011000015', isTokenized }] }
    };
  }

  private async getMockIdentity(itemId: string, userName: string): Promise<PlaidIdentityData> {
    await new Promise(resolve => setTimeout(resolve, 600));
    let bankName = userName;
    if (userName.toLowerCase().includes('stepup')) bankName = 'Dev M. User';
    else if (userName.toLowerCase().includes('fail')) bankName = 'Jane Doe';
    else if (userName.toLowerCase().includes('business')) bankName = 'Clear-Flow LLC';
    return { accounts: [{ owners: [{ names: [bankName] }] }] };
  }

  private async getMockMatchIdentity(userName: string, bankName: string): Promise<PlaidIdentityMatchScores> {
    await new Promise(resolve => setTimeout(resolve, 400));
    const userParts = userName.toLowerCase().split(' ');
    const bankParts = bankName.toLowerCase().split(' ');
    let score = 40;
    if (userParts.every(part => bankParts.includes(part))) score = 95;
    else if (userParts.some(part => bankParts.includes(part))) score = 75;
    return { legal_name: { score } };
  }
  
  private async getMockSignalPrepare(itemId: string): Promise<{ status: string }> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { status: 'ok' };
  }

  private async getMockSignalEvaluate(payload: SignalEvaluatePayload): Promise<PlaidSignalResponse> {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const isHighRisk = Math.round((payload.amount - Math.floor(payload.amount)) * 100) === 99;
    
    if (isHighRisk) {
      return {
        decision: 'REROUTE',
        ruleset_key: 'clearflowach',
        signal: { ruleset: { result: 'REROUTE', triggered_rule_details: { internal_note: 'High risk score detected (Mocked)' }}}
      };
    } else {
      return {
        decision: 'ACCEPT',
        ruleset_key: 'clearflowach',
        signal: { ruleset: { result: 'ACCEPT' }}
      };
    }
  }
}

export const plaidService = new PlaidService();
