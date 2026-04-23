import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { CoreDataBundle } from '../../types/core';
import type { User } from '../../types/app.models';
import PageSection from '../ui/PageSection';
import EntityProfileCard from '../entities/EntityProfileCard';
import EntityResourceStudio from '../entities/EntityResourceStudio';
import EntityExecutionStudio from '../entities/EntityExecutionStudio';
import EntityQuickAddModal from '../entities/EntityQuickAddModal';
import EntityConnectionRailModal from '../entities/EntityConnectionRailModal';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';
import { buildPrivateWealthRailSummaries } from '../../services/privateWealthRail.service';
import {
  buildEntityDispatchIdentity,
  buildEntitySealDesign,
} from '../../services/dispatchIdentity.service';
import { saveDocumentFile } from '../../services/documentVault.service';
import { analyzeAuthorityProofFile } from '../../services/authorityProofMatching.service';
import { useAuth } from '../../hooks/useAuth';

interface EntitiesPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
  currentUser?: User | null;
  hasDriveAccess?: boolean;
  activeEntityId?: string | null;
  onSetActiveEntity?: (entityId: string | null) => void;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

export default function EntitiesPage({
  data,
  setData,
  currentUser,
  hasDriveAccess = false,
  activeEntityId,
  onSetActiveEntity,
}: EntitiesPageProps) {
  const auth = useAuth();
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isConnectionRailModalOpen, setIsConnectionRailModalOpen] = useState(false);
  const [connectionRailPreset, setConnectionRailPreset] = useState<'general' | 'business_partner'>(
    'general',
  );
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
  const internalConnections = data.entityConnections.filter(
    (connection) => connection.connectionType === 'internal_entity'
  ).length;
  const externalConnections = data.entityConnections.filter(
    (connection) => connection.connectionType !== 'internal_entity'
  ).length;
  const activeCreditRails = data.creditRails.filter((rail) => rail.status === 'active').length;
  const watchCreditRails = data.creditRails.filter((rail) => rail.status === 'watch').length;
  const authorityReviewTags = data.complianceTags.filter(
    (tag) => tag.category === 'authority' && tag.status === 'review',
  );
  const authorityReadyEntities = data.entities.filter((entity) => {
    const hasRepresentative = Boolean(entity.representativeName && entity.representativeRole);
    const hasAttestation = Boolean(entity.authorityAttestedAt);
    const proofReady =
      entity.authorityProofStatus === 'matched' || entity.authorityProofStatus === 'similar_match';
    const hasAuthorityReview = authorityReviewTags.some((tag) => tag.entityId === entity.id);
    return hasRepresentative && hasAttestation && proofReady && !hasAuthorityReview;
  }).length;
  const authorityWatchEntities = data.entities.filter((entity) =>
    authorityReviewTags.some((tag) => tag.entityId === entity.id),
  ).length;

  const entityNameById = new Map(
    data.entities.map((entity) => [entity.id, entity.displayName || entity.name]),
  );
  const treasuryNameById = new Map(data.treasuryAccounts.map((account) => [account.id, account.name]));
  const privateWealthRailSummaries = buildPrivateWealthRailSummaries(data);
  const orderedEntities = [...data.entities].sort((left, right) => {
    if (left.id === activeEntityId) return -1;
    if (right.id === activeEntityId) return 1;
    return (left.displayName || left.name).localeCompare(right.displayName || right.name);
  });
  const authorityHeldEntities = orderedEntities.filter(
    (entity) =>
      entity.authorityTransactionsPaused ||
      authorityReviewTags.some((tag) => tag.entityId === entity.id) ||
      Boolean(entity.authorityProofRequiredPartyNames?.length),
  );
  const firstHeldEntity = authorityHeldEntities[0];
  const visibleAuthorityRecords = data.authorityRecords.filter((record, index, records) => {
    const makeKey = (item: typeof record) =>
      [item.entityId, item.personName.trim().toLowerCase(), item.recordType, item.signerEmail?.trim().toLowerCase() || ''].join('|');
    return index === records.findIndex((candidate) => makeKey(candidate) === makeKey(record));
  });

  const resolveEntitySetupDocument = (entityId: string) =>
    data.documents.find(
      (document) =>
        document.entityId === entityId &&
        (document.templateKey === 'formation_packet' || document.category === 'authority_record'),
    );

  const openAuthorityWorkspace = (entityId?: string | null) => {
    if (entityId) {
      onSetActiveEntity?.(entityId);
    }
    if (typeof window !== 'undefined') {
      window.location.hash = '#entities:authority';
      window.setTimeout(() => {
        document.getElementById('entity-authority-workspace')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 60);
    }
  };

  const releaseAuthorityHold = (entityId: string) => {
    setData((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              authorityTransactionsPaused: false,
              authorityProofStatus:
                entity.authorityProofStatus === 'matched' ? entity.authorityProofStatus : 'similar_match',
              authorityProofSummary: `${entity.authorityProofSummary || 'Authority reviewed.'} Release hold cleared by operator on ${new Date().toISOString().slice(0, 10)}.`,
            }
          : entity,
      ),
      authorityRecords: prev.authorityRecords.map((record) =>
        record.entityId === entityId
          ? {
              ...record,
              clientAuthorizationStatus:
                record.clientAuthorizationStatus === 'revoked'
                  ? record.clientAuthorizationStatus
                  : 'active',
              approvalStatus:
                record.approvalStatus === 'declined' ? record.approvalStatus : 'accepted',
              acceptedAt: record.acceptedAt || new Date().toISOString(),
              acceptedBy: record.acceptedBy || currentUser?.name || record.personName,
            }
          : record,
      ),
      complianceTags: prev.complianceTags.map((tag) =>
        tag.category === 'authority' && tag.entityId === entityId && tag.status === 'review'
          ? {
              ...tag,
              status: 'ok',
              notes: `${tag.notes || tag.label} Authority hold cleared by operator on ${new Date().toISOString().slice(0, 10)}.`,
            }
          : tag,
      ),
    }));
  };

  const deleteEntityProfile = (entityId: string) => {
    const entityLabel = entityNameById.get(entityId) || 'this entity';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete ${entityLabel}? This removes the entity profile and linked setup/authority records from this workspace.`)
    ) {
      return;
    }

    setData((prev) => ({
      ...prev,
      entities: prev.entities.filter((entity) => entity.id !== entityId),
      authorityRecords: prev.authorityRecords.filter((record) => record.entityId !== entityId),
      complianceTags: prev.complianceTags.filter((tag) => tag.entityId !== entityId),
      documents: prev.documents.filter((document) => document.entityId !== entityId),
      tokens: prev.tokens.filter((token) => token.entityId !== entityId),
      bankAccounts: prev.bankAccounts.filter((account) => account.entityId !== entityId),
      treasuryAccounts: prev.treasuryAccounts.filter((account) => account.entityId !== entityId),
      wallets: prev.wallets.filter((wallet) => wallet.entityId !== entityId),
      entityConnections: prev.entityConnections.filter(
        (connection) =>
          connection.ownerEntityId !== entityId && connection.connectedEntityId !== entityId,
      ),
      creditRails: prev.creditRails.filter((rail) => rail.ownerEntityId !== entityId),
      instruments: prev.instruments.filter((instrument) => instrument.entityId !== entityId),
      obligations: prev.obligations.filter((obligation) => obligation.entityId !== entityId),
      instrumentSettlements: prev.instrumentSettlements.filter((settlement) => settlement.entityId !== entityId),
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.filter(
        (register) =>
          register.entityId !== entityId &&
          register.issuerEntityId !== entityId &&
          register.currentHolderEntityId !== entityId,
      ),
      holderLedgerEntries: prev.holderLedgerEntries.filter((entry) => entry.entityId !== entityId),
      remittanceStatements: prev.remittanceStatements.filter((statement) => statement.entityId !== entityId),
      entityMarkUsageRecords: prev.entityMarkUsageRecords.filter((record) => record.entityId !== entityId),
    }));

    if (activeEntityId === entityId) {
      onSetActiveEntity?.(null);
    }
  };

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
      } else if (window.location.hash === '#entities:connections') {
        setConnectionRailPreset('general');
        setIsConnectionRailModalOpen(true);
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
        currentUserEmail={currentUser?.email}
        currentUserName={currentUser?.name}
        onClose={() => setIsEntityModalOpen(false)}
        onSubmit={async (payload) => {
          if (!payload.authorityAttested) {
            return;
          }
          const stamp = Date.now();
          const entityId = `ent-${stamp}`;
          const authorityId = `auth-${stamp}`;
          const documentId = `doc-${stamp}`;
          const tokenId = `tok-${stamp}`;
          const authorityReviewTagId = `cmp-${stamp}`;
          const entityDisplayName = payload.displayName.trim() || payload.name.trim();
          const normalizedRole = payload.representativeRole.trim().toLowerCase();
          const authorityProofAnalysis = await analyzeAuthorityProofFile({
            file: payload.authorityProofFile,
            operatorName: currentUser?.name || currentUser?.clearflowTermsSignerName || null,
            representativeName: payload.representativeName,
            entityName: entityDisplayName,
          });
          let proofFileMetadata = null;
          if (payload.authorityProofFile) {
            try {
              proofFileMetadata = await saveDocumentFile(
                `entity-authority-proof-${entityId}`,
                payload.authorityProofFile,
              );
            } catch (error) {
              console.warn('Failed to save entity authority proof file.', error);
            }
          }
          const requiresAuthorityReview =
            payload.type === 'other' ||
            normalizedRole.includes('agent') ||
            normalizedRole.includes('attorney') ||
            normalizedRole.includes('authorized representative') ||
            authorityProofAnalysis.status === 'missing' ||
            authorityProofAnalysis.status === 'review' ||
            authorityProofAnalysis.status === 'mismatch';
          const requiredAdditionalPartyNames = Array.from(
            new Set(
              authorityProofAnalysis.requiredAdditionalNames
                .map((name) => name.trim())
                .filter(Boolean)
                .filter(
                  (name) =>
                    name.toLowerCase() !==
                    (payload.representativeName.trim() || entityDisplayName).toLowerCase(),
                ),
            ),
          );
          const dispatchIdentity = payload.generateDispatchIdentity
            ? buildEntityDispatchIdentity({
                entityId,
                entityName: entityDisplayName,
                country: payload.country,
                uspsMailerId: data.workspaceSettings.uspsMailerId,
                uspsCrid: data.workspaceSettings.uspsCrid,
              })
            : null;
          setData((prev) => {
            const entityEmail =
              payload.googleStorageEmail.trim() ||
              payload.primaryEmail.trim() ||
              undefined;
            const storageEmail = entityEmail || currentUser?.email || undefined;
            const nextBundle = {
              ...prev,
            entities: [
              {
                id: entityId,
                name: payload.name.trim(),
                displayName: entityDisplayName,
                type: payload.type,
                primaryEmail: entityEmail || currentUser?.email || undefined,
                jurisdiction: payload.jurisdiction.trim() || undefined,
                country: payload.country.trim() || undefined,
                formationDate: new Date().toISOString().slice(0, 10),
                status: 'active',
                representativeName: payload.representativeName.trim() || undefined,
                representativeRole: payload.representativeRole.trim() || undefined,
                authorityAttestedAt: new Date().toISOString(),
                authorityAttestationStatement: `${payload.representativeName.trim() || 'Authorized representative'} acting as ${payload.representativeRole.trim() || 'authorized representative'} affirmed legal authority to establish and operate ${entityDisplayName} in ClearFlow.`,
                authorityProofDocumentId: documentId,
                authorityProofUploadedAt: new Date().toISOString(),
                authorityProofStatus: authorityProofAnalysis.status,
                authorityProofSummary: authorityProofAnalysis.summary,
                authorityProofNamedPartyNames: authorityProofAnalysis.extractedNames,
                authorityProofRequiredPartyNames: requiredAdditionalPartyNames,
                authorityTransactionsPaused:
                  authorityProofAnalysis.status !== 'matched' &&
                  authorityProofAnalysis.status !== 'similar_match',
                entityAccess: {
                  googleStorageEmail: storageEmail,
                  storageMode:
                    payload.storageMode ||
                    (currentUser?.email ? 'operator_google' : 'internal_only'),
                  driveConnectionStatus:
                    payload.storageMode === 'internal_only'
                      ? 'internal_only'
                      : !hasDriveAccess
                        ? 'not_connected'
                        : (
                            storageEmail
                          )?.trim().toLowerCase() === currentUser?.email?.trim().toLowerCase()
                          ? 'connected'
                          : 'needs_google_switch',
                  shareInCollectiveOverview: true,
                  shareInOperatorDashboard: true,
                },
                branding: {
                  accentColor: prev.workspaceSettings.preferredAccentColor || '#36d7ff',
                  documentLogoText: entityDisplayName,
                  emailFromName: entityDisplayName,
                  replyToEmail: entityEmail || currentUser?.email || undefined,
                  invoiceFooterNote: 'Operational records generated through ClearFlow.',
                  sealValueEnabled: true,
                  sealUnitValue: 1,
                  sealValueCurrency: prev.workspaceSettings.baseCurrency,
                  sealTemplate: 'round',
                  sealPrimaryText: entityDisplayName,
                  sealSecondaryText: payload.jurisdiction.trim() || payload.country.trim() || 'ClearFlow Entity Seal',
                  sealInkColor: prev.workspaceSettings.preferredAccentColor || '#36d7ff',
                  entitySealSvg: buildEntitySealDesign({
                    entityName: entityDisplayName,
                    jurisdiction: payload.jurisdiction.trim() || payload.country.trim() || undefined,
                    template: 'round',
                    primaryText: entityDisplayName,
                    secondaryText:
                      payload.jurisdiction.trim() || payload.country.trim() || 'ClearFlow Entity Seal',
                    inkColor: prev.workspaceSettings.preferredAccentColor || '#36d7ff',
                  }),
                  autoGenerateDispatchIdentity: payload.generateDispatchIdentity,
                  entityMailingLine: dispatchIdentity?.mailingLine,
                  entityProofSealCode: dispatchIdentity?.proofSealCode,
                  entityQrPayload: dispatchIdentity?.qrPayload,
                  entityQrSealSvg: dispatchIdentity?.qrSealSvg,
                  entityMailingBarcodeSvg: dispatchIdentity?.mailingBarcodeSvg,
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
                notes: `Created automatically during entity setup. Operator attested that ${payload.representativeName.trim() || 'the representative'} is authorized to establish and operate ${entityDisplayName} in ClearFlow as ${payload.representativeRole.trim() || 'an authorized representative'}.`,
              },
              ...requiredAdditionalPartyNames.map((personName, index) => ({
                id: `${authorityId}-additional-${index + 1}`,
                entityId,
                personName,
                recordType:
                  payload.type === 'trust'
                    ? 'trustee_authority'
                    : ('manager_authority' as const),
                effectiveDate: new Date().toISOString().slice(0, 10),
                clientAuthorizationStatus: 'unknown',
                approvalStatus: 'pending_acceptance' as const,
                linkedDocumentIds: [documentId],
                notes: `Named in uploaded authority proof during onboarding. Add ${personName} to the workspace or clear the authority review before external transactions.`,
              })),
              ...prev.authorityRecords,
            ],
            documents: [
              {
                id: documentId,
                entityId,
                title: `${entityDisplayName} Authority Proof Packet`,
                category: 'authority_record',
                date: new Date().toISOString().slice(0, 10),
                status: 'final',
                templateKey: 'formation_packet',
                outputStatus: requiresAuthorityReview ? 'review' : 'ready',
                linkedAuthorityRecordIds: [authorityId],
                linkedTokenIds: [tokenId],
                summary: authorityProofAnalysis.summary,
                fileName: proofFileMetadata?.fileName || payload.authorityProofFile?.name,
                mimeType: proofFileMetadata?.mimeType || payload.authorityProofFile?.type,
                sizeBytes: proofFileMetadata?.sizeBytes || payload.authorityProofFile?.size,
                uploadedAt: proofFileMetadata?.uploadedAt || new Date().toISOString(),
                sourceFileId: proofFileMetadata?.sourceFileId,
                storageOwner: 'user_owned',
                retentionClass: 'authority',
                externalStorageTarget: 'google_drive',
                externalStorageStatus: 'ready',
                storageNotes:
                  'Entity authority proof packet is workspace-owned and ready to route into the user-controlled Google Drive archive.',
                generatedBody: dispatchIdentity
                  ? `# ${entityDisplayName} Authority Proof Packet\n\n## Authority Attestation\n- Representative: ${payload.representativeName.trim() || entityDisplayName}\n- Capacity: ${payload.representativeRole.trim() || 'Authorized representative'}\n- Attestation: I affirm that I have the legal authority to establish, administer, connect, and operate ${entityDisplayName} in ClearFlow, including authorizing records, integrations, and retained platform history for that entity.\n- Proof analysis: ${authorityProofAnalysis.summary}\n- Uploaded proof: ${payload.authorityProofFile?.name || 'Not retained'}\n\n## Named Parties Found\n${authorityProofAnalysis.extractedNames.length ? authorityProofAnalysis.extractedNames.map((name) => `- ${name}`).join('\n') : '- No names extracted automatically'}\n\n## Required Additional Parties\n${requiredAdditionalPartyNames.length ? requiredAdditionalPartyNames.map((name) => `- ${name}`).join('\n') : '- None'}\n\n<div style="display:flex;justify-content:center;padding:12px 0;">${buildEntitySealDesign({
                      entityName: entityDisplayName,
                      jurisdiction: payload.jurisdiction.trim() || payload.country.trim() || undefined,
                      template: 'round',
                      primaryText: entityDisplayName,
                      secondaryText:
                        payload.jurisdiction.trim() || payload.country.trim() || 'ClearFlow Entity Seal',
                      inkColor: prev.workspaceSettings.preferredAccentColor || '#36d7ff',
                    })}</div>\n\n## Dispatch Identity\n- Mailing line: ${dispatchIdentity.mailingLine}\n- Proof seal: ${dispatchIdentity.proofSealCode}\n- QR payload: ${dispatchIdentity.qrPayload}\n\n## Signature Support\n| Authorized Signature | Seal / Stamp |\n| --- | --- |\n| ________________________________  \n${payload.representativeName.trim() || entityDisplayName} | ${dispatchIdentity.proofSealCode} |\n\n## Operator Note\nUse this entity-specific dispatch identity and seal on outgoing bills, notes, tax packets, and communications for controlled recordkeeping.\n`
                  : undefined,
              },
              ...prev.documents,
            ],
            complianceTags: requiresAuthorityReview
              ? [
                  {
                    id: authorityReviewTagId,
                    entityId,
                    label: 'Authority representation review',
                    category: 'authority',
                    status: 'review',
                    linkedDocumentIds: [documentId],
                    notes: `Entity was added using representative capacity "${payload.representativeRole.trim()}". ${authorityProofAnalysis.summary} External transactions, bank setup, and release actions should remain paused until the proof is rechecked${requiredAdditionalPartyNames.length ? ` and ${requiredAdditionalPartyNames.join(', ')} ${requiredAdditionalPartyNames.length === 1 ? 'is' : 'are'} added to the account` : ''}.`,
                  },
                  ...prev.complianceTags,
                ]
              : prev.complianceTags,
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
            };
            auth.updateCoreDataSnapshot(nextBundle);
            return nextBundle;
          });
          setIsEntityModalOpen(false);
          onSetActiveEntity?.(entityId);
          goToHash('#entities');
        }}
      />
      <EntityConnectionRailModal
        open={isConnectionRailModalOpen}
        entities={data.entities}
        treasuryAccounts={data.treasuryAccounts}
        defaultCurrency={data.workspaceSettings.baseCurrency}
        initialPreset={connectionRailPreset}
        onClose={() => setIsConnectionRailModalOpen(false)}
        onSubmit={(payload) => {
          const stamp = Date.now();
          const ownerEntity = data.entities.find((entity) => entity.id === payload.ownerEntityId);
          if (!ownerEntity) {
            return;
          }

          const connectedEntity = payload.connectedEntityId
            ? data.entities.find((entity) => entity.id === payload.connectedEntityId)
            : undefined;
          const connectionId = `conn-${stamp}`;
          const railId = `rail-${stamp}`;
          const documentId = `doc-${stamp}`;
          const tokenId = `tok-${stamp}`;
          const noteInstrumentId = payload.autoCreateNoteRemittance ? `inst-${stamp}` : null;
          const obligationId = payload.autoCreateNoteRemittance ? `obl-${stamp}` : null;
          const remittanceId = payload.autoCreateNoteRemittance ? `rem-${stamp}` : null;
          const instrumentSettlementId = payload.autoCreateNoteRemittance ? `iset-${stamp}` : null;
          const registerId = payload.autoCreateNoteRemittance ? `nir-${stamp}` : null;
          const holderLedgerIssueId = payload.autoCreateNoteRemittance ? `hle-${stamp}-issue` : null;
          const holderLedgerPresentmentId = payload.autoCreateNoteRemittance ? `hle-${stamp}-present` : null;
          const connectionName =
            payload.connectionName.trim() ||
            (connectedEntity
              ? `${ownerEntity.displayName || ownerEntity.name} <> ${connectedEntity.displayName || connectedEntity.name}`
              : `${ownerEntity.displayName || ownerEntity.name} <> ${payload.connectedUserLabel || 'External User'}`);
          const railName =
            payload.railName.trim() ||
            `${connectionName} ${payload.settlementPath.replace(/_/g, ' ')} rail`;
          const creditLimit = Number(payload.creditLimit || 0);
          const identifierNamespace =
            payload.identifierNamespace.trim() ||
            `${(ownerEntity.displayName || ownerEntity.name)
              .replace(/[^A-Za-z0-9]/g, '')
              .toUpperCase()
              .slice(0, 8)}-RAIL`;
          const noteIdentifier = `${identifierNamespace}-NOTE-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}-${String(stamp).slice(-4)}`;
          const obligationIdentifier = `${identifierNamespace}-OBL-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}-${String(stamp).slice(-4)}`;
          const packetTitle = `${connectionName} Connection Packet`;
          const complianceTagId =
            payload.legalUsePosture === 'partner_bank_required_external_presentment' ||
            payload.relationshipClass === 'business_partner'
              ? `cmp-${stamp}`
              : null;

          setData((prev) => ({
            ...prev,
            entityConnections: [
              {
                id: connectionId,
                ownerEntityId: payload.ownerEntityId,
                connectionName,
                connectionType: payload.connectionType,
                relationshipClass: payload.relationshipClass,
                status: 'active',
                connectedEntityId: payload.connectedEntityId,
                connectedUserLabel: payload.connectedUserLabel?.trim() || undefined,
                connectedUserEmail: payload.connectedUserEmail?.trim() || undefined,
                connectedWorkspaceLabel: payload.connectedWorkspaceLabel?.trim() || undefined,
                linkedDocumentIds: [documentId],
                linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                defaultSettlementPath: payload.settlementPath,
                defaultCurrency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                validationMode: payload.requireComplianceValidation ? 'strict' : 'standard',
                requireVerificationTokens: payload.requireVerificationTokens,
                requireComplianceValidation: payload.requireComplianceValidation,
                reserveBackedPreferred: payload.reserveBacked,
                notes: payload.notes.trim() || undefined,
              },
              ...prev.entityConnections,
            ],
            creditRails: [
              {
                id: railId,
                ownerEntityId: payload.ownerEntityId,
                entityConnectionId: connectionId,
                railName,
                railType: payload.railType,
                status: payload.requireComplianceValidation ? 'watch' : 'active',
                settlementPath: payload.settlementPath,
                dischargeMethod:
                  payload.settlementPath === 'tokenized_credit'
                    ? 'instrument_performance'
                    : payload.settlementPath === 'internal_ledger'
                      ? 'internal_ledger_credit'
                      : 'bank_rail_payment',
                legalUsePosture: payload.legalUsePosture,
                bankingOperationClass: payload.bankingOperationClass,
                identifierNamespace,
                currency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                exposureLimit: creditLimit || undefined,
                outstandingExposure: 0,
                availableCredit: creditLimit || undefined,
                linkedTreasuryAccountId: payload.linkedTreasuryAccountId,
                linkedDocumentIds: [documentId],
                linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                autoMirrorIntercompanyEntries: payload.connectionType === 'internal_entity',
                autoIssueTokens: payload.requireVerificationTokens,
                autoCreateNoteRemittance: payload.autoCreateNoteRemittance,
                noteSettlementMode: payload.autoCreateNoteRemittance
                  ? 'holder_presentment'
                  : undefined,
                holderRecordRequired:
                  payload.railType === 'partner_note' || payload.relationshipClass === 'business_partner',
                reserveBacked: payload.reserveBacked,
                notes: payload.notes.trim() || undefined,
              },
              ...prev.creditRails,
            ],
            instruments:
              payload.autoCreateNoteRemittance && noteInstrumentId
                ? [
                    {
                      id: noteInstrumentId,
                      entityId: payload.ownerEntityId,
                      title: `${connectionName} Partner Note`,
                      instrumentType: 'promissory_note',
                      legalIdentifier: noteIdentifier,
                      sourceClass: 'note',
                      issuerEntityId: payload.ownerEntityId,
                      counterpartyEntityId: payload.connectedEntityId,
                      counterpartyLabel:
                        connectedEntity?.displayName ||
                        connectedEntity?.name ||
                        payload.connectedUserLabel ||
                        payload.connectedWorkspaceLabel,
                      issueDate: new Date().toISOString().slice(0, 10),
                      denominationValue: creditLimit || 0,
                      paymentMedium: 'private_tender',
                      reserveDepositEnabled: payload.reserveBacked,
                      linkedTreasuryAccountId: payload.linkedTreasuryAccountId,
                      linkedDocumentIds: [documentId],
                      linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                      notes: 'Auto-structured partner note from entity connection rail creation.',
                    },
                    ...prev.instruments,
                  ]
                : prev.instruments,
            obligations:
              payload.autoCreateNoteRemittance && obligationId && noteInstrumentId
                ? [
                    {
                      id: obligationId,
                      entityId: payload.ownerEntityId,
                      title: `${connectionName} Partner Obligation`,
                      legalIdentifier: obligationIdentifier,
                      obligationType: 'private_obligation',
                      amount: creditLimit || 0,
                      paymentMedium: 'private_tender',
                      status: 'open',
                      linkedInstrumentIds: [noteInstrumentId],
                      linkedDocumentIds: [documentId],
                    },
                    ...prev.obligations,
                  ]
                : prev.obligations,
            instrumentSettlements:
              payload.autoCreateNoteRemittance &&
              instrumentSettlementId &&
              noteInstrumentId &&
              obligationId
                ? [
                    {
                      id: instrumentSettlementId,
                      entityId: payload.ownerEntityId,
                      title: `${connectionName} Partner Presentment Flow`,
                      legalIdentifier: noteIdentifier,
                      instrumentId: noteInstrumentId,
                      obligationId,
                      treasuryAccountId: payload.linkedTreasuryAccountId,
                      linkedDocumentIds: [documentId],
                      linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                      dischargeMethod: 'instrument_performance',
                      recognitionBasis: 'obligation_recognized_before_cash',
                      performanceStatus: 'issued',
                      faceAmount: creditLimit || 0,
                      performedAmount: 0,
                      currency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                      effectiveDate: new Date().toISOString().slice(0, 10),
                      sourceDepositStatus: payload.reserveBacked ? 'deposited_to_reserve' : 'not_deposited',
                      remittanceReference: railName,
                      notes: 'Auto-structured from business-partner connection creation.',
                    },
                    ...prev.instrumentSettlements,
                  ]
                : prev.instrumentSettlements,
            negotiableInstrumentRegisters:
              payload.autoCreateNoteRemittance && registerId && noteInstrumentId
                ? [
                    {
                      id: registerId,
                      entityId: payload.ownerEntityId,
                      instrumentId: noteInstrumentId,
                      obligationId: obligationId || undefined,
                      legalIdentifier: noteIdentifier,
                      registerLabel: `${connectionName} Partner Register`,
                      instrumentForm: 'note',
                      status: 'issued',
                      issueDate: new Date().toISOString().slice(0, 10),
                      issuerEntityId: payload.ownerEntityId,
                      currentHolderEntityId: payload.connectedEntityId,
                      currentHolderConnectionId: connectionId,
                      currentHolderLabel:
                        connectedEntity?.displayName ||
                        connectedEntity?.name ||
                        payload.connectedUserLabel ||
                        payload.connectedWorkspaceLabel ||
                        'Connected holder',
                      backingCreditRailId: railId,
                      backingTreasuryAccountId: payload.linkedTreasuryAccountId,
                      faceAmount: creditLimit || 0,
                      outstandingAmount: creditLimit || 0,
                      currency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                      linkedDocumentIds: [documentId],
                      linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                      notes: 'Auto-generated from business partner connection setup.',
                    },
                    ...prev.negotiableInstrumentRegisters,
                  ]
                : prev.negotiableInstrumentRegisters,
            holderLedgerEntries:
              payload.autoCreateNoteRemittance && registerId
                ? [
                    ...(holderLedgerPresentmentId && remittanceId
                      ? [
                          {
                            id: holderLedgerPresentmentId,
                            entityId: payload.ownerEntityId,
                            registerId,
                            entryDate: new Date().toISOString().slice(0, 10),
                            entryType: 'presentment' as const,
                            holderEntityId: payload.connectedEntityId,
                            holderConnectionId: connectionId,
                            holderLabel:
                              connectedEntity?.displayName ||
                              connectedEntity?.name ||
                              payload.connectedUserLabel ||
                              payload.connectedWorkspaceLabel ||
                              'Connected holder',
                            amount: creditLimit || 0,
                            currency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                            resultingBalance: creditLimit || 0,
                            linkedInstrumentId: noteInstrumentId || undefined,
                            linkedObligationId: obligationId || undefined,
                            linkedRemittanceStatementId: remittanceId,
                            linkedDocumentIds: [documentId],
                            linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                            notes: 'Initial holder presentment lane opened with the partner note rail.',
                          },
                        ]
                      : []),
                    ...(holderLedgerIssueId
                      ? [
                          {
                            id: holderLedgerIssueId,
                            entityId: payload.ownerEntityId,
                            registerId,
                            entryDate: new Date().toISOString().slice(0, 10),
                            entryType: 'issue' as const,
                            holderEntityId: payload.connectedEntityId,
                            holderConnectionId: connectionId,
                            holderLabel:
                              connectedEntity?.displayName ||
                              connectedEntity?.name ||
                              payload.connectedUserLabel ||
                              payload.connectedWorkspaceLabel ||
                              'Connected holder',
                            amount: creditLimit || 0,
                            currency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                            resultingBalance: creditLimit || 0,
                            linkedInstrumentId: noteInstrumentId || undefined,
                            linkedObligationId: obligationId || undefined,
                            linkedDocumentIds: [documentId],
                            linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                            notes: 'Initial holder issuance entry generated from business partner setup.',
                          },
                        ]
                      : []),
                    ...prev.holderLedgerEntries,
                  ]
                : prev.holderLedgerEntries,
            remittanceStatements:
              payload.autoCreateNoteRemittance && remittanceId && obligationId
                ? [
                    {
                      id: remittanceId,
                      entityId: payload.ownerEntityId,
                      title: `${connectionName} Partner Remittance`,
                      statementDate: new Date().toISOString().slice(0, 10),
                      payerName: ownerEntity.displayName || ownerEntity.name,
                      payeeName:
                        connectedEntity?.displayName ||
                        connectedEntity?.name ||
                        payload.connectedUserLabel ||
                        payload.connectedWorkspaceLabel ||
                        'Connected holder',
                      amount: creditLimit || 0,
                      currency: payload.currency.trim() || prev.workspaceSettings.baseCurrency,
                      dischargeMethod: 'instrument_performance',
                      status: 'issued',
                      linkedInstrumentSettlementId: instrumentSettlementId || undefined,
                      notes: 'Auto-structured remittance for the connected note holder.',
                    },
                    ...prev.remittanceStatements,
                  ]
                : prev.remittanceStatements,
            documents: [
              {
                id: documentId,
                entityId: payload.ownerEntityId,
                title: packetTitle,
                category: 'contract',
                date: new Date().toISOString().slice(0, 10),
                status: 'draft',
                outputStatus: 'drafting',
                linkedTokenIds: payload.requireVerificationTokens ? [tokenId] : undefined,
                linkedComplianceTagIds: complianceTagId ? [complianceTagId] : undefined,
                summary:
                  'Connection and credit rail packet created for inter-entity or cross-user settlement controls.',
                generatedBody: [
                  `# ${packetTitle}`,
                  '',
                  `Owner Entity: ${ownerEntity.displayName || ownerEntity.name}`,
                  connectedEntity
                    ? `Connected Entity: ${connectedEntity.displayName || connectedEntity.name}`
                    : `Connected User: ${payload.connectedUserLabel || 'External User'}`,
                  `Rail: ${railName}`,
                  `Settlement Path: ${payload.settlementPath}`,
                  `Business Partner Flow: ${payload.autoCreateNoteRemittance ? 'Auto note/remittance enabled' : 'Standard connection rail'}`,
                  `Credit Limit: ${
                    creditLimit
                      ? `${payload.currency.trim() || prev.workspaceSettings.baseCurrency} ${creditLimit.toLocaleString()}`
                      : 'Open'
                  }`,
                  `Validation Mode: ${payload.requireComplianceValidation ? 'strict' : 'standard'}`,
                  '',
                  payload.notes.trim() || 'Generated automatically from the entity connection rail desk.',
                ].join('\n'),
                storageOwner: 'user_owned',
                retentionClass: 'agreement',
                externalStorageTarget: 'google_drive',
                externalStorageStatus: 'ready',
                storageNotes:
                  'Connection packets are workspace-owned and ready to route into the user-controlled archive.',
              },
              ...prev.documents,
            ],
            complianceTags: complianceTagId
              ? [
                  {
                    id: complianceTagId,
                    entityId: payload.ownerEntityId,
                    label:
                      payload.legalUsePosture === 'partner_bank_required_external_presentment'
                        ? `${connectionName} external presentment review`
                        : `${connectionName} business partner rail review`,
                    category: 'risk',
                    status: 'review',
                    linkedDocumentIds: [documentId],
                    notes:
                      payload.legalUsePosture === 'partner_bank_required_external_presentment'
                        ? 'This rail requires a partner bank or outside rail before external presentment.'
                        : 'Business partner note/remittance rail should be reviewed for holder records, identifiers, and release controls.',
                  },
                  ...prev.complianceTags,
                ]
              : prev.complianceTags,
            tokens: payload.requireVerificationTokens
              ? [
                  {
                    id: tokenId,
                    entityId: payload.ownerEntityId,
                    subjectType: 'document',
                    subjectId: documentId,
                    label: `${connectionName} Control Token`,
                    status: 'issued',
                    tokenStandard: 'internal-proof',
                    tokenReference: `CONN-${stamp}`,
                    issuedAt: new Date().toISOString(),
                    proofReference: 'Issued automatically from entity connection rail creation.',
                  },
                  ...prev.tokens,
                ]
              : prev.tokens,
          }));
          setIsConnectionRailModalOpen(false);
          goToHash(`#documents:${documentId}`);
        }}
      />
      <div
        style={{
          borderRadius: 18,
          border: '1px solid var(--cf-border)',
          background: 'rgba(15,23,42,0.34)',
          padding: 14,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>Entities</h1>
            <p style={{ color: '#9ca3af', margin: '4px 0 0' }}>
              Profiles, authority, records, and operating routes by entity.
            </p>
          </div>
          {firstHeldEntity ? (
            <div style={{ color: '#fef3c7', fontSize: 13, lineHeight: 1.5 }}>
              Next: finish authorization for <strong>{firstHeldEntity.displayName || firstHeldEntity.name}</strong>.
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {firstHeldEntity ? (
            <button
              type="button"
              onClick={() => openAuthorityWorkspace(firstHeldEntity.id)}
              style={{
                padding: '10px 14px',
                minHeight: 42,
                borderRadius: 10,
                border: '1px solid rgba(251,191,36,0.38)',
                background: 'rgba(251,191,36,0.16)',
                color: '#fffbeb',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              Resume Authorization
            </button>
          ) : null}
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
            {data.entities.length ? '+ Add Another Entity' : '+ Add Entity'}
          </button>
          <button
            type="button"
            onClick={() => {
              setConnectionRailPreset('general');
              setIsConnectionRailModalOpen(true);
            }}
            style={{
              padding: '10px 14px',
              minHeight: 42,
              borderRadius: 10,
              border: '1px solid rgba(96,165,250,0.4)',
              background: 'rgba(37,99,235,0.18)',
              color: '#eff6ff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            + Create Connection Rail
          </button>
          <button
            type="button"
            onClick={() => {
              setConnectionRailPreset('business_partner');
              setIsConnectionRailModalOpen(true);
            }}
            style={{
              padding: '10px 14px',
              minHeight: 42,
              borderRadius: 10,
              border: '1px solid rgba(251,191,36,0.35)',
              background: 'rgba(120, 53, 15, 0.22)',
              color: '#fef3c7',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            + Add Business Partner
          </button>
        </div>
      </div>

      {firstHeldEntity ? (
        <div
          style={{
            borderRadius: 16,
            border: '1px solid rgba(251,191,36,0.28)',
            background: 'rgba(120, 53, 15, 0.16)',
            padding: 12,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ color: '#fde68a', lineHeight: 1.45 }}>
            Authority review does not block data entry, but it pauses bank setup and transaction release until cleared.
          </div>
          <button
            type="button"
            onClick={() => openAuthorityWorkspace(firstHeldEntity.id)}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid rgba(251,191,36,0.38)',
              background: 'rgba(251,191,36,0.14)',
              color: '#fffbeb',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            Continue Required Info
          </button>
        </div>
      ) : null}

      {data.entities.length === 0 ? (
        <PageSection
          title="Start Your Entity Boards"
          description="Set up each legal profile once, then ClearFlow can keep records, storage, accounting, and remittance routing organized by entity."
        >
          <div
            style={{
              display: 'grid',
              gap: 14,
              padding: 18,
              borderRadius: 18,
              border: '1px dashed rgba(126,242,255,0.26)',
              background: 'rgba(15,23,42,0.34)',
              color: '#d1d5db',
            }}
          >
            <div style={{ lineHeight: 1.7 }}>
              Add your first entity to create its own board, authority records, Google storage
              routing, seal and dispatch identity, and accounting defaults.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsEntityModalOpen(true)}
                style={{
                  minHeight: 42,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Add First Entity
              </button>
              <button
                type="button"
                onClick={() => goToHash('#accounting:bankFeed')}
                style={{
                  minHeight: 42,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.5)',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Connect Financial Accounts
              </button>
            </div>
          </div>
        </PageSection>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        <StatCard label="Entities" value={String(data.entities.length)} />
        <StatCard label="Active Profiles" value={String(activeEntities)} />
        <StatCard label="Token-Ready Defaults" value={String(tokenEnabledEntities)} />
        <StatCard label="Pending Signer Acceptances" value={String(pendingSignerApprovals)} />
        <StatCard label="Bank Packages In Flight" value={String(bankPackagesInFlight)} />
        <StatCard label="Internal Connections" value={String(internalConnections)} />
        <StatCard label="External User Links" value={String(externalConnections)} />
        <StatCard label="Active Credit Rails" value={String(activeCreditRails)} />
        <StatCard label="Watch Rails" value={String(watchCreditRails)} />
        <StatCard label="Authority Ready" value={String(authorityReadyEntities)} />
        <StatCard label="Authority Review" value={String(authorityWatchEntities)} />
      </div>

      <PageSection
        title="Authority Control"
        description="Keep representative authority, attestation posture, and onboarding readiness visible before banks, vendors, and counterparties depend on the entity."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <WorkbenchRecordCard
            title="Authority Ready"
            subtitle={`${authorityReadyEntities} entities with representative attestation and no open authority review`}
          >
            These entities have a representative name, representative role, retained attestation timestamp, and no open authority review tag.
          </WorkbenchRecordCard>
          <WorkbenchRecordCard
            title="Authority Review Queue"
            subtitle={`${authorityReviewTags.length} authority review item(s)`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {authorityReviewTags.length
                ? authorityReviewTags.slice(0, 4).map((tag) => {
                    const entityLabel = tag.entityId
                      ? entityNameById.get(tag.entityId) || tag.entityId
                      : 'Workspace';
                    return (
                      <div
                        key={tag.id}
                        style={{
                          display: 'grid',
                          gap: 8,
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: 'rgba(8, 13, 27, 0.56)',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{entityLabel}</div>
                        <div style={{ color: 'var(--cf-muted)', lineHeight: 1.55 }}>
                          {tag.notes || tag.label}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => tag.entityId && releaseAuthorityHold(tag.entityId)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 10,
                              border: '1px solid rgba(74,222,128,0.24)',
                              background: 'rgba(34,197,94,0.12)',
                              color: '#dcfce7',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Authorize / Clear Hold
                          </button>
                          {tag.entityId ? (
                            <button
                              type="button"
                              onClick={() => openAuthorityWorkspace(tag.entityId)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: '1px solid rgba(126,242,255,0.24)',
                                background: 'rgba(54, 215, 255, 0.1)',
                                color: '#effcff',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Add Needed Info
                            </button>
                          ) : null}
                          {tag.entityId ? (
                            <button
                              type="button"
                              onClick={() => deleteEntityProfile(tag.entityId || '')}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: '1px solid rgba(248,113,113,0.28)',
                                background: 'rgba(127,29,29,0.22)',
                                color: '#fecaca',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Delete Stale Entity
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                : 'No authority review items are open right now.'}
            </div>
          </WorkbenchRecordCard>
          <WorkbenchRecordCard
            title="Onboarding Use"
            subtitle="Authority should be aligned before bank packaging and external execution"
          >
            Use the authority desk as the control point before moving an entity into bank onboarding, counterparty routing, or outside settlement work.
          </WorkbenchRecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Entity Records"
        description="Edit legal identity, numbering, branding, and default settlement behavior without touching raw JSON."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {orderedEntities.map((entity) => (
            <div key={entity.id}>
              <EntityProfileCard
                entity={entity}
                currentGoogleEmail={currentUser?.email}
                isActive={entity.id === activeEntityId}
                onSetActive={() => onSetActiveEntity?.(entity.id)}
                onRequestDriveAccess={() => auth.requestDriveAccess()}
                defaultCurrency={data.workspaceSettings.baseCurrency}
                sealValueSummary={(() => {
                  const usageRecords = data.entityMarkUsageRecords.filter((item) => item.entityId === entity.id);
                  const reserveValue = usageRecords.reduce((sum, item) => sum + item.totalValue, 0);
                  const unitsIssued = usageRecords.reduce((sum, item) => sum + item.unitsIssued, 0);
                  const treasuryLabel = data.treasuryAccounts.find(
                    (item) => item.id === entity.branding?.sealReserveTreasuryAccountId,
                  )?.name;
                  const digitalAssetLabel = data.digitalAssets.find(
                    (item) => item.id === entity.branding?.sealReserveDigitalAssetId,
                  )?.name;

                  return {
                    usageCount: usageRecords.length,
                    reserveValue,
                    unitsIssued,
                    treasuryLabel,
                    digitalAssetLabel,
                    currency:
                      entity.branding?.sealValueCurrency ||
                      entity.operationalDefaults?.baseCurrency ||
                      data.workspaceSettings.baseCurrency,
                  };
                })()}
                onSave={(nextRecord) => {
                  const needsAuthorityNext =
                    nextRecord.authorityTransactionsPaused ||
                    nextRecord.authorityProofStatus === 'missing' ||
                    nextRecord.authorityProofStatus === 'review' ||
                    nextRecord.authorityProofStatus === 'mismatch' ||
                    Boolean(nextRecord.authorityProofRequiredPartyNames?.length);
                  setData((prev) => ({
                    ...prev,
                    entities: prev.entities.map((item) =>
                      item.id === entity.id
                        ? (() => {
                            const nextSealSvg = buildEntitySealDesign({
                              entityName: nextRecord.displayName || nextRecord.name,
                              jurisdiction: nextRecord.jurisdiction || nextRecord.country,
                              template: nextRecord.branding?.sealTemplate,
                              primaryText:
                                nextRecord.branding?.sealPrimaryText ||
                                nextRecord.displayName ||
                                nextRecord.name,
                              secondaryText:
                                nextRecord.branding?.sealSecondaryText ||
                                nextRecord.jurisdiction ||
                                nextRecord.country ||
                                'ClearFlow Entity Seal',
                              inkColor:
                                nextRecord.branding?.sealInkColor ||
                                nextRecord.branding?.accentColor ||
                                prev.workspaceSettings.preferredAccentColor ||
                                '#36d7ff',
                            });

                            if (!nextRecord.branding?.autoGenerateDispatchIdentity) {
                              const selectedSeal =
                                nextRecord.branding?.documentSealSource === 'uploaded' &&
                                nextRecord.branding?.customSealDataUrl
                                  ? nextRecord.branding.customSealDataUrl
                                  : nextSealSvg;
                              return {
                                ...nextRecord,
                                entityAccess: {
                                  ...nextRecord.entityAccess,
                                  driveConnectionStatus:
                                    nextRecord.entityAccess?.storageMode === 'internal_only'
                                      ? 'internal_only'
                                      : !hasDriveAccess
                                        ? 'not_connected'
                                        : (
                                            nextRecord.entityAccess?.googleStorageEmail ||
                                            nextRecord.primaryEmail ||
                                            currentUser?.email
                                          )?.trim().toLowerCase() ===
                                          currentUser?.email?.trim().toLowerCase()
                                          ? 'connected'
                                          : 'needs_google_switch',
                                },
                                branding: {
                                  ...nextRecord.branding,
                                  entitySealSvg: selectedSeal,
                                },
                              };
                            }

                            const dispatchIdentity = buildEntityDispatchIdentity({
                              entityId: nextRecord.id,
                              entityName: nextRecord.displayName || nextRecord.name,
                              country: nextRecord.country,
                              uspsMailerId: prev.workspaceSettings.uspsMailerId,
                              uspsCrid: prev.workspaceSettings.uspsCrid,
                            });

                            return {
                              ...nextRecord,
                              entityAccess: {
                                ...nextRecord.entityAccess,
                                driveConnectionStatus:
                                  nextRecord.entityAccess?.storageMode === 'internal_only'
                                    ? 'internal_only'
                                    : !hasDriveAccess
                                      ? 'not_connected'
                                      : (
                                          nextRecord.entityAccess?.googleStorageEmail ||
                                          nextRecord.primaryEmail ||
                                          currentUser?.email
                                        )?.trim().toLowerCase() ===
                                        currentUser?.email?.trim().toLowerCase()
                                        ? 'connected'
                                        : 'needs_google_switch',
                              },
                              branding: {
                                ...nextRecord.branding,
                                entitySealSvg:
                                  nextRecord.branding?.documentSealSource === 'uploaded' &&
                                  nextRecord.branding?.customSealDataUrl
                                    ? nextRecord.branding.customSealDataUrl
                                    : nextSealSvg,
                                entityMailingLine: dispatchIdentity.mailingLine,
                                entityProofSealCode: dispatchIdentity.proofSealCode,
                                entityQrPayload: dispatchIdentity.qrPayload,
                                entityQrSealSvg: dispatchIdentity.qrSealSvg,
                                entityMailingBarcodeSvg: dispatchIdentity.mailingBarcodeSvg,
                              },
                            };
                          })()
                        : item
                    ),
                  }));
                  window.setTimeout(() => {
                    if (needsAuthorityNext) {
                      openAuthorityWorkspace(nextRecord.id);
                    } else {
                      goToHash('#accounting:bankFeed');
                    }
                  }, 80);
                }}
              />
              {entity.authorityTransactionsPaused ||
              authorityReviewTags.some((tag) => tag.entityId === entity.id) ||
              entity.authorityProofRequiredPartyNames?.length ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: 14,
                    borderRadius: 14,
                    border: '1px solid rgba(251,191,36,0.28)',
                    background: 'rgba(120, 53, 15, 0.18)',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#fef3c7' }}>
                    Authorization needed before this entity can transact
                  </div>
                  <div style={{ color: '#fde68a', lineHeight: 1.55, fontSize: 13 }}>
                    {entity.authorityProofSummary ||
                      'Authority proof needs review before bank setup, payment release, or outside settlement.'}
                    {entity.authorityProofRequiredPartyNames?.length
                      ? ` Add or confirm: ${entity.authorityProofRequiredPartyNames.join(', ')}.`
                      : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => openAuthorityWorkspace(entity.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(251,191,36,0.36)',
                        background: 'rgba(251,191,36,0.14)',
                        color: '#fffbeb',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      Add / Review Authorization Info
                    </button>
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
                        Open Authority Packet
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => releaseAuthorityHold(entity.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(74,222,128,0.28)',
                        background: 'rgba(34,197,94,0.14)',
                        color: '#dcfce7',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      Confirm Authority And Release Hold
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntityProfile(entity.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(248,113,113,0.28)',
                        background: 'rgba(127,29,29,0.22)',
                        color: '#fecaca',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      Delete This Entity
                    </button>
                  </div>
                </div>
              ) : null}
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
                  onClick={() => goToHash('#documents:upload')}
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
                  Upload Entity Records
                </button>
                <button
                  type="button"
                  onClick={() => goToHash('#accounting:bills')}
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
                  Bulk Accounting Intake
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
        title="Connection Rails"
        description="Control multi-entity links, user-to-user credit posture, reserve-backed settlement permissions, and validation standards from one desk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.entityConnections.map((connection) => {
            const linkedRail = data.creditRails.find((rail) => rail.entityConnectionId === connection.id);
            const destinationLabel =
              connection.connectedEntityId
                ? entityNameById.get(connection.connectedEntityId)
                : connection.connectedUserLabel || connection.connectedWorkspaceLabel || 'External user';

            return (
              <WorkbenchRecordCard
                key={connection.id}
                title={connection.connectionName}
                subtitle={`${entityNameById.get(connection.ownerEntityId) || 'Entity'} -> ${destinationLabel || 'Counterparty'} · ${connection.connectionType.replace(/_/g, ' ')}`}
                summaryItems={[
                  { label: 'Status', value: connection.status },
                  { label: 'Settlement Path', value: connection.defaultSettlementPath.replace(/_/g, ' ') },
                  { label: 'Validation', value: connection.validationMode.replace(/_/g, ' ') },
                  {
                    label: 'Credit Rail',
                    value: linkedRail ? linkedRail.railName : 'No rail linked yet',
                  },
                  {
                    label: 'Available Credit',
                    value:
                      linkedRail?.availableCredit !== undefined
                        ? `${linkedRail.currency} ${linkedRail.availableCredit.toLocaleString()}`
                        : 'Open',
                  },
                  {
                    label: 'Treasury Link',
                    value:
                      linkedRail?.linkedTreasuryAccountId
                        ? treasuryNameById.get(linkedRail.linkedTreasuryAccountId) || linkedRail.linkedTreasuryAccountId
                        : 'Not linked',
                  },
                ]}
                actionSlot={
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        goToHash(
                          linkedRail?.settlementPath === 'internal_ledger'
                            ? '#accounting:intercompany'
                            : '#accounting:payments',
                        )
                      }
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
                      Open Rail Desk
                    </button>
                    {connection.linkedDocumentIds?.[0] ? (
                      <button
                        type="button"
                        onClick={() => goToHash(`#documents:${connection.linkedDocumentIds?.[0]}`)}
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
                        Open Packet
                      </button>
                    ) : null}
                  </>
                }
              >
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>
                    Relationship: {connection.relationshipClass.replace(/_/g, ' ')}. Tokens{' '}
                    {connection.requireVerificationTokens ? 'required' : 'optional'} and compliance
                    validation {connection.requireComplianceValidation ? 'enabled' : 'light'}.
                  </div>
                  <div>
                    {linkedRail
                      ? `${linkedRail.railType.replace(/_/g, ' ')} rail is ${linkedRail.status}. Outstanding exposure: ${linkedRail.currency} ${Number(linkedRail.outstandingExposure ?? 0).toLocaleString()}.`
                      : 'No linked credit rail is attached yet.'}
                  </div>
                  {connection.notes ? <div>Notes: {connection.notes}</div> : null}
                </div>
              </WorkbenchRecordCard>
            );
          })}
          {!data.entityConnections.length ? (
            <WorkbenchRecordCard title="No connection rails yet" subtitle="Create the first internal or external rail">
              Use connection rails to define who can settle with whom, which reserve or treasury accounts back the moves, and how much exposure the relationship can carry before review.
            </WorkbenchRecordCard>
          ) : null}
        </div>
      </PageSection>

      <PageSection
        title="Private Wealth Banking Rail Board"
        description="See how each rail is being used operationally: internal controlled book-entry only, private instrument tracking, or partner-bank-required external presentment."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {privateWealthRailSummaries.map((summary) => (
            <WorkbenchRecordCard
              key={summary.railId}
              title={summary.railName}
              subtitle={`${summary.connectionName} · ${summary.bankingOperationClass.replace(/_/g, ' ')}`}
              summaryItems={[
                { label: 'Use Posture', value: summary.legalUsePosture.replace(/_/g, ' ') },
                { label: 'Status', value: summary.overallStatus },
                { label: 'Identifier', value: summary.identifierNamespace },
                {
                  label: 'Outstanding',
                  value: `USD ${summary.outstandingExposure.toLocaleString()}`,
                },
                {
                  label: 'Available',
                  value:
                    summary.availableCredit !== undefined
                      ? `USD ${summary.availableCredit.toLocaleString()}`
                      : 'Open',
                },
              ]}
            >
              {summary.warnings.length
                ? `Open control points: ${summary.warnings.join(' · ')}`
                : 'Control posture is aligned for the selected operating use.'}
            </WorkbenchRecordCard>
          ))}
          {!privateWealthRailSummaries.length ? (
            <WorkbenchRecordCard title="No wealth rails yet" subtitle="Create a connection rail first">
              Once a rail exists, ClearFlow will classify whether it is suitable for internal book-entry control, private instrument tracking, or outside presentment that still needs a bank or external rail partner.
            </WorkbenchRecordCard>
          ) : null}
        </div>
      </PageSection>

      <div id="entity-authority-workspace">
        <PageSection
          title="Entity Resource Studio"
          description="Create the working resources an entity needs to operate: bank accounts, wallets, authority records, obligations, instruments, and control documents. Use Authority Record for additional trustees, members, managers, or signers."
        >
          <EntityResourceStudio data={data} setData={setData} />
        </PageSection>
      </div>

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
          {visibleAuthorityRecords.map((record) => (
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
                        entities:
                          status === 'accepted' && record.entityId
                            ? prev.entities.map((entity) =>
                                entity.id === record.entityId
                                  ? {
                                      ...entity,
                                      authorityTransactionsPaused: false,
                                      authorityProofStatus:
                                        entity.authorityProofStatus === 'matched'
                                          ? entity.authorityProofStatus
                                          : 'similar_match',
                                    }
                                  : entity,
                              )
                            : prev.entities,
                        complianceTags:
                          status === 'accepted'
                            ? prev.complianceTags.map((tag) =>
                                tag.category === 'authority' &&
                                tag.entityId === record.entityId &&
                                tag.status === 'review'
                                  ? {
                                      ...tag,
                                      status: 'ok',
                                      notes: `${tag.notes || tag.label} Cleared automatically after signer acceptance on ${new Date().toISOString().slice(0, 10)}.`,
                                    }
                                  : tag,
                              )
                            : prev.complianceTags,
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
              {authorityReviewTags.some((tag) => tag.entityId === account.entityId) ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(251,191,36,0.28)',
                    background: 'rgba(120,53,15,0.18)',
                    color: '#fde68a',
                    padding: '10px 12px',
                    lineHeight: 1.55,
                  }}
                >
                  Authority review is still open for this entity. Keep this banking rail in review until representative authority is confirmed.
                </div>
              ) : null}
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

