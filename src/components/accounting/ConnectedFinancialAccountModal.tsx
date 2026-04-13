import { useEffect, useMemo, useState } from 'react';
import type { LedgerAccountRecord, FinancialConnectionProvider } from '../../types/core';
import {
  getFinancialConnectionProvider,
  getFinancialConnectionProviders,
} from '../../services/financialConnectionCatalog.service';

export interface ConnectedFinancialAccountSubmitPayload {
  providerKey: FinancialConnectionProvider;
  institutionName: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'custodial' | 'other';
  currency: string;
  externalAccountId?: string;
  externalCustomerId?: string;
  loginLabel?: string;
  last4?: string;
  linkedLedgerAccountId?: string;
  openingBalance?: string;
}

interface ConnectedFinancialAccountModalProps {
  isOpen: boolean;
  ledgerAccounts: LedgerAccountRecord[];
  defaultCurrency: string;
  onClose: () => void;
  onSubmit: (payload: ConnectedFinancialAccountSubmitPayload) => void;
}

const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(2, 6, 23, 0.72)',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  zIndex: 60,
};

const modalStyle = {
  width: 'min(780px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto' as const,
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(8, 15, 32, 0.98)',
  color: '#e5e7eb',
  padding: 22,
  display: 'grid',
  gap: 16,
};

const inputStyle = {
  width: '100%',
  minHeight: 44,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.55)',
  color: '#e5e7eb',
  boxSizing: 'border-box' as const,
};

const primaryButtonStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(126, 242, 255, 0.28)',
  background: 'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryButtonStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.5)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

function buildInitialForm(defaultCurrency: string): ConnectedFinancialAccountSubmitPayload {
  return {
    providerKey: 'stripe',
    institutionName: '',
    accountName: '',
    accountType: 'other',
    currency: defaultCurrency,
    externalAccountId: '',
    externalCustomerId: '',
    loginLabel: '',
    last4: '',
    linkedLedgerAccountId: '',
    openingBalance: '',
  };
}

export default function ConnectedFinancialAccountModal({
  isOpen,
  ledgerAccounts,
  defaultCurrency,
  onClose,
  onSubmit,
}: ConnectedFinancialAccountModalProps) {
  const providers = useMemo(() => getFinancialConnectionProviders().filter((item) => item.providerKey !== 'plaid'), []);
  const [form, setForm] = useState<ConnectedFinancialAccountSubmitPayload>(buildInitialForm(defaultCurrency));

  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm(defaultCurrency));
    }
  }, [defaultCurrency, isOpen]);

  const selectedProvider = getFinancialConnectionProvider(form.providerKey);
  const mercuryReferralUrl =
    selectedProvider?.providerKey === 'mercury' ? selectedProvider.referralSignupUrl : undefined;

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      accountType: selectedProvider.accountTypeHint,
    }));
  }, [selectedProvider?.providerKey]);

  if (!isOpen) {
    return null;
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Add Connected Financial Account</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Save a permanent third-party financial account profile into the workspace and chart of accounts.
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid rgba(148,163,184,0.2)',
            background: 'rgba(15,23,42,0.4)',
            color: '#d1d5db',
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 700, color: '#e5e7eb', marginBottom: 6 }}>
            {selectedProvider?.label || 'Provider'}
          </div>
          <div>{selectedProvider?.description}</div>
          <div style={{ color: '#93c5fd', marginTop: 8 }}>
            Availability: {selectedProvider?.availabilityStatus === 'live' ? 'live connector' : 'persistent profile now, deeper OAuth later'}
          </div>
          {selectedProvider?.providerKey === 'mercury' ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button
                type="button"
                onClick={() =>
                  window.open('https://app.mercury.com/login', '_blank', 'noopener,noreferrer')
                }
                style={secondaryButtonStyle}
              >
                Login To Existing Mercury
              </button>
              {mercuryReferralUrl ? (
                <button
                  type="button"
                  onClick={() => window.open(mercuryReferralUrl, '_blank', 'noopener,noreferrer')}
                  style={primaryButtonStyle}
                >
                  Open New Mercury Account
                </button>
              ) : null}
              <div style={{ flexBasis: '100%', color: '#cbd5e1', fontSize: 13 }}>
                Existing users can log in to Mercury now, then save the Mercury account profile here. New users can
                open Mercury through ClearFlow, then return to map the account into the COA.
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Provider</span>
            <select
              value={form.providerKey}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  providerKey: event.target.value as FinancialConnectionProvider,
                }))
              }
              style={inputStyle}
            >
              {providers.map((provider) => (
                <option key={provider.providerKey} value={provider.providerKey}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Institution / Provider Name</span>
            <input
              value={form.institutionName}
              onChange={(event) => setForm((prev) => ({ ...prev, institutionName: event.target.value }))}
              placeholder="Stripe, Cash App, Capital One..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Label</span>
            <input
              value={form.accountName}
              onChange={(event) => setForm((prev) => ({ ...prev, accountName: event.target.value }))}
              placeholder="Settlement account, card program, reserve wallet..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Type</span>
            <select
              value={form.accountType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  accountType: event.target.value as ConnectedFinancialAccountSubmitPayload['accountType'],
                }))
              }
              style={inputStyle}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit_card">Credit card</option>
              <option value="custodial">Custodial</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Login / Contact Label</span>
            <input
              value={form.loginLabel ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, loginLabel: event.target.value }))}
              placeholder="operator@company.com"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>External Account ID</span>
            <input
              value={form.externalAccountId ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, externalAccountId: event.target.value }))}
              placeholder="acct_..., cashtag, issuer id..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Customer / Merchant ID</span>
            <input
              value={form.externalCustomerId ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, externalCustomerId: event.target.value }))}
              placeholder="cus_..., merchant id..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Last 4 / Mask</span>
            <input
              value={form.last4 ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, last4: event.target.value }))}
              placeholder="1234"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Opening Balance</span>
            <input
              value={form.openingBalance ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, openingBalance: event.target.value }))}
              placeholder="0.00"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Currency</span>
            <input
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
              placeholder="USD"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Linked Ledger Account</span>
            <select
              value={form.linkedLedgerAccountId ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, linkedLedgerAccountId: event.target.value }))}
              style={inputStyle}
            >
              <option value="">Create new ledger account automatically</option>
              {ledgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!form.institutionName.trim() || !form.accountName.trim()) {
                return;
              }
              onSubmit(form);
            }}
            style={primaryButtonStyle}
          >
            Save Connected Profile
          </button>
        </div>
      </div>
    </div>
  );
}
