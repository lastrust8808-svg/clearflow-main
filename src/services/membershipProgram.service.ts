import { coreMockData } from '../data/mockData';
import type {
  AppData,
  BillingInvoice,
  MembershipAutopayMethod,
  MembershipProfile,
  MembershipTierPlan,
  Settlement,
  User,
} from '../types/app.models';
import type {
  AuthorityRecord,
  CoreDataBundle,
  DocumentRecord,
  EntityRecord,
  LedgerAccountRecord,
  TokenRecord,
  TreasuryAccountRecord,
} from '../types/core';

type MembershipPlanConfig = {
  tier: MembershipTierPlan;
  monthlyRate: number;
  autopayDiscountRate: number;
  label: string;
};

const PLAN_CONFIG: Record<MembershipTierPlan, MembershipPlanConfig> = {
  steward: {
    tier: 'steward',
    monthlyRate: 39,
    autopayDiscountRate: 0.1,
    label: 'Steward',
  },
  operator: {
    tier: 'operator',
    monthlyRate: 89,
    autopayDiscountRate: 0.1,
    label: 'Operator',
  },
  crown: {
    tier: 'crown',
    monthlyRate: 179,
    autopayDiscountRate: 0.1,
    label: 'Crown',
  },
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildEffectiveMonthlyRate(
  monthlyRate: number,
  autopayEnabled: boolean,
  autopayDiscountRate: number,
) {
  return autopayEnabled
    ? Number((monthlyRate * (1 - autopayDiscountRate)).toFixed(2))
    : monthlyRate;
}

export function buildMembershipProfile(input?: {
  tier?: MembershipTierPlan;
  autopayEnabled?: boolean;
  autopayMethod?: MembershipAutopayMethod;
  status?: MembershipProfile['status'];
  now?: string;
  devProfileLinked?: boolean;
}) {
  const tier = input?.tier || 'operator';
  const config = PLAN_CONFIG[tier];
  const now = input?.now ? new Date(input.now) : new Date();
  const trialEndsAt = addDays(now, 30);
  const autopayEnabled = input?.autopayEnabled ?? true;
  const autopayMethod = input?.autopayMethod ?? (autopayEnabled ? 'bank' : 'none');
  const effectiveMonthlyRate = buildEffectiveMonthlyRate(
    config.monthlyRate,
    autopayEnabled,
    config.autopayDiscountRate,
  );

  return {
    tier,
    status: input?.status || 'trialing',
    billingCadence: 'monthly' as const,
    monthlyRate: config.monthlyRate,
    autopayEnabled,
    autopayMethod,
    autopayDiscountRate: config.autopayDiscountRate,
    effectiveMonthlyRate,
    trialStartedAt: now.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    nextBillingDate: toDateString(trialEndsAt),
    devProfileLinked: input?.devProfileLinked,
  } satisfies MembershipProfile;
}

export function buildMembershipBillingArtifacts(
  userId: string,
  membershipProfile: MembershipProfile,
  options?: {
    now?: string;
    includePaidCycle?: boolean;
  },
) {
  const now = options?.now ? new Date(options.now) : new Date();
  const trialEnd = new Date(membershipProfile.trialEndsAt);
  const firstPaidDate = trialEnd;
  const secondPaidDate = addMonths(firstPaidDate, 1);
  const effectiveRate = membershipProfile.effectiveMonthlyRate;

  const billingInvoices: BillingInvoice[] = [
    {
      id: `billing-trial-${userId}`,
      userId,
      periodStartDate: toDateString(now),
      periodEndDate: toDateString(trialEnd),
      issueDate: toDateString(now),
      dueDate: toDateString(now),
      status: 'closed',
      subtotal: 0,
      credits: 0,
      total: 0,
      amountPaid: 0,
      balanceDue: 0,
    },
  ];

  const settlements: Settlement[] = [];

  if (options?.includePaidCycle) {
    billingInvoices.push({
      id: `billing-paid-${userId}`,
      userId,
      periodStartDate: toDateString(firstPaidDate),
      periodEndDate: toDateString(addMonths(firstPaidDate, 1)),
      issueDate: toDateString(firstPaidDate),
      dueDate: toDateString(firstPaidDate),
      status: 'settled',
      subtotal: membershipProfile.monthlyRate,
      credits: Number((membershipProfile.monthlyRate - effectiveRate).toFixed(2)),
      total: effectiveRate,
      amountPaid: effectiveRate,
      balanceDue: 0,
    });

    settlements.push({
      id: `settlement-membership-${userId}`,
      invoiceId: `billing-paid-${userId}`,
      paymentDate: toDateString(firstPaidDate),
      amount: effectiveRate,
      method: membershipProfile.autopayMethod === 'card' ? 'Credit Card' : 'ACH',
      confirmationCode: `CF-AUTO-${userId.slice(0, 6).toUpperCase()}`,
    });
  }

  billingInvoices.push({
    id: `billing-next-${userId}`,
    userId,
    periodStartDate: toDateString(secondPaidDate),
    periodEndDate: toDateString(addMonths(secondPaidDate, 1)),
    issueDate: toDateString(secondPaidDate),
    dueDate: toDateString(secondPaidDate),
    status: 'issued',
    subtotal: membershipProfile.monthlyRate,
    credits: Number((membershipProfile.monthlyRate - effectiveRate).toFixed(2)),
    total: effectiveRate,
    amountPaid: 0,
    balanceDue: effectiveRate,
  });

  return { billingInvoices, settlements };
}

function buildBlankSnapshot(
  entity: EntityRecord,
  authorityRecord: AuthorityRecord,
  documents: DocumentRecord[],
  tokens: TokenRecord[],
  ledgerAccounts: LedgerAccountRecord[],
  treasuryAccounts: TreasuryAccountRecord[],
): CoreDataBundle {
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
    treasuryAccounts,
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
    ledgerAccounts,
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
    workspaceSettings: {
      ...coreMockData.workspaceSettings,
      workspaceName: entity.displayName || entity.name,
      defaultCountry: entity.country,
      defaultJurisdiction: entity.jurisdiction,
      supportEmail: entity.primaryEmail,
      preferredAccentColor: '#36d7ff',
    },
  };
}

