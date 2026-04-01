import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  AssetRecord,
  AuthorityRecord,
  BankAccountRecord,
  ComplianceTagRecord,
  CoreDataBundle,
  DocumentRecord,
  InstrumentRecord,
  InstrumentSettlementRecord,
  MovementIdentifierRecord,
  NegotiableInstrumentRegisterRecord,
  ObligationRecord,
  SettlementRecord,
  TokenRecord,
  TransactionRecord,
  TreasuryAccountRecord,
  WalletRecord,
  HolderLedgerEntryRecord,
} from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
import { saveDocumentFile } from '../../services/documentVault.service';

type ResourceType =
  | 'bankAccount'
  | 'wallet'
  | 'authority'
  | 'instrument'
  | 'obligation'
  | 'document';

interface EntityResourceStudioProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const resourceTypeOptions: Array<{ value: ResourceType; label: string; description: string }> = [
  {
    value: 'bankAccount',
    label: 'Bank Account',
    description: 'Create operating, reserve, custodial, or reconciliation-ready bank accounts.',
  },
  {
    value: 'wallet',
    label: 'Wallet',
    description: 'Set up digital-asset custody, multisig, contract, or exchange-linked wallets.',
  },
  {
    value: 'authority',
    label: 'Authority Record',
    description: 'Track signer, trustee, manager, or client authorization authority.',
  },
  {
    value: 'instrument',
    label: 'Instrument',
    description: 'Issue notes, contract rights, tokenized claims, or pledged securities.',
  },
  {
    value: 'obligation',
    label: 'Obligation',
    description: 'Stand up liabilities, reserve-backed claims, or secured private obligations.',
  },
  {
    value: 'document',
    label: 'Control Document',
    description: 'Create the operational memo or authority document the entity needs next.',
  },
];

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(10, 11, 24, 0.78)',
  color: '#fff6fd',
  padding: '10px 12px',
  fontSize: 14,
};

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function buildLegalIdentifier(entityName: string, category: string, issueDate?: string) {
  const root = entityName
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6) || 'ENTITY';
  const date = (issueDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const nonce = Date.now().toString().slice(-4);
  return `${root}-${category.toUpperCase()}-${date}-${nonce}`;
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

function buildResourceSummary(data: CoreDataBundle, entityId: string) {
  return {
    bankAccounts: data.bankAccounts.filter((item) => item.entityId === entityId).length,
    wallets: data.wallets.filter((item) => item.entityId === entityId).length,
    authorityRecords: data.authorityRecords.filter((item) => item.entityId === entityId).length,
    instruments: data.instruments.filter((item) => item.entityId === entityId).length,
    obligations: data.obligations.filter((item) => item.entityId === entityId).length,
    documents: data.documents.filter((item) => item.entityId === entityId).length,
  };
}

export default function EntityResourceStudio({
  data,
  setData,
}: EntityResourceStudioProps) {
  const auth = useAuth();
  const [selectedEntityId, setSelectedEntityId] = useState(data.entities[0]?.id ?? '');
  const [resourceType, setResourceType] = useState<ResourceType>('bankAccount');
  const [formState, setFormState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedEntityId && data.entities[0]?.id) {
      setSelectedEntityId(data.entities[0].id);
    }
  }, [data.entities, selectedEntityId]);

  useEffect(() => {
    const selectedEntity = data.entities.find((entity) => entity.id === selectedEntityId);
    setFormState({
      currency:
        selectedEntity?.operationalDefaults?.baseCurrency ||
        data.workspaceSettings.baseCurrency ||
        'USD',
      accountType: 'checking',
      institutionName: '',
      accountName: '',
      currentBalance: '',
      walletName: '',
      walletNetwork: 'ethereum',
      walletAddress: '',
      walletCustodyType: 'self_custody',
      authorityPersonName: '',
      authorityType: 'client_authorization',
      authorityStatus: 'active',
      authorityDate: new Date().toISOString().slice(0, 10),
      authorityNotes: '',
      instrumentTitle: '',
      instrumentType: 'promissory_note',
      instrumentAmount: '',
      instrumentDate: new Date().toISOString().slice(0, 10),
      instrumentSourceClass: 'note',
      instrumentCounterpartyLabel: '',
      instrumentDepositToReserve: 'yes',
      instrumentTreasuryAccountId: '',
      instrumentNotes: '',
      obligationTitle: '',
      obligationType: 'private_obligation',
      obligationAmount: '',
      obligationPaymentMedium: 'fiat',
      obligationStatus: 'open',
      documentTitle: '',
      documentCategory: 'authority_record',
      documentDate: new Date().toISOString().slice(0, 10),
      documentSummary: '',
    });
  }, [data.workspaceSettings.baseCurrency, resourceType, selectedEntityId]);

  const selectedEntity = useMemo(
    () => data.entities.find((entity) => entity.id === selectedEntityId),
    [data.entities, selectedEntityId]
  );
  const selectedEntityTreasuryAccounts = useMemo(
    () => data.treasuryAccounts.filter((account) => account.entityId === selectedEntityId),
    [data.treasuryAccounts, selectedEntityId],
  );

  const summary = selectedEntity
    ? buildResourceSummary(data, selectedEntity.id)
    : {
        bankAccounts: 0,
        wallets: 0,
        authorityRecords: 0,
        instruments: 0,
        obligations: 0,
        documents: 0,
      };

  const workflowSignals = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }

    const entityId = selectedEntity.id;
    const bankPackagesInFlight = data.bankAccounts.filter(
      (item) =>
        item.entityId === entityId &&
        item.onboardingStatus &&
        !['connected', 'ready'].includes(item.onboardingStatus),
    ).length;
    const walletReviews = data.complianceTags.filter(
      (tag) => tag.entityId === entityId && tag.category === 'digital_asset' && tag.status !== 'ok',
    ).length;
    const openObligations = data.obligations.filter(
      (item) => item.entityId === entityId && ['open', 'disputed', 'defaulted'].includes(item.status),
    ).length;
    const driveReadyPackets = data.documents.filter(
      (document) =>
        document.entityId === entityId &&
        document.storageOwner === 'user_owned' &&
        document.externalStorageStatus === 'ready',
    ).length;

    return [
      {
        label: 'Bank onboarding in flight',
        value: bankPackagesInFlight,
        hint: 'Accounts still need onboarding or feed completion.',
        actionLabel: 'Open Bank Feed',
        actionHash: '#accounting:bank-feed',
      },
      {
        label: 'Wallet custody reviews',
        value: walletReviews,
        hint: 'Digital-asset support packets are waiting on review.',
        actionLabel: 'Open Compliance',
        actionHash: '#compliance',
      },
      {
        label: 'Open obligations',
        value: openObligations,
        hint: 'Outstanding obligations still need performance or discharge work.',
        actionLabel: 'Open Transactions',
        actionHash: '#transactions',
      },
      {
        label: 'Drive-ready packets',
        value: driveReadyPackets,
        hint: 'Workspace-owned packets are ready to route to Google Drive.',
        actionLabel: 'Open Documents',
        actionHash: '#documents',
      },
    ];
  }, [data, selectedEntity]);

  const recentResources = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }

    const entityId = selectedEntity.id;
    const findLinkedDocument = (documentIds?: string[]) =>
      documentIds?.length
        ? data.documents.find((document) => documentIds.includes(document.id)) || null
        : null;
    const findComplianceTag = (documentIds?: string[]) =>
      documentIds?.length
        ? data.complianceTags.find((tag) =>
            tag.linkedDocumentIds?.some((documentId) => documentIds.includes(documentId)),
          ) || null
        : null;

    return [
      ...data.bankAccounts
        .filter((item) => item.entityId === entityId)
        .map((item) => {
          const linkedDocument = findLinkedDocument(item.linkedDocumentIds);
          const complianceTag = findComplianceTag(item.linkedDocumentIds);

          return {
            id: item.id,
            label: item.accountName,
            kind: 'Bank Account',
            supportLabel:
              complianceTag?.label ||
              linkedDocument?.title ||
              `${item.onboardingStatus ? formatLabel(item.onboardingStatus) : 'support pending'}`,
            actionLabel: linkedDocument ? 'Open Packet' : 'Open Accounting',
            actionHash: linkedDocument ? `#documents:${linkedDocument.id}` : '#accounting:bank-feed',
          };
        }),
      ...data.wallets
        .filter((item) => item.entityId === entityId)
        .map((item) => {
          const linkedDocument = findLinkedDocument(item.linkedDocumentIds);
          const complianceTag = findComplianceTag(item.linkedDocumentIds);

          return {
            id: item.id,
            label: item.name,
            kind: 'Wallet',
            supportLabel:
              complianceTag?.label ||
              linkedDocument?.title ||
              `${formatLabel(item.custodyType || 'self_custody')} custody`,
            actionLabel: linkedDocument ? 'Open Packet' : 'Open Assets',
            actionHash: linkedDocument ? `#documents:${linkedDocument.id}` : '#assets',
          };
        }),
      ...data.authorityRecords
        .filter((item) => item.entityId === entityId)
        .map((item) => {
          const linkedDocument = findLinkedDocument(item.linkedDocumentIds);

          return {
            id: item.id,
            label: item.personName,
            kind: 'Authority',
            supportLabel:
              linkedDocument?.title ||
              `${formatLabel(item.clientAuthorizationStatus || 'active')} authority`,
            actionLabel: linkedDocument ? 'Open Memo' : 'Open Entities',
            actionHash: linkedDocument ? `#documents:${linkedDocument.id}` : '#entities',
          };
        }),
      ...data.instruments
        .filter((item) => item.entityId === entityId)
        .map((item) => {
          const linkedDocument = findLinkedDocument(item.linkedDocumentIds);

          return {
            id: item.id,
            label: item.title,
            kind: 'Instrument',
            supportLabel:
              linkedDocument?.title || `${formatLabel(item.instrumentType)} support packet`,
            actionLabel: linkedDocument ? 'Open Packet' : 'Open Transactions',
            actionHash: linkedDocument ? `#documents:${linkedDocument.id}` : '#transactions',
          };
        }),
      ...data.obligations
        .filter((item) => item.entityId === entityId)
        .map((item) => {
          const linkedDocument = findLinkedDocument(item.linkedDocumentIds);

          return {
            id: item.id,
            label: item.title,
            kind: 'Obligation',
            supportLabel: linkedDocument?.title || `${formatLabel(item.status)} control memo`,
            actionLabel: linkedDocument ? 'Open Memo' : 'Open Transactions',
            actionHash: linkedDocument ? `#documents:${linkedDocument.id}` : '#transactions',
          };
        }),
      ...data.documents
        .filter((item) => item.entityId === entityId)
        .map((item) => ({
          id: item.id,
          label: item.title,
          kind: 'Document',
          supportLabel:
            item.externalStorageStatus === 'routed'
              ? 'Routed to Google Drive'
              : item.externalStorageLabel || `${formatLabel(item.status)} document`,
          actionLabel: 'Open Vault',
          actionHash: `#documents:${item.id}`,
        })),
    ].slice(0, 8);
  }, [data, selectedEntity]);

  if (!data.entities.length) {
    return (
      <div style={{ color: 'var(--cf-muted)' }}>
        Create an entity first, then its operating resources can be generated here.
      </div>
    );
  }

  const updateField = (key: string, value: string) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

  const shouldIssueVerificationToken =
    selectedEntity?.operationalDefaults?.autoIssueVerificationTokens ??
    data.workspaceSettings.autoIssueVerificationTokens;

  const buildStorageReadyDocument = (
    entityId: string,
    title: string,
    category: DocumentRecord['category'],
    summary: string,
    generatedBody?: string,
    linkedAuthorityRecordIds?: string[],
    linkedTokenIds?: string[],
  ): DocumentRecord => {
    const retentionClass =
      category === 'tax'
        ? 'tax'
        : category === 'compliance'
          ? 'compliance'
          : category === 'authority_record' || category === 'governing'
            ? 'authority'
            : 'operational';

    return {
      id: buildId('doc'),
      entityId,
      title,
      category,
      date: formState.documentDate || new Date().toISOString().slice(0, 10),
      status: 'draft',
      summary,
      generatedBody,
      linkedAuthorityRecordIds,
      linkedTokenIds,
      storageOwner: 'user_owned',
      retentionClass,
      storageNotes:
        'Entity resource packet is workspace-owned and ready for vault review or Google Drive routing when enabled.',
      externalStorageTarget: 'google_drive',
      externalStorageStatus: 'ready',
    };
  };

  const persistGeneratedEntityDocument = async (
    document: DocumentRecord,
  ): Promise<DocumentRecord> => {
    if (!document.generatedBody) {
      return document;
    }

    try {
      const fileStem =
        document.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'entity-resource-packet';
      const generatedFile = new File([document.generatedBody], `${fileStem}.md`, {
        type: 'text/markdown',
      });
      const fileMetadata = await saveDocumentFile(`entity-resource-${document.id}`, generatedFile);
      const shouldAutoRoute =
        document.storageOwner === 'user_owned' &&
        data.workspaceSettings.autoRouteUserOwnedDocumentsToDrive &&
        auth.hasDriveAccess;
      const driveRoutingResult = shouldAutoRoute
        ? await auth.routeDocumentToDrive({
            sourceFileId: fileMetadata.sourceFileId,
            fileName: fileMetadata.fileName,
            entityId: document.entityId,
            targetGoogleEmail:
              data.entities.find((item) => item.id === document.entityId)?.entityAccess
                ?.googleStorageEmail ||
              data.entities.find((item) => item.id === document.entityId)?.primaryEmail,
          })
        : null;

      return {
        ...document,
        fileName: fileMetadata.fileName,
        mimeType: fileMetadata.mimeType,
        sizeBytes: fileMetadata.sizeBytes,
        uploadedAt: fileMetadata.uploadedAt,
        sourceFileId: fileMetadata.sourceFileId,
        sourceRecordType: 'document',
        sourceRecordId: document.id,
        vaultPath: `/vault/${document.entityId}/documents/${fileMetadata.fileName}`,
        externalStorageStatus:
          document.storageOwner === 'user_owned'
            ? driveRoutingResult?.success
              ? 'routed'
              : shouldAutoRoute
                ? 'error'
                : document.externalStorageStatus || 'ready'
            : document.externalStorageStatus,
        externalStorageFileId:
          document.storageOwner === 'user_owned' && driveRoutingResult?.success
            ? driveRoutingResult.fileId
            : document.externalStorageFileId,
        externalStorageLabel:
          document.storageOwner === 'user_owned'
            ? driveRoutingResult?.success
              ? 'Auto-routed to Google Drive'
              : shouldAutoRoute
                ? driveRoutingResult?.error || 'Automatic Google Drive routing failed'
                : 'Ready for Google Drive routing'
            : document.externalStorageLabel,
        externalStorageRoutedAt:
          document.storageOwner === 'user_owned' && driveRoutingResult?.success
            ? new Date().toISOString()
            : document.externalStorageRoutedAt,
      };
    } catch (error) {
      console.warn('Failed to persist entity resource document into the vault.', error);
      return {
        ...document,
        externalStorageStatus:
          document.storageOwner === 'user_owned' ? 'error' : document.externalStorageStatus,
        externalStorageLabel:
          document.storageOwner === 'user_owned'
            ? 'Vault persistence failed for this generated entity packet'
            : document.externalStorageLabel,
      };
    }
  };

  const handleCreateResource = async () => {
    if (!selectedEntity) {
      return;
    }

    let persistedDocument: DocumentRecord | null = null;

    setData((prev) => {
      const entityId = selectedEntity.id;

      if (resourceType === 'bankAccount') {
        const bankAccountId = buildId('bank');
        const nextRecord: BankAccountRecord = {
          id: bankAccountId,
          entityId,
          institutionName: formState.institutionName || 'Operating Bank',
          accountName: formState.accountName || `${selectedEntity.displayName || selectedEntity.name} Operating`,
          accountType: (formState.accountType as BankAccountRecord['accountType']) || 'checking',
          currency: formState.currency || 'USD',
          status: 'active',
          currentBalance: Number(formState.currentBalance || 0),
          linkedDocumentIds: [],
          onboardingStatus: 'draft',
        };
        const bankDocument = buildStorageReadyDocument(
          entityId,
          `${nextRecord.accountName} Banking Support Packet`,
          'financial',
          'Banking support packet generated from the entity resource desk.',
          `# Banking Support Packet\n\nEntity: ${selectedEntity.displayName || selectedEntity.name}\nInstitution: ${nextRecord.institutionName}\nAccount Name: ${nextRecord.accountName}\nAccount Type: ${nextRecord.accountType}\nCurrency: ${nextRecord.currency}\nOpening Balance: ${nextRecord.currentBalance || 0}\n\nNext Steps\n- Attach onboarding and authority support\n- Confirm feed or manual reconciliation posture\n- Link treasury or ledger mapping as needed`,
        );
        const bankTag: ComplianceTagRecord = {
          id: buildId('cmp'),
          entityId,
          label: `${nextRecord.accountName} onboarding review`,
          category: 'reporting',
          status: 'review',
          linkedDocumentIds: [bankDocument.id],
          notes: 'Created automatically from bank account setup in Entity Resource Studio.',
        };
        persistedDocument = bankDocument;
        nextRecord.linkedDocumentIds = [bankDocument.id];

        return {
          ...prev,
          bankAccounts: [nextRecord, ...prev.bankAccounts],
          documents: [bankDocument, ...prev.documents],
          complianceTags: [bankTag, ...prev.complianceTags],
        };
      }

      if (resourceType === 'wallet') {
        const walletId = buildId('wallet');
        const nextRecord: WalletRecord = {
          id: walletId,
          entityId,
          name: formState.walletName || `${selectedEntity.displayName || selectedEntity.name} Wallet`,
          network: formState.walletNetwork || 'ethereum',
          address: formState.walletAddress || 'pending-assignment',
          custodyType: (formState.walletCustodyType as WalletRecord['custodyType']) || 'self_custody',
          linkedDocumentIds: [],
          notes: 'Created from Entity Resource Studio.',
        };
        const walletDocument = buildStorageReadyDocument(
          entityId,
          `${nextRecord.name} Custody Packet`,
          'wallet_control_memo',
          'Wallet custody and execution support packet generated from the entity resource desk.',
          `# Wallet Custody Packet\n\nEntity: ${selectedEntity.displayName || selectedEntity.name}\nWallet: ${nextRecord.name}\nNetwork: ${nextRecord.network}\nAddress: ${nextRecord.address}\nCustody Type: ${nextRecord.custodyType}\n\nControl Notes\n- Confirm signer or custodian authority\n- Confirm execution posture and routing\n- Link policy or compliance support as needed`,
        );
        const walletTag: ComplianceTagRecord = {
          id: buildId('cmp'),
          entityId,
          label: `${nextRecord.name} custody review`,
          category: 'digital_asset',
          status: 'review',
          linkedDocumentIds: [walletDocument.id],
          notes: 'Created automatically from wallet setup in Entity Resource Studio.',
        };
        persistedDocument = walletDocument;
        nextRecord.linkedDocumentIds = [walletDocument.id];

        return {
          ...prev,
          wallets: [nextRecord, ...prev.wallets],
          documents: [walletDocument, ...prev.documents],
          complianceTags: [walletTag, ...prev.complianceTags],
        };
      }

      if (resourceType === 'authority') {
        const authorityId = buildId('auth');
        const tokenId = shouldIssueVerificationToken ? buildId('tok') : null;
        const nextRecord: AuthorityRecord = {
          id: authorityId,
          entityId,
          personName: formState.authorityPersonName || selectedEntity.representativeName || 'Authorized Representative',
          recordType: (formState.authorityType as AuthorityRecord['recordType']) || 'client_authorization',
          effectiveDate: formState.authorityDate,
          clientAuthorizationStatus:
            (formState.authorityStatus as AuthorityRecord['clientAuthorizationStatus']) || 'active',
          notes: formState.authorityNotes || 'Created from Entity Resource Studio.',
          linkedTokenIds: tokenId ? [tokenId] : undefined,
        };

        const authorityToken: TokenRecord | null = tokenId
          ? {
              id: tokenId,
              entityId,
              subjectType: 'authority_record',
              subjectId: authorityId,
              label: `${nextRecord.personName} authority token`,
              status: 'issued',
              tokenStandard: 'internal-proof',
              tokenReference: `AUTH-${Date.now()}`,
              issuedAt: new Date().toISOString(),
              proofReference: 'Generated automatically from Entity Resource Studio authority creation.',
            }
          : null;
        const authorityDocument = buildStorageReadyDocument(
          entityId,
          `${nextRecord.personName} Authority Memo`,
          'authority_record',
          'Authority packet generated from the entity resource desk.',
          `# Authority Memo\n\nEntity: ${selectedEntity.displayName || selectedEntity.name}\nRepresentative: ${nextRecord.personName}\nAuthority Type: ${nextRecord.recordType}\nStatus: ${nextRecord.clientAuthorizationStatus}\nEffective Date: ${nextRecord.effectiveDate || 'Pending'}\n\nNotes\n${nextRecord.notes || 'Authority support generated from Entity Resource Studio.'}`,
          [authorityId],
          authorityToken ? [authorityToken.id] : undefined,
        );
        persistedDocument = authorityDocument;
        nextRecord.linkedDocumentIds = [authorityDocument.id];

        return {
          ...prev,
          authorityRecords: [nextRecord, ...prev.authorityRecords],
          documents: [authorityDocument, ...prev.documents],
          tokens: authorityToken ? [authorityToken, ...prev.tokens] : prev.tokens,
        };
      }

      if (resourceType === 'instrument') {
        const instrumentId = buildId('inst');
        const tokenId = shouldIssueVerificationToken ? buildId('tok') : null;
        const legalIdentifier = buildLegalIdentifier(
          selectedEntity.displayName || selectedEntity.name,
          formState.instrumentType || 'instrument',
          formState.instrumentDate,
        );
        const reserveDepositEnabled = (formState.instrumentDepositToReserve || 'yes') === 'yes';
        const sourceClass =
          (formState.instrumentSourceClass as InstrumentRecord['sourceClass']) || 'note';
        const denominationValue = Number(formState.instrumentAmount || 0);
        const linkedTreasuryAccount =
          data.treasuryAccounts.find((account) => account.id === formState.instrumentTreasuryAccountId) ||
          selectedEntityTreasuryAccounts[0];
        const depositAssetId = reserveDepositEnabled ? buildId('asset') : null;
        const depositTransactionId = reserveDepositEnabled ? buildId('txn') : null;
        const depositSettlementId = reserveDepositEnabled ? buildId('set') : null;
        const instrumentSettlementId = reserveDepositEnabled ? buildId('iset') : null;
        const movementIdentifierId = reserveDepositEnabled ? buildId('mid') : null;
        const registerId = buildId('nir');
        const holderLedgerIssueId = buildId('hle');
        const holderLedgerDepositId = reserveDepositEnabled ? buildId('hle') : null;
        const nextRecord: InstrumentRecord = {
          id: instrumentId,
          entityId,
          title: formState.instrumentTitle || `${selectedEntity.displayName || selectedEntity.name} Instrument`,
          instrumentType:
            (formState.instrumentType as InstrumentRecord['instrumentType']) || 'promissory_note',
          legalIdentifier,
          sourceClass,
          issuerEntityId: entityId,
          counterpartyLabel: formState.instrumentCounterpartyLabel || undefined,
          issueDate: formState.instrumentDate,
          denominationValue,
          paymentMedium: 'fiat',
          reserveDepositEnabled,
          linkedTreasuryAccountId: reserveDepositEnabled ? linkedTreasuryAccount?.id : undefined,
          linkedAssetIds: depositAssetId ? [depositAssetId] : undefined,
          linkedDocumentIds: [],
          linkedTokenIds: tokenId ? [tokenId] : undefined,
          notes: formState.instrumentNotes || 'Created from Entity Resource Studio.',
        };
        const instrumentToken: TokenRecord | null = tokenId
          ? {
              id: tokenId,
              entityId,
              subjectType: 'instrument',
              subjectId: instrumentId,
              label: `${nextRecord.title} verification token`,
              status: 'issued',
              tokenStandard: 'internal-proof',
              tokenReference: `INST-${Date.now()}`,
              issuedAt: new Date().toISOString(),
              proofReference: 'Generated automatically from Entity Resource Studio instrument creation.',
            }
          : null;
        const instrumentDocument = buildStorageReadyDocument(
          entityId,
          `${nextRecord.title} Support Packet`,
          'financial',
          'Instrument support packet generated from the entity resource desk.',
          `# Instrument Support Packet\n\nEntity: ${selectedEntity.displayName || selectedEntity.name}\nInstrument: ${nextRecord.title}\nLegal Identifier: ${legalIdentifier}\nType: ${nextRecord.instrumentType}\nSource Class: ${sourceClass}\nIssue Date: ${nextRecord.issueDate || 'Pending'}\nDenomination: ${nextRecord.denominationValue || 0}\nCounterparty: ${nextRecord.counterpartyLabel || 'Pending assignment'}\nReserve Deposit: ${reserveDepositEnabled ? `Auto performance enabled${linkedTreasuryAccount ? ` via ${linkedTreasuryAccount.name}` : ''}` : 'Manual only'}\n\nNotes\n${nextRecord.notes || 'Instrument support generated from Entity Resource Studio.'}`,
          undefined,
          instrumentToken ? [instrumentToken.id] : undefined,
        );
        persistedDocument = instrumentDocument;
        nextRecord.linkedDocumentIds = [instrumentDocument.id];

        const depositedAsset: AssetRecord | null =
          reserveDepositEnabled && depositAssetId
            ? {
                id: depositAssetId,
                entityId,
                name: `${nextRecord.title} Reserve Source`,
                category: ['note', 'bond', 'future'].includes(sourceClass) ? 'security' : 'receivable',
                status: 'active',
                bookValue: denominationValue,
                paymentMedium: 'private_tender',
                linkedDocumentIds: [instrumentDocument.id],
                notes: 'Auto-created source reserve asset from instrument deposit.',
              }
            : null;
        const depositTransaction: TransactionRecord | null =
          reserveDepositEnabled && depositTransactionId
            ? {
                id: depositTransactionId,
                entityId,
                type: 'deposit',
                title: `${nextRecord.title} Source Deposit`,
                amount: denominationValue,
                currency: formState.currency || 'USD',
                date: formState.instrumentDate || new Date().toISOString().slice(0, 10),
                status: 'posted',
                linkedAssetIds: depositedAsset ? [depositedAsset.id] : undefined,
                linkedDocumentIds: [instrumentDocument.id],
                linkedSettlementId: depositSettlementId || undefined,
                linkedTokenIds: instrumentToken ? [instrumentToken.id] : undefined,
                notes: 'Auto-created from source instrument deposit into reserve.',
              }
            : null;
        const depositSettlement: SettlementRecord | null =
          reserveDepositEnabled && depositSettlementId && depositTransaction
            ? {
                id: depositSettlementId,
                entityId,
                linkedTransactionId: depositTransaction.id,
                path: 'internal_ledger',
                dischargeMethod: 'instrument_performance',
                direction: 'incoming',
                status: 'settled',
                liquidCashStage: 'liquid_cash_available',
                verificationMethod: shouldIssueVerificationToken
                  ? 'internal_control_token'
                  : 'manual_override',
                verificationStatus: shouldIssueVerificationToken ? 'verified' : 'pending',
                verificationReference: `Instrument ${legalIdentifier} recognized from source deposit.`,
                tokenizedProofId: instrumentToken?.id,
                linkedTokenIds: instrumentToken ? [instrumentToken.id] : undefined,
                grossAmount: denominationValue,
                settledAmount: denominationValue,
                currency: formState.currency || 'USD',
                initiatedAt: formState.instrumentDate || new Date().toISOString().slice(0, 10),
                expectedSettlementDate: formState.instrumentDate || new Date().toISOString().slice(0, 10),
                actualSettlementDate: formState.instrumentDate || new Date().toISOString().slice(0, 10),
                executionRail: 'LedgerRemittance',
                processorStatus: 'settled',
                executionReason: 'Auto performance on deposit of source instrument into reserve.',
                reserveBacked: true,
                autoReconcileStatus: 'matched',
                notes: 'Created automatically from source-backed reserve deposit.',
              }
            : null;
        const movementIdentifier: MovementIdentifierRecord | null =
          reserveDepositEnabled && movementIdentifierId && depositSettlement
            ? {
                id: movementIdentifierId,
                entityId,
                railNamespace: 'commercial_ach',
                movementType: 'payment',
                linkedSettlementId: depositSettlement.id,
                primaryIdentifier: legalIdentifier,
                secondaryIdentifier: nextRecord.title,
                effectiveDate: nextRecord.issueDate,
                status: 'active',
                notes: 'Internal legal/source identifier assigned to the issued instrument.',
              }
            : null;
        const autoPerformance: InstrumentSettlementRecord | null =
          reserveDepositEnabled && instrumentSettlementId
            ? {
                id: instrumentSettlementId,
                entityId,
                title: `${nextRecord.title} Auto Performance`,
                legalIdentifier,
                instrumentId: instrumentId,
                treasuryAccountId: linkedTreasuryAccount?.id,
                linkedSettlementId: depositSettlement?.id,
                linkedTransactionId: depositTransaction?.id,
                linkedDocumentIds: [instrumentDocument.id],
                linkedTokenIds: instrumentToken ? [instrumentToken.id] : undefined,
                dischargeMethod: 'instrument_performance',
                recognitionBasis: 'obligation_recognized_before_cash',
                performanceStatus: 'performed',
                faceAmount: denominationValue,
                performedAmount: denominationValue,
                currency: formState.currency || 'USD',
                effectiveDate: formState.instrumentDate || new Date().toISOString().slice(0, 10),
                sourceDepositStatus: 'deposited_to_reserve',
                remittanceReference: legalIdentifier,
                notes: 'Auto-performed on entry of source-backed reserve deposit.',
              }
            : null;
        const registerRecord: NegotiableInstrumentRegisterRecord = {
          id: registerId,
          entityId,
          instrumentId,
          legalIdentifier,
          registerLabel: `${nextRecord.title} Register`,
          instrumentForm:
            sourceClass === 'bond'
              ? 'bond'
              : sourceClass === 'future'
                ? 'future'
                : sourceClass === 'collateral'
                  ? 'collateral_memorandum'
                  : 'note',
          status: reserveDepositEnabled ? 'performed' : 'issued',
          issueDate: formState.instrumentDate || new Date().toISOString().slice(0, 10),
          maturityDate: nextRecord.maturityDate,
          issuerEntityId: entityId,
          currentHolderEntityId: entityId,
          currentHolderLabel: selectedEntity.displayName || selectedEntity.name,
          backingTreasuryAccountId: linkedTreasuryAccount?.id,
          faceAmount: denominationValue,
          outstandingAmount: reserveDepositEnabled ? 0 : denominationValue,
          currency: formState.currency || 'USD',
          linkedSettlementIds: autoPerformance?.linkedSettlementId ? [autoPerformance.linkedSettlementId] : undefined,
          linkedDocumentIds: [instrumentDocument.id],
          linkedTokenIds: instrumentToken ? [instrumentToken.id] : undefined,
          notes: 'Generated automatically from Entity Resource Studio instrument creation.',
        };
        const holderLedgerEntries: HolderLedgerEntryRecord[] = [
          {
            id: holderLedgerIssueId,
            entityId,
            registerId,
            entryDate: formState.instrumentDate || new Date().toISOString().slice(0, 10),
            entryType: 'issue',
            holderEntityId: entityId,
            holderLabel: selectedEntity.displayName || selectedEntity.name,
            amount: denominationValue,
            currency: formState.currency || 'USD',
            resultingBalance: denominationValue,
            linkedInstrumentId: instrumentId,
            linkedDocumentIds: [instrumentDocument.id],
            linkedTokenIds: instrumentToken ? [instrumentToken.id] : undefined,
            notes: 'Initial issuance entry generated from the resource desk.',
          },
          ...(reserveDepositEnabled && holderLedgerDepositId && depositSettlement
            ? [
                {
                  id: holderLedgerDepositId,
                  entityId,
                  registerId,
                  entryDate: formState.instrumentDate || new Date().toISOString().slice(0, 10),
                  entryType: 'deposit' as const,
                  holderEntityId: entityId,
                  holderLabel: linkedTreasuryAccount?.name || (selectedEntity.displayName || selectedEntity.name),
                  amount: denominationValue,
                  currency: formState.currency || 'USD',
                  resultingBalance: 0,
                  linkedInstrumentId: instrumentId,
                  linkedSettlementId: depositSettlement.id,
                  linkedDocumentIds: [instrumentDocument.id],
                  linkedTokenIds: instrumentToken ? [instrumentToken.id] : undefined,
                  notes: 'Reserve deposit and auto-performance recorded on creation.',
                },
              ]
            : []),
        ];

        return {
          ...prev,
          instruments: [nextRecord, ...prev.instruments],
          negotiableInstrumentRegisters: [registerRecord, ...prev.negotiableInstrumentRegisters],
          holderLedgerEntries: [...holderLedgerEntries, ...prev.holderLedgerEntries],
          documents: [instrumentDocument, ...prev.documents],
          assets: depositedAsset ? [depositedAsset, ...prev.assets] : prev.assets,
          transactions: depositTransaction ? [depositTransaction, ...prev.transactions] : prev.transactions,
          settlements: depositSettlement ? [depositSettlement, ...prev.settlements] : prev.settlements,
          movementIdentifiers: movementIdentifier
            ? [movementIdentifier, ...prev.movementIdentifiers]
            : prev.movementIdentifiers,
          instrumentSettlements: autoPerformance
            ? [autoPerformance, ...prev.instrumentSettlements]
            : prev.instrumentSettlements,
          treasuryAccounts:
            reserveDepositEnabled && linkedTreasuryAccount
              ? prev.treasuryAccounts.map((account) =>
                  account.id === linkedTreasuryAccount.id
                    ? {
                        ...account,
                        availableBalance: account.availableBalance + denominationValue,
                      }
                    : account,
                )
              : prev.treasuryAccounts,
          tokens: instrumentToken ? [instrumentToken, ...prev.tokens] : prev.tokens,
        };
      }

      if (resourceType === 'obligation') {
        const obligationId = buildId('obl');
        const legalIdentifier = buildLegalIdentifier(
          selectedEntity.displayName || selectedEntity.name,
          formState.obligationType || 'obligation',
          formState.documentDate,
        );
        const nextRecord: ObligationRecord = {
          id: obligationId,
          entityId,
          title: formState.obligationTitle || `${selectedEntity.displayName || selectedEntity.name} Obligation`,
          legalIdentifier,
          obligationType:
            (formState.obligationType as ObligationRecord['obligationType']) || 'private_obligation',
          amount: Number(formState.obligationAmount || 0),
          paymentMedium:
            (formState.obligationPaymentMedium as ObligationRecord['paymentMedium']) || 'fiat',
          status: (formState.obligationStatus as ObligationRecord['status']) || 'open',
          linkedDocumentIds: [],
        };
        const obligationDocument = buildStorageReadyDocument(
          entityId,
          `${nextRecord.title} Control Memo`,
          'financial',
          'Obligation control memo generated from the entity resource desk.',
          `# Obligation Control Memo\n\nEntity: ${selectedEntity.displayName || selectedEntity.name}\nObligation: ${nextRecord.title}\nLegal Identifier: ${legalIdentifier}\nType: ${nextRecord.obligationType}\nAmount: ${nextRecord.amount}\nPayment Medium: ${nextRecord.paymentMedium}\nStatus: ${nextRecord.status}\n\nNotes\nGenerated from Entity Resource Studio for downstream settlement and treasury work.`,
        );
        persistedDocument = obligationDocument;
        nextRecord.linkedDocumentIds = [obligationDocument.id];

        return {
          ...prev,
          obligations: [nextRecord, ...prev.obligations],
          documents: [obligationDocument, ...prev.documents],
        };
      }

      const nextRecord = buildStorageReadyDocument(
        entityId,
        formState.documentTitle || `${selectedEntity.displayName || selectedEntity.name} Control Memo`,
        (formState.documentCategory as DocumentRecord['category']) || 'authority_record',
        formState.documentSummary || 'Created from Entity Resource Studio.',
        `# Entity Control Memo\n\nEntity: ${selectedEntity.displayName || selectedEntity.name}\nCategory: ${formState.documentCategory || 'authority_record'}\nDate: ${formState.documentDate || new Date().toISOString().slice(0, 10)}\n\nSummary\n${formState.documentSummary || 'Created from Entity Resource Studio.'}`,
      );
      persistedDocument = nextRecord;

      return { ...prev, documents: [nextRecord, ...prev.documents] };
    });

    if (persistedDocument) {
      const hydratedDocument = await persistGeneratedEntityDocument(persistedDocument);
      setData((prev) => ({
        ...prev,
        documents: prev.documents.map((item) =>
          item.id === hydratedDocument.id ? hydratedDocument : item,
        ),
      }));
      goToHash(`#documents:${hydratedDocument.id}`);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Target Entity</span>
          <select
            style={inputStyle}
            value={selectedEntityId}
            onChange={(event) => setSelectedEntityId(event.target.value)}
          >
            {data.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.displayName || entity.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Resource Type</span>
          <select
            style={inputStyle}
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value as ResourceType)}
          >
            {resourceTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 16,
          border: '1px solid rgba(126, 242, 255, 0.16)',
          background: 'rgba(11, 20, 38, 0.72)',
          color: 'var(--cf-muted)',
          lineHeight: 1.6,
        }}
      >
        {
          resourceTypeOptions.find((option) => option.value === resourceType)?.description
        }
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        {[
          ['Bank Accounts', summary.bankAccounts],
          ['Wallets', summary.wallets],
          ['Authority', summary.authorityRecords],
          ['Instruments', summary.instruments],
          ['Obligations', summary.obligations],
          ['Documents', summary.documents],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: 14,
            }}
          >
            <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(126, 242, 255, 0.16)',
          background: 'rgba(11, 20, 38, 0.72)',
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>Entity Follow-Through</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {workflowSignals.map((signal) => (
            <div
              key={signal.label}
              style={{
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: 14,
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{signal.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{signal.value}</div>
              <div style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.5 }}>
                {signal.hint}
              </div>
              <button
                type="button"
                onClick={() => goToHash(signal.actionHash)}
                style={{
                  justifySelf: 'start',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(126, 242, 255, 0.24)',
                  background: 'rgba(54, 215, 255, 0.12)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {signal.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </div>

      {resourceType === 'bankAccount' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Institution Name</span>
            <input
              style={inputStyle}
              value={formState.institutionName || ''}
              onChange={(event) => updateField('institutionName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Name</span>
            <input
              style={inputStyle}
              value={formState.accountName || ''}
              onChange={(event) => updateField('accountName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Type</span>
            <select
              style={inputStyle}
              value={formState.accountType || 'checking'}
              onChange={(event) => updateField('accountType', event.target.value)}
            >
              {['checking', 'savings', 'credit_card', 'custodial', 'other'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Currency</span>
            <input
              style={inputStyle}
              value={formState.currency || 'USD'}
              onChange={(event) => updateField('currency', event.target.value)}
            />
          </label>
        </div>
      )}

      {resourceType === 'wallet' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Wallet Name</span>
            <input
              style={inputStyle}
              value={formState.walletName || ''}
              onChange={(event) => updateField('walletName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Network</span>
            <input
              style={inputStyle}
              value={formState.walletNetwork || 'ethereum'}
              onChange={(event) => updateField('walletNetwork', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Address / Identifier</span>
            <input
              style={inputStyle}
              value={formState.walletAddress || ''}
              onChange={(event) => updateField('walletAddress', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Custody Type</span>
            <select
              style={inputStyle}
              value={formState.walletCustodyType || 'self_custody'}
              onChange={(event) => updateField('walletCustodyType', event.target.value)}
            >
              {['self_custody', 'exchange', 'qualified_custodian', 'multisig', 'contract'].map(
                (option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
      )}

      {resourceType === 'authority' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Person Name</span>
            <input
              style={inputStyle}
              value={formState.authorityPersonName || ''}
              onChange={(event) => updateField('authorityPersonName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Authority Type</span>
            <select
              style={inputStyle}
              value={formState.authorityType || 'client_authorization'}
              onChange={(event) => updateField('authorityType', event.target.value)}
            >
              {[
                'attorney_of_record',
                'private_representative',
                'power_of_attorney',
                'notice_of_appearance',
                'client_authorization',
                'trustee_authority',
                'manager_authority',
                'other',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Authorization Status</span>
            <select
              style={inputStyle}
              value={formState.authorityStatus || 'active'}
              onChange={(event) => updateField('authorityStatus', event.target.value)}
            >
              {['active', 'limited', 'revoked', 'unknown'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Effective Date</span>
            <input
              type="date"
              style={inputStyle}
              value={formState.authorityDate || ''}
              onChange={(event) => updateField('authorityDate', event.target.value)}
            />
          </label>
        </div>
      )}

      {resourceType === 'instrument' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Instrument Title</span>
            <input
              style={inputStyle}
              value={formState.instrumentTitle || ''}
              onChange={(event) => updateField('instrumentTitle', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Instrument Type</span>
            <select
              style={inputStyle}
              value={formState.instrumentType || 'promissory_note'}
              onChange={(event) => updateField('instrumentType', event.target.value)}
            >
              {[
                'promissory_note',
                'private_bond',
                'pledged_metal_reserve',
                'contract_right',
                'performance_security_posting',
                'tender_designation',
                'tokenized_note',
                'tokenized_equity',
                'custody_record',
                'other',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Denomination / Face Value</span>
            <input
              style={inputStyle}
              type="number"
              value={formState.instrumentAmount || ''}
              onChange={(event) => updateField('instrumentAmount', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Issue Date</span>
            <input
              type="date"
              style={inputStyle}
              value={formState.instrumentDate || ''}
              onChange={(event) => updateField('instrumentDate', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Source Class</span>
            <select
              style={inputStyle}
              value={formState.instrumentSourceClass || 'note'}
              onChange={(event) => updateField('instrumentSourceClass', event.target.value)}
            >
              {['note', 'bond', 'future', 'collateral', 'other'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Counterparty / Related Party</span>
            <input
              style={inputStyle}
              value={formState.instrumentCounterpartyLabel || ''}
              onChange={(event) => updateField('instrumentCounterpartyLabel', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Auto Deposit to Reserve</span>
            <select
              style={inputStyle}
              value={formState.instrumentDepositToReserve || 'yes'}
              onChange={(event) => updateField('instrumentDepositToReserve', event.target.value)}
            >
              <option value="yes">Yes, auto perform on deposit</option>
              <option value="no">No, create instrument only</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Reserve Treasury</span>
            <select
              style={inputStyle}
              value={formState.instrumentTreasuryAccountId || ''}
              onChange={(event) => updateField('instrumentTreasuryAccountId', event.target.value)}
            >
              <option value="">Use primary treasury</option>
              {selectedEntityTreasuryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {resourceType === 'obligation' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Obligation Title</span>
            <input
              style={inputStyle}
              value={formState.obligationTitle || ''}
              onChange={(event) => updateField('obligationTitle', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Obligation Type</span>
            <select
              style={inputStyle}
              value={formState.obligationType || 'private_obligation'}
              onChange={(event) => updateField('obligationType', event.target.value)}
            >
              {[
                'public_obligation',
                'private_obligation',
                'secured_private_obligation',
                'pledged_performance_security',
                'reserve_backed_claim',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Amount</span>
            <input
              style={inputStyle}
              type="number"
              value={formState.obligationAmount || ''}
              onChange={(event) => updateField('obligationAmount', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Payment Medium</span>
            <select
              style={inputStyle}
              value={formState.obligationPaymentMedium || 'fiat'}
              onChange={(event) => updateField('obligationPaymentMedium', event.target.value)}
            >
              {['specie', 'fiat', 'private_tender', 'digital_asset', 'mixed_contractual_tender'].map(
                (option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
      )}

      {resourceType === 'document' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Document Title</span>
            <input
              style={inputStyle}
              value={formState.documentTitle || ''}
              onChange={(event) => updateField('documentTitle', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Document Category</span>
            <select
              style={inputStyle}
              value={formState.documentCategory || 'authority_record'}
              onChange={(event) => updateField('documentCategory', event.target.value)}
            >
              {[
                'governing',
                'financial',
                'compliance',
                'contract',
                'title',
                'tax',
                'authority_record',
                'legal_memo',
                'other',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Document Date</span>
            <input
              type="date"
              style={inputStyle}
              value={formState.documentDate || ''}
              onChange={(event) => updateField('documentDate', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Summary</span>
            <input
              style={inputStyle}
              value={formState.documentSummary || ''}
              onChange={(event) => updateField('documentSummary', event.target.value)}
            />
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleCreateResource}
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
          Create Resource
        </button>
        <div style={{ color: 'var(--cf-muted)', alignSelf: 'center' }}>
          New resources inherit the entity’s currency and operating context where available.
        </div>
      </div>

      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>Recent Entity Resources</div>
        {recentResources.length === 0 ? (
          <div style={{ color: 'var(--cf-muted)' }}>
            This entity does not have any quick-created resources yet.
          </div>
        ) : (
            recentResources.map((resource) => (
              <div
                key={resource.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(8, 13, 27, 0.56)',
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontWeight: 700 }}>{resource.label}</div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
                    {resource.kind} · {resource.supportLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToHash(resource.actionHash)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126, 242, 255, 0.24)',
                    background: 'rgba(54, 215, 255, 0.12)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resource.actionLabel}
                </button>
              </div>
            ))
          )}
      </div>
    </div>
  );
}
