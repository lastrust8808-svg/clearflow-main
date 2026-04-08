import type {
  AppData,
  RewardBadge,
  RewardEntry,
  RewardTier,
  User,
} from '../types/app.models';
import type { CoreDataBundle } from '../types/core';

export interface RewardsProgramSummary {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  tier: RewardTier;
  badgeCount: number;
  recentEntries: RewardEntry[];
  badges: RewardBadge[];
  membershipCreditsEarned: number;
}

function resolveTier(balance: number): RewardTier {
  if (balance >= 25000) return 'crown';
  if (balance >= 10000) return 'capital';
  if (balance >= 2500) return 'treasury';
  if (balance >= 500) return 'operator';
  return 'steward';
}

function badgeForActivity(
  userId: string,
  data: CoreDataBundle,
  now: string,
): RewardBadge[] {
  const badges: RewardBadge[] = [];

  if (data.entities.length > 0) {
    badges.push({
      id: `badge-first-entity-${userId}`,
      userId,
      badgeType: 'first_entity_established',
      title: 'First Entity Established',
      description: 'Created and retained the first operating entity in ClearFlow.',
      earnedAt: now,
      mintable: true,
    });
  }
  if (data.invoices.length >= 5) {
    badges.push({
      id: `badge-invoices-${userId}`,
      userId,
      badgeType: 'invoices_in_motion',
      title: 'Invoices in Motion',
      description: 'Moved five or more invoices through the workspace.',
      earnedAt: now,
      mintable: true,
    });
  }
  if (data.entities.some((item) => item.type === 'trust')) {
    badges.push({
      id: `badge-trust-${userId}`,
      userId,
      badgeType: 'trust_steward',
      title: 'Trust Steward',
      description: 'Maintains a trust-aware fiduciary workspace.',
      earnedAt: now,
      mintable: true,
    });
  }
  if (data.instruments.some((item) => item.sourceClass === 'bond')) {
    badges.push({
      id: `badge-bond-${userId}`,
      userId,
      badgeType: 'bond_operator',
      title: 'Bond Operator',
      description: 'Using bond issuance, application, or collateral rails.',
      earnedAt: now,
      mintable: true,
    });
  }
  if (data.collateralHoldings.length > 0 || data.treasuryAccounts.some((item) => item.treasuryType === 'reserve')) {
    badges.push({
      id: `badge-reserve-${userId}`,
      userId,
      badgeType: 'reserve_builder',
      title: 'Reserve Builder',
      description: 'Built reserve or collateral posture into the operating system.',
      earnedAt: now,
      mintable: true,
    });
  }
  if (data.settlements.length > 0) {
    badges.push({
      id: `badge-settlement-${userId}`,
      userId,
      badgeType: 'settlement_clarity',
      title: 'Settlement Clarity',
      description: 'Tracked payment and settlement records through ClearFlow.',
      earnedAt: now,
      mintable: true,
    });
  }
  if (data.documents.length >= 10) {
    badges.push({
      id: `badge-vault-${userId}`,
      userId,
      badgeType: 'vault_keeper',
      title: 'Vault Keeper',
      description: 'Built a retained record trail with meaningful document volume.',
      earnedAt: now,
      mintable: true,
    });
  }

  return badges;
}

