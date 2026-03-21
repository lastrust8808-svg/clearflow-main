import { useEffect, useMemo, useState } from 'react';
import type {
  BankAccountRecord,
  BankFeedEntryRecord,
  BankFeedRuleRecord,
  LedgerAccountRecord,
} from '../../types/core';
import type { BankFeedRuleSubmitPayload } from './accountingTypes';

interface BankFeedWorkspaceProps {
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  rules: BankFeedRuleRecord[];
  entries: BankFeedEntryRecord[];
  onConnectBank: (bankAccountId: string) => void;
  onSyncBank: (bankAccountId: string) => void;
  onAddRule: (payload: BankFeedRuleSubmitPayload) => void;
  onToggleRule: (ruleId: string) => void;
}

const inputStyle = {
  width: '100%',
  minHeight: 44,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.5)',
  color: '#e5e7eb',
  boxSizing: 'border-box' as const,
};

export default function BankFeedWorkspace({
  bankAccounts,
  ledgerAccounts,
  rules,
  entries,
  onConnectBank,
  onSyncBank,
  onAddRule,
  onToggleRule,
}: BankFeedWorkspaceProps) {
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(
    bankAccounts[0]?.id ?? ''
  );
  const [form, setForm] = useState<BankFeedRuleSubmitPayload>({
    bankAccountId: bankAccounts[0]?.id ?? '',
    name: '',
    merchantContains: '',
    direction: 'debit',
    transactionType: 'expense',
    defaultLedgerAccountId: ledgerAccounts[0]?.id,
    counterpartyLabel: '',
    memoTemplate: '',
    minAmount: '',
    maxAmount: '',
    verificationMode: 'bank_confirmation',
    autoPost: true,
    autoReconcile: true,
  });

  useEffect(() => {
    if (!selectedBankAccountId && bankAccounts[0]?.id) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccountId]);

  useEffect(() => {
    if (!selectedBankAccountId) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      bankAccountId: selectedBankAccountId,
    }));
  }, [selectedBankAccountId]);

  const filteredRules = useMemo(
    () =>
      rules.filter(
        (rule) => !selectedBankAccountId || rule.bankAccountId === selectedBankAccountId
      ),
    [rules, selectedBankAccountId]
  );

  const filteredEntries = useMemo(
    () =>
      entries
        .filter((entry) => !selectedBankAccountId || entry.bankAccountId === selectedBankAccountId)
        .slice(0, 10),
    [entries, selectedBankAccountId]
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
        }}
      >
        {bankAccounts.map((account) => (
          <div
            key={account.id}
            style={{
              borderRadius: 16,
              padding: 16,
              border:
                selectedBankAccountId === account.id
                  ? '1px solid rgba(126, 242, 255, 0.45)'
                  : '1px solid rgba(148,163,184,0.2)',
              background:
                selectedBankAccountId === account.id
                  ? 'linear-gradient(180deg, rgba(36, 128, 160, 0.22), rgba(15,23,42,0.55))'
                  : 'rgba(15,23,42,0.45)',
              color: '#e5e7eb',
              display: 'grid',
              gap: 10,
              cursor: 'pointer',
            }}
            onClick={() => setSelectedBankAccountId(account.id)}
          >
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{account.accountName}</div>
              <div style={{ color: '#94a3b8', marginTop: 4 }}>
                {account.institutionName} | {account.accountType} | {account.currency}
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.7 }}>
              Feed status: <strong>{account.liveFeedStatus ?? 'disconnected'}</strong>
              <br />
              Connection: <strong>{account.liveConnectionProvider ?? account.connectionType ?? 'manual'}</strong>
              <br />
              Auto reconcile: <strong>{account.autoReconcileEnabled === false ? 'off' : 'on'}</strong>
              <br />
              Last sync:{' '}
              <strong>{account.lastFeedSyncAt ? new Date(account.lastFeedSyncAt).toLocaleString() : 'not yet'}</strong>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onConnectBank(account.id);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(126, 242, 255, 0.28)',
                  background: 'rgba(54, 215, 255, 0.12)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {account.connectionType === 'plaid_connected' ? 'Reconnect Feed' : 'Connect Bank'}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSyncBank(account.id);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Sync Feed Now
              </button>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 14,
          borderRadius: 18,
          padding: 18,
          background: 'rgba(15,23,42,0.45)',
          border: '1px solid rgba(148,163,184,0.2)',
          color: '#e5e7eb',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Auto-Reconcile Rules</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Route merchant activity into the operational ledger, attach verification posture,
            and auto-clear matched bank feed activity into reconciliation.
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
                  {account.accountName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Rule Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Mortgage servicer, payroll, card rewards..."
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Merchant Contains</span>
            <input
              value={form.merchantContains}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, merchantContains: event.target.value }))
              }
              placeholder="BASELANE, PAYROLL, STRIPE..."
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
                  direction: event.target.value as BankFeedRuleSubmitPayload['direction'],
                }))
              }
              style={inputStyle}
            >
              <option value="debit">Debit / money out</option>
              <option value="credit">Credit / money in</option>
              <option value="any">Any direction</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Operational Ledger Account</span>
            <select
              value={form.defaultLedgerAccountId ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, defaultLedgerAccountId: event.target.value }))
              }
              style={inputStyle}
            >
              <option value="">Unclassified review queue</option>
              {ledgerAccounts
                .filter((account) => account.entityId === bankAccounts.find((item) => item.id === form.bankAccountId)?.entityId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Post As</span>
            <select
              value={form.transactionType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  transactionType: event.target.value as BankFeedRuleSubmitPayload['transactionType'],
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
            <span>Verification Mode</span>
            <select
              value={form.verificationMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  verificationMode:
                    event.target.value as BankFeedRuleSubmitPayload['verificationMode'],
                }))
              }
              style={inputStyle}
            >
              <option value="bank_confirmation">Bank confirmation</option>
              <option value="internal_control_token">Control token</option>
              <option value="manual_review">Manual review</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Memo Template</span>
            <input
              value={form.memoTemplate ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, memoTemplate: event.target.value }))
              }
              placeholder="Operating charge from {merchant}"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Counterparty Label</span>
            <input
              value={form.counterpartyLabel ?? ''}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, counterpartyLabel: event.target.value }))
              }
              placeholder="Vendor or source label"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.autoPost}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, autoPost: event.target.checked }))
              }
            />
            Auto-post to ledger
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.autoReconcile}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, autoReconcile: event.target.checked }))
              }
            />
            Auto-reconcile matched items
          </label>
          <button
            type="button"
            onClick={() => {
              if (!form.bankAccountId || !form.name.trim() || !form.merchantContains.trim()) {
                return;
              }
              onAddRule(form);
              setForm((prev) => ({
                ...prev,
                name: '',
                merchantContains: '',
                memoTemplate: '',
                counterpartyLabel: '',
                minAmount: '',
                maxAmount: '',
              }));
            }}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(126, 242, 255, 0.28)',
              background:
                'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Save Rule
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {filteredRules.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>
              No feed rules yet for this account. Add one above to let ClearFlow auto-post and
              auto-reconcile certain merchants or incoming sources.
            </div>
          ) : (
            filteredRules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: 'grid',
                  gap: 4,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{rule.name}</strong>
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {rule.active ? 'Disable' : 'Enable'}
                  </button>
                </div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                  Match: "{rule.merchantContains}" | {rule.direction} | verify via{' '}
                  {rule.verificationMode}
                </div>
                <div style={{ color: '#d1d5db', fontSize: 13 }}>
                  {rule.autoPost ? 'Auto-posts to ledger' : 'Review before posting'} |{' '}
                  {rule.autoReconcile ? 'auto-reconciles' : 'holds for reconciliation review'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 10,
          borderRadius: 18,
          padding: 18,
          background: 'rgba(15,23,42,0.45)',
          border: '1px solid rgba(148,163,184,0.2)',
          color: '#e5e7eb',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>Recent Feed Activity</div>
        {filteredEntries.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>
            No synced entries yet. Connect a bank and run a feed sync to start posting live
            statement activity into the operational ledger.
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gap: 4,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{entry.description}</strong>
                <span>
                  {entry.amount >= 0 ? '+' : '-'}$
                  {Math.abs(entry.amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>
                {entry.postedDate} | {entry.status} | {entry.verificationStatus}
                {entry.matchedRuleId ? ` | rule ${entry.matchedRuleId}` : ''}
              </div>
              {entry.notes ? (
                <div style={{ color: '#d1d5db', fontSize: 13 }}>{entry.notes}</div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
