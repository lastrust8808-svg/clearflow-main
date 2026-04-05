import { coreMockData } from '../data/mockData';
import type { AppData, Entity } from '../types/app.models';
import type {
  AuthorityRecord,
  CoreDataBundle,
  DocumentRecord,
  EntityRecord,
  TokenRecord,
} from '../types/core';
import type { MembershipIntakeDraft } from './onboarding.service';

export const MEMBERSHIP_DRAFT_STORAGE_KEY = 'clearflow-membership-intake-draft';
export const MEMBERSHIP_DRAFT_ID_STORAGE_KEY = 'clearflow-membership-intake-draft-id';
export const CLEARFLOW_TERMS_VERSION = '2026.03';

function buildPrefixSeed(value: string, fallback: string) {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) {
    return fallback;
  }

  const initials = cleaned
    .split(/\s+/)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || fallback;
}

function mapDraftPathToAuthEntityType(
  selectedPath: MembershipIntakeDraft['selectedPath']
): Entity['type'] {
  switch (selectedPath) {
    case 'trust_estate':
      return 'Trust/Estate';
    case 'business_entity':
      return 'LLC';
    case 'tax_exempt':
      return 'Non-profit';
    case 'personal':
      return 'Personal';
    default:
      return 'LLC';
  }
}

function mapDraftPathToCoreEntityType(
  selectedPath: MembershipIntakeDraft['selectedPath']
): EntityRecord['type'] {
  switch (selectedPath) {
    case 'trust_estate':
      return 'trust';
    case 'business_entity':
      return 'llc';
    case 'tax_exempt':
      return 'nonprofit';
    case 'personal':
      return 'individual';
    default:
      return 'other';
  }
}

