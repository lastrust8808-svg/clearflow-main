import { bankingSession } from './storageSession.service';
import { PlaidSignalResponse, PlaidAuthResponse, PlaidIdentityData, PlaidIdentityMatchScores, PlaidConnectionPayload, PlaidTransaction } from '../types/app.models';
import { getApiBaseUrl } from './runtimeConfig.service';

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

export interface PlaidTransactionSyncResult {
  itemId?: string;
  deliveryId?: string;
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removedTransactionIds: string[];
}

class PlaidService {
  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const session = bankingSession();
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(session.headers)) headers.set(name, value);
    // A one-use public token must never be replayed against guessed API origins.
    const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      throw new Error('Banking service returned an invalid response.');
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Banking service is unavailable.');
    return payload as T;
  }

  // ============== REAL API IMPLEMENTATIONS ==============

  async createLinkToken(_userId: string): Promise<{ link_token: string }> {
    return this.requestJson<{ link_token: string }>('/api/plaid/link_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: bankingSession().accountId })
    });
  }

  async exchangePublicToken(publicToken: string, _userId: string, userName: string): Promise<PlaidConnectionPayload> {
    return this.requestJson<PlaidConnectionPayload>('/api/plaid/exchange_public_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken, userId: bankingSession().accountId, userName })
    });
  }

  async getTransactions(itemId: string): Promise<PlaidTransaction[]> {
     return this.requestJson<PlaidTransaction[]>(`/api/plaid/transactions/${encodeURIComponent(itemId)}`);
  }

  async syncTransactions(itemId: string): Promise<PlaidTransactionSyncResult> {
    return this.requestJson<PlaidTransactionSyncResult>('/api/plaid/transactions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
  }


  async acknowledgeTransactions(itemId: string, deliveryId: string): Promise<{ acknowledged: boolean }> {
    return this.requestJson('/api/plaid/transactions/ack', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, deliveryId }),
    });
  }

  async getAuth(itemId: string, initialAmount?: number): Promise<PlaidAuthResponse> {
    return this.requestJson<PlaidAuthResponse>('/api/plaid/auth/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, initialAmount })
    });
  }

  async getIdentity(itemId: string, userName: string): Promise<PlaidIdentityData> {
    return this.requestJson<PlaidIdentityData>('/api/plaid/identity/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, userName })
    });
  }

  async matchIdentity(userName: string, bankName: string): Promise<PlaidIdentityMatchScores> {
    return this.requestJson<PlaidIdentityMatchScores>('/api/plaid/identity/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName, bankName }) // bankName is used for simulation on backend
    });
  }

  async signalPrepare(itemId: string): Promise<{ status: string }> {
    return this.requestJson<{ status: string }>('/api/plaid/signal/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
  }

  async signalEvaluate(payload: SignalEvaluatePayload): Promise<PlaidSignalResponse> {
    return this.requestJson<PlaidSignalResponse>('/api/plaid/signal/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

}

export const plaidService = new PlaidService();
