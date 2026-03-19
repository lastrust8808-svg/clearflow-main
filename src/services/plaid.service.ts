import { PlaidSignalResponse, PlaidAuthResponse, PlaidVerificationStatus, PlaidIdentityData, PlaidIdentityMatchScores, PlaidConnectionPayload, PlaidTransaction } from '../types/app.models';

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

// FIX: Access environment variables from the custom window.process object.
const API_BASE_URL = (window as any).process?.env?.REACT_APP_API_BASE_URL;

class PlaidService {
  
  private isBackendConfigured(): boolean {
    return !!API_BASE_URL && !API_BASE_URL.includes('YOUR_NGROK');
  }

  // ============== REAL API IMPLEMENTATIONS ==============

  async createLinkToken(userId: string): Promise<{ link_token: string }> {
    if (!this.isBackendConfigured()) {
      console.warn('Backend not configured, using mock link token.');
      return Promise.resolve({ link_token: `link-sandbox-mock-${Date.now()}`});
    }
    const response = await fetch(`${API_BASE_URL}/plaid/link_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Failed to create link token');
    return response.json();
  }

  async exchangePublicToken(publicToken: string, userId: string, userName: string): Promise<PlaidConnectionPayload> {
    if (!this.isBackendConfigured()) {
       console.warn('Backend not configured, using mock exchange.');
       const authResponse = await this.getMockAuth('mock-token');
       const identityData = await this.getMockIdentity('mock-token', userName);
       const bankOwnerName = identityData.accounts[0].owners[0].names[0] || '';
       const identityMatchScores = await this.getMockMatchIdentity(userName, bankOwnerName);
       return { authResponse, identityData, identityMatchScores, itemId: `mock-item-${Date.now()}` };
    }
    const response = await fetch(`${API_BASE_URL}/plaid/exchange_public_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken, userId, userName })
    });
    if (!response.ok) {
       const err = await response.json();
       throw new Error(err.error || 'Failed to exchange public token');
    }
    return response.json();
  }

  async getTransactions(itemId: string): Promise<PlaidTransaction[]> {
     if (!this.isBackendConfigured()) return Promise.resolve([]);
     const response = await fetch(`${API_BASE_URL}/plaid/transactions/${itemId}`);
     if (!response.ok) throw new Error('Failed to fetch transactions');
     return response.json();
  }
  
  async syncTransactions(itemId: string): Promise<PlaidTransaction[]> {
    if (!this.isBackendConfigured()) return Promise.resolve([]);
    const response = await fetch(`${API_BASE_URL}/plaid/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
    if (!response.ok) throw new Error('Failed to sync transactions');
    return response.json();
  }


  async getAuth(itemId: string, initialAmount?: number): Promise<PlaidAuthResponse> {
    if (!this.isBackendConfigured()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for getAuth.');
      return this.getMockAuth(itemId, initialAmount);
    }
    const response = await fetch(`${API_BASE_URL}/plaid/auth/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, initialAmount })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to fetch Plaid Auth data');
    }
    return response.json();
  }

  async getIdentity(itemId: string, userName: string): Promise<PlaidIdentityData> {
     if (!this.isBackendConfigured()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for getIdentity.');
      return this.getMockIdentity(itemId, userName);
    }
    const response = await fetch(`${API_BASE_URL}/plaid/identity/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, userName })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to fetch Plaid Identity data');
    }
    return response.json();
  }

  async matchIdentity(userName: string, bankName: string): Promise<PlaidIdentityMatchScores> {
    if (!this.isBackendConfigured()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for matchIdentity.');
      return this.getMockMatchIdentity(userName, bankName);
    }
    const response = await fetch(`${API_BASE_URL}/plaid/identity/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName, bankName }) // bankName is used for simulation on backend
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to fetch Plaid Identity Match data');
    }
    return response.json();
  }

  async signalPrepare(itemId: string): Promise<{ status: string }> {
    if (!this.isBackendConfigured()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for signalPrepare.');
      return this.getMockSignalPrepare(itemId);
    }
    const response = await fetch(`${API_BASE_URL}/plaid/signal/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
     if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to prepare Plaid Signal');
    }
    return response.json();
  }

  async signalEvaluate(payload: SignalEvaluatePayload): Promise<PlaidSignalResponse> {
    if (!this.isBackendConfigured()) {
      console.warn('REACT_APP_API_BASE_URL not set. Using mocked Plaid service for signalEvaluate.');
      return this.getMockSignalEvaluate(payload);
    }
     const response = await fetch(`${API_BASE_URL}/plaid/signal/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
     if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to evaluate Plaid Signal');
    }
    return response.json();
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
