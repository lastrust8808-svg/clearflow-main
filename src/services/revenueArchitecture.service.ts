import type { CoreDataBundle } from '../types/core';

export interface RevenueArchitectureSummary {
  embeddedBankingReadyCount: number;
  connectedRevenueAccountCount: number;
  connectedCardAccountCount: number;
  processorSettlementCount: number;
  yieldReadyReserveCount: number;
  idleOperationalCash: number;
  monetizablePaymentVolume: number;
  monetizableInvoiceVolume: number;
  monetizableAnnualizedSubscriptionBase: number;
  monetizableUserCount: number;
  revenueSignals: string[];
  nextMoves: string[];
}

export function buildRevenueArchitectureSummary(data: CoreDataBundle): RevenueArchitectureSummary {
  const connectedBankingAccounts = data.bankAccounts.filter(
    (account) =>
      account.connectionType === 'plaid_connected' ||
      account.connectionType === 'external_provider_connected'
  );
  const connectedCardAccounts = connectedBankingAccounts.filter(
    (account) => account.accountType === 'credit_card'
  );
  const processorSettlementAccounts = connectedBankingAccounts.filter(
    (account) =>
      account.connectedProfile?.providerKey === 'stripe' ||
      account.connectedProfile?.providerKey === 'paypal' ||
      account.connectedProfile?.providerKey === 'square' ||
      account.connectedProfile?.providerKey === 'cash_app'
  );
  const yieldReadyReserves = data.treasuryAccounts.filter(
    (account) =>
      account.status === 'active' &&
      account.treasuryType === 'reserve' &&
      account.availableBalance > 0
  );
  const idleOperationalCash = data.treasuryAccounts
    .filter(
      (account) =>
        account.status === 'active' &&
        account.treasuryType === 'operational_cash' &&
        account.availableBalance > 0
    )
    .reduce((sum, account) => sum + account.availableBalance, 0);
  const recurringPayments = data.payments.filter(
    (payment) =>
      payment.recurringSchedule?.enabled &&
      (payment.status === 'initiated' || payment.status === 'settled')
  );
  const monetizablePaymentVolume = data.payments
    .filter((payment) => payment.status === 'initiated' || payment.status === 'settled')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const monetizableInvoiceVolume = data.invoices
    .filter((invoice) => invoice.status === 'sent' || invoice.status === 'paid')
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const monetizableAnnualizedSubscriptionBase =
    recurringPayments.reduce((sum, payment) => sum + payment.amount, 0) * 12;
  const monetizableUserCount = Math.max(1, data.entities.length);

  const revenueSignals: string[] = [];
  if (connectedBankingAccounts.length > 0) {
    revenueSignals.push(
      `${connectedBankingAccounts.length} connected banking or financial accounts are ready for embedded-finance upsell posture.`
    );
  }
  if (processorSettlementAccounts.length > 0) {
    revenueSignals.push(
      `${processorSettlementAccounts.length} processor-linked settlement accounts can anchor payout, merchant-settlement, or subscription revenue workflows.`
    );
  }
  if (yieldReadyReserves.length > 0 || idleOperationalCash > 0) {
    revenueSignals.push(
      `Reserve and operating cash show sweep or yield-management potential across ${yieldReadyReserves.length} reserve account(s).`
    );
  }
  if (monetizablePaymentVolume > 0 || monetizableInvoiceVolume > 0) {
    revenueSignals.push(
      `Live ERP flow already supports monetizable payment and receivable volume inside the workspace.`
    );
  }
  if (revenueSignals.length === 0) {
    revenueSignals.push(
      'Connect at least one banking, card, or processor account to activate embedded-finance and revenue readiness signals.'
    );
  }

  const nextMoves = [
    connectedBankingAccounts.length
      ? 'Layer embedded business accounts, cards, and bill pay on top of the connected account spine.'
      : 'Prioritize connected business accounts and cards so ClearFlow can monetize account, payment, and treasury rails.',
    idleOperationalCash > 0 || yieldReadyReserves.length > 0
      ? 'Offer reserve sweep and yield posture for idle operational and reserve balances.'
      : 'Grow reserve and operating cash visibility so yield and sweep posture can be offered responsibly.',
    processorSettlementAccounts.length
      ? 'Expand processor settlement sync into payout analytics, cash concentration, and take-rate reporting.'
      : 'Add processor settlement profiles and merchant payout reporting to widen monetizable cashflow.',
  ];

  return {
    embeddedBankingReadyCount: connectedBankingAccounts.filter(
      (account) =>
        account.achOriginationEnabled ||
        account.connectedProfile?.supportsSettlementInitiation
    ).length,
    connectedRevenueAccountCount: connectedBankingAccounts.length,
    connectedCardAccountCount: connectedCardAccounts.length,
    processorSettlementCount: processorSettlementAccounts.length,
    yieldReadyReserveCount: yieldReadyReserves.length,
    idleOperationalCash: Number(idleOperationalCash.toFixed(2)),
    monetizablePaymentVolume: Number(monetizablePaymentVolume.toFixed(2)),
    monetizableInvoiceVolume: Number(monetizableInvoiceVolume.toFixed(2)),
    monetizableAnnualizedSubscriptionBase: Number(
      monetizableAnnualizedSubscriptionBase.toFixed(2)
    ),
    monetizableUserCount,
    revenueSignals,
    nextMoves,
  };
}
