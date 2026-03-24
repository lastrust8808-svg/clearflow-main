import { useEffect, useState } from 'react';
import type { LedgerAccountRecord } from '../../types/core';
import type { ManualBankAccountSubmitPayload } from './accountingTypes';

interface BankAccountManualModalProps {
  isOpen: boolean;
  ledgerAccounts: LedgerAccountRecord[];
  defaultCurrency: string;
  onClose: () => void;
  onSubmit: (payload: ManualBankAccountSubmitPayload) => void;
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
  width: 'min(760px, 100%)',
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

const buildInitialForm = (defaultCurrency: string): ManualBankAccountSubmitPayload => ({
  institutionName: '',
  accountName: '',
  accountType: 'checking',
  currency: defaultCurrency,
  routingNumber: '',
  accountNumber: '',
  openingBalance: '',
  linkedLedgerAccountId: '',
  achOriginationEnabled: true,
  wireEnabled: false,
});

export default function BankAccountManualModal({
  isOpen,
  ledgerAccounts,
  defaultCurrency,
  onClose,
  onSubmit,
}: BankAccountManualModalProps) {
  const [form, setForm] = useState<ManualBankAccountSubmitPayload>(buildInitialForm(defaultCurrency));

  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm(defaultCurrency));
    }
  }, [defaultCurrency, isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Add Bank Account Manually</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Create a bank account shell for the entity even before a live feed is connected.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Institution</span>
            <input
              value={form.institutionName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, institutionName: event.target.value }))
              }
              placeholder="Mercury, Chase, Treasury partner..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Name</span>
            <input
              value={form.accountName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, accountName: event.target.value }))
              }
              placeholder="Operating, Reserve, Payroll..."
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
                  accountType: event.target.value as ManualBankAccountSubmitPayload['accountType'],
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
            <span>Currency</span>
            <input
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
              placeholder="USD"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Routing Number</span>
            <input
              value={form.routingNumber ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, routingNumber: event.target.value }))
              }
              placeholder="Optional"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Number</span>
            <input
              value={form.accountNumber ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, accountNumber: event.target.value }))
              }
              placeholder="Optional"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Opening Balance</span>
            <input
              value={form.openingBalance ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, openingBalance: event.target.value }))
              }
              placeholder="0.00"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Linked Ledger Account</span>
            <select
              value={form.linkedLedgerAccountId ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, linkedLedgerAccountId: event.target.value }))
              }
              style={inputStyle}
            >
              <option value="">Create new ledger cash account automatically</option>
              {ledgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.achOriginationEnabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, achOriginationEnabled: event.target.checked }))
              }
            />
            ACH eligible
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.wireEnabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, wireEnabled: event.target.checked }))
              }
            />
            Wire eligible
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
            Add Bank Account
          </button>
        </div>
      </div>
    </div>
  );
}
