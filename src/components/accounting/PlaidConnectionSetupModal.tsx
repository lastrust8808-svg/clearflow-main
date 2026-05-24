import type { CSSProperties } from 'react';
import { useState } from 'react';

type PlaidConnectionImportMode =
  | 'connect_only'
  | 'manual_review_forward'
  | 'auto_categorize_forward';

interface ConnectedAccountSummary {
  bankAccountId: string;
  accountName: string;
  institutionName: string;
  currentBalance?: number;
  availableBalance?: number;
  last4?: string;
}

interface PlaidConnectionSetupModalProps {
  open: boolean;
  accounts: ConnectedAccountSummary[];
  onClose: () => void;
  onSubmit: (mode: PlaidConnectionImportMode) => void | Promise<void>;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,6,23,0.76)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  width: 'min(720px, 100%)',
  maxHeight: '92vh',
  overflowY: 'auto',
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.2)',
  background: '#0f172a',
  color: '#e5e7eb',
  padding: 20,
  display: 'grid',
  gap: 16,
};

const actionButtonStyle: CSSProperties = {
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

function formatCurrency(amount?: number, currency = 'USD') {
  if (typeof amount !== 'number') {
    return 'Not returned';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function PlaidConnectionSetupModal({
  open,
  accounts,
  onClose,
  onSubmit,
}: PlaidConnectionSetupModalProps) {
  const [mode, setMode] = useState<PlaidConnectionImportMode>('manual_review_forward');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(mode);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Connected Bank Setup</div>
          <div style={{ color: '#94a3b8', marginTop: 6, lineHeight: 1.6 }}>
            ClearFlow saved the connected account profile and starting balance. Choose how bank
            feed transactions should enter accounting after this balance snapshot so the opening
            balance and future activity do not double count.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 12,
            borderRadius: 16,
            padding: 16,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(15,23,42,0.35)',
          }}
        >
          {accounts.map((account) => (
            <div
              key={account.bankAccountId}
              style={{
                borderRadius: 14,
                padding: 14,
                border: '1px solid rgba(148,163,184,0.14)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: 4,
              }}
            >
              <div style={{ fontWeight: 700 }}>{account.accountName}</div>
              <div style={{ color: '#94a3b8' }}>
                {account.institutionName}
                {account.last4 ? ` •••• ${account.last4}` : ''}
              </div>
              <div style={{ color: '#d1d5db', fontSize: 13 }}>
                Current balance: <strong>{formatCurrency(account.currentBalance)}</strong>
              </div>
              {typeof account.availableBalance === 'number' ? (
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Available balance: <strong>{formatCurrency(account.availableBalance)}</strong>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <label
            style={{
              display: 'grid',
              gap: 6,
              padding: 14,
              borderRadius: 14,
              border:
                mode === 'connect_only'
                  ? '1px solid rgba(96,165,250,0.38)'
                  : '1px solid rgba(148,163,184,0.18)',
              background:
                mode === 'connect_only' ? 'rgba(37,99,235,0.14)' : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="radio"
                checked={mode === 'connect_only'}
                onChange={() => setMode('connect_only')}
              />
              <strong>Connect only for now</strong>
            </span>
            <span style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
              Save the starting balance and account mapping now, but do not import any bank feed
              transactions until the user decides later.
            </span>
          </label>

          <label
            style={{
              display: 'grid',
              gap: 6,
              padding: 14,
              borderRadius: 14,
              border:
                mode === 'manual_review_forward'
                  ? '1px solid rgba(96,165,250,0.38)'
                  : '1px solid rgba(148,163,184,0.18)',
              background:
                mode === 'manual_review_forward'
                  ? 'rgba(37,99,235,0.14)'
                  : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="radio"
                checked={mode === 'manual_review_forward'}
                onChange={() => setMode('manual_review_forward')}
              />
              <strong>Import forward for manual categorization</strong>
            </span>
            <span style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
              Start with new activity after this connection snapshot and load feed items into
              reconciliation review so the user can categorize and approve them manually.
            </span>
          </label>

          <label
            style={{
              display: 'grid',
              gap: 6,
              padding: 14,
              borderRadius: 14,
              border:
                mode === 'auto_categorize_forward'
                  ? '1px solid rgba(45,212,191,0.38)'
                  : '1px solid rgba(148,163,184,0.18)',
              background:
                mode === 'auto_categorize_forward'
                  ? 'rgba(20,184,166,0.14)'
                  : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="radio"
                checked={mode === 'auto_categorize_forward'}
                onChange={() => setMode('auto_categorize_forward')}
              />
              <strong>Auto-categorize and reconcile forward</strong>
            </span>
            <span style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
              Start with new activity after this connection snapshot and let ClearFlow
              auto-create journal entries, assign transaction categories from the feed, and clear matched items into
              reconciliation.
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={actionButtonStyle} disabled={isSubmitting}>
            Decide Later
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              ...actionButtonStyle,
              border: '1px solid rgba(126,242,255,0.28)',
              background:
                'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))',
              color: '#fff',
            }}
          >
            {isSubmitting ? 'Saving Setup...' : 'Save Feed Setup'}
          </button>
        </div>
      </div>
    </div>
  );
}
