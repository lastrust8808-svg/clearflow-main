import type {
  CoreDataBundle,
  CreditRailRecord,
  EntityConnectionRecord,
  EntityRecord,
  HolderLedgerEntryRecord,
  InterEntityTransferRecord,
  JournalEntryRecord,
  NegotiableInstrumentRegisterRecord,
  ObligationRecord,
  PaymentRecord,
  SettlementRecord,
  TransactionRecord,
  InstrumentRecord,
} from '../types/core';
import type { InterEntityTransferSubmitPayload } from '../components/accounting/accountingTypes';

interface MovementResult {
  data: CoreDataBundle;
  notice: string;
}

function label(entity: EntityRecord) {
  return entity.displayName || entity.name;
}

function safeAmount(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  return Number(amount.toFixed(2));
}

function identifierSegment(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'ENTITY';
}

function findOrCreateConnection(
  existing: EntityConnectionRecord[],
  owner: EntityRecord,
  connected: EntityRecord,
  stamp: number,
): { records: EntityConnectionRecord[]; connection: EntityConnectionRecord } {
  const found = existing.find(
    (connection) =>
      connection.ownerEntityId === owner.id &&
      connection.connectedEntityId === connected.id &&
      connection.connectionType === 'internal_entity',
  );

  if (found) {
    const updated: EntityConnectionRecord = {
      ...found,
      status: 'active',
      notes:
        found.notes ||
        'Internal entity connection used for controlled inter-entity accounting movements.',
    };
    return {
      records: existing.map((item) => (item.id === found.id ? updated : item)),
      connection: updated,
    };
  }

  const connection: EntityConnectionRecord = {
    id: `conn-${stamp}-${identifierSegment(owner.id)}-${identifierSegment(connected.id)}`,
    ownerEntityId: owner.id,
    connectionName: `${label(owner)} <> ${label(connected)}`,
    connectionType: 'internal_entity',
    relationshipClass: 'shared_control',
    status: 'active',
    connectedEntityId: connected.id,
    defaultSettlementPath: 'internal_ledger',
    defaultCurrency: 'USD',
    validationMode: 'strict',
    requireVerificationTokens: true,
    requireComplianceValidation: false,
    reserveBackedPreferred: true,
    notes:
      'Created automatically for controlled inter-entity accounting movements. This record does not by itself represent bank cash.',
  };

  return { records: [connection, ...existing], connection };
}

function buildCreditRail({
  connection,
  owner,
  amount,
  reserveBacked,
  railType,
  stamp,
  noteLabel,
}: {
  connection: EntityConnectionRecord;
  owner: EntityRecord;
  amount: number;
  reserveBacked: boolean;
  railType: 'intercompany_credit' | 'reserve_bridge' | 'partner_note';
  stamp: number;
  noteLabel?: string;
}): CreditRailRecord {
  return {
    id: `rail-${stamp}-${identifierSegment(owner.id)}`,
    ownerEntityId: owner.id,
    entityConnectionId: connection.id,
    railName:
      noteLabel ||
      `${label(owner)} ${railType === 'reserve_bridge' ? 'Reserve Bridge' : 'Internal Credit'}`,
    railType,
    status: 'active',
    settlementPath: 'internal_ledger',
    dischargeMethod:
      railType === 'partner_note' ? 'instrument_performance' : 'internal_ledger_credit',
    legalUsePosture:
      railType === 'partner_note'
        ? 'private_instrument_tracking_only'
        : 'internal_controlled_book_entry',
    bankingOperationClass:
      reserveBacked || railType === 'partner_note'
        ? 'collateral_control'
        : 'affiliate_cash_management',
    identifierNamespace: `${identifierSegment(owner.name)}-${
      railType === 'partner_note' ? 'NOTE' : railType === 'reserve_bridge' ? 'RSV' : 'AFFIL'
    }`,
    currency: 'USD',
    outstandingExposure: amount,
    autoMirrorIntercompanyEntries: true,
    autoIssueTokens: true,
    autoCreateNoteRemittance: railType === 'partner_note',
    noteSettlementMode: railType === 'partner_note' ? 'holder_presentment' : undefined,
    holderRecordRequired: railType === 'partner_note',
    reserveBacked,
    notes:
      railType === 'partner_note'
        ? 'Private inter-entity note rail. Holder movement is tracked internally; no bank cash is created by issuance or assignment.'
        : reserveBacked
          ? 'Reserve-backed internal credit exposure. This is non-cash until an external settlement event is confirmed.'
          : 'Internal credit exposure. This is non-cash until an external settlement event is confirmed.',
  };
}

