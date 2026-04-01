import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
import { downloadDocumentFile, saveDocumentFile } from '../../services/documentVault.service';
import {
  getDocumentStorageProfile,
  isClearFlowRetainedDocument,
  isUserOwnedReadyDocument,
} from '../../services/documentStorage.service';
import DocumentUploadModal from '../documents/DocumentUploadModal';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface DocumentsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

export default function DocumentsPage({ data, setData }: DocumentsPageProps) {
  const auth = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [routingId, setRoutingId] = useState<string | null>(null);
  const [isRoutingAll, setIsRoutingAll] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [focusedDocumentId, setFocusedDocumentId] = useState<string | null>(null);
  const retainedRecordCount = data.documents.filter(isClearFlowRetainedDocument).length;
  const userOwnedReadyCount = data.documents.filter(isUserOwnedReadyDocument).length;
  const readyForDriveIds = data.documents
    .filter((item) => getDocumentStorageProfile(item).externalStatus === 'ready')
    .map((item) => item.id);
  const routedToDriveCount = data.documents.filter(
    (item) => getDocumentStorageProfile(item).externalStatus === 'routed'
  ).length;
  const finalCount = data.documents.filter((item) => item.status === 'final').length;
  const draftCount = data.documents.filter((item) => item.status === 'draft').length;
  const verifiedTokenCount = data.tokens.filter((item) => item.status === 'verified').length;
  const resolveEntityStorageEmail = (entityId?: string) => {
    if (!entityId) {
      return undefined;
    }

    const entity = data.entities.find((item) => item.id === entityId);
    return entity?.entityAccess?.googleStorageEmail || entity?.primaryEmail;
  };

  useEffect(() => {
    const applyHash = () => {
      if (typeof window === 'undefined') {
        return;
      }

      if (window.location.hash === '#documents:upload') {
        setIsUploadModalOpen(true);
        setFocusedDocumentId(null);
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#documents`,
        );
        return;
      }

      if (window.location.hash.startsWith('#documents:')) {
        const targetId = window.location.hash.replace('#documents:', '');
        setFocusedDocumentId(targetId || null);
        return;
      }

      setFocusedDocumentId(null);
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const resolveDocumentAction = (doc: CoreDataBundle['documents'][number]) => {
    if (doc.linkedComplianceTagIds?.length || doc.category === 'tax' || doc.category === 'compliance') {
      return { label: 'Open Compliance', hash: '#compliance' };
    }

    if (doc.linkedInstrumentIds?.length || doc.category === 'financial' || doc.category === 'contract') {
      return { label: 'Open Transactions', hash: '#transactions' };
    }

    if (doc.linkedAuthorityRecordIds?.length || doc.category === 'authority_record' || doc.category === 'governing') {
      return { label: 'Open Entities', hash: '#entities' };
    }

    if (doc.sourceRecordType === 'bill' || doc.sourceRecordType === 'receipt') {
      return { label: 'Open Accounting', hash: '#accounting:dashboard' };
    }

    return { label: 'Open Documents', hash: `#documents:${doc.id}` };
  };

  const routeSingleDocumentToDrive = async (docId: string) => {
    const doc = data.documents.find((item) => item.id === docId);
    if (!doc?.sourceFileId) {
      return;
    }

    const result = await auth.routeDocumentToDrive({
      sourceFileId: doc.sourceFileId,
      fileName: doc.fileName || `${doc.title}.pdf`,
      entityId: doc.entityId,
      targetGoogleEmail: resolveEntityStorageEmail(doc.entityId),
    });

    setData((prev) => ({
      ...prev,
      documents: prev.documents.map((item) =>
        item.id === doc.id
          ? {
              ...item,
              externalStorageTarget: 'google_drive',
              externalStorageStatus: result.success ? 'routed' : 'error',
              externalStorageFileId: result.success ? result.fileId : item.externalStorageFileId,
              externalStorageLabel: result.success
                ? 'Routed to Google Drive'
                : result.error || 'Drive routing failed',
              externalStorageRoutedAt: result.success
                ? new Date().toISOString()
                : item.externalStorageRoutedAt,
            }
          : item
      ),
    }));
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DocumentUploadModal
        open={isUploadModalOpen}
        entities={data.entities}
        onClose={() => setIsUploadModalOpen(false)}
        onSubmit={async (payload) => {
          if (!payload.entityId || !payload.title.trim() || !payload.file) {
            return;
          }

          const stamp = Date.now();
          const fileMetadata = await saveDocumentFile(`doc-upload-${stamp}`, payload.file);
          const shouldAutoRouteToDrive =
            payload.storageOwner === 'user_owned' &&
            data.workspaceSettings.autoRouteUserOwnedDocumentsToDrive &&
            auth.hasDriveAccess;
          const driveRoutingResult = shouldAutoRouteToDrive
            ? await auth.routeDocumentToDrive({
                sourceFileId: fileMetadata.sourceFileId,
                fileName: fileMetadata.fileName,
                entityId: payload.entityId,
                targetGoogleEmail: resolveEntityStorageEmail(payload.entityId),
              })
            : null;

          setData((prev) => ({
            ...prev,
            documents: [
              {
                id: `doc-upload-${stamp}`,
                entityId: payload.entityId,
                title: payload.title.trim(),
                category: payload.category,
                date: payload.date,
                status: 'final',
                fileName: fileMetadata.fileName,
                mimeType: fileMetadata.mimeType,
                sizeBytes: fileMetadata.sizeBytes,
                uploadedAt: fileMetadata.uploadedAt,
                sourceFileId: fileMetadata.sourceFileId,
                sourceRecordType: 'document',
                sourceRecordId: `doc-upload-${stamp}`,
                vaultPath: `/vault/${payload.entityId}/documents/${fileMetadata.fileName}`,
                summary: payload.summary.trim() || 'Uploaded through the document vault desk.',
                storageOwner: payload.storageOwner,
                retentionClass: payload.retentionClass,
                storageNotes:
                  payload.storageOwner === 'clearflow_retained'
                    ? 'Marked for ClearFlow retained storage so it stays inside the platform-held agreement, custody, or compliance record layer.'
                    : 'Workspace-owned document retained in the ClearFlow vault and ready for user-owned external storage routing when enabled.',
                externalStorageTarget:
                  payload.storageOwner === 'user_owned' ? 'google_drive' : undefined,
                externalStorageStatus:
                  payload.storageOwner === 'user_owned'
                    ? driveRoutingResult?.success
                      ? 'routed'
                      : shouldAutoRouteToDrive
                        ? 'error'
                        : 'ready'
                    : 'not_applicable',
                externalStorageFileId:
                  payload.storageOwner === 'user_owned' && driveRoutingResult?.success
                    ? driveRoutingResult.fileId
                    : undefined,
                externalStorageLabel:
                  payload.storageOwner === 'user_owned'
                    ? driveRoutingResult?.success
                      ? 'Auto-routed to Google Drive'
                      : shouldAutoRouteToDrive
                        ? driveRoutingResult?.error || 'Automatic Google Drive routing failed'
                        : 'Ready for Google Drive routing'
                    : undefined,
                externalStorageRoutedAt:
                  payload.storageOwner === 'user_owned' && driveRoutingResult?.success
                    ? new Date().toISOString()
                    : undefined,
              },
              ...prev.documents,
            ],
          }));
          setIsUploadModalOpen(false);
          goToHash(`#documents:doc-upload-${stamp}`);
        }}
      />
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Documents & Vault</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Vault-linked records for custody, issuance, reserve, authority, legal support, and ERP source files.
        </p>
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
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
            + Upload Document
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
        <StatCard label="Documents" value={data.documents.length} />
        <StatCard label="Final" value={finalCount} />
        <StatCard label="Draft" value={draftCount} />
        <StatCard label="Vault-Linked" value={data.documents.filter((d) => d.vaultPath).length} />
        <StatCard label="User-Owned Ready" value={userOwnedReadyCount} />
        <StatCard label="Drive Routed" value={routedToDriveCount} />
        <StatCard label="Retained Records" value={retainedRecordCount} />
        <StatCard label="Verification Tokens" value={verifiedTokenCount} />
      </div>

      <PageSection
        title="Storage Posture"
        description="ClearFlow separates user-owned workspace records from the platform records it must retain."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <WorkbenchRecordCard
            title="User-Owned Workspace Records"
            subtitle="Operational files, uploads, and working packets"
            summaryItems={[
              { label: 'Upload Records', value: userOwnedReadyCount },
              {
                label: 'Vault Files',
                value: data.documents.filter((item) => item.sourceFileId).length,
              },
            ]}
          >
            General user documents and workflow packets are the part of the workspace best suited for external, user-owned storage paths such as Google Drive when that path is enabled.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="ClearFlow Retained Records"
            subtitle="Agreement, custody, and internal security support"
            summaryItems={[
              { label: 'Retained Documents', value: retainedRecordCount },
              { label: 'Retained Tokens', value: data.tokens.filter((item) => item.label.includes('ClearFlow Agreement')).length },
            ]}
          >
            Terms acceptance, internal security agreement support, and platform custody/compliance records stay inside ClearFlow&apos;s own retained record layer.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Drive Routing Queue"
            subtitle="User-owned records that can move into user-controlled Google Drive storage"
            summaryItems={[
              { label: 'Drive Access', value: auth.hasDriveAccess ? 'Connected' : 'Not connected' },
              {
                label: 'Ready',
                value: data.documents.filter(
                  (item) => getDocumentStorageProfile(item).externalStatus === 'ready'
                ).length,
              },
              { label: 'Routed', value: routedToDriveCount },
            ]}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                User-owned workspace records can be routed into Google Drive from the vault desk when Google Drive access is active. ClearFlow-retained records stay internal.
              </div>
              {auth.hasDriveAccess && readyForDriveIds.length > 1 ? (
                <button
                  type="button"
                  onClick={async () => {
                    setIsRoutingAll(true);
                    for (const docId of readyForDriveIds) {
                      await routeSingleDocumentToDrive(docId);
                    }
                    setIsRoutingAll(false);
                  }}
                  style={{
                    width: 'fit-content',
                    padding: '10px 14px',
                    minHeight: 42,
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(14, 116, 144, 0.24)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {isRoutingAll ? 'Routing All...' : 'Route All Ready Files'}
                </button>
              ) : null}
              {!auth.hasDriveAccess ? (
                <button
                  type="button"
                  onClick={() => auth.requestDriveAccess()}
                  style={{
                    width: 'fit-content',
                    padding: '10px 14px',
                    minHeight: 42,
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(54, 215, 255, 0.1)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Connect Google Drive
                </button>
              ) : null}
            </div>
          </WorkbenchRecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Vault Records"
        description="Source files, generated packets, and operating evidence in one usable vault desk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.documents.map((doc) => {
            const storageProfile = getDocumentStorageProfile(doc);

            return (
              <WorkbenchRecordCard
                key={doc.id}
                title={doc.title}
                subtitle={`${doc.category} | ${doc.status} | ${doc.date}${doc.id === focusedDocumentId ? ' | focused' : ''}`}
                summaryItems={[
                  {
                    label: 'Entity',
                    value:
                      data.entities.find((item) => item.id === doc.entityId)?.displayName ||
                      doc.entityId,
                  },
                  { label: 'Output', value: doc.outputStatus || 'Not generated' },
                  { label: 'Vault Path', value: doc.vaultPath || 'Vault path not assigned' },
                  { label: 'Source File', value: doc.fileName || 'No stored file' },
                  { label: 'Storage Owner', value: storageProfile.ownerLabel },
                  { label: 'Retention', value: storageProfile.retentionLabel },
                  { label: 'External Route', value: storageProfile.externalStatusLabel },
                ]}
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
                    <button
                      type="button"
                      onClick={() => goToHash(resolveDocumentAction(doc).hash)}
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
                      {resolveDocumentAction(doc).label}
                    </button>
                    {storageProfile.driveEligible &&
                    storageProfile.externalStatus !== 'routed' &&
                    doc.sourceFileId &&
                    auth.hasDriveAccess ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setRoutingId(doc.id);
                          await routeSingleDocumentToDrive(doc.id);
                          setRoutingId(null);
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(126,242,255,0.28)',
                          background: 'rgba(14, 116, 144, 0.24)',
                          color: '#effcff',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {routingId === doc.id ? 'Routing...' : 'Route to Drive'}
                      </button>
                    ) : null}
                  </div>
                }
              >
                <div style={{ display: 'grid', gap: 10 }}>
                  {doc.summary ? <div>{doc.summary}</div> : null}
                  {doc.storageNotes ? (
                    <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>{doc.storageNotes}</div>
                  ) : (
                    <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                      {storageProfile.owner === 'clearflow_retained'
                        ? "This record stays inside ClearFlow's retained record layer."
                        : 'This record is part of the user workspace and is a candidate for user-owned drive routing.'}
                    </div>
                  )}
                  {doc.externalStorageLabel ? (
                    <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                      {doc.externalStorageLabel}
                      {doc.externalStorageRoutedAt
                        ? ` | ${doc.externalStorageRoutedAt.slice(0, 10)}`
                        : ''}
                    </div>
                  ) : null}
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
            );
          })}
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
            >
              {token.proofReference || 'Use advanced edit to add proof references, revocation notes, and subject metadata.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
