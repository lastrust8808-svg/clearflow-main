import type {
  AutoReconcileStatus,
  CoreDataBundle,
  InterEntityTransferRecord,
  JournalEntryRecord,
  OnChainTransactionRecord,
  PaymentRecord,
  ReconciliationRecord,
  SettlementRecord,
  TransactionRecord,
} from '../types/core';

export interface SettlementFlowView {
  transaction: TransactionRecord;
  settlement?: SettlementRecord;
  interEntityTransfer?: InterEntityTransferRecord;
  payment?: PaymentRecord;
  journalEntries: JournalEntryRecord[];
  reconciliation?: ReconciliationRecord;
  onChainRecord?: OnChainTransactionRecord;
  journalAmount: number;
  journalDelta: number;
  derivedAutoReconcileStatus: AutoReconcileStatus;
  liquidCashReady: boolean;
  verificationReady: boolean;
  clearedInReconciliation: boolean;
  hasCoverageGap: boolean;
  erpCashflowStage:
    | 'recognized'
    | 'payment_sent'
    | 'clearing'
    | 'matched'
    | 'applied'
    | 'closed';
  erpCashflowSummary: string;
}

function approximatelyEqual(left: number, right: number, tolerance = 0.005) {
  return Math.abs(left - right) <= tolerance;
}

function isLiquidCashStageReady(stage?: SettlementRecord['liquidCashStage']) {
  return (
    stage === 'liquid_cash_available' ||
    stage === 'liquid_cash_reserved' ||
    stage === 'liquid_cash_released'
  );
}

function deriveAutoReconcileStatus(
  flow: Omit<
    SettlementFlowView,
    'derivedAutoReconcileStatus' | 'erpCashflowStage' | 'erpCashflowSummary'
  >
) {
  if (!flow.settlement) {
    return 'pending';
  }

  if (
    flow.settlement.processorStatus === 'blocked' ||
    flow.settlement.processorStatus === 'requires_review'
  ) {
    return 'exception';
  }

  if (!flow.journalEntries.length) {
    return 'pending';
  }

  if (!approximatelyEqual(flow.journalAmount, flow.settlement.settledAmount)) {
    return 'exception';
  }

  if (flow.settlement.status === 'exception' || flow.settlement.verificationStatus === 'exception') {
    return 'exception';
  }

  const paymentSettled = !flow.payment || flow.payment.status === 'settled';
  const proofSettled = !flow.onChainRecord || flow.onChainRecord.status === 'confirmed';
  const reconciliationAligned =
    !flow.reconciliation ||
    (flow.clearedInReconciliation &&
      (flow.reconciliation.status === 'completed' || flow.reconciliation.status === 'in_review'));

  const transferAligned =
    !flow.interEntityTransfer || flow.interEntityTransfer.settlementMode === 'mirrored_halves';

  if (
    flow.settlement.verificationStatus === 'verified' &&
    flow.settlement.processorStatus !== 'processing' &&
    paymentSettled &&
    proofSettled &&
    reconciliationAligned &&
    transferAligned
  ) {
    return 'matched';
  }

  if (flow.settlement.verificationStatus === 'pending' || !reconciliationAligned) {
    return 'partial';
  }

  return 'pending';
}