export function getStoredMembershipDraft(): MembershipIntakeDraft | null {
  try {
    const raw = window.localStorage.getItem(MEMBERSHIP_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as MembershipIntakeDraft;
  } catch {
    return null;
  }
}

export function clearStoredMembershipDraft() {
  window.localStorage.removeItem(MEMBERSHIP_DRAFT_STORAGE_KEY);
  window.localStorage.removeItem(MEMBERSHIP_DRAFT_ID_STORAGE_KEY);
}

function buildBlankSnapshot(entity: EntityRecord, authorityRecord: AuthorityRecord, tokens: TokenRecord[], documents: DocumentRecord[]): CoreDataBundle {
  return {
    ...coreMockData,
    entities: [entity],
    entityMarkUsageRecords: [],
    entityConnections: [],
    creditRails: [],
    negotiableInstrumentRegisters: [],
    holderLedgerEntries: [],
    dispatchRecords: [],
    customers: [],
    vendors: [],
    invoices: [],
    bills: [],
    receipts: [],
    expenses: [],
    payments: [],
    employees: [],
    directDepositAuthorizations: [],
    bankAccounts: [],
    reconciliations: [],
    accountingPeriods: [],
    journalEntries: [],
    settlements: [],
    treasuryAccounts: [],
    borrowingFacilities: [],
    collateralHoldings: [],
    futuresStrategies: [],
    liquidationPlans: [],
    instrumentSettlements: [],
    remittanceStatements: [],
    movementIdentifiers: [],
    returnEvents: [],
    reclamationEvents: [],
    taxReportingLinks: [],
    ledgerAccounts: [],
    assets: [],
    wallets: [],
    digitalAssets: [],
    smartContractPositions: [],
    instruments: [],
    obligations: [],
    couponPresentments: [],
    authorityRecords: [authorityRecord],
    onChainTransactions: [],
    transactions: [],
    interEntityTransfers: [],
    complianceTags: [],
    municipalDisclosures: [],
    municipalEventNotices: [],
    kybReviews: [],
    watchlistScreenings: [],
    amlCases: [],
    digitalAssetCompliance: [],
    documents,
    tokens,
    aiWorkflows: coreMockData.aiWorkflows,
    bankFeedRules: [],
    bankFeedEntries: [],
    workspaceSettings: coreMockData.workspaceSettings,
  };
}

export function enrichAppDataFromMembershipDraft(appData: AppData): AppData {
  const draft = getStoredMembershipDraft();
  if (!draft) {
    return appData;
  }

  const now = new Date().toISOString();
  const entityId = appData.entities[0]?.id ?? `entity-${crypto.randomUUID()}`;
  const authorityId = `auth-${crypto.randomUUID()}`;
  const tokenId = `tok-${crypto.randomUUID()}`;
  const documentId = `doc-${crypto.randomUUID()}`;
  const prefixSeed = buildPrefixSeed(draft.displayName || draft.legalName, 'CF');
  const workspaceName = draft.displayName || draft.legalName || 'ClearFlow Workspace';

  const seededEntity: Entity = appData.entities[0] ?? {
    id: entityId,
    name: draft.displayName || draft.legalName,
    type: mapDraftPathToAuthEntityType(draft.selectedPath),
    ein: draft.ein,
    bankConnected: false,
    isVerified: false,
    bankSourcedOwnerNames: draft.representativeName ? [draft.representativeName] : undefined,
    stateRegistrationNumber: draft.stateOfFormation || undefined,
  };

  const coreEntity: EntityRecord = {
    id: seededEntity.id,
    name: draft.displayName || draft.legalName,
    displayName: draft.displayName || draft.legalName,
    type: mapDraftPathToCoreEntityType(draft.selectedPath),
    jurisdiction: draft.stateOfFormation || draft.country || undefined,
    country: draft.country || undefined,
    taxId: draft.ein || undefined,
    formationDate: now.slice(0, 10),
    status: 'draft',
    ownerDisplay: draft.representativeName || undefined,
    representativeName: draft.representativeName || appData.user.name,
    representativeRole: draft.representativeRole || undefined,
    branding: {
      accentColor: '#36d7ff',
      documentLogoText: draft.displayName || draft.legalName,
      emailFromName: draft.displayName || draft.legalName,
      replyToEmail: draft.representativeEmail || appData.user.email,
      invoiceFooterNote: 'Generated and verified through the ClearFlow operating system.',
    },
    numbering: {
      invoicePrefix: `${prefixSeed}-INV`,
      quotePrefix: `${prefixSeed}-QTE`,
      billPrefix: `${prefixSeed}-BILL`,
      receiptPrefix: `${prefixSeed}-RCPT`,
      journalPrefix: `${prefixSeed}-JE`,
      nextInvoiceSequence: 1,
      nextQuoteSequence: 1,
      nextBillSequence: 1,
      nextReceiptSequence: 1,
      nextJournalSequence: 1,
    },
    operationalDefaults: {
      baseCurrency: 'USD',
      fiscalYearStartMonth: 1,
      defaultSettlementPath: 'ach',
      interEntitySettlementMode: 'mirrored_halves',
      autoIssueVerificationTokens: true,
      autoReconcileLedgerLinks: true,
    },
  };

  const authorityRecord: AuthorityRecord = {
    id: authorityId,
    entityId: seededEntity.id,
    personName: draft.representativeName || appData.user.name,
    recordType:
      draft.selectedPath === 'trust_estate' ? 'trustee_authority' : 'manager_authority',
    effectiveDate: now.slice(0, 10),
    clientAuthorizationStatus: draft.authorizedRepresentative ? 'active' : 'limited',
    linkedTokenIds: [tokenId],
    linkedDocumentIds: [documentId],
    notes: `${draft.representativeRole || 'Representative'} onboarding authority created during secure intake.`,
  };

  const authorityToken: TokenRecord = {
    id: tokenId,
    entityId: seededEntity.id,
    subjectType: 'authority_record',
    subjectId: authorityId,
    label: 'Onboarding Authority Token',
    status: draft.googleIdentityMatch ? 'issued' : 'draft',
    tokenStandard: 'internal-proof',
    tokenReference: `ONBOARD-${seededEntity.id}`,
    issuedAt: now,
    proofReference: draft.googleIdentityMatch
      ? 'Identity match affirmed during onboarding; pending final verification.'
      : 'Awaiting identity match affirmation and verification.',
    notes: draft.notes || undefined,
  };

  const onboardingDocument: DocumentRecord = {
    id: documentId,
    entityId: seededEntity.id,
    title: 'Onboarding Authority Intake',
    category: 'authority_record',
    date: now.slice(0, 10),
    status: 'draft',
    linkedAuthorityRecordIds: [authorityId],
    linkedTokenIds: [tokenId],
    summary: `${draft.selectedPath} onboarding draft for ${draft.legalName}.`,
  };

  const existingSnapshot = appData.coreDataSnapshot;
  const nextSnapshot = existingSnapshot
    ? {
        ...existingSnapshot,
        entities:
          existingSnapshot.entities.length > 0 ? existingSnapshot.entities : [coreEntity],
        authorityRecords:
          existingSnapshot.authorityRecords.length > 0
            ? existingSnapshot.authorityRecords
            : [authorityRecord],
        documents:
          existingSnapshot.documents.length > 0
            ? existingSnapshot.documents
            : [onboardingDocument],
        tokens: existingSnapshot.tokens.length > 0 ? existingSnapshot.tokens : [authorityToken],
        workspaceSettings: {
          ...existingSnapshot.workspaceSettings,
          workspaceName:
            existingSnapshot.workspaceSettings.workspaceName || workspaceName,
          defaultCountry:
            existingSnapshot.workspaceSettings.defaultCountry || draft.country || undefined,
          defaultJurisdiction:
            existingSnapshot.workspaceSettings.defaultJurisdiction ||
            draft.stateOfFormation ||
            draft.country ||
            undefined,
          supportEmail:
            existingSnapshot.workspaceSettings.supportEmail ||
            draft.representativeEmail ||
            undefined,
          preferredAccentColor:
            existingSnapshot.workspaceSettings.preferredAccentColor || '#36d7ff',
        },
      }
    : buildBlankSnapshot(coreEntity, authorityRecord, [authorityToken], [onboardingDocument]);

  if (!existingSnapshot) {
    nextSnapshot.workspaceSettings = {
      ...nextSnapshot.workspaceSettings,
      workspaceName,
      defaultCountry: draft.country || undefined,
      defaultJurisdiction: draft.stateOfFormation || draft.country || undefined,
      supportEmail: draft.representativeEmail || undefined,
      preferredAccentColor: '#36d7ff',
    };
  }

  return {
    ...appData,
    entities: appData.entities.length > 0 ? appData.entities : [seededEntity],
    coreDataSnapshot: nextSnapshot,
  };
}

function upsertById<T extends { id: string }>(records: T[], nextRecord: T) {
  const existingIndex = records.findIndex((record) => record.id === nextRecord.id);
  if (existingIndex === -1) {
    return [...records, nextRecord];
  }

  return records.map((record) => (record.id === nextRecord.id ? nextRecord : record));
}

export function hasClearFlowRetentionPackage(appData: AppData): boolean {
  if (!appData.coreDataSnapshot) {
    return false;
  }

  const {
    clearflowTermsDocumentId,
    clearflowRetainedRecordDocumentId,
  } = appData.user;

  if (!clearflowTermsDocumentId || !clearflowRetainedRecordDocumentId) {
    return false;
  }

  const snapshot = appData.coreDataSnapshot;
  return (
    snapshot.documents.some((item) => item.id === clearflowTermsDocumentId) &&
    snapshot.documents.some((item) => item.id === clearflowRetainedRecordDocumentId)
  );
}

export function applyClearFlowRetentionRecords(
  appData: AppData,
  input: {
    acceptedAt: string;
    termsVersion?: string;
    signerName?: string;
  }
): AppData {
  const primaryEntityId =
    appData.entities[0]?.id ?? appData.coreDataSnapshot?.entities[0]?.id;

  if (!primaryEntityId || !appData.coreDataSnapshot) {
    return appData;
  }

  const acceptedDate = input.acceptedAt.slice(0, 10);
  const termsVersion = input.termsVersion || CLEARFLOW_TERMS_VERSION;
  const signerName =
    input.signerName?.trim() || appData.user.name || appData.user.email || 'ClearFlow user';
  const agreementDocumentId = `doc-clearflow-terms-${appData.user.id}`;
  const retainedDocumentId = `doc-clearflow-retained-${appData.user.id}`;
  const agreementTokenId = `tok-clearflow-terms-${appData.user.id}`;
  const cleanedSnapshot: CoreDataBundle = {
    ...appData.coreDataSnapshot,
    ledgerAccounts: appData.coreDataSnapshot.ledgerAccounts.filter(
      (item) => !item.name.startsWith('ClearFlow '),
    ),
    treasuryAccounts: appData.coreDataSnapshot.treasuryAccounts.filter(
      (item) => !item.name.startsWith('ClearFlow '),
    ),
    assets: appData.coreDataSnapshot.assets.filter((item) => !item.name.startsWith('ClearFlow ')),
    instruments: appData.coreDataSnapshot.instruments.filter(
      (item) =>
        !item.title.startsWith('ClearFlow ') &&
        !item.notes?.includes('platform-retained security agreement support'),
    ),
  };

  const agreementDocument: DocumentRecord = {
    id: agreementDocumentId,
    entityId: primaryEntityId,
    title: 'ClearFlow User Terms and Security Agreement',
    category: 'contract',
    date: acceptedDate,
    status: 'final',
    linkedTokenIds: [agreementTokenId],
    summary:
      `Accepted ClearFlow user agreement, platform security terms, and retained-record consent signed by ${signerName}.`,
    storageOwner: 'clearflow_retained',
    retentionClass: 'agreement',
    storageNotes:
      'Required internal agreement record retained by ClearFlow for platform security, consent, and recordkeeping support.',
    externalStorageStatus: 'not_applicable',
  };

  const retainedRecordDocument: DocumentRecord = {
    id: retainedDocumentId,
    entityId: primaryEntityId,
    title: 'ClearFlow Retained Security Record',
    category: 'compliance',
    date: acceptedDate,
    status: 'final',
    linkedTokenIds: [agreementTokenId],
    summary:
      `Platform-retained record of the user agreement, security posture, internal ClearFlow ledger deposit reference, and protected recordkeeping retention for signer ${signerName}.`,
    storageOwner: 'clearflow_retained',
    retentionClass: 'security_support',
    storageNotes:
      'Protected internal retained record held by ClearFlow for custody support, growth tracking, and audit-ready recordkeeping.',
    externalStorageStatus: 'not_applicable',
  };

  const agreementToken: TokenRecord = {
    id: agreementTokenId,
    entityId: primaryEntityId,
    subjectType: 'document',
    subjectId: agreementDocumentId,
    label: 'ClearFlow Agreement Acceptance Token',
    status: 'verified',
    tokenStandard: 'internal-proof',
    tokenReference: `CLEARFLOW-TERMS-${appData.user.id}`,
    issuedAt: input.acceptedAt,
    verifiedAt: input.acceptedAt,
    proofReference: `Accepted ClearFlow terms version ${termsVersion} and linked platform retention record signed by ${signerName}.`,
  };

  const nextSnapshot: CoreDataBundle = {
    ...cleanedSnapshot,
    documents: upsertById(
      upsertById(cleanedSnapshot.documents, agreementDocument),
      retainedRecordDocument
    ),
    tokens: upsertById(cleanedSnapshot.tokens, agreementToken),
    workspaceSettings: {
      ...cleanedSnapshot.workspaceSettings,
      vaultRetentionPolicy: 'core_records_permanent',
      customRetentionNotes:
        'Core user agreement, security support records, and retained platform custody records are kept internally by ClearFlow while user workspace data can remain user-owned where configured.',
    },
  };

  return {
    ...appData,
    user: {
      ...appData.user,
      clearflowTermsAcceptedAt: input.acceptedAt,
      clearflowTermsVersion: termsVersion,
      clearflowTermsSignerName: signerName,
      clearflowTermsDocumentId: agreementDocumentId,
      clearflowRetainedRecordDocumentId: retainedDocumentId,
      clearflowInternalLedgerStatus: appData.user.clearflowInternalLedgerStatus || 'pending',
    },
    coreDataSnapshot: nextSnapshot,
  };
}