export function buildDevOperatorAppData(user: User) {
  const membershipProfile =
    user.membershipProfile ||
    buildMembershipProfile({
      tier: 'operator',
      autopayEnabled: true,
      autopayMethod: 'bank',
      status: 'active',
      devProfileLinked: true,
      now: new Date().toISOString(),
    });
  const { billingInvoices, settlements } = buildMembershipBillingArtifacts(user.id, membershipProfile, {
    includePaidCycle: true,
    now: membershipProfile.trialStartedAt,
  });

  const entityId = `entity-dev-${user.id.slice(0, 8)}`;
  const authorityId = `auth-dev-${user.id.slice(0, 8)}`;
  const authorityDocumentId = `doc-dev-authority-${user.id.slice(0, 8)}`;
  const authorityTokenId = `tok-dev-authority-${user.id.slice(0, 8)}`;
  const cashLedgerId = `ledger-cash-${user.id.slice(0, 8)}`;
  const receivableLedgerId = `ledger-ar-${user.id.slice(0, 8)}`;
  const deferredLedgerId = `ledger-deferred-${user.id.slice(0, 8)}`;
  const revenueLedgerId = `ledger-revenue-${user.id.slice(0, 8)}`;
  const autopayLedgerId = `ledger-autopay-${user.id.slice(0, 8)}`;
  const treasuryId = `treasury-dev-${user.id.slice(0, 8)}`;

  const coreEntity: EntityRecord = {
    id: entityId,
    name: 'ClearFlow Dev Operations',
    displayName: 'ClearFlow Dev Operations',
    type: 'individual',
    jurisdiction: 'United States',
    country: 'United States',
    formationDate: toDateString(new Date()),
    status: 'active',
    ownerDisplay: user.name,
    representativeName: user.name,
    representativeRole: 'Operator',
    authorityAttestedAt: new Date().toISOString(),
    authorityAttestationStatement:
      'Dev operator attests to platform testing authority and retained agreement support.',
    authorityProofStatus: 'matched',
    authorityProofSummary: 'Dev operator profile is internally attested for workspace testing.',
    authorityTransactionsPaused: false,
    primaryEmail: user.email,
    entityAccess: {
      storageMode: 'internal_only',
      driveConnectionStatus: 'internal_only',
      shareInCollectiveOverview: true,
      shareInOperatorDashboard: true,
    },
    branding: {
      accentColor: '#36d7ff',
      documentLogoText: 'ClearFlow Dev',
      emailFromName: 'ClearFlow Dev Operations',
      replyToEmail: user.email,
      invoiceFooterNote: 'Internal development workspace operated through ClearFlow.',
    },
    numbering: {
      invoicePrefix: 'DEV-INV',
      quotePrefix: 'DEV-QTE',
      billPrefix: 'DEV-BILL',
      receiptPrefix: 'DEV-RCPT',
      journalPrefix: 'DEV-JE',
      nextInvoiceSequence: 2,
      nextQuoteSequence: 1,
      nextBillSequence: 1,
      nextReceiptSequence: 1,
      nextJournalSequence: 3,
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
    entityId,
    personName: user.name,
    recordType: 'manager_authority',
    effectiveDate: toDateString(new Date()),
    clientAuthorizationStatus: 'active',
    linkedTokenIds: [authorityTokenId],
    linkedDocumentIds: [authorityDocumentId],
    notes: 'Dev operator authority seeded for internal workspace testing.',
  };

  const authorityDocument: DocumentRecord = {
    id: authorityDocumentId,
    entityId,
    title: 'ClearFlow Dev Operator Authority Record',
    category: 'authority_record',
    date: toDateString(new Date()),
    status: 'final',
    linkedAuthorityRecordIds: [authorityId],
    linkedTokenIds: [authorityTokenId],
    summary: 'Internal dev operator authority and workspace control record.',
    storageOwner: 'clearflow_retained',
    retentionClass: 'security_support',
    externalStorageStatus: 'not_applicable',
  };

  const authorityToken: TokenRecord = {
    id: authorityTokenId,
    entityId,
    subjectType: 'authority_record',
    subjectId: authorityId,
    label: 'Dev Operator Authority Token',
    status: 'verified',
    tokenStandard: 'internal-proof',
    tokenReference: `DEV-AUTH-${user.id.slice(0, 8).toUpperCase()}`,
    issuedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    proofReference: 'Internal development operator record verified for workspace testing.',
  };

  const ledgerAccounts: LedgerAccountRecord[] = [
    {
      id: cashLedgerId,
      entityId,
      code: '1000',
      name: 'ClearFlow Operating Cash',
      accountType: 'asset',
      currency: 'USD',
      balance: settlements.reduce((sum, settlement) => sum + settlement.amount, 0),
      remittanceEligible: true,
      remittanceClassification: 'cash',
    },
    {
      id: receivableLedgerId,
      entityId,
      code: '1105',
      name: 'Membership Accounts Receivable',
      accountType: 'asset',
      currency: 'USD',
      balance: billingInvoices.find((invoice) => invoice.id === `billing-next-${user.id}`)?.balanceDue || 0,
      remittanceClassification: 'receivable',
    },
    {
      id: autopayLedgerId,
      entityId,
      code: '1155',
      name: 'Membership Autopay Clearing',
      accountType: 'asset',
      currency: 'USD',
      balance: 0,
      remittanceClassification: 'cash',
    },
    {
      id: deferredLedgerId,
      entityId,
      code: '2305',
      name: 'Deferred Trial Membership Revenue',
      accountType: 'liability',
      currency: 'USD',
      balance: 0,
    },
    {
      id: revenueLedgerId,
      entityId,
      code: '4005',
      name: 'Membership Revenue',
      accountType: 'income',
      currency: 'USD',
      balance: settlements.reduce((sum, settlement) => sum + settlement.amount, 0),
    },
  ];

  const treasuryAccounts: TreasuryAccountRecord[] = [
    {
      id: treasuryId,
      entityId,
      name: 'Membership Operating Treasury',
      treasuryType: 'operational_cash',
      status: 'active',
      currency: 'USD',
      availableBalance: settlements.reduce((sum, settlement) => sum + settlement.amount, 0),
      linkedLedgerAccountId: cashLedgerId,
      originatingAuthority: 'private_ledger_only',
      remittanceEnabled: true,
      notes: 'Internal dev treasury record for membership acceptance and autopay testing.',
    },
  ];

  const coreDataSnapshot = buildBlankSnapshot(
    coreEntity,
    authorityRecord,
    [authorityDocument],
    [authorityToken],
    ledgerAccounts,
    treasuryAccounts,
  );

  return {
    user: {
      ...user,
      membershipProfile,
    },
    entities: [
      {
        id: entityId,
        name: coreEntity.displayName || coreEntity.name,
        type: 'Personal',
        ein: '',
        bankConnected: false,
        isVerified: true,
      },
    ],
    membershipProfile,
    billingInvoices,
    settlements,
    coreDataSnapshot,
  } satisfies AppData;
}