function deriveErpCashflowStage(
  flow: Omit<SettlementFlowView, 'erpCashflowStage' | 'erpCashflowSummary'>
) {
  if (!flow.payment && !flow.settlement) {
    return {
      stage: 'recognized' as const,
      summary: 'Obligation recognized in ERP, but no settlement or payment leg has been entered yet.',
    };
  }

  if (flow.payment && flow.payment.status === 'initiated' && flow.settlement?.processorStatus === 'processing') {
    return {
      stage: 'payment_sent' as const,
      summary: 'Payment has been sent into the settlement rail and is waiting for clearing evidence.',
    };
  }

  if (
    flow.settlement &&
    (flow.settlement.processorStatus === 'processing' ||
      flow.settlement.verificationStatus === 'pending' ||
      flow.derivedAutoReconcileStatus === 'pending')
  ) {
    return {
      stage: 'clearing' as const,
      summary: 'Settlement is in clearing and still needs bank, treasury, or counterparty confirmation.',
    };
  }

  if (flow.derivedAutoReconcileStatus === 'partial') {
    return {
      stage: 'matched' as const,
      summary: 'Payment and settlement have been posted, but final tie-out or external application is still incomplete.',
    };
  }

  if (flow.derivedAutoReconcileStatus === 'matched' && !flow.clearedInReconciliation) {
    return {
      stage: 'applied' as const,
      summary: 'The remittance appears applied and verified, but final reconciliation close is still pending.',
    };
  }

  if (flow.derivedAutoReconcileStatus === 'matched' && flow.clearedInReconciliation) {
    return {
      stage: 'closed' as const,
      summary: 'The payable has been cash-flowed through settlement, matched, and closed in reconciliation.',
    };
  }

  return {
    stage: 'recognized' as const,
    summary: 'The remittance is recognized, but its cashflow and settlement proof still need follow-through.',
  };
}

export function buildSettlementFlowViews(data: CoreDataBundle): SettlementFlowView[] {
  return data.transactions.map((transaction) => {
    const interEntityTransfer = data.interEntityTransfers.find(
      (item) =>
        item.fromTransactionId === transaction.id ||
        item.toTransactionId === transaction.id ||
        item.transferGroupId === transaction.sharedTransferGroupId
    );

    const settlement = data.settlements.find(
      (item) =>
        item.id === transaction.linkedSettlementId || item.linkedTransactionId === transaction.id
    );

    const journalEntries = data.journalEntries.filter(
      (entry) =>
        entry.entityId === transaction.entityId &&
        (entry.linkedTransactionIds?.includes(transaction.id) ||
        (settlement ? entry.linkedSettlementIds?.includes(settlement.id) : false)
        )
    );

    const payment = data.payments.find(
      (item) =>
        item.entityId === transaction.entityId &&
        (item.linkedTransactionIds?.includes(transaction.id) ||
        (settlement?.linkedPaymentId ? item.id === settlement.linkedPaymentId : false)
        )
    );

    const reconciliation = data.reconciliations.find(
      (item) =>
        item.entityId === transaction.entityId &&
        (item.id === settlement?.linkedReconciliationId ||
          item.clearedTransactionIds.includes(transaction.id))
    );

    const onChainRecord = data.onChainTransactions.find(
      (item) =>
        item.entityId === transaction.entityId &&
        (item.id === transaction.linkedOnChainRecordId ||
        (settlement?.linkedOnChainRecordId ? item.id === settlement.linkedOnChainRecordId : false)
        )
    );

    const journalAmount = journalEntries.reduce((sum, item) => sum + item.amount, 0);
    const targetAmount = settlement?.settledAmount ?? transaction.amount;
    const clearedInReconciliation = Boolean(
      reconciliation?.clearedTransactionIds.includes(transaction.id)
    );

    const baseFlow = {
      transaction,
      settlement,
      interEntityTransfer,
      payment,
      journalEntries,
      reconciliation,
      onChainRecord,
      journalAmount,
      journalDelta: Number((targetAmount - journalAmount).toFixed(2)),
      liquidCashReady: isLiquidCashStageReady(settlement?.liquidCashStage),
      verificationReady: settlement?.verificationStatus === 'verified',
      clearedInReconciliation,
      hasCoverageGap: !settlement,
    };

    const derivedAutoReconcileStatus = deriveAutoReconcileStatus(baseFlow);
    const erpCashflow = deriveErpCashflowStage({
      ...baseFlow,
      derivedAutoReconcileStatus,
    });

    return {
      ...baseFlow,
      derivedAutoReconcileStatus,
      erpCashflowStage: erpCashflow.stage,
      erpCashflowSummary: erpCashflow.summary,
    };
  });
}

export function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
