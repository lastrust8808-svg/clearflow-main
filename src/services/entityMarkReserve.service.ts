import type {
  AssetRecord,
  CoreDataBundle,
  DigitalAssetRecord,
  DocumentRecord,
  EntityMarkRailCode,
  EntityMarkUsageRecord,
  EntityRecord,
  JournalEntryRecord,
  LedgerAccountRecord,
  TokenRecord,
  TransactionRecord,
  TreasuryAccountRecord,
} from '../types/core';

function buildEntityCode(label?: string) {
  const cleaned = (label || 'ENTITY').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 8) || 'ENTITY';
}

function mergeIds(existing: string[] | undefined, additions: (string | undefined)[]) {
  const next = new Set(existing || []);
  additions.forEach((item) => {
    if (item) {
      next.add(item);
    }
  });
  return next.size ? Array.from(next) : undefined;
}

function buildAppliedRails(
  bundle: CoreDataBundle,
  entity: EntityRecord,
  document: DocumentRecord,
  hasDigitalAsset: boolean,
  hasCashPath: boolean,
): EntityMarkRailCode[] {
  const rails: EntityMarkRailCode[] = ['mark_reserve'];

  if (
    entity.branding?.entityMailingLine &&
    entity.branding?.entityProofSealCode &&
    entity.branding?.entityQrPayload
  ) {
    rails.push('mailing_proof');
  }

  if (hasDigitalAsset) {
    rails.push('digital_liquidation');
  }

  if (hasCashPath) {
    rails.push('cash_settlement');
  }

  const hasTaxEvidencePath =
    document.category === 'tax' ||
    Boolean(bundle.workspaceSettings.eftpsEnabled && entity.taxId) ||
    bundle.taxReportingLinks.some((item) => item.entityId === entity.id);
  if (hasTaxEvidencePath) {
    rails.push('tax_evidence');
  }

  return rails;
}

function buildUsageTrigger(entity: EntityRecord, document: DocumentRecord) {
  if (entity.branding?.sealValueEnabled !== true || !document.generatedBody) {
    return false;
  }

  const body = document.generatedBody;
  return (
    body.includes('## Signature Support') ||
    body.includes('Seal / Stamp') ||
    (Boolean(entity.branding?.entityProofSealCode) &&
      body.includes(entity.branding?.entityProofSealCode || '')) ||
    (Boolean(entity.branding?.entitySealSvg) &&
      body.includes(entity.branding?.entitySealSvg || ''))
  );
}

export function findNextEntityMarkEligibleDocument(bundle: CoreDataBundle): DocumentRecord | null {
  for (const document of bundle.documents) {
    const entity = bundle.entities.find((item) => item.id === document.entityId);
    if (!entity || !buildUsageTrigger(entity, document)) {
      continue;
    }

    const existingUsage = bundle.entityMarkUsageRecords.find((item) => item.documentId === document.id);
    if (!existingUsage) {
      return document;
    }
  }

  return null;
}

function ensureLedgerAccount(
  ledgerAccounts: LedgerAccountRecord[],
  entityId: string,
  preferredId: string | undefined,
  input: Pick<LedgerAccountRecord, 'code' | 'name' | 'accountType' | 'currency' | 'balance'>,
) {
  const existing =
    (preferredId ? ledgerAccounts.find((item) => item.id === preferredId) : undefined) ||
    ledgerAccounts.find((item) => item.entityId === entityId && item.name === input.name);
  if (existing) {
    return { record: existing, created: false, ledgerAccounts };
  }

  const record: LedgerAccountRecord = {
    id: `ledg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityId,
    code: input.code,
    name: input.name,
    accountType: input.accountType,
    currency: input.currency,
    balance: input.balance,
    remittanceClassification: 'reserve',
  };

  return { record, created: true, ledgerAccounts: [record, ...ledgerAccounts] };
}

function ensureTreasuryAccount(
  treasuryAccounts: TreasuryAccountRecord[],
  entity: EntityRecord,
  currency: string,
  linkedLedgerAccountId: string,
) {
  const existing =
    (entity.branding?.sealReserveTreasuryAccountId
      ? treasuryAccounts.find((item) => item.id === entity.branding?.sealReserveTreasuryAccountId)
      : undefined) ||
    treasuryAccounts.find(
      (item) => item.entityId === entity.id && item.name === `${entity.displayName || entity.name} Mark Reserve`,
    );

  if (existing) {
    return { record: existing, created: false, treasuryAccounts };
  }

  const record: TreasuryAccountRecord = {
    id: `tre-mark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityId: entity.id,
    name: `${entity.displayName || entity.name} Mark Reserve`,
    treasuryType: 'reserve',
    status: 'active',
    currency,
    availableBalance: 0,
    reservedBalance: 0,
    linkedLedgerAccountId,
    originatingAuthority: 'private_ledger_only',
    remittanceEnabled: false,
    notes: 'Controlled reserve account for entity mark, seal, and signature value usage.',
  };

  return { record, created: true, treasuryAccounts: [record, ...treasuryAccounts] };
}

