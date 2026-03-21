import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import EntityProfileCard from '../entities/EntityProfileCard';
import EntityResourceStudio from '../entities/EntityResourceStudio';
import EntityExecutionStudio from '../entities/EntityExecutionStudio';
import StatCard from '../ui/StatCard';

interface EntitiesPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function EntitiesPage({ data, setData }: EntitiesPageProps) {
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

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Entities</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Entity records, workspace identity, and operational defaults for the operating system.
        </p>
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