function updateExistingRailExposure(
  rails: CreditRailRecord[],
  railId: string | undefined,
  amount: number,
) {
  if (!railId) return rails;

  return rails.map((rail) => {
    if (rail.id !== railId) return rail;
    const outstanding = Math.max(Number(rail.outstandingExposure || 0) - amount, 0);
    const limit = Number(rail.exposureLimit || 0);
    return {
      ...rail,
      outstandingExposure: outstanding,
      availableCredit: limit > 0 ? Math.max(limit - outstanding, 0) : rail.availableCredit,
      status: outstanding === 0 ? ('closed' as const) : rail.status,
    };
  });
}

function makeNonCashJournalPair({
  stamp,
  fromEntity,
  toEntity,
  entryDate,
  memo,
  amount,
  fromDebit,
  fromCredit,
  toDebit,
  toCredit,
  fromTransactionId,
  toTransactionId,
}: {
  stamp: number;
  fromEntity: EntityRecord;
  toEntity: EntityRecord;
  entryDate: string;
  memo: string;
  amount: number;
  fromDebit: string;
  fromCredit: string;
  toDebit: string;
  toCredit: string;
  fromTransactionId: string;
  toTransactionId: string;
}): JournalEntryRecord[] {
  return [
    {
      id: `je-${stamp}-from`,
      entityId: fromEntity.id,
      entryNumber: `JE-${stamp}-A`,
      entryDate,
      memo,
      debitAccount: fromDebit,
      creditAccount: fromCredit,
      amount,
      status: 'posted',
      source: 'system',
      linkedTransactionIds: [fromTransactionId],
      autoReconcileStatus: 'matched',
    },
    {
      id: `je-${stamp}-to`,
      entityId: toEntity.id,
      entryNumber: `JE-${stamp}-B`,
      entryDate,
      memo,
      debitAccount: toDebit,
      creditAccount: toCredit,
      amount,
      status: 'posted',
      source: 'system',
      linkedTransactionIds: [toTransactionId],
      autoReconcileStatus: 'matched',
    },
  ];
}

function buildTransferRecord({
  groupId,
  fromEntity,
  toEntity,
  fromTransactionId,
  toTransactionId,
  amount,
  entryDate,
  payload,
  status,
  connectionId,
  creditRailId,
  linkedInstrumentId,
  linkedInstrumentRegisterId,
  linkedObligationId,
  bankConfirmationRequired,
}: {
  groupId: string;
  fromEntity: EntityRecord;
  toEntity: EntityRecord;
  fromTransactionId: string;
  toTransactionId: string;
  amount: number;
  entryDate: string;
  payload: InterEntityTransferSubmitPayload;
  status: InterEntityTransferRecord['status'];
  connectionId?: string;
  creditRailId?: string;
  linkedInstrumentId?: string;
  linkedInstrumentRegisterId?: string;
  linkedObligationId?: string;
  bankConfirmationRequired?: boolean;
}): InterEntityTransferRecord {
  return {
    id: groupId,
    transferGroupId: groupId,
    fromEntityId: fromEntity.id,
    toEntityId: toEntity.id,
    fromTransactionId,
    toTransactionId,
    amount,
    currency: 'USD',
    effectiveDate: entryDate,
    settlementMode: payload.settlementMode,
    movementType: payload.movementType,
    noteAction:
      payload.movementType === 'note_instrument' ? payload.noteAction : undefined,
    status,
    linkedEntityConnectionId: connectionId,
    linkedCreditRailId: creditRailId,
    linkedInstrumentId,
    linkedInstrumentRegisterId,
    linkedObligationId,
    reserveBacked: payload.reserveBacked,
    bankConfirmationRequired,
    memo: payload.memo || undefined,
  };
}

