import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import EntityProfileCard from '../entities/EntityProfileCard';
import EntityResourceStudio from '../entities/EntityResourceStudio';
import EntityExecutionStudio from '../entities/EntityExecutionStudio';
import EntityQuickAddModal from '../entities/EntityQuickAddModal';
import StatCard from '../ui/StatCard';

interface EntitiesPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

export default function EntitiesPage({ data, setData }: EntitiesPageProps) {
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const activeEntities = data.entities.filter((entity) => entity.status === 'active').length;
  const tokenEnabledEntities = data.entities.filter(
    (entity) => entity.operationalDefaults?.autoIssueVerificationTokens
  ).length;
  const pendingSignerApprovals = data.authorityRecords.filter(
    (record) => record.approvalStatus === 'pending_acceptance'
  ).length;
  const bankPackagesInFlight = data.bankAccounts.filter(
    (account) => account.onboardingStatus && account.onboardingStatus !== 'connected'
  ).length;

  const resolveEntitySetupDocument = (entityId: string) =>
    data.documents.find(
      (document) =>
        document.entityId === entityId &&
        (document.templateKey === 'formation_packet' || document.category === 'authority_record'),
    );

  useEffect(() => {
    const applyHash = () => {
      if (typeof window === 'undefined') {
        return;
      }

      if (window.location.hash === '#entities:new') {
        setIsEntityModalOpen(true);
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#entities`,
        );
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <EntityQuickAddModal
        open={isEntityModalOpen}
        onClose={() => setIsEntityModalOpen(false)}
        onSubmit={(payload) => {
          const stamp = Date.now();
          const entityId = `ent-${stamp}`;
          const authorityId = `auth-${stamp}`;
          const documentId = `doc-${stamp}`;
          const tokenId = `tok-${stamp}`;
          const entityDisplayName = payload.displayName.trim() || payload.name.trim();
          setData((prev) => ({
            ...prev,
            entities: [
              {
                id: entityId,
                name: payload.name.trim(),
                displayName: entityDisplayName,
                type: payload.type,
                jurisdiction: payload.jurisdiction.trim() || undefined,
                country: payload.country.trim() || undefined,
                formationDate: new Date().toISOString().slice(0, 10),
                status: 'active',
                representativeName: payload.representativeName.trim() || undefined,
                representativeRole: payload.representativeRole.trim() || undefined,
                branding: {
                  accentColor: prev.workspaceSettings.preferredAccentColor || '#36d7ff',
                  documentLogoText: entityDisplayName,
                  emailFromName: entityDisplayName,
                  invoiceFooterNote: 'Operational records generated through ClearFlow.',
                },
                numbering: {
                  invoicePrefix: 'INV',
                  quotePrefix: 'QTE',
                  billPrefix: 'BILL',
                  receiptPrefix: 'RCPT',
                  journalPrefix: 'JE',
                  nextInvoiceSequence: 1,
                  nextQuoteSequence: 1,
                  nextBillSequence: 1,
                  nextReceiptSequence: 1,
                  nextJournalSequence: 1,
                },
                operationalDefaults: {
                  baseCurrency: prev.workspaceSettings.baseCurrency,
                  fiscalYearStartMonth: 1,
                  defaultSettlementPath: prev.workspaceSettings.defaultSettlementPath,
                  interEntitySettlementMode: prev.workspaceSettings.defaultInterEntitySettlementMode,
                  autoIssueVerificationTokens: prev.workspaceSettings.autoIssueVerificationTokens,
                  autoReconcileLedgerLinks: prev.workspaceSettings.autoReconcileJournalEntries,
                },
              },
              ...prev.entities,
            ],
            authorityRecords: [
              {
                id: authorityId,
                entityId,
                personName: payload.representativeName.trim() || entityDisplayName,
                recordType:
                  payload.type === 'trust'
                    ? 'trustee_authority'
                    : ('manager_authority' as const),
                effectiveDate: new Date().toISOString().slice(0, 10),
                clientAuthorizationStatus: 'active',
                linkedTokenIds: [tokenId],
                linkedDocumentIds: [documentId],
                notes: 'Created automatically during entity setup.',
              },
              ...prev.authorityRecords,
            ],
            documents: [
              {
                id: documentId,
                entityId,
                title: `${entityDisplayName} Setup Packet`,
                category: 'authority_record',
                date: new Date().toISOString().slice(0, 10),
                status: 'draft',
                templateKey: 'formation_packet',
                outputStatus: 'drafting',
                linkedAuthorityRecordIds: [authorityId],
                linkedTokenIds: [tokenId],
                summary: 'Initial setup packet created automatically from the entity profile flow.',
              },
              ...prev.documents,
            ],
            tokens: [
              {
                id: tokenId,
                entityId,
                subjectType: 'authority_record',
                subjectId: authorityId,
                label: `${entityDisplayName} Authority Token`,
                status: 'issued',
                tokenStandard: 'internal-proof',
                tokenReference: `AUTH-${stamp}`,
                issuedAt: new Date().toISOString(),
                proofReference: 'Issued automatically from entity creation.',
              },
              ...prev.tokens,
            ],
          }));
          setIsEntityModalOpen(false);
          goToHash(`#documents:${documentId}`);
        }}
      />
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Entities</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Entity records, workspace identity, and operational defaults for the operating system.
        </p>
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setIsEntityModalOpen(true)}
            style={{
              padding: '10px 14px',
              minHeight: 42,
              borderRadius: 10,
              border: '1px solid rgba(126,242,255,0.28)',
              background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            + Add Entity
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Entities" value={String(data.entities.length)} />
        <StatCard label="Active Profiles" value={String(activeEntities)} />
        <StatCard label="Token-Ready Defaults" value={String(tokenEnabledEntities)} />
        <StatCard label="Pending Signer Acceptances" value={String(pendingSignerApprovals)} />
        <StatCard label="Bank Packages In Flight" value={String(bankPackagesInFlight)} />
      </div>

      <PageSection
        title="Entity Records"
        description="Edit legal identity, numbering, branding, and default settlement behavior without touching raw JSON."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.entities.map((entity) => (
            <div key={entity.id}>
              <EntityProfileCard
                entity={entity}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    entities: prev.entities.map((item) =>
                      item.id === entity.id ? nextRecord : item
                    ),
                  }))
                }
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {resolveEntitySetupDocument(entity.id) ? (
                  <button
                    type="button"
                    onClick={() => goToHash(`#documents:${resolveEntitySetupDocument(entity.id)?.id}`)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Open Setup Packet
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => goToHash('#documents')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(54, 215, 255, 0.09)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Open Documents
                </button>
                <button
                  type="button"
                  onClick={() => goToHash('#accounting:dashboard')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(54, 215, 255, 0.09)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Open Accounting
                </button>
                <button
                  type="button"
                  onClick={() => goToHash('#compliance')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(54, 215, 255, 0.09)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Open Compliance
                </button>
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Entity Resource Studio"
        description="Create the working resources an entity needs to operate: bank accounts, wallets, authority records, obligations, instruments, and control documents."
      >
        <EntityResourceStudio data={data} setData={setData} />
      </PageSection>

      <PageSection
        title="Entity Execution Studio"
        description="Launch linked setup bundles for formation, signers, banking, governing documents, and compliance kickoff."
      >
        <EntityExecutionStudio data={data} setData={setData} />
      </PageSection>

      <PageSection
        title="Signer Acceptance Desk"
        description="Track signer assignments, acceptance state, and verification readiness."
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {data.authorityRecords.map((record) => (
            <div
              key={record.id}
              style={{
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                padding: 14,
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{record.personName}</div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                    {record.recordType} | approval: {record.approvalStatus || 'draft'}
                  </div>
                </div>
                <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                  {record.signerEmail || record.signerPhone || 'No signer contact set'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['draft', 'pending_acceptance', 'accepted', 'declined'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        authorityRecords: prev.authorityRecords.map((item) =>
                          item.id === record.id
                            ? {
                                ...item,
                                approvalStatus: status,
                                acceptedAt:
                                  status === 'accepted'
                                    ? new Date().toISOString()
                                    : item.acceptedAt,
                                acceptedBy:
                                  status === 'accepted'
                                    ? item.personName
                                    : item.acceptedBy,
                              }
                            : item
                        ),
                      }))
                    }
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background:
                        record.approvalStatus === status
                          ? 'rgba(37,99,235,0.22)'
                          : 'rgba(255,255,255,0.04)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                    }}
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Bank Onboarding Desk"
        description="Work the onboarding checklist and use linked document slots to complete the package."
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {data.bankAccounts.map((account) => (
            <div
              key={account.id}
              style={{
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                padding: 14,
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{account.accountName}</div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                    {account.institutionName} | onboarding: {account.onboardingStatus || 'not tracked'}
                  </div>
                </div>
                {account.linkedDocumentIds?.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = account.linkedDocumentIds?.[0];
                      if (targetId) {
                        window.location.hash = `documents:${targetId}`;
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
                    Open Packet
                  </button>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['draft', 'collecting', 'ready', 'submitted', 'connected'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        bankAccounts: prev.bankAccounts.map((item) =>
                          item.id === account.id ? { ...item, onboardingStatus: status } : item
                        ),
                      }))
                    }
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background:
                        account.onboardingStatus === status
                          ? 'rgba(37,99,235,0.22)'
                          : 'rgba(255,255,255,0.04)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                    }}
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
              {account.onboardingChecklist?.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {account.onboardingChecklist.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'rgba(8, 13, 27, 0.56)',
                      }}
                    >
                      <div>
                        <div>{item.label}</div>
                        {item.linkedDocumentId ? (
                          <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
                            Linked doc:{' '}
                            {data.documents.find((doc) => doc.id === item.linkedDocumentId)?.title ||
                              item.linkedDocumentId}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(['pending', 'ready', 'completed'] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() =>
                              setData((prev) => ({
                                ...prev,
                                bankAccounts: prev.bankAccounts.map((bankAccount) =>
                                  bankAccount.id === account.id
                                    ? {
                                        ...bankAccount,
                                        onboardingChecklist: bankAccount.onboardingChecklist?.map(
                                          (checklistItem) =>
                                            checklistItem.id === item.id
                                              ? { ...checklistItem, status }
                                              : checklistItem
                                        ),
                                      }
                                    : bankAccount
                                ),
                              }))
                            }
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background:
                                item.status === status
                                  ? 'rgba(37,99,235,0.22)'
                                  : 'rgba(255,255,255,0.04)',
                              color: '#e5e7eb',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            {status}
                          </button>
                        ))}
                        {item.linkedDocumentId ? (
                          <button
                            type="button"
                            onClick={() => {
                              window.location.hash = `documents:${item.linkedDocumentId}`;
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              border: '1px solid rgba(96,165,250,0.4)',
                              background: 'rgba(37,99,235,0.18)',
                              color: '#e5e7eb',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Open Doc
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

