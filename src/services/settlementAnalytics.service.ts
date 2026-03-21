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

function deriveAutoReconcileStatus(flow: Omit<SettlementFlowView, 'derivedAutoReconcileStatus'>) {
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

    return {
      ...baseFlow,
      derivedAutoReconcileStatus: deriveAutoReconcileStatus(baseFlow),
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