function postCashMovement(
  data: CoreDataBundle,
  payload: InterEntityTransferSubmitPayload,
  fromEntity: EntityRecord,
  toEntity: EntityRecord,
  amount: number,
  entryDate: string,
  stamp: number,
): MovementResult {
  const groupId = `iet-${stamp}`;
  const fromTransactionId = `txn-${stamp}-from`;
  const toTransactionId = `txn-${stamp}-to`;
  const fromPaymentId = `pay-${stamp}-from`;
  const toPaymentId = `pay-${stamp}-to`;
  const fromSettlementId = `set-${stamp}-from`;
  const toSettlementId = `set-${stamp}-to`;
  const fromJournalId = `je-${stamp}-from`;
  const toJournalId = `je-${stamp}-to`;
  const memo = payload.memo || `Cash movement from ${label(fromEntity)} to ${label(toEntity)}`;

  const connectionResult = findOrCreateConnection(
    [...(data.entityConnections ?? [])],
    fromEntity,
    toEntity,
    stamp,
  );

  const transactions: TransactionRecord[] = [
    {
      id: fromTransactionId,
      entityId: fromEntity.id,
      type: 'transfer',
      title: memo,
      amount,
      currency: 'USD',
      date: entryDate,
      status: 'pending',
      linkedSettlementId: fromSettlementId,
      linkedPaymentIds: [fromPaymentId],
      linkedJournalEntryIds: [fromJournalId],
      counterpartyEntityId: toEntity.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'origin',
      notes: 'Cash-side origin is pending bank confirmation and must not be treated as settled cash yet.',
    },
    {
      id: toTransactionId,
      entityId: toEntity.id,
      type: 'deposit',
      title: memo,
      amount,
      currency: 'USD',
      date: entryDate,
      status: 'pending',
      linkedSettlementId: toSettlementId,
      linkedPaymentIds: [toPaymentId],
      linkedJournalEntryIds: [toJournalId],
      counterpartyEntityId: fromEntity.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'destination',
      notes: 'Cash-side destination is pending bank confirmation and must not be treated as available cash yet.',
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: fromPaymentId,
      entityId: fromEntity.id,
      direction: 'outgoing',
      counterpartyType: 'other',
      paymentDate: entryDate,
      amount,
      currency: 'USD',
      method: 'internal_transfer',
      status: 'initiated',
      linkedTransactionIds: [fromTransactionId],
      linkedSettlementId: fromSettlementId,
      linkedEntityConnectionId: connectionResult.connection.id,
      notes: `Inter-entity cash movement to ${label(toEntity)} awaiting bank-feed confirmation.`,
    },
    {
      id: toPaymentId,
      entityId: toEntity.id,
      direction: 'incoming',
      counterpartyType: 'other',
      paymentDate: entryDate,
      amount,
      currency: 'USD',
      method: 'internal_transfer',
      status: 'initiated',
      linkedTransactionIds: [toTransactionId],
      linkedSettlementId: toSettlementId,
      linkedEntityConnectionId: connectionResult.connection.id,
      notes: `Inter-entity cash receipt from ${label(fromEntity)} awaiting bank-feed confirmation.`,
    },
  ];

  const settlements: SettlementRecord[] = [
    {
      id: fromSettlementId,
      entityId: fromEntity.id,
      linkedTransactionId: fromTransactionId,
      linkedPaymentId: fromPaymentId,
      linkedJournalEntryIds: [fromJournalId],
      path: 'internal_ledger',
      direction: 'outgoing',
      status: 'verifying',
      liquidCashStage: 'liquid_cash_pending',
      verificationMethod: 'bank_confirmation',
      verificationStatus: 'pending',
      verificationReference: 'Awaiting external bank activity / reconciliation confirmation.',
      grossAmount: amount,
      settledAmount: 0,
      currency: 'USD',
      initiatedAt: entryDate,
      linkedEntityConnectionId: connectionResult.connection.id,
      executionMode: 'staged',
      executionProvider: 'manual',
      liveExecution: false,
      externalStatus: 'staged',
      processorStatus: 'queued',
      executionReason:
        'Inter-entity cash movement recorded, but ClearFlow will not call it settled until bank activity confirms the movement.',
      autoReconcileStatus: 'pending',
      notes: memo,
    },
    {
      id: toSettlementId,
      entityId: toEntity.id,
      linkedTransactionId: toTransactionId,
      linkedPaymentId: toPaymentId,
      linkedJournalEntryIds: [toJournalId],
      path: 'internal_ledger',
      direction: 'incoming',
      status: 'verifying',
      liquidCashStage: 'liquid_cash_pending',
      verificationMethod: 'bank_confirmation',
      verificationStatus: 'pending',
      verificationReference: 'Awaiting external bank activity / reconciliation confirmation.',
      grossAmount: amount,
      settledAmount: 0,
      currency: 'USD',
      initiatedAt: entryDate,
      linkedEntityConnectionId: connectionResult.connection.id,
      executionMode: 'staged',
      executionProvider: 'manual',
      liveExecution: false,
      externalStatus: 'staged',
      processorStatus: 'queued',
      executionReason:
        'Destination cash remains pending until bank activity confirms the receipt.',
      autoReconcileStatus: 'pending',
      notes: memo,
    },
  ];

  const journalEntries: JournalEntryRecord[] = [
    {
      id: fromJournalId,
      entityId: fromEntity.id,
      entryNumber: `JE-${stamp}-A`,
      entryDate,
      memo,
      debitAccount: `1450 Due From ${label(toEntity)}`,
      creditAccount: payload.fromCashAccount || '1000 Operating Cash',
      amount,
      status: 'draft',
      source: 'system',
      linkedTransactionIds: [fromTransactionId],
      linkedSettlementIds: [fromSettlementId],
      autoReconcileStatus: 'pending',
    },
    {
      id: toJournalId,
      entityId: toEntity.id,
      entryNumber: `JE-${stamp}-B`,
      entryDate,
      memo,
      debitAccount: payload.toCashAccount || '1000 Operating Cash',
      creditAccount: `2400 Due To ${label(fromEntity)}`,
      amount,
      status: 'draft',
      source: 'system',
      linkedTransactionIds: [toTransactionId],
      linkedSettlementIds: [toSettlementId],
      autoReconcileStatus: 'pending',
    },
  ];

  const transfer = buildTransferRecord({
    groupId,
    fromEntity,
    toEntity,
    fromTransactionId,
    toTransactionId,
    amount,
    entryDate,
    payload,
    status: 'posted',
    connectionId: connectionResult.connection.id,
    bankConfirmationRequired: true,
  });

  return {
    data: {
      ...data,
      entityConnections: connectionResult.records,
      transactions: [...transactions, ...(data.transactions ?? [])],
      payments: [...payments, ...(data.payments ?? [])],
      settlements: [...settlements, ...(data.settlements ?? [])],
      journalEntries: [...journalEntries, ...(data.journalEntries ?? [])],
      interEntityTransfers: [transfer, ...(data.interEntityTransfers ?? [])],
    },
    notice: `Recorded ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} as a cash movement awaiting bank confirmation. It is not counted as settled/available cash yet.`,
  };
}

