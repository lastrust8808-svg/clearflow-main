import { useEffect, useState } from 'react';
import type { BankAccountRecord, LedgerAccountRecord } from '../../types/core';
import type { ManualBankTransactionSubmitPayload } from './accountingTypes';

interface ManualBankTransactionModalProps {
  isOpen: boolean;
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  onClose: () => void;
  onSubmit: (payload: ManualBankTransactionSubmitPayload) => void;
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

const buildInitialForm = (bankAccountId: string): ManualBankTransactionSubmitPayload => ({
  bankAccountId,
  postedDate: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  direction: 'debit',
  transactionType: 'expense',
  ledgerAccountId: '',
  counterpartyLabel: '',
  memo: '',
  verificationMode: 'bank_confirmation',
  autoReconcile: true,
});

export default function ManualBankTransactionModal({
  isOpen,
  bankAccounts,
  ledgerAccounts,
  onClose,
  onSubmit,
}: ManualBankTransactionModalProps) {
  const [form, setForm] = useState<ManualBankTransactionSubmitPayload>(
    buildInitialForm(bankAccounts[0]?.id ?? ''),
  );

  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm(bankAccounts[0]?.id ?? ''));
    }
  }, [bankAccounts, isOpen]);

  if (!isOpen) {
    return null;
  }

  const selectedBankAccount = bankAccounts.find((account) => account.id === form.bankAccountId);
  const filteredLedgerAccounts = selectedBankAccount
    ? ledgerAccounts.filter((account) => account.entityId === selectedBankAccount.entityId)
    : ledgerAccounts;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Enter Bank Transaction</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Capture statement, CSV, or manual bank activity directly into the accounting flow.
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
            <span>Bank Account</span>
            <select
              value={form.bankAccountId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, bankAccountId: event.target.value }))
              }
              style={inputStyle}
            >
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} - {account.institutionName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Posted Date</span>
            <input
              type="date"
              value={form.postedDate}
              onChange={(event) => setForm((prev) => ({ ...prev, postedDate: event.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Description</span>
            <input
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Wire in, rent debit, ACH credit..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Amount</span>
            <input
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder="0.00"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Direction</span>
            <select
              value={form.direction}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  direction: event.target.value as ManualBankTransactionSubmitPayload['direction'],
                }))
              }
              style={inputStyle}
            >
              <option value="debit">Debit / money out</option>
              <option value="credit">Credit / money in</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Post As</span>
            <select
              value={form.transactionType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  transactionType:
                    event.target.value as ManualBankTransactionSubmitPayload['transactionType'],
                }))
              }
              style={inputStyle}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Operational Ledger Account</span>
            <select
              value={form.ledgerAccountId ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, ledgerAccountId: event.target.value }))
              }
              style={inputStyle}
            >
              <option value="">Auto-classify from bank account linkage</option>
              {filteredLedgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Counterparty Label</span>
            <input
              value={form.counterpartyLabel ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, counterpartyLabel: event.target.value }))
              }
              placeholder="Vendor, payer, processor..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Verification Mode</span>
            <select
              value={form.verificationMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  verificationMode:
                    event.target.value as ManualBankTransactionSubmitPayload['verificationMode'],
                }))
              }
              style={inputStyle}
            >
              <option value="bank_confirmation">Bank confirmation</option>
              <option value="internal_control_token">Control token</option>
              <option value="manual_review">Manual review</option>
            </select>
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Memo</span>
          <textarea
            value={form.memo ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
            rows={4}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.autoReconcile}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, autoReconcile: event.target.checked }))
            }
          />
          Auto-reconcile into the working bank reconciliation
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!form.bankAccountId || !form.description.trim() || !Number(form.amount || 0)) {
                return;
              }
              onSubmit(form);
            }}
            style={primaryButtonStyle}
          >
            Post Bank Transaction
          </button>
        </div>
      </div>
    </div>
  );
}
