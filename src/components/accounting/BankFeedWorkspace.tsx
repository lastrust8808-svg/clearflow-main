import { useEffect, useMemo, useState } from 'react';
import type {
  BankAccountRecord,
  BankFeedEntryRecord,
  BankFeedRuleRecord,
  LedgerAccountRecord,
} from '../../types/core';
import type { BankFeedRuleSubmitPayload } from './accountingTypes';
import { getFinancialConnectionProviders } from '../../services/financialConnectionCatalog.service';
import { getTreasuryRailCatalog } from '../../services/treasuryRailCatalog.service';
import { getSettlementExecutionCapabilities } from '../../services/settlementExecution.service';

interface BankFeedWorkspaceProps {
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  rules: BankFeedRuleRecord[];
  entries: BankFeedEntryRecord[];
  onConnectNewInstitution: () => void;
  onAddConnectedAccount: () => void;
  onAddManualBankAccount: () => void;
  onAddManualTransaction: () => void;
  onUpdateImportPolicy: (
    bankAccountId: string,
    policy: NonNullable<BankAccountRecord['statementImportPolicy']>,
    threshold?: number,
  ) => void;
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
  onConnectNewInstitution,
  onAddConnectedAccount,
  onAddManualBankAccount,
  onAddManualTransaction,
  onUpdateImportPolicy,
  onConnectBank,
  onSyncBank,
  onAddRule,
  onToggleRule,
}: BankFeedWorkspaceProps) {
  const [executionCapabilities, setExecutionCapabilities] = useState<{
    provider: string;
    executionMode: string;
    plaidEnvironment: string;
    liveBankExecutionReady: boolean;
    achOriginationReady: boolean;
    wireOriginationReady: boolean;
    billerDirectReady: boolean;
    printableCheckReady: boolean;
    positivePayReady: boolean;
    supportedMethods: string[];
    notes: string[];
  } | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    getSettlementExecutionCapabilities()
      .then((response) => {
        if (!cancelled) {
          setExecutionCapabilities(response.capabilities);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExecutionCapabilities(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  const selectedBankAccount = useMemo(
    () => bankAccounts.find((account) => account.id === selectedBankAccountId),
    [bankAccounts, selectedBankAccountId],
  );
  const providerCatalog = useMemo(() => getFinancialConnectionProviders(), []);
  const treasuryRails = useMemo(() => getTreasuryRailCatalog(), []);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onConnectNewInstitution}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(45,212,191,0.28)',
            background:
              'linear-gradient(135deg, rgba(20, 184, 166, 0.9), rgba(37, 99, 235, 0.82))',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Connect Institution Login
        </button>
        <button
          type="button"
          onClick={onAddConnectedAccount}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(249,115,22,0.28)',
            background: 'rgba(124,45,18,0.32)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Add Connected Provider
        </button>
        <button
          type="button"
          onClick={onAddManualBankAccount}
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
          Add Bank Account Manually
        </button>
        <button
          type="button"
          onClick={onAddManualTransaction}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(15,23,42,0.55)',
            color: '#e5e7eb',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Enter Bank Transaction
        </button>
      </div>

      {executionCapabilities ? (
        <div
          style={{
            display: 'grid',
            gap: 10,
            borderRadius: 18,
            padding: 18,
            background:
              executionCapabilities.executionMode === 'live'
                ? 'linear-gradient(135deg, rgba(20,184,166,0.16), rgba(15,23,42,0.55))'
                : 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(15,23,42,0.55))',
            border:
              executionCapabilities.executionMode === 'live'
                ? '1px solid rgba(45,212,191,0.28)'
                : '1px solid rgba(245,158,11,0.28)',
            color: '#e5e7eb',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Live Execution Readiness</div>
          <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
            Provider: <strong>{executionCapabilities.provider}</strong> | Mode:{' '}
            <strong>{executionCapabilities.executionMode}</strong> | Plaid env:{' '}
            <strong>{executionCapabilities.plaidEnvironment}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: '#cbd5e1' }}>
            <span>ACH: <strong>{executionCapabilities.achOriginationReady ? 'ready' : 'not ready'}</strong></span>
            <span>Wire: <strong>{executionCapabilities.wireOriginationReady ? 'ready' : 'not ready'}</strong></span>
            <span>Live bank execution: <strong>{executionCapabilities.liveBankExecutionReady ? 'yes' : 'no'}</strong></span>
            <span>Biller-direct: <strong>{executionCapabilities.billerDirectReady ? 'ready' : 'not ready'}</strong></span>
            <span>Printable check: <strong>{executionCapabilities.printableCheckReady ? 'ready' : 'not ready'}</strong></span>
            <span>Positive Pay: <strong>{executionCapabilities.positivePayReady ? 'ready' : 'not ready'}</strong></span>
          </div>
          {executionCapabilities.supportedMethods.length > 0 ? (
            <div style={{ color: '#93c5fd' }}>
              Supported execution methods: {executionCapabilities.supportedMethods.join(', ')}
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 4, color: '#d1d5db' }}>
            {executionCapabilities.notes.map((note) => (
              <div key={note}>{note}</div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedBankAccount ? (
        <div
          style={{
            display: 'grid',
            gap: 12,
            borderRadius: 18,
            padding: 18,
            background: 'rgba(15,23,42,0.45)',
            border: '1px solid rgba(148,163,184,0.2)',
            color: '#e5e7eb',
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Statement Import Hardening</div>
            <div style={{ color: '#94a3b8', marginTop: 6 }}>
              Control how aggressively this account auto-posts unmatched statement lines into the
              accounting engine.
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
              <span>Import Policy</span>
              <select
                value={selectedBankAccount.statementImportPolicy ?? 'review_all'}
                onChange={(event) =>
                  onUpdateImportPolicy(
                    selectedBankAccount.id,
                    event.target.value as NonNullable<BankAccountRecord['statementImportPolicy']>,
                    selectedBankAccount.statementAutoPostThreshold,
                  )
                }
                style={inputStyle}
              >
                <option value="review_all">Review all unmatched lines</option>
                <option value="auto_post_under_threshold">Auto-post under threshold</option>
                <option value="auto_post_credits_only">Auto-post credits only</option>
                <option value="auto_post_all">Auto-post all parsed lines</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Auto-Post Threshold</span>
              <input
                type="number"
                step="0.01"
                value={selectedBankAccount.statementAutoPostThreshold ?? ''}
                onChange={(event) =>
                  onUpdateImportPolicy(
                    selectedBankAccount.id,
                    selectedBankAccount.statementImportPolicy ?? 'review_all',
                    Number(event.target.value || 0),
                  )
                }
                disabled={(selectedBankAccount.statementImportPolicy ?? 'review_all') !== 'auto_post_under_threshold'}
                style={inputStyle}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
        }}
      >
        {bankAccounts.length === 0 ? (
          <div
            style={{
              borderRadius: 16,
              padding: 18,
              border: '1px dashed rgba(148,163,184,0.28)',
              background: 'rgba(15,23,42,0.32)',
              color: '#cbd5e1',
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              No bank accounts are set up yet. Connect your institution login for live feeds,
              add a connected provider like Stripe or Cash App, or add one manually if you are
              still gathering access.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onConnectNewInstitution}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(45,212,191,0.28)',
                  background:
                    'linear-gradient(135deg, rgba(20, 184, 166, 0.9), rgba(37, 99, 235, 0.82))',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Connect Institution Login
              </button>
              <button
                type="button"
                onClick={onAddConnectedAccount}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(249,115,22,0.28)',
                  background: 'rgba(124,45,18,0.32)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Add Connected Provider
              </button>
            </div>
          </div>
        ) : null}
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
              {account.connectedProfile?.providerLabel ? (
                <>
                  <br />
                  Provider: <strong>{account.connectedProfile.providerLabel}</strong>
                </>
              ) : null}
              <br />
              Auto reconcile: <strong>{account.autoReconcileEnabled === false ? 'off' : 'on'}</strong>
              <br />
              Statement policy:{' '}
              <strong>{account.statementImportPolicy ?? 'review_all'}</strong>
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>Execution & Treasury Rails</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            ClearFlow can now distinguish live sync, treasury execution posture, and biller-direct limits instead of treating every connected account like the same bank rail.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {providerCatalog
            .filter((provider) => provider.supportsLiveSync || provider.supportsSettlementInitiation)
            .map((provider) => (
              <div
                key={provider.providerKey}
                style={{
                  borderRadius: 14,
                  padding: 14,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(255,255,255,0.03)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 700 }}>{provider.label}</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                  {provider.executionReadiness.replace('_', ' ')} | {provider.availabilityStatus.replace('_', ' ')}
                </div>
                <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.6 }}>
                  {provider.description}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Rails: {provider.supportedRails.join(', ')}
                </div>
              </div>
            ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {treasuryRails.map((rail) => (
            <div
              key={rail.railKey}
              style={{
                borderRadius: 14,
                padding: 14,
                border: '1px solid rgba(148,163,184,0.18)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700 }}>{rail.label}</div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>
                {rail.readiness.replace('_', ' ')} | {rail.settlementWindow}
              </div>
              <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.6 }}>
                Best use: {rail.bestUse}
              </div>
              <div style={{ color: '#cbd5e1', fontSize: 13 }}>{rail.notes}</div>
            </div>
          ))}
        </div>
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