function postInternalCredit(
  data: CoreDataBundle,
  payload: InterEntityTransferSubmitPayload,
  fromEntity: EntityRecord,
  toEntity: EntityRecord,
  amount: number,
  entryDate: string,
  stamp: number,
): MovementResult {
  const groupId = `iet-${stamp}`;
  const fromTransactionId = `txn-${stamp}-from`;
  const toTransactionId = `txn-${stamp}-to`;
  const memo =
    payload.memo ||
    `${payload.reserveBacked ? 'Reserve bridge' : 'Internal credit'} from ${label(fromEntity)} to ${label(toEntity)}`;

  const connectionResult = findOrCreateConnection(
    [...(data.entityConnections ?? [])],
    fromEntity,
    toEntity,
    stamp,
  );
  const desiredRailType = payload.reserveBacked ? 'reserve_bridge' : 'intercompany_credit';
  const existingRail = (data.creditRails ?? []).find(
    (rail) =>
      rail.entityConnectionId === connectionResult.connection.id &&
      rail.railType === desiredRailType &&
      rail.status !== 'closed',
  );

  let rails = [...(data.creditRails ?? [])];
  let rail: CreditRailRecord;

  if (existingRail) {
    const nextOutstanding = Number(existingRail.outstandingExposure || 0) + amount;
    const limit = Number(existingRail.exposureLimit || 0);
    rail = {
      ...existingRail,
      status: existingRail.status === 'blocked' ? 'watch' : existingRail.status,
      outstandingExposure: nextOutstanding,
      availableCredit: limit > 0 ? Math.max(limit - nextOutstanding, 0) : existingRail.availableCredit,
      reserveBacked: payload.reserveBacked || existingRail.reserveBacked,
    };
    rails = rails.map((item) => (item.id === rail.id ? rail : item));
  } else {
    rail = buildCreditRail({
      connection: connectionResult.connection,
      owner: fromEntity,
      amount,
      reserveBacked: payload.reserveBacked,
      railType: desiredRailType,
      stamp,
    });
    rails = [rail, ...rails];
  }

  const transactions: TransactionRecord[] = [
    {
      id: fromTransactionId,
      entityId: fromEntity.id,
      type: 'journal',
      title: memo,
      amount,
      currency: 'USD',
      date: entryDate,
      status: 'posted',
      linkedJournalEntryIds: [`je-${stamp}-from`],
      counterpartyEntityId: toEntity.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'origin',
      notes: 'Non-cash inter-entity credit exposure. No bank deposit or withdrawal was created.',
    },
    {
      id: toTransactionId,
      entityId: toEntity.id,
      type: 'journal',
      title: memo,
      amount,
      currency: 'USD',
      date: entryDate,
      status: 'posted',
      linkedJournalEntryIds: [`je-${stamp}-to`],
      counterpartyEntityId: fromEntity.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'destination',
      notes: 'Non-cash inter-entity obligation. No bank cash was created.',
    },
  ];

  const journalEntries = makeNonCashJournalPair({
    stamp,
    fromEntity,
    toEntity,
    entryDate,
    memo,
    amount,
    fromDebit: `1450 Due From ${label(toEntity)}`,
    fromCredit: '3995 Interentity Credit Clearing',
    toDebit: '1995 Interentity Credit Clearing',
    toCredit: `2400 Due To ${label(fromEntity)}`,
    fromTransactionId,
    toTransactionId,
  });

  const transfer = buildTransferRecord({
    groupId,
    fromEntity,
    toEntity,
    fromTransactionId,
    toTransactionId,
    amount,
    entryDate,
    payload,
    status: 'posted',
    connectionId: connectionResult.connection.id,
    creditRailId: rail.id,
    bankConfirmationRequired: false,
  });

  return {
    data: {
      ...data,
      entityConnections: connectionResult.records,
      creditRails: rails,
      transactions: [...transactions, ...(data.transactions ?? [])],
      journalEntries: [...journalEntries, ...(data.journalEntries ?? [])],
      interEntityTransfers: [transfer, ...(data.interEntityTransfers ?? [])],
    },
    notice: `Posted ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} as ${payload.reserveBacked ? 'reserve-backed internal credit' : 'internal credit'}. No bank cash was created.`,
  };
}