function ensureReserveAsset(
  assets: AssetRecord[],
  entity: EntityRecord,
  currency: string,
  linkedLedgerAccountId: string,
) {
  const existing =
    (entity.branding?.sealReserveAssetId
      ? assets.find((item) => item.id === entity.branding?.sealReserveAssetId)
      : undefined) ||
    assets.find(
      (item) => item.entityId === entity.id && item.name === `${entity.displayName || entity.name} Mark Reserve Asset`,
    );

  if (existing) {
    return { record: existing, created: false, assets };
  }

  const record: AssetRecord = {
    id: `asset-mark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityId: entity.id,
    name: `${entity.displayName || entity.name} Mark Reserve Asset`,
    category: 'tokenized_claim',
    status: 'active',
    bookValue: 0,
    marketValue: 0,
    paymentMedium: 'digital_asset',
    linkedLedgerAccountId,
    notes: `Internal controlled-value reserve attached to ${entity.displayName || entity.name} mark usage.`,
  };

  return { record, created: true, assets: [record, ...assets] };
}

function ensureDigitalAsset(
  digitalAssets: DigitalAssetRecord[],
  entity: EntityRecord,
  currency: string,
  linkedLedgerAccountId: string,
) {
  const symbol = `${buildEntityCode(entity.displayName || entity.name)}M`;
  const existing =
    (entity.branding?.sealReserveDigitalAssetId
      ? digitalAssets.find((item) => item.id === entity.branding?.sealReserveDigitalAssetId)
      : undefined) ||
    digitalAssets.find(
      (item) => item.entityId === entity.id && item.symbol === symbol && item.name.includes('Mark Reserve'),
    );

  if (existing) {
    return { record: existing, created: false, digitalAssets };
  }

  const record: DigitalAssetRecord = {
    id: `dmark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityId: entity.id,
    name: `${entity.displayName || entity.name} Mark Reserve Unit`,
    symbol,
    network: 'clearflow_internal',
    assetSubtype: 'fungible_token',
    quantity: 0,
    estimatedValue: 0,
    classification: 'utility',
    custodyStatus: 'controlled',
    complianceStatus: 'ok',
    tokenDecimals: 2,
    linkedLedgerAccountId,
  };

  return { record, created: true, digitalAssets: [record, ...digitalAssets] };
}

