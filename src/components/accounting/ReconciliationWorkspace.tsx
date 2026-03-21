import { useEffect, useMemo, useState } from 'react';
import type {
  BankAccountRecord,
  PaymentRecord,
  ReconciliationRecord,
} from '../../types/core';

interface ReconciliationWorkspaceProps {
  bankAccounts: BankAccountRecord[];
  reconciliations: ReconciliationRecord[];
  payments: PaymentRecord[];
  onCreateReconciliation: (bankAccountId: string) => void;
  onAutoClear: (reconciliationId: string) => void;
  onSaveStatement: (
    reconciliationId: string,
    statementEndingBalance: number,
    statementFileName: string,
    exceptionNotes: string,
    statementFile?: File | null
  ) => void;
  onApplySuggestedMatches: (reconciliationId: string) => void;
  onAcceptLineSuggestion: (reconciliationId: string, lineId: string) => void;
  onFlagLineException: (reconciliationId: string, lineId: string) => void;
  onCreateAdjustingEntry: (reconciliationId: string, lineId: string) => void;
  onMarkCompleted: (reconciliationId: string, closeSummary: string) => void;
}

export default function ReconciliationWorkspace({
  bankAccounts,
  reconciliations,
  payments,
  onCreateReconciliation,
  onAutoClear,
  onSaveStatement,
  onApplySuggestedMatches,
  onAcceptLineSuggestion,
  onFlagLineException,
  onCreateAdjustingEntry,
  onMarkCompleted,
}: ReconciliationWorkspaceProps) {
  const [selectedReconciliationId, setSelectedReconciliationId] = useState<string | null>(
    reconciliations[0]?.id ?? null
  );
  const [statementEndingBalance, setStatementEndingBalance] = useState('');
  const [statementFileName, setStatementFileName] = useState('');
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [closeSummary, setCloseSummary] = useState('');

  const selectedReconciliation = useMemo(
    () =>
      reconciliations.find((record) => record.id === selectedReconciliationId) ??
      reconciliations[0],
    [reconciliations, selectedReconciliationId]
  );

  useEffect(() => {
    if (!selectedReconciliation) {
      setStatementEndingBalance('');
      setStatementFileName('');
      setStatementFile(null);
      setExceptionNotes('');
      setCloseSummary('');
      return;
    }

    setStatementEndingBalance(String(selectedReconciliation.statementEndingBalance ?? ''));
    setStatementFileName(selectedReconciliation.statementFileName ?? '');
    setStatementFile(null);
    setExceptionNotes(selectedReconciliation.exceptionNotes ?? '');
    setCloseSummary(selectedReconciliation.closeSummary ?? '');
  }, [selectedReconciliation]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {bankAccounts.length === 0 ? (
        <div style={{ color: '#d1d5db' }}>
          No bank accounts available for reconciliation yet.
        </div>
      ) : (
        bankAccounts.map((account) => {
          const accountReconciliations = reconciliations.filter(
            (record) => record.bankAccountId === account.id
          );
          const latest = accountReconciliations[0];
          const settledPayments = payments.filter(
            (payment) =>
              payment.entityId === account.entityId && payment.status === 'settled'
          );

          return (
            <div
              key={account.id}
              style={{
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 16,
                padding: 16,
                background: 'rgba(15,23,42,0.45)',
                color: '#e5e7eb',
                display: 'grid',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {account.accountName}
                </div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}>
                  {account.institutionName} | {account.accountType} | {account.currency}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>
                    Open Reconciliations
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {accountReconciliations.length}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>
                    Settled Payments In Scope
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {settledPayments.length}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>Latest Status</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {latest?.status ?? 'not started'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onCreateReconciliation(account.id)}
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
                  Start Reconciliation
                </button>
                {latest ? (
                  <button
                    type="button"
                    onClick={() => setSelectedReconciliationId(latest.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.04)',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Open Latest
                  </button>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      {selectedReconciliation ? (
        <div
          style={{
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 16,
            padding: 18,
            background: 'rgba(15,23,42,0.45)',
            color: '#e5e7eb',
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              Reconciliation {selectedReconciliation.id}
            </div>
            <div style={{ color: '#94a3b8', marginTop: 6 }}>
              {selectedReconciliation.periodStart} to {selectedReconciliation.periodEnd}
            </div>
            <div style={{ color: '#94a3b8', marginTop: 6 }}>
              Review status: {selectedReconciliation.statementReviewStatus ?? 'not_imported'}
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
              <span>Statement Ending Balance</span>
              <input
                value={statementEndingBalance}
                onChange={(event) => setStatementEndingBalance(event.target.value)}
                type="number"
                step="0.01"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.5)',
                  color: '#e5e7eb',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Statement File Name</span>
              <input
                value={statementFileName}
                onChange={(event) => setStatementFileName(event.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.5)',
                  color: '#e5e7eb',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Statement File Upload</span>
              <input
                type="file"
                accept=".pdf,.csv,.ofx,.qfx,.xlsx,.xls,.png,.jpg,.jpeg"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setStatementFile(nextFile);
                  if (nextFile) {
                    setStatementFileName(nextFile.name);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.5)',
                  color: '#e5e7eb',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Exception Notes</span>
            <textarea
              value={exceptionNotes}
              onChange={(event) => setExceptionNotes(event.target.value)}
              style={{
                width: '100%',
                minHeight: 100,
                resize: 'vertical',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.25)',
                background: 'rgba(15,23,42,0.5)',
                color: '#e5e7eb',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Close Summary</span>
            <textarea
              value={closeSummary}
              onChange={(event) => setCloseSummary(event.target.value)}
              style={{
                width: '100%',
                minHeight: 100,
                resize: 'vertical',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.25)',
                background: 'rgba(15,23,42,0.5)',
                color: '#e5e7eb',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
            Cleared transactions:{' '}
            <strong>{selectedReconciliation.clearedTransactionIds.length}</strong>
            {selectedReconciliation.unmatchedTransactionIds?.length ? (
              <>
                {' '}| Unmatched transactions:{' '}
                <strong>{selectedReconciliation.unmatchedTransactionIds.length}</strong>
              </>
            ) : null}
            {selectedReconciliation.statementImportId ? (
              <>
                {' '}| Statement import job:{' '}
                <strong>{selectedReconciliation.statementImportId}</strong>
              </>
            ) : null}
            {selectedReconciliation.parsedStatementLines?.length ? (
              <>
                {' '}| Parsed lines:{' '}
                <strong>{selectedReconciliation.parsedStatementLines.length}</strong>
              </>
            ) : null}
          </div>

          {selectedReconciliation.parsedStatementLines?.length ? (
            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: 14,
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.18)',
                background: 'rgba(15,23,42,0.35)',
              }}
            >
              <div style={{ fontWeight: 700 }}>Statement Review</div>
              {selectedReconciliation.parsedStatementLines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    display: 'grid',
                    gap: 4,
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong>{line.description}</strong>
                    <span>
                      {line.direction === 'credit' ? '+' : '-'}$
                      {Math.abs(line.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>
                    {line.postedDate} | {line.matchStatus}
                    {line.suggestedPaymentId ? ` | payment ${line.suggestedPaymentId}` : ''}
                    {line.suggestedTransactionIds?.length
                      ? ` | tx ${line.suggestedTransactionIds.join(', ')}`
                      : ''}
                  </div>
                  {line.notes ? (
                    <div style={{ color: '#d1d5db', fontSize: 13 }}>{line.notes}</div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {line.matchStatus === 'suggested' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onAcceptLineSuggestion(selectedReconciliation.id, line.id)
                        }
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(126, 242, 255, 0.28)',
                          background: 'rgba(54, 215, 255, 0.12)',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        Accept Suggestion
                      </button>
                    ) : null}
                    {line.matchStatus !== 'exception' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onFlagLineException(selectedReconciliation.id, line.id)
                        }
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        Flag Exception
                      </button>
                    ) : null}
                    {line.matchStatus === 'exception' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onCreateAdjustingEntry(selectedReconciliation.id, line.id)
                        }
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        Create Adjusting Entry
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onAutoClear(selectedReconciliation.id)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Auto-Clear Settled Payments
            </button>
            <button
              type="button"
              onClick={() =>
                onSaveStatement(
                  selectedReconciliation.id,
                  Number(statementEndingBalance || 0),
                  statementFileName,
                  exceptionNotes,
                  statementFile
                )
              }
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Save Statement Inputs
            </button>
            <button
              type="button"
              onClick={() => onApplySuggestedMatches(selectedReconciliation.id)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Apply Suggested Matches
            </button>
            <button
              type="button"
              onClick={() => onMarkCompleted(selectedReconciliation.id, closeSummary)}
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
              Close Reconciliation
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