function postNewNote(
  data: CoreDataBundle,
  payload: InterEntityTransferSubmitPayload,
  issuer: EntityRecord,
  holder: EntityRecord,
  amount: number,
  entryDate: string,
  stamp: number,
): MovementResult {
  const groupId = `iet-${stamp}`;
  const fromTransactionId = `txn-${stamp}-issuer`;
  const toTransactionId = `txn-${stamp}-holder`;
  const instrumentId = `inst-note-${stamp}`;
  const obligationId = `obl-note-${stamp}`;
  const registerId = `reg-note-${stamp}`;
  const legalIdentifier = `CF-NOTE-${entryDate.replace(/-/g, '')}-${String(stamp).slice(-6)}`;
  const memo = payload.memo || `Promissory note: ${label(issuer)} to ${label(holder)}`;

  const connectionResult = findOrCreateConnection(
    [...(data.entityConnections ?? [])],
    holder,
    issuer,
    stamp,
  );
  const rail = buildCreditRail({
    connection: connectionResult.connection,
    owner: holder,
    amount,
    reserveBacked: payload.reserveBacked,
    railType: 'partner_note',
    stamp,
    noteLabel: `${label(holder)} Note Receivable from ${label(issuer)}`,
  });

  const rate = payload.noteInterestRate === undefined || payload.noteInterestRate === ''
    ? undefined
    : Number(payload.noteInterestRate);
  const couponRate = rate !== undefined && Number.isFinite(rate) && rate >= 0 ? rate : undefined;

  const instrument: InstrumentRecord = {
    id: instrumentId,
    entityId: issuer.id,
    title: memo,
    instrumentType: 'promissory_note',
    legalIdentifier,
    sourceClass: 'note',
    marketSector: 'private',
    identifierCode: legalIdentifier,
    issuerName: label(issuer),
    issuerEntityId: issuer.id,
    counterpartyEntityId: holder.id,
    counterpartyLabel: label(holder),
    issueDate: entryDate,
    maturityDate: payload.noteMaturityDate,
    denominationValue: amount,
    couponRate,
    liquidityProfile: 'internal_only',
    obligationType: payload.reserveBacked ? 'reserve_backed_claim' : 'private_obligation',
    issuanceStatus: 'issued',
    applicationProfile: {
      applicationType: payload.reserveBacked ? 'reserve_support' : 'liquidity_bridge',
      applicationStatus: 'active',
      linkedObligationId: obligationId,
      applicationNotes:
        'Internal private note tracking only. Issuance does not create or prove bank cash, third-party acceptance, negotiability, or external settlement.',
    },
    notes:
      'Inter-entity promissory note recorded for internal accounting and holder-chain tracking. External legal or banking treatment depends on the actual executed instrument and applicable law.',
  };

  const obligation: ObligationRecord = {
    id: obligationId,
    entityId: issuer.id,
    title: `${legalIdentifier} payable to ${label(holder)}`,
    legalIdentifier,
    obligationType: payload.reserveBacked ? 'reserve_backed_claim' : 'private_obligation',
    amount,
    paymentMedium: 'private_tender',
    status: 'open',
    linkedInstrumentIds: [instrumentId],
    lifecycleStage: 'recognized',
    enforcementMemo:
      'Internal obligation record. No external enforceability or bank acceptance is represented by this ClearFlow entry.',
  };

  const register: NegotiableInstrumentRegisterRecord = {
    id: registerId,
    entityId: issuer.id,
    instrumentId,
    obligationId,
    legalIdentifier,
    registerLabel: `${label(issuer)} Note to ${label(holder)}`,
    instrumentForm: 'note',
    status: 'issued',
    issueDate: entryDate,
    maturityDate: payload.noteMaturityDate,
    issuerEntityId: issuer.id,
    currentHolderEntityId: holder.id,
    currentHolderConnectionId: connectionResult.connection.id,
    currentHolderLabel: label(holder),
    backingCreditRailId: rail.id,
    faceAmount: amount,
    outstandingAmount: amount,
    currency: 'USD',
    applicationSummary:
      'Private inter-entity note. Holder changes are tracked by assignment entries; note value is not bank cash until an external settlement event is separately confirmed.',
    notes: payload.reserveBacked
      ? 'Marked reserve-backed in ClearFlow based on the user-selected internal classification.'
      : 'No reserve-backing classification selected at issuance.',
  };

  const holderEntry: HolderLedgerEntryRecord = {
    id: `holder-${stamp}-issue`,
    entityId: holder.id,
    registerId,
    entryDate,
    entryType: 'issue',
    holderEntityId: holder.id,
    holderConnectionId: connectionResult.connection.id,
    holderLabel: label(holder),
    amount,
    currency: 'USD',
    resultingBalance: amount,
    linkedInstrumentId: instrumentId,
    linkedObligationId: obligationId,
    applicationEventType: 'issuance',
    notes: `Initial holder record for ${legalIdentifier}. No bank cash was created by this issuance entry.`,
  };

  const transactions: TransactionRecord[] = [
    {
      id: fromTransactionId,
      entityId: issuer.id,
      type: 'journal',
      title: memo,
      amount,
      currency: 'USD',
      date: entryDate,
      status: 'posted',
      linkedJournalEntryIds: [`je-${stamp}-from`],
      counterpartyEntityId: holder.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'origin',
      notes: 'Issuer-side non-cash note recognition.',
    },
    {
      id: toTransactionId,
      entityId: holder.id,
      type: 'journal',
      title: memo,
      amount,
      currency: 'USD',
      date: entryDate,
      status: 'posted',
      linkedJournalEntryIds: [`je-${stamp}-to`],
      counterpartyEntityId: issuer.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'destination',
      notes: 'Holder-side non-cash note receivable recognition.',
    },
  ];

  const journalEntries = makeNonCashJournalPair({
    stamp,
    fromEntity: issuer,
    toEntity: holder,
    entryDate,
    memo,
    amount,
    fromDebit: '1990 Interentity Note Consideration / Clearing',
    fromCredit: `2500 Note Payable to ${label(holder)}`,
    toDebit: `1500 Note Receivable from ${label(issuer)}`,
    toCredit: '3990 Interentity Note Funding / Clearing',
    fromTransactionId,
    toTransactionId,
  });

  const transfer = buildTransferRecord({
    groupId,
    fromEntity: issuer,
    toEntity: holder,
    fromTransactionId,
    toTransactionId,
    amount,
    entryDate,
    payload,
    status: 'posted',
    connectionId: connectionResult.connection.id,
    creditRailId: rail.id,
    linkedInstrumentId: instrumentId,
    linkedInstrumentRegisterId: registerId,
    linkedObligationId: obligationId,
    bankConfirmationRequired: false,
  });

  return {
    data: {
      ...data,
      entityConnections: connectionResult.records,
      creditRails: [rail, ...(data.creditRails ?? [])],
      instruments: [instrument, ...(data.instruments ?? [])],
      obligations: [obligation, ...(data.obligations ?? [])],
      negotiableInstrumentRegisters: [register, ...(data.negotiableInstrumentRegisters ?? [])],
      holderLedgerEntries: [holderEntry, ...(data.holderLedgerEntries ?? [])],
      transactions: [...transactions, ...(data.transactions ?? [])],
      journalEntries: [...journalEntries, ...(data.journalEntries ?? [])],
      interEntityTransfers: [transfer, ...(data.interEntityTransfers ?? [])],
    },
    notice: `Issued internal note ${legalIdentifier} for ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. Holder chain was created and no bank cash was posted.`,
  };
}