export function applyEntityMarkValueToBundle(
  bundle: CoreDataBundle,
  documentId: string,
): CoreDataBundle {
  const document = bundle.documents.find((item) => item.id === documentId);
  if (!document) {
    return bundle;
  }

  const entity = bundle.entities.find((item) => item.id === document.entityId);
  if (!entity || !buildUsageTrigger(entity, document)) {
    return bundle;
  }

  if (bundle.entityMarkUsageRecords.some((item) => item.documentId === documentId)) {
    return bundle;
  }

  const currency =
    entity.branding?.sealValueCurrency ||
    entity.operationalDefaults?.baseCurrency ||
    bundle.workspaceSettings.baseCurrency ||
    'USD';
  const unitValue = Math.max(entity.branding?.sealUnitValue || 1, 0.01);

  let ledgerAccounts = [...bundle.ledgerAccounts];
  let treasuryAccounts = [...bundle.treasuryAccounts];
  let assets = [...bundle.assets];
  let digitalAssets = [...bundle.digitalAssets];
  const entities = [...bundle.entities];
  const documents = [...bundle.documents];
  const journalEntries = [...bundle.journalEntries];
  const transactions = [...bundle.transactions];
  const tokens = [...bundle.tokens];
  const entityMarkUsageRecords = [...bundle.entityMarkUsageRecords];

  const assetLedgerResult = ensureLedgerAccount(ledgerAccounts, entity.id, entity.branding?.sealReserveAssetAccountId, {
    code: `${buildEntityCode(entity.displayName || entity.name)}-MRA`,
    name: `${entity.displayName || entity.name} Mark Reserve Asset`,
    accountType: 'asset',
    currency,
    balance: 0,
  });
  ledgerAccounts = assetLedgerResult.ledgerAccounts;

  const equityLedgerResult = ensureLedgerAccount(
    ledgerAccounts,
    entity.id,
    entity.branding?.sealReserveEquityAccountId,
    {
      code: `${buildEntityCode(entity.displayName || entity.name)}-MRI`,
      name: `${entity.displayName || entity.name} Mark Value Issuance`,
      accountType: 'equity',
      currency,
      balance: 0,
    },
  );
  ledgerAccounts = equityLedgerResult.ledgerAccounts;

  const treasuryResult = ensureTreasuryAccount(
    treasuryAccounts,
    entity,
    currency,
    assetLedgerResult.record.id,
  );
  treasuryAccounts = treasuryResult.treasuryAccounts;

  const reserveAssetResult = ensureReserveAsset(assets, entity, currency, assetLedgerResult.record.id);
  assets = reserveAssetResult.assets;

  const digitalAssetResult = ensureDigitalAsset(
    digitalAssets,
    entity,
    currency,
    assetLedgerResult.record.id,
  );
  digitalAssets = digitalAssetResult.digitalAssets;
  const hasEntityBankPath = bundle.bankAccounts.some((item) => item.entityId === entity.id);
  const hasCashPath =
    hasEntityBankPath ||
    treasuryResult.record.linkedBankAccountId === bundle.workspaceSettings.eftpsLinkedBankAccountId ||
    bundle.workspaceSettings.eftpsLinkedTreasuryAccountId === treasuryResult.record.id;
  const appliedRails = buildAppliedRails(
    bundle,
    entity,
    document,
    Boolean(digitalAssetResult.record.id),
    hasCashPath,
  );
  const liquidationFocus = appliedRails.includes('digital_liquidation')
    ? 'digital_asset_to_cash'
    : appliedRails.includes('cash_settlement')
      ? 'reserve_to_cash'
      : 'none';

  const stamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 7);
  const usageId = `muse-${stamp}-${suffix}`;
  const tokenId = `tok-mark-${stamp}-${suffix}`;
  const transactionId = `txn-mark-${stamp}-${suffix}`;
  const journalEntryId = `je-mark-${stamp}-${suffix}`;
  const today = new Date().toISOString().slice(0, 10);
  const entityLabel = entity.displayName || entity.name;

  const token: TokenRecord = {
    id: tokenId,
    entityId: entity.id,
    subjectType: 'seal_usage',
    subjectId: usageId,
    label: `${entityLabel} Mark Usage Token`,
    status: 'issued',
    tokenStandard: 'internal-mark-proof',
    tokenReference: `${buildEntityCode(entityLabel)}-MARK-${stamp}`,
    issuedAt: new Date().toISOString(),
    proofReference: `Issued when ${entityLabel} mark usage was attached to ${document.title}. Proof seal ${
      entity.branding?.entityProofSealCode || 'noted on entity profile'
    }.`,
    notes: 'Controlled-value usage proof for entity seal and signature support.',
  };

  const transaction: TransactionRecord = {
    id: transactionId,
    entityId: entity.id,
    type: 'token_issuance',
    title: `${entityLabel} mark reserve issuance`,
    amount: unitValue,
    currency,
    date: today,
    status: 'posted',
    linkedLedgerAccountIds: [assetLedgerResult.record.id, equityLedgerResult.record.id],
    linkedAssetIds: [reserveAssetResult.record.id],
    linkedDocumentIds: [document.id],
    linkedJournalEntryIds: [journalEntryId],
    linkedTokenIds: [token.id],
    notes: 'Issued automatically when a stamped or signed entity document was generated and retained.',
  };

  const journalEntry: JournalEntryRecord = {
    id: journalEntryId,
    entityId: entity.id,
    entryNumber: `${entity.numbering?.journalPrefix || 'JE'}-MARK-${String(stamp).slice(-6)}`,
    entryDate: today,
    memo: `${entityLabel} mark reserve issuance for ${document.title}`,
    debitAccount: assetLedgerResult.record.name,
    creditAccount: equityLedgerResult.record.name,
    amount: unitValue,
    status: 'posted',
    source: 'system',
    linkedTransactionIds: [transactionId],
    linkedDocumentIds: [document.id],
    autoReconcileStatus: 'matched',
    verificationRequired: false,
  };

  const usageRecord: EntityMarkUsageRecord = {
    id: usageId,
    entityId: entity.id,
    documentId: document.id,
    usageDate: today,
    placement: 'signature_block',
    markLabel: `${entityLabel} seal and signature reserve usage`,
    unitsIssued: 1,
    unitValue,
    totalValue: unitValue,
    currency,
    proofSealCode: entity.branding?.entityProofSealCode,
    qrPayload: entity.branding?.entityQrPayload,
    reserveTreasuryAccountId: treasuryResult.record.id,
    reserveAssetAccountId: assetLedgerResult.record.id,
    reserveEquityAccountId: equityLedgerResult.record.id,
    reserveAssetId: reserveAssetResult.record.id,
    digitalAssetId: digitalAssetResult.record.id,
    linkedTransactionId: transaction.id,
    linkedJournalEntryId: journalEntry.id,
    linkedTokenId: token.id,
    appliedRails,
    liquidationFocus,
    status: 'recorded',
    notes: `Recorded automatically when the entity mark is embedded in an outgoing generated document. Rails: ${appliedRails.join(', ')}.`,
  };

  const entityIndex = entities.findIndex((item) => item.id === entity.id);
  entities[entityIndex] = {
    ...entity,
    branding: {
      ...entity.branding,
      sealReserveTreasuryAccountId: treasuryResult.record.id,
      sealReserveAssetAccountId: assetLedgerResult.record.id,
      sealReserveEquityAccountId: equityLedgerResult.record.id,
      sealReserveAssetId: reserveAssetResult.record.id,
      sealReserveDigitalAssetId: digitalAssetResult.record.id,
      sealValueCurrency: currency,
      sealUnitValue: unitValue,
    },
  };

  const documentIndex = documents.findIndex((item) => item.id === document.id);
  documents[documentIndex] = {
    ...document,
    linkedAssetIds: mergeIds(document.linkedAssetIds, [reserveAssetResult.record.id]),
    linkedTransactionIds: mergeIds(document.linkedTransactionIds, [transaction.id]),
    linkedTokenIds: mergeIds(document.linkedTokenIds, [token.id]),
    linkedSealUsageIds: mergeIds(document.linkedSealUsageIds, [usageRecord.id]),
    summary: document.summary
      ? `${document.summary} Mark value recorded at ${currency} ${unitValue.toLocaleString()}.`
      : `Mark value recorded at ${currency} ${unitValue.toLocaleString()}.`,
  };

  const reserveAssetIndex = assets.findIndex((item) => item.id === reserveAssetResult.record.id);
  assets[reserveAssetIndex] = {
    ...reserveAssetResult.record,
    bookValue: Number(reserveAssetResult.record.bookValue || 0) + unitValue,
    marketValue: Number(reserveAssetResult.record.marketValue || 0) + unitValue,
    linkedDocumentIds: mergeIds(reserveAssetResult.record.linkedDocumentIds, [document.id]),
    notes: reserveAssetResult.record.notes,
  };

  const digitalAssetIndex = digitalAssets.findIndex((item) => item.id === digitalAssetResult.record.id);
  digitalAssets[digitalAssetIndex] = {
    ...digitalAssetResult.record,
    quantity: Number(digitalAssetResult.record.quantity || 0) + usageRecord.unitsIssued,
    estimatedValue: Number(digitalAssetResult.record.estimatedValue || 0) + unitValue,
    linkedTokenIds: mergeIds(digitalAssetResult.record.linkedTokenIds, [token.id]),
    linkedDocumentIds: mergeIds(digitalAssetResult.record.linkedDocumentIds, [document.id]),
  };

  const treasuryIndex = treasuryAccounts.findIndex((item) => item.id === treasuryResult.record.id);
  treasuryAccounts[treasuryIndex] = {
    ...treasuryResult.record,
    availableBalance: Number(treasuryResult.record.availableBalance || 0) + unitValue,
    notes: treasuryResult.record.notes,
  };

  const assetLedgerIndex = ledgerAccounts.findIndex((item) => item.id === assetLedgerResult.record.id);
  ledgerAccounts[assetLedgerIndex] = {
    ...assetLedgerResult.record,
    balance: Number(assetLedgerResult.record.balance || 0) + unitValue,
    linkedAssetIds: mergeIds(assetLedgerResult.record.linkedAssetIds, [reserveAssetResult.record.id]),
  };

  const equityLedgerIndex = ledgerAccounts.findIndex((item) => item.id === equityLedgerResult.record.id);
  ledgerAccounts[equityLedgerIndex] = {
    ...equityLedgerResult.record,
    balance: Number(equityLedgerResult.record.balance || 0) + unitValue,
  };

  journalEntries.unshift(journalEntry);
  transactions.unshift(transaction);
  tokens.unshift(token);
  entityMarkUsageRecords.unshift(usageRecord);

  return {
    ...bundle,
    entities,
    entityMarkUsageRecords,
    ledgerAccounts,
    treasuryAccounts,
    assets,
    digitalAssets,
    journalEntries,
    transactions,
    documents,
    tokens,
  };
}
