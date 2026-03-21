import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { downloadDocumentFile } from '../../services/documentVault.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface DocumentsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function DocumentsPage({ data, setData }: DocumentsPageProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const focusedDocumentId =
    typeof window !== 'undefined' && window.location.hash.startsWith('#documents:')
      ? window.location.hash.replace('#documents:', '')
      : null;
  const finalCount = data.documents.filter((item) => item.status === 'final').length;
  const draftCount = data.documents.filter((item) => item.status === 'draft').length;
  const verifiedTokenCount = data.tokens.filter((item) => item.status === 'verified').length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Documents & Vault</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Vault-linked records for custody, issuance, reserve, authority, legal support, and ERP source files.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Documents" value={data.documents.length} />
        <StatCard label="Final" value={finalCount} />
        <StatCard label="Draft" value={draftCount} />
        <StatCard label="Vault-Linked" value={data.documents.filter((d) => d.vaultPath).length} />
        <StatCard label="Verification Tokens" value={verifiedTokenCount} />
      </div>

      <PageSection
        title="Vault Records"
        description="Source files, generated packets, and operating evidence in one usable vault desk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.documents.map((doc) => (
            <WorkbenchRecordCard
              key={doc.id}
              title={doc.title}
              subtitle={`${doc.category} | ${doc.status} | ${doc.date}${doc.id === focusedDocumentId ? ' | focused' : ''}`}
              summaryItems={[
                { label: 'Entity', value: data.entities.find((item) => item.id === doc.entityId)?.displayName || doc.entityId },
                { label: 'Output', value: doc.outputStatus || 'Not generated' },
                { label: 'Vault Path', value: doc.vaultPath || 'Vault path not assigned' },
                { label: 'Source File', value: doc.fileName || 'No stored file' },
              ]}
              record={doc}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  documents: prev.documents.map((item) => (item.id === doc.id ? nextRecord : item)),
                }))
              }
              actionSlot={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(doc.fileName || doc.sourceFileId) && doc.sourceFileId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setDownloadingId(doc.id);
                        try {
                          await downloadDocumentFile(
                            doc.sourceFileId,
                            doc.fileName ?? `${doc.title}.bin`,
                          );
                        } finally {
                          setDownloadingId(null);
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(96,165,250,0.4)',
                        background: 'rgba(37,99,235,0.18)',
                        color: '#e5e7eb',
                        cursor: 'pointer',
                      }}
                    >
                      {downloadingId === doc.id ? 'Opening...' : 'Open File'}
                    </button>
                  ) : null}
                </div>
              }
            >
              <div style={{ display: 'grid', gap: 10 }}>
                {doc.summary ? <div>{doc.summary}</div> : null}
                {doc.generatedBody ? (
                  <div
                    style={{
                      borderRadius: 14,
                      padding: 14,
                      background:
                        doc.id === focusedDocumentId
                          ? 'rgba(54, 215, 255, 0.08)'
                          : 'rgba(255,255,255,0.04)',
                      border:
                        doc.id === focusedDocumentId
                          ? '1px solid rgba(126, 242, 255, 0.5)'
                          : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 8,
                        color: 'var(--cf-muted)',
                        fontSize: 13,
                      }}
                    >
                      <div>
                        Template: {doc.templateKey || 'custom'} | Output: {doc.outputStatus || 'drafting'}
                      </div>
                      <div>{doc.sizeBytes ? `${(doc.sizeBytes / 1024).toFixed(1)} KB` : null}</div>
                    </div>
                    <textarea
                      value={doc.generatedBody}
                      onChange={(event) =>
                        setData((prev) => ({
                          ...prev,
                          documents: prev.documents.map((item) =>
                            item.id === doc.id
                              ? { ...item, generatedBody: event.target.value }
                              : item
                          ),
                        }))
                      }
                      style={{
                        width: '100%',
                        minHeight: 180,
                        background: 'rgba(10, 11, 24, 0.78)',
                        color: '#fff6fd',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: 14,
                        padding: 12,
                        fontFamily: 'monospace',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ) : (
                  <div>Use advanced edit for deeper metadata, link maps, and archive handling.</div>
                )}
              </div>
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Remittance & Instrument Evidence"
        description="Private remittance, instrument performance, and MICR-mode control notes."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.remittanceStatements.map((statement) => (
            <WorkbenchRecordCard
              key={statement.id}
              title={statement.title}
              subtitle={`${statement.dischargeMethod} | ${statement.status} | ${statement.statementDate}`}
              summaryItems={[
                { label: 'Payer', value: statement.payerName },
                { label: 'Payee', value: statement.payeeName },
                { label: 'Amount', value: `${statement.currency} ${statement.amount.toLocaleString()}` },
                { label: 'MICR Mode', value: statement.micrLine?.mode || 'Not assigned' },
              ]}
              record={statement}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  remittanceStatements: prev.remittanceStatements.map((item) =>
                    item.id === statement.id ? nextRecord : item
                  ),
                }))
              }
            >
              {statement.notes || 'Use advanced edit to alter MICR references, linked obligations, and performance notes.'}
            </WorkbenchRecordCard>
          ))}
          {data.instrumentSettlements.map((settlement) => (
            <WorkbenchRecordCard
              key={settlement.id}
              title={settlement.title}
              subtitle={`${settlement.dischargeMethod} | ${settlement.performanceStatus} | ${settlement.effectiveDate}`}
              summaryItems={[
                { label: 'Recognition', value: settlement.recognitionBasis },
                { label: 'Face Amount', value: `${settlement.currency} ${settlement.faceAmount.toLocaleString()}` },
                { label: 'Performed', value: `${settlement.currency} ${settlement.performedAmount.toLocaleString()}` },
                { label: 'Treasury', value: settlement.treasuryAccountId || 'No treasury source' },
              ]}
              record={settlement}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  instrumentSettlements: prev.instrumentSettlements.map((item) =>
                    item.id === settlement.id ? nextRecord : item
                  ),
                }))
              }
            >
              {settlement.notes || 'Use advanced edit to control linked settlement, instrument, and remittance references.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Verification Tokens"
        description="Issued and assigned verification or assignment tokens tied to documents, settlements, contracts, and authority records."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.tokens.map((token) => (
            <WorkbenchRecordCard
              key={token.id}
              title={token.label}
              subtitle={`${token.subjectType} | ${token.status} | ${token.tokenReference ?? token.id}`}
              summaryItems={[
                { label: 'Entity', value: data.entities.find((item) => item.id === token.entityId)?.displayName || token.entityId },
                { label: 'Standard', value: token.tokenStandard || 'Internal proof' },
                { label: 'Network', value: token.network || 'Off-chain' },
                { label: 'Issued', value: token.issuedAt },
              ]}
              record={token}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  tokens: prev.tokens.map((item) => (item.id === token.id ? nextRecord : item)),
                }))
              }
            >
              {token.proofReference || 'Use advanced edit to add proof references, revocation notes, and subject metadata.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