function assignExistingNote(
  data: CoreDataBundle,
  payload: InterEntityTransferSubmitPayload,
  currentHolder: EntityRecord,
  newHolder: EntityRecord,
  entryDate: string,
  stamp: number,
): MovementResult {
  const register = (data.negotiableInstrumentRegisters ?? []).find(
    (item) => item.id === payload.existingRegisterId,
  );

  if (!register) {
    throw new Error('Select an existing note to assign.');
  }
  if (register.currentHolderEntityId !== currentHolder.id) {
    throw new Error('The selected entity is not the current holder of this note.');
  }
  if (register.status === 'retired' || register.status === 'performed' || register.outstandingAmount <= 0) {
    throw new Error('The selected note is no longer available for assignment.');
  }

  const issuer = data.entities.find((entity) => entity.id === register.issuerEntityId);
  if (!issuer) {
    throw new Error('The issuer entity for this note could not be found.');
  }

  const amount = safeAmount(register.outstandingAmount);
  const groupId = `iet-${stamp}`;
  const fromTransactionId = `txn-${stamp}-holder-out`;
  const toTransactionId = `txn-${stamp}-holder-in`;
  const memo =
    payload.memo ||
    `Assignment of ${register.legalIdentifier} from ${label(currentHolder)} to ${label(newHolder)}`;

  const connectionResult = findOrCreateConnection(
    [...(data.entityConnections ?? [])],
    newHolder,
    issuer,
    stamp,
  );
  const newRail = buildCreditRail({
    connection: connectionResult.connection,
    owner: newHolder,
    amount,
    reserveBacked: Boolean(
      (data.creditRails ?? []).find((rail) => rail.id === register.backingCreditRailId)?.reserveBacked,
    ),
    railType: 'partner_note',
    stamp,
    noteLabel: `${label(newHolder)} Note Receivable from ${label(issuer)}`,
  });

  const oldRail = (data.creditRails ?? []).find((rail) => rail.id === register.backingCreditRailId);
  const reserveBacked = Boolean(oldRail?.reserveBacked);
  let rails = updateExistingRailExposure(
    [...(data.creditRails ?? [])],
    register.backingCreditRailId,
    amount,
  );
  rails = [newRail, ...rails];

  const updatedRegister: NegotiableInstrumentRegisterRecord = {
    ...register,
    status: 'assigned',
    currentHolderEntityId: newHolder.id,
    currentHolderConnectionId: connectionResult.connection.id,
    currentHolderLabel: label(newHolder),
    backingCreditRailId: newRail.id,
    notes: [
      register.notes,
      `Assigned in full from ${label(currentHolder)} to ${label(newHolder)} on ${entryDate}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };

  const holderEntry: HolderLedgerEntryRecord = {
    id: `holder-${stamp}-assignment`,
    entityId: newHolder.id,
    registerId: register.id,
    entryDate,
    entryType: 'assignment',
    holderEntityId: newHolder.id,
    holderConnectionId: connectionResult.connection.id,
    holderLabel: label(newHolder),
    amount,
    currency: register.currency,
    resultingBalance: amount,
    linkedInstrumentId: register.instrumentId,
    linkedObligationId: register.obligationId,
    applicationEventType: 'allocation',
    notes: `Full holder assignment from ${label(currentHolder)} to ${label(newHolder)}. No bank cash was created by the assignment.`,
  };

  const transactions: TransactionRecord[] = [
    {
      id: fromTransactionId,
      entityId: currentHolder.id,
      type: 'custody_transfer',
      title: memo,
      amount,
      currency: register.currency,
      date: entryDate,
      status: 'posted',
      linkedJournalEntryIds: [`je-${stamp}-from`],
      counterpartyEntityId: newHolder.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'origin',
      notes: 'Assignment out of the note receivable. This is not a bank withdrawal.',
    },
    {
      id: toTransactionId,
      entityId: newHolder.id,
      type: 'custody_transfer',
      title: memo,
      amount,
      currency: register.currency,
      date: entryDate,
      status: 'posted',
      linkedJournalEntryIds: [`je-${stamp}-to`],
      counterpartyEntityId: currentHolder.id,
      sharedTransferGroupId: groupId,
      ledgerSide: 'destination',
      notes: 'Assignment in of the note receivable. This is not a bank deposit.',
    },
  ];

  const journalEntries = makeNonCashJournalPair({
    stamp,
    fromEntity: currentHolder,
    toEntity: newHolder,
    entryDate,
    memo,
    amount,
    fromDebit: '1995 Note Assignment Clearing',
    fromCredit: `1500 Note Receivable from ${label(issuer)}`,
    toDebit: `1500 Note Receivable from ${label(issuer)}`,
    toCredit: '1995 Note Assignment Clearing',
    fromTransactionId,
    toTransactionId,
  });

  const transfer = buildTransferRecord({
    groupId,
    fromEntity: currentHolder,
    toEntity: newHolder,
    fromTransactionId,
    toTransactionId,
    amount,
    entryDate,
    payload: { ...payload, reserveBacked },
    status: 'posted',
    connectionId: connectionResult.connection.id,
    creditRailId: newRail.id,
    linkedInstrumentId: register.instrumentId,
    linkedInstrumentRegisterId: register.id,
    linkedObligationId: register.obligationId,
    bankConfirmationRequired: false,
  });

  return {
    data: {
      ...data,
      entityConnections: connectionResult.records,
      creditRails: rails,
      negotiableInstrumentRegisters: (data.negotiableInstrumentRegisters ?? []).map((item) =>
        item.id === register.id ? updatedRegister : item,
      ),
      holderLedgerEntries: [holderEntry, ...(data.holderLedgerEntries ?? [])],
      transactions: [...transactions, ...(data.transactions ?? [])],
      journalEntries: [...journalEntries, ...(data.journalEntries ?? [])],
      interEntityTransfers: [transfer, ...(data.interEntityTransfers ?? [])],
    },
    notice: `Assigned ${register.legalIdentifier} in full to ${label(newHolder)}. The holder ledger and note rail moved; no bank cash was posted.`,
  };
}

export function postInterEntityMovement(
  data: CoreDataBundle,
  payload: InterEntityTransferSubmitPayload,
  stamp = Date.now(),
): MovementResult {
  if (!payload.fromEntityId || !payload.toEntityId || payload.fromEntityId === payload.toEntityId) {
    throw new Error('Select two different entities.');
  }

  const fromEntity = data.entities.find((entity) => entity.id === payload.fromEntityId);
  const toEntity = data.entities.find((entity) => entity.id === payload.toEntityId);

  if (!fromEntity || !toEntity) {
    throw new Error('One of the selected entities could not be found.');
  }

  const entryDate = payload.effectiveDate || new Date().toISOString().slice(0, 10);

  if (payload.movementType === 'note_instrument' && payload.noteAction === 'assign_existing') {
    return assignExistingNote(data, payload, fromEntity, toEntity, entryDate, stamp);
  }

  const amount = safeAmount(payload.amount);

  if (payload.movementType === 'cash_transfer') {
    return postCashMovement(data, payload, fromEntity, toEntity, amount, entryDate, stamp);
  }

  if (payload.movementType === 'internal_credit') {
    return postInternalCredit(data, payload, fromEntity, toEntity, amount, entryDate, stamp);
  }

  return postNewNote(data, payload, fromEntity, toEntity, amount, entryDate, stamp);
}
