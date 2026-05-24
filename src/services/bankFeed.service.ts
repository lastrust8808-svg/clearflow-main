import type { PlaidTransaction } from '../types/app.models';
import type {
  BankAccountRecord,
  BankFeedEntryRecord,
  BankFeedRuleRecord,
  CoreDataBundle,
  JournalEntryRecord,
  ReconciliationRecord,
  ReconciliationStatementLineRecord,
  TokenRecord,
  TransactionRecord,
} from '../types/core';

function buildId(prefix: string, seed: string) {
  return `${prefix}-${seed}-${Math.random().toString(36).slice(2, 8)}`;
}

function toIsoDate(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function normalizePlaidAmount(amount: number) {
  if (amount >= 0) {
    return {
      direction: 'debit' as const,
      signedAmount: -Math.abs(amount),
      absoluteAmount: Math.abs(amount),
    };
  }

  return {
    direction: 'credit' as const,
    signedAmount: Math.abs(amount),
    absoluteAmount: Math.abs(amount),
  };
}

function maskLast4(value?: string) {
  if (!value) {
    return undefined;
  }

  return value.slice(-4);
}

function buildFallbackPlaidTransactions(account: BankAccountRecord): PlaidTransaction[] {
  const today = new Date();
  const baseDate = new Date(today.getFullYear(), today.getMonth(), Math.max(today.getDate() - 3, 1));
  const iso = (offset: number) => {
    const next = new Date(baseDate);
    next.setDate(baseDate.getDate() + offset);
    return next.toISOString().slice(0, 10);
  };

  return [
    {
      transaction_id: `${account.id}-feed-001`,
      account_id: account.id,
      amount: 86.45,
      date: iso(0),
      name: `${account.institutionName} Treasury Service Fee`,
      pending: false,
      payment_channel: 'online',
      category: ['Bank Fees'],
    },
    {
      transaction_id: `${account.id}-feed-002`,
      account_id: account.id,
      amount: 1420,
      date: iso(1),
      name: 'Vendor ACH Settlement',
      pending: false,
      payment_channel: 'online',
      category: ['Transfer'],
    },
    {
      transaction_id: `${account.id}-feed-003`,
      account_id: account.id,
      amount: -2300,
      date: iso(2),
      name: 'Client Deposit',
      pending: false,
      payment_channel: 'online',
      category: ['Deposit'],
    },
  ];
}

function pickMatchingRule(
  rules: BankFeedRuleRecord[],
  entry: { bankAccountId: string; description: string; merchantName?: string; direction: 'credit' | 'debit'; absoluteAmount: number }
) {
  const searchText = `${entry.description} ${entry.merchantName ?? ''}`.toLowerCase();

  return rules.find((rule) => {
    if (!rule.active) {
      return false;
    }

    if (rule.bankAccountId && rule.bankAccountId !== entry.bankAccountId) {
      return false;
    }

    if (rule.direction !== 'any' && rule.direction !== entry.direction) {
      return false;
    }

    if (rule.merchantContains && !searchText.includes(rule.merchantContains.toLowerCase())) {
      return false;
    }

    if (typeof rule.minAmount === 'number' && entry.absoluteAmount < rule.minAmount) {
      return false;
    }

    if (typeof rule.maxAmount === 'number' && entry.absoluteAmount > rule.maxAmount) {
      return false;
    }

    return true;
  });
}

function buildMemo(rule: BankFeedRuleRecord | undefined, description: string) {
  if (!rule?.memoTemplate?.trim()) {
    return description;
  }

  return rule.memoTemplate.replace(/\{merchant\}/gi, description);
}

function ensureAutoCategorizeLedgerAccount(input: {
  ledgerAccounts: LedgerAccountRecord[];
  entityId: string;
  direction: 'credit' | 'debit';
  currency: string;
}) {
  const template =
    input.direction === 'debit'
      ? {
          code: '6850',
          name: 'Bank Feed Expense Clearing',
          accountType: 'expense' as const,
        }
      : {
          code: '2300',
          name: 'Unapplied Cash',
          accountType: 'liability' as const,
        };

  const existing = input.ledgerAccounts.find(
    (account) =>
      account.entityId === input.entityId &&
      (account.code === template.code || account.name === template.name),
  );

  if (existing) {
    return {
      ledgerAccount: existing,
      ledgerAccounts: input.ledgerAccounts,
    };
  }

  const nextLedgerAccount: LedgerAccountRecord = {
    id: buildId('led', `${input.entityId}-${template.code}`),
    entityId: input.entityId,
    code: template.code,
    name: template.name,
    accountType: template.accountType,
    currency: input.currency,
    balance: 0,
    remittanceEligible: false,
    remittanceClassification: 'other',
  };

  return {
    ledgerAccount: nextLedgerAccount,
    ledgerAccounts: [nextLedgerAccount, ...input.ledgerAccounts],
  };
}

function applyLedgerAmount(
  ledgerAccounts: LedgerAccountRecord[],
  ledgerAccountId: string | undefined,
  side: 'debit' | 'credit',
  amount: number,
) {
  if (!ledgerAccountId || !amount) {
    return ledgerAccounts;
  }

  return ledgerAccounts.map((account) => {
    if (account.id !== ledgerAccountId) {
      return account;
    }

    const signedAmount =
      account.accountType === 'asset' || account.accountType === 'expense'
        ? side === 'debit'
          ? amount
          : -amount
        : side === 'credit'
          ? amount
          : -amount;

    return {
      ...account,
      balance: Number((account.balance + signedAmount).toFixed(2)),
    };
  });
}

function ensureWorkingReconciliation(
  data: CoreDataBundle,
  bankAccount: BankAccountRecord
): { record: ReconciliationRecord; reconciliations: ReconciliationRecord[] } {
  const existing =
    data.reconciliations.find(
      (item) =>
        item.bankAccountId === bankAccount.id &&
        (item.status === 'open' || item.status === 'in_review')
    ) ||
    data.reconciliations.find(
      (item) =>
        item.bankAccountId === bankAccount.id &&
        item.periodStart === startOfMonth() &&
        item.periodEnd === endOfMonth()
    );

  if (existing) {
    return { record: existing, reconciliations: data.reconciliations };
  }

  const nextRecord: ReconciliationRecord = {
    id: buildId('rec', bankAccount.id),
    entityId: bankAccount.entityId,
    bankAccountId: bankAccount.id,
    periodStart: startOfMonth(),
    periodEnd: endOfMonth(),
    statementEndingBalance: bankAccount.currentBalance ?? 0,
    clearedTransactionIds: [],
    status: 'open',
    preparedBy: 'Live Bank Feed',
    statementReviewStatus: 'not_imported',
    closeApprovalStatus: 'pending',
  };

  return {
    record: nextRecord,
    reconciliations: [nextRecord, ...data.reconciliations],
  };
}

export function syncBankFeedToLedger(input: {
  data: CoreDataBundle;
  bankAccountId: string;
  plaidTransactions?: PlaidTransaction[];
}) {
  const { data, bankAccountId } = input;
  const bankAccount = data.bankAccounts.find((account) => account.id === bankAccountId);
  if (!bankAccount) {
    return data;
  }

  const sourceTransactions =
    input.plaidTransactions && input.plaidTransactions.length > 0
      ? input.plaidTransactions
      : buildFallbackPlaidTransactions(bankAccount);
  const feedStartDate =
    bankAccount.feedStartDate ||
    bankAccount.connectedProfile?.connectedAt?.slice(0, 10);
  const filteredTransactions = feedStartDate
    ? sourceTransactions.filter((transaction) => toIsoDate(transaction.date) >= feedStartDate)
    : sourceTransactions;

  const existingExternalIds = new Set(
    (data.bankFeedEntries ?? [])
      .filter((entry) => entry.bankAccountId === bankAccountId)
      .map((entry) => entry.externalTransactionId)
  );

  const entityRules = (data.bankFeedRules ?? []).filter(
    (rule) => rule.entityId === bankAccount.entityId
  );
  const { record: workingReconciliation, reconciliations: startingReconciliations } =
    ensureWorkingReconciliation(data, bankAccount);

  let nextBankAccounts = data.bankAccounts.map((account) =>
    account.id === bankAccountId
      ? {
          ...account,
          liveFeedEnabled: true,
          liveFeedStatus: 'connected' as const,
          lastFeedSyncAt: new Date().toISOString(),
          autoReconcileEnabled: account.autoReconcileEnabled ?? true,
        }
      : account
  );
  let nextLedgerAccounts = [...data.ledgerAccounts];
  let nextTransactions = [...data.transactions];
  let nextJournalEntries = [...data.journalEntries];
  let nextTokens = [...data.tokens];
  let nextFeedEntries = [...data.bankFeedEntries];
  let nextReconciliations = [...startingReconciliations];

  const bankLedgerAccount = bankAccount.linkedLedgerAccountId
    ? data.ledgerAccounts.find((account) => account.id === bankAccount.linkedLedgerAccountId)
    : undefined;

  for (const plaidTransaction of filteredTransactions) {
    if (existingExternalIds.has(plaidTransaction.transaction_id)) {
      continue;
    }

    const normalized = normalizePlaidAmount(Number(plaidTransaction.amount ?? 0));
    const rule = pickMatchingRule(entityRules, {
      bankAccountId,
      description: plaidTransaction.name,
      merchantName: plaidTransaction.name,
      direction: normalized.direction,
      absoluteAmount: normalized.absoluteAmount,
    });

    const importSeed = `${Date.now()}-${nextFeedEntries.length + 1}`;
    const transactionId = buildId('txn', importSeed);
    const journalId = buildId('je', importSeed);
    const tokenId = buildId('tok', importSeed);
    const ruleLedgerAccount = rule?.defaultLedgerAccountId
      ? nextLedgerAccounts.find((account) => account.id === rule.defaultLedgerAccountId)
      : undefined;
    const shouldUseFallbackCounterparty = Boolean(
      !ruleLedgerAccount &&
        bankLedgerAccount &&
        (bankAccount.autoCategorizeFeedTransactions || rule?.autoPost),
    );
    const fallbackCounterparty = shouldUseFallbackCounterparty
      ? ensureAutoCategorizeLedgerAccount({
          ledgerAccounts: nextLedgerAccounts,
          entityId: bankAccount.entityId,
          direction: normalized.direction,
          currency: bankAccount.currency,
        })
      : null;
    if (fallbackCounterparty) {
      nextLedgerAccounts = fallbackCounterparty.ledgerAccounts;
    }
    const postingLedgerAccount = ruleLedgerAccount || fallbackCounterparty?.ledgerAccount;
    const shouldAutoPost = Boolean(
      bankLedgerAccount &&
        ((rule?.autoPost && (postingLedgerAccount || bankLedgerAccount)) ||
          (bankAccount.autoCategorizeFeedTransactions && postingLedgerAccount)),
    );
    const verificationStatus =
      rule?.verificationMode === 'manual_review' ? 'pending' : 'verified';

    let createdTransactionId: string | undefined;
    let createdJournalEntryId: string | undefined;
    let createdTokenIds: string[] | undefined;

    if (shouldAutoPost) {
      const transactionRecord: TransactionRecord = {
        id: transactionId,
        entityId: bankAccount.entityId,
        type:
          rule?.transactionType ||
          (normalized.direction === 'debit' ? 'expense' : 'deposit'),
        title: buildMemo(rule, plaidTransaction.name),
        amount: normalized.absoluteAmount,
        currency: bankAccount.currency,
        date: toIsoDate(plaidTransaction.date),
        status: 'posted',
        linkedLedgerAccountIds: [
          bankAccount.linkedLedgerAccountId,
          postingLedgerAccount?.id,
        ].filter(Boolean) as string[],
        notes:
          `Auto-posted from live bank feed sync for ${bankAccount.accountName}.` +
          (rule
            ? ` Rule applied: ${rule.name}.`
            : bankAccount.autoCategorizeFeedTransactions
              ? ` Auto-categorized from Plaid category ${plaidTransaction.category?.join(' / ') || 'uncategorized'}.`
              : ''),
      };

      const journalRecord: JournalEntryRecord = {
        id: journalId,
        entityId: bankAccount.entityId,
        entryNumber: `BFS-${String(nextJournalEntries.length + 1).padStart(4, '0')}`,
        entryDate: toIsoDate(plaidTransaction.date),
        memo: transactionRecord.title,
        debitAccount:
          normalized.direction === 'debit'
            ? postingLedgerAccount?.name || 'Bank Feed Expense Clearing'
            : bankLedgerAccount?.name || bankAccount.accountName,
        creditAccount:
          normalized.direction === 'debit'
            ? bankLedgerAccount?.name || bankAccount.accountName
            : postingLedgerAccount?.name || 'Unapplied Cash',
        amount: normalized.absoluteAmount,
        status: 'posted',
        source: 'system',
        linkedTransactionIds: [transactionId],
        autoReconcileStatus:
          (rule ? rule.autoReconcile : bankAccount.autoReconcileEnabled !== false) &&
          verificationStatus === 'verified'
            ? 'matched'
            : 'pending',
      };

      nextTransactions = [transactionRecord, ...nextTransactions];
      nextJournalEntries = [journalRecord, ...nextJournalEntries];
      createdTransactionId = transactionId;
      createdJournalEntryId = journalId;

      if (rule?.verificationMode === 'internal_control_token') {
        const token: TokenRecord = {
          id: tokenId,
          entityId: bankAccount.entityId,
          subjectType: 'transaction',
          subjectId: transactionId,
          label: `${bankAccount.accountName} bank feed verification`,
          status: 'verified',
          tokenStandard: 'internal-proof',
          tokenReference: plaidTransaction.transaction_id,
          issuedAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          proofReference: 'Verified from connected bank feed rule execution.',
          notes: `Issued from bank feed rule ${rule.name}.`,
        };
        nextTokens = [token, ...nextTokens];
        createdTokenIds = [token.id];
      }

      nextLedgerAccounts = applyLedgerAmount(
        nextLedgerAccounts,
        bankLedgerAccount?.id,
        normalized.direction === 'debit' ? 'credit' : 'debit',
        normalized.absoluteAmount,
      );
      nextLedgerAccounts = applyLedgerAmount(
        nextLedgerAccounts,
        postingLedgerAccount?.id,
        normalized.direction === 'debit' ? 'debit' : 'credit',
        normalized.absoluteAmount,
      );
    }

    const reconciliationLine: ReconciliationStatementLineRecord = {
      id: buildId('stmt', importSeed),
      postedDate: toIsoDate(plaidTransaction.date),
      description: plaidTransaction.name,
      amount: normalized.signedAmount,
      direction: normalized.direction,
      reference: plaidTransaction.transaction_id,
      rawAmountText: String(plaidTransaction.amount),
      matchStatus:
        createdTransactionId &&
        (rule ? rule.autoReconcile : bankAccount.autoReconcileEnabled !== false) &&
        verificationStatus === 'verified'
          ? 'matched'
          : createdTransactionId
            ? 'suggested'
            : 'unreviewed',
      suggestedTransactionIds: createdTransactionId ? [createdTransactionId] : undefined,
        notes:
          rule?.verificationMode === 'manual_review'
            ? 'Rule matched, but manual review is required before full auto-reconcile.'
            : rule
              ? `Bank feed rule applied: ${rule.name}.`
              : bankAccount.autoCategorizeFeedTransactions
                ? `Auto-categorized from Plaid feed category ${plaidTransaction.category?.join(' / ') || 'uncategorized'}.`
              : 'Imported from connected bank feed. No auto-post rule matched yet.',
    };

    nextReconciliations = nextReconciliations.map((record) =>
      record.id === workingReconciliation.id
        ? {
            ...record,
            status: 'in_review',
            statementReviewStatus: 'needs_review',
            parsedStatementLines: [reconciliationLine, ...(record.parsedStatementLines ?? [])],
            clearedTransactionIds:
              createdTransactionId &&
              (rule ? rule.autoReconcile : bankAccount.autoReconcileEnabled !== false) &&
              verificationStatus === 'verified'
                ? Array.from(
                    new Set([...(record.clearedTransactionIds ?? []), createdTransactionId])
                  )
                : record.clearedTransactionIds,
            matchedStatementLineIds:
              createdTransactionId &&
              (rule ? rule.autoReconcile : bankAccount.autoReconcileEnabled !== false) &&
              verificationStatus === 'verified'
                ? Array.from(
                    new Set([...(record.matchedStatementLineIds ?? []), reconciliationLine.id])
                  )
                : record.matchedStatementLineIds,
            unmatchedStatementLineIds:
              createdTransactionId &&
              (rule ? rule.autoReconcile : bankAccount.autoReconcileEnabled !== false) &&
              verificationStatus === 'verified'
                ? (record.unmatchedStatementLineIds ?? []).filter(
                    (lineId) => lineId !== reconciliationLine.id
                  )
                : Array.from(
                    new Set([...(record.unmatchedStatementLineIds ?? []), reconciliationLine.id])
                  ),
          }
        : record
    );

    nextFeedEntries = [
      {
        id: buildId('feed', importSeed),
        entityId: bankAccount.entityId,
        bankAccountId,
        sourceProvider: bankAccount.connectionType === 'plaid_connected' ? 'plaid' : 'manual',
        externalTransactionId: plaidTransaction.transaction_id,
        postedDate: toIsoDate(plaidTransaction.date),
        description: plaidTransaction.name,
        merchantName: plaidTransaction.name,
        amount: normalized.signedAmount,
        direction: normalized.direction,
        category: plaidTransaction.category?.join(' / '),
        importedAt: new Date().toISOString(),
        status:
          createdTransactionId &&
          (rule ? rule.autoReconcile : bankAccount.autoReconcileEnabled !== false) &&
          verificationStatus === 'verified'
            ? 'reconciled'
            : createdTransactionId
              ? 'posted'
              : rule?.verificationMode === 'manual_review'
                ? 'exception'
                : 'imported',
        matchedRuleId: rule?.id,
        linkedTransactionId: createdTransactionId,
        linkedJournalEntryId: createdJournalEntryId,
        linkedReconciliationId: workingReconciliation.id,
        linkedTokenIds: createdTokenIds,
        verificationStatus,
        notes:
          rule?.counterpartyLabel ||
          (rule
            ? `Rule ${rule.name} applied during sync.`
            : bankAccount.autoCategorizeFeedTransactions
              ? 'Auto-categorized from connected Plaid feed using the live bank category.'
            : 'Imported into the operational feed queue with no rule match yet.'),
      },
      ...nextFeedEntries,
    ];

    nextBankAccounts = nextBankAccounts.map((account) =>
      account.id === bankAccountId
        ? {
            ...account,
            currentBalance:
              bankAccount.connectionType === 'plaid_connected'
                ? account.currentBalance
                : Number(((account.currentBalance ?? 0) + normalized.signedAmount).toFixed(2)),
          }
        : account
    );
  }

  return {
    ...data,
    bankAccounts: nextBankAccounts,
    ledgerAccounts: nextLedgerAccounts,
    transactions: nextTransactions,
    journalEntries: nextJournalEntries,
    tokens: nextTokens,
    reconciliations: nextReconciliations,
    bankFeedEntries: nextFeedEntries,
  };
}
