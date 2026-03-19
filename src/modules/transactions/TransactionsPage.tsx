import React from 'react';
import { useCoreData } from '../../hooks/useCoreData';

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 16,
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

export default function TransactionsPage() {
  const {
    transactions,
    transactionTaxProfiles,
    generatedReportingPackets,
    onChainTransactions,
    entities,
  } = useCoreData();

  const entityNameById = Object.fromEntries(entities.map((entity) => [entity.id, entity.name]));
  const taxProfileByTxnId = Object.fromEntries(
    (transactionTaxProfiles ?? []).map((profile) => [profile.transactionId, profile])
  );

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Transactions</div>
        <div style={{ opacity: 0.72 }}>
          Movement, reporting triggers, UCC/tax packet generation, and on-chain activity.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Transaction Register</div>

            <div style={{ display: 'grid', gap: 12 }}>
              {transactions.map((txn) => {
                const profile = taxProfileByTxnId[txn.id];

                return (
                  <div
                    key={txn.id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800 }}>{txn.description}</div>
                        <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                          {txn.date} • {txn.type} • {entityNameById[txn.entityId] ?? txn.entityId}
                          {txn.counterpartyName ? ` • ${txn.counterpartyName}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>{money(txn.amount)}</div>
                        <div style={{ opacity: 0.65, fontSize: 12 }}>{txn.paymentMedium ?? 'n/a'}</div>
                      </div>
                    </div>

                    {profile && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 12,
                          background: 'rgba(37,99,235,0.12)',
                          border: '1px solid rgba(37,99,235,0.28)',
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Reporting Review</div>
                        <div style={{ opacity: 0.84, fontSize: 14, marginBottom: 6 }}>
                          {profile.reasoning}
                        </div>
                        <div style={{ fontSize: 13, opacity: 0.75 }}>
                          Candidate Forms: {profile.candidateForms.join(', ')} • Status: {profile.filingStatus}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>On-Chain Activity</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {onChainTransactions.map((txn) => (
                <div
                  key={txn.id}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{txn.eventType} • {txn.network}</div>
                  <div style={{ opacity: 0.72, fontSize: 13, marginTop: 4 }}>{txn.timestamp}</div>
                  <div style={{ opacity: 0.82, fontSize: 13, marginTop: 6, wordBreak: 'break-all' }}>
                    {txn.txHash}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Generated Reporting Packets</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {(generatedReportingPackets ?? []).map((packet) => (
                <div
                  key={packet.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{packet.title}</div>
                  <div style={{ opacity: 0.72, fontSize: 13, marginTop: 4 }}>
                    {packet.formType} • {packet.filingStatus} • {packet.taxYear}
                  </div>
                  {packet.notes && (
                    <div style={{ opacity: 0.72, fontSize: 13, marginTop: 6 }}>{packet.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Workflow Intent</div>
            <div style={{ display: 'grid', gap: 10, opacity: 0.84, lineHeight: 1.5 }}>
              <div>• classify every transaction</div>
              <div>• detect tax / UCC packet candidates</div>
              <div>• generate draft reporting packet</div>
              <div>• verify before filing</div>
              <div>• track corrected / approved / filed state</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