export function buildRewardsProgramSummary(
  data: CoreDataBundle,
  appData?: AppData | null,
  user?: User | null,
): RewardsProgramSummary {
  const userId = user?.id || appData?.user.id || 'operator';
  const now = new Date().toISOString();
  const derivedEntries: RewardEntry[] = [];

  const paidMembershipInvoices =
    appData?.billingInvoices?.filter((item) => item.status === 'paid' || item.status === 'settled') || [];
  paidMembershipInvoices.forEach((invoice, index) => {
    derivedEntries.push({
      id: `reward-membership-${invoice.id}`,
      userId,
      type: 'earn',
      sourceEvent: 'membership_paid',
      amount: 100,
      description: `Membership payment reward for billing cycle ${index + 1}.`,
      occurredAt: invoice.issueDate,
      status: 'posted',
    });
  });

  data.invoices.forEach((invoice) => {
    derivedEntries.push({
      id: `reward-invoice-sent-${invoice.id}`,
      userId,
      entityId: invoice.entityId,
      type: 'earn',
      sourceEvent: 'invoice_sent',
      amount: 2,
      description: `Invoice ${invoice.invoiceNumber} sent through ClearFlow.`,
      occurredAt: invoice.issueDate,
      status: 'posted',
    });
    if (invoice.status === 'paid') {
      derivedEntries.push({
        id: `reward-invoice-paid-${invoice.id}`,
        userId,
        entityId: invoice.entityId,
        type: 'earn',
        sourceEvent: 'invoice_paid',
        amount: 10,
        description: `Invoice ${invoice.invoiceNumber} paid.`,
        occurredAt: invoice.issueDate,
        status: 'posted',
      });
    }
  });

  data.bills
    .filter((bill) => bill.status === 'paid')
    .forEach((bill) => {
      derivedEntries.push({
        id: `reward-bill-paid-${bill.id}`,
        userId,
        entityId: bill.entityId,
        type: 'earn',
        sourceEvent: 'bill_paid',
        amount: 5,
        description: `Bill ${bill.billNumber || bill.id} paid.`,
        occurredAt: bill.issueDate,
        status: 'posted',
      });
    });

  data.couponPresentments.forEach((presentment) => {
    derivedEntries.push({
      id: `reward-remittance-${presentment.id}`,
      userId,
      entityId: presentment.entityId,
      type: 'earn',
      sourceEvent: 'remittance_completed',
      amount: 5,
      description: `Presentment ${presentment.title} posted into the ERP rail.`,
      occurredAt: presentment.presentmentDate,
      status: 'posted',
    });
  });

  data.entities.forEach((entity) => {
    derivedEntries.push({
      id: `reward-entity-${entity.id}`,
      userId,
      entityId: entity.id,
      type: 'earn',
      sourceEvent: 'entity_onboarded',
      amount: 40,
      description: `Entity ${entity.displayName || entity.name} established in ClearFlow.`,
      occurredAt: entity.authorityAttestedAt || now,
      status: 'posted',
    });
    if (entity.authorityProofStatus === 'matched' || entity.authorityProofStatus === 'similar_match') {
      derivedEntries.push({
        id: `reward-authority-${entity.id}`,
        userId,
        entityId: entity.id,
        type: 'earn',
        sourceEvent: 'authority_completed',
        amount: 20,
        description: `Authority proof reviewed for ${entity.displayName || entity.name}.`,
        occurredAt: entity.authorityProofUploadedAt || now,
        status: 'posted',
      });
    }
  });

  data.bankAccounts
    .filter((account) => account.connectionType === 'plaid_connected' || account.liveFeedEnabled)
    .forEach((account) => {
      derivedEntries.push({
        id: `reward-bank-${account.id}`,
        userId,
        entityId: account.entityId,
        type: 'earn',
        sourceEvent: 'bank_connected',
        amount: 25,
        description: `Connected financial account ${account.accountName}.`,
        occurredAt: account.lastFeedSyncAt || now,
        status: 'posted',
      });
    });

  data.wallets.forEach((wallet) => {
    derivedEntries.push({
      id: `reward-wallet-${wallet.id}`,
      userId,
      entityId: wallet.entityId,
      type: 'earn',
      sourceEvent: 'wallet_connected',
      amount: 20,
      description: `Connected wallet or trading profile ${wallet.name}.`,
      occurredAt: wallet.lastSyncAt || now,
      status: 'posted',
    });
  });

  const rewardEntries = appData?.rewardEntries?.length ? appData.rewardEntries : derivedEntries;
  const lifetimeEarned = rewardEntries
    .filter((entry) => entry.type === 'earn' && entry.status === 'posted')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const lifetimeSpent = (appData?.rewardRedemptions || [])
    .filter((item) => item.status === 'fulfilled')
    .reduce((sum, item) => sum + item.creditCost, 0);
  const balance = Math.max(0, lifetimeEarned - lifetimeSpent);
  const badges = appData?.rewardBadges?.length ? appData.rewardBadges : badgeForActivity(userId, data, now);

  return {
    balance,
    lifetimeEarned,
    lifetimeSpent,
    tier: appData?.rewardAccount?.tier || resolveTier(balance),
    badgeCount: badges.length,
    recentEntries: [...rewardEntries]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 8),
    badges,
    membershipCreditsEarned: paidMembershipInvoices.length * 100,
  };
}
