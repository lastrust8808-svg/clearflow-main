import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { downloadDocumentFile } from '../../services/documentVault.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import RecordEditorCard from '../ui/RecordEditorCard';

interface DocumentsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function DocumentsPage({ data, setData }: DocumentsPageProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const finalCount = data.documents.filter((item) => item.status === 'final').length;
  const draftCount = data.documents.filter((item) => item.status === 'draft').length;
  const verifiedTokenCount = data.tokens.filter((item) => item.status === 'verified').length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Documents</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Vault-linked records for custody, issuance, reserve, authority, legal support, and ERP
          source files.
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

      <PageSection title="Vault Records" description="Editable document records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.documents.map((doc) => (
            <div key={doc.id}>
              {(doc.fileName || doc.sourceFileId) && (
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>
                    {doc.fileName ?? 'Stored source file'}
                    {doc.sizeBytes ? ` | ${(doc.sizeBytes / 1024).toFixed(1)} KB` : ''}
                  </div>
                  {doc.sourceFileId ? (
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
                      {downloadingId === doc.id ? 'Opening file...' : 'Open Source File'}
                    </button>
                  ) : null}
                </div>
              )}
              <RecordEditorCard
                title={doc.title}
                subtitle={`${doc.category} | ${doc.status} | ${doc.date}`}
                record={doc}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    documents: prev.documents.map((item) =>
                      item.id === doc.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Verification Tokens"
        description="Issued and assigned verification or assignment tokens tied to documents, settlements, contracts, authority records, and related records."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.tokens.map((token) => (
            <div key={token.id}>
              <RecordEditorCard
                title={token.label}
                subtitle={`${token.subjectType} | ${token.status} | ${token.tokenReference ?? token.id}`}
                record={token}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    tokens: prev.tokens.map((item) => (item.id === token.id ? nextRecord : item)),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
