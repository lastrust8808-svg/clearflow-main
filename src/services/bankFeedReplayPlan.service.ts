/**
 * Pure, non-posting provider-feed replay planner. This deliberately does not
 * persist a cursor, write a ledger entry, or approve a reconciliation.
 * The server must apply its result and the provider cursor in ONE authorized
 * database transaction; never acknowledge a provider page before that commit.
 */
export type FeedProvider = 'plaid' | 'mercury';
export type FeedEntryStatus = 'pending' | 'posted' | 'superseded' | 'removed';

export interface FeedReplayEntry {
  tenantId: string;
  provider: FeedProvider;
  connectionId: string;
  accountId: string;
  transactionId: string;
  amountCents: number;
  status: FeedEntryStatus;
  pendingTransactionId?: string | null;
  supersededBy?: string;
  requiresReview: boolean;
}

export interface FeedReplayEvent {
  kind: 'added' | 'modified' | 'removed';
  accountId: string;
  transactionId: string;
  amountCents?: number;
  pending?: boolean;
  pendingTransactionId?: string | null;
}

export interface FeedReplayInput {
  tenantId: string;
  provider: FeedProvider;
  connectionId: string;
  allowedAccountIds: string[];
  existing: FeedReplayEntry[];
  events: FeedReplayEvent[];
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 &&
  value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value);

const keyOf = (accountId: string, transactionId: string): string =>
  JSON.stringify([accountId, transactionId]);

function requireAmount(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Feed amount must be an exact, safe integer number of cents.');
  }
}

/** Returns a detached proposal. A thrown error leaves all caller data unchanged. */
export function planBankFeedReplay(input: FeedReplayInput): {
  entries: FeedReplayEntry[];
  applied: number;
  replayed: number;
} {
  if (!validId(input.tenantId) || !validId(input.connectionId) ||
      (input.provider !== 'plaid' && input.provider !== 'mercury') ||
      !Array.isArray(input.allowedAccountIds) || !input.allowedAccountIds.length ||
      input.allowedAccountIds.some((id) => !validId(id)) ||
      new Set(input.allowedAccountIds).size !== input.allowedAccountIds.length ||
      !Array.isArray(input.existing) || !Array.isArray(input.events)) {
    throw new Error('Invalid authorized feed scope or event collection.');
  }
  const allowed = new Set(input.allowedAccountIds);
  const entries = input.existing.map((entry) => ({ ...entry }));
  const index = new Map<string, FeedReplayEntry>();
  for (const entry of entries) {
    if (!entry || entry.tenantId !== input.tenantId || entry.provider !== input.provider ||
        entry.connectionId !== input.connectionId || !allowed.has(entry.accountId) ||
        !validId(entry.transactionId) ||
        !['pending', 'posted', 'superseded', 'removed'].includes(entry.status) ||
        typeof entry.requiresReview !== 'boolean' ||
        (entry.pendingTransactionId != null &&
          (!validId(entry.pendingTransactionId) || entry.pendingTransactionId === entry.transactionId)) ||
        (entry.supersededBy != null && !validId(entry.supersededBy)) ||
        (entry.status === 'pending' && entry.pendingTransactionId != null) ||
        (entry.status === 'superseded' && !entry.supersededBy) ||
        (entry.status !== 'superseded' && entry.supersededBy != null)) {
      throw new Error('Existing feed record is outside the authorized scope or malformed.');
    }
    requireAmount(entry.amountCents);
    const key = keyOf(entry.accountId, entry.transactionId);
    if (index.has(key)) throw new Error('Duplicate canonical feed identity in existing records.');
    index.set(key, entry);
  }
  // Persisted links must agree in both directions before any new provider
  // event is considered. Otherwise a fabricated tombstone could authorize
  // a posted correction without its original pending transaction.
  for (const entry of entries) {
    if (entry.pendingTransactionId != null) {
      const predecessor = index.get(keyOf(entry.accountId, entry.pendingTransactionId));
      if (!predecessor || predecessor.status !== 'superseded' ||
          predecessor.supersededBy !== entry.transactionId ||
          (entry.status !== 'posted' && entry.status !== 'removed')) {
        throw new Error('Persisted pending-to-posted linkage is inconsistent.');
      }
    }
    if (entry.status === 'superseded') {
      const successor = index.get(keyOf(entry.accountId, entry.supersededBy!));
      if (!successor || (successor.status !== 'posted' && successor.status !== 'removed') ||
          successor.pendingTransactionId !== entry.transactionId) {
        throw new Error('Persisted supersession linkage is inconsistent.');
      }
    }
  }

  let applied = 0;
  let replayed = 0;
  for (const event of input.events) {
    if (!event || !allowed.has(event.accountId) || !validId(event.transactionId) ||
        !['added', 'modified', 'removed'].includes(event.kind)) {
      throw new Error('Feed event has an invalid or unauthorized account/transaction identity.');
    }
    const key = keyOf(event.accountId, event.transactionId);
    const existing = index.get(key);
    if (event.kind === 'removed') {
      if (!existing) throw new Error('Unknown removal requires an audited provider exception.');
      // A provider may remove a pending row after its linked posted row arrives.
      // Preserve the superseded tombstone: posted corrections still need the
      // original provider identity to validate their pending-to-posted link.
      if (existing.status === 'removed' || existing.status === 'superseded') {
        replayed++;
        continue;
      }
      existing.status = 'removed';
      existing.requiresReview = true;
      applied++;
      continue;
    }
    requireAmount(event.amountCents);
    if (typeof event.pending !== 'boolean' ||
        (event.pendingTransactionId != null && !validId(event.pendingTransactionId))) {
      throw new Error('Feed event requires an explicit posting state and valid linkage.');
    }
    if (event.pending && event.pendingTransactionId != null) {
      throw new Error('Pending transactions cannot supersede another pending transaction.');
    }
    const status: FeedEntryStatus = event.pending ? 'pending' : 'posted';
    const pendingTransactionId = event.pendingTransactionId ?? null;
    if (event.kind === 'added' && existing) {
      if (existing.status === status && existing.amountCents === event.amountCents &&
          (existing.pendingTransactionId ?? null) === pendingTransactionId) {
        replayed++;
        continue;
      }
      throw new Error('Conflicting replay or resurrection requires manual review.');
    }
    if (event.kind === 'modified' && !existing) {
      throw new Error('Unknown modification requires an audited provider exception.');
    }
    if (existing && (existing.status === 'removed' || existing.status === 'superseded')) {
      throw new Error('Cannot silently modify a removed or superseded transaction.');
    }
    // A posted bank transaction must not become pending again or lose its
    // original provider pending-to-posted link through a feed modification.
    // Either change would reopen already-reviewed financial evidence; route
    // corrections through an explicitly audited exception workflow instead.
    if (existing?.status === 'posted') {
      if (status !== 'posted') {
        throw new Error('Posted feed transaction cannot regress to pending.');
      }
      if ((existing.pendingTransactionId ?? null) !== pendingTransactionId) {
        throw new Error('Posted feed pending linkage cannot change without audited correction.');
      }
    }
    // A posted transaction may replace a pending one only through an explicit
    // provider linkage on the same account. Never match merely by amount/date.
    if (pendingTransactionId) {
      if (pendingTransactionId === event.transactionId) throw new Error('Self-linked pending transaction.');
      const predecessor = index.get(keyOf(event.accountId, pendingTransactionId));
      if (!predecessor || (predecessor.status !== 'pending' &&
          !(predecessor.status === 'superseded' && predecessor.supersededBy === event.transactionId)) ||
          (predecessor.supersededBy && predecessor.supersededBy !== event.transactionId)) {
        throw new Error('Pending-to-posted linkage is missing or ambiguous.');
      }
      predecessor.status = 'superseded';
      predecessor.supersededBy = event.transactionId;
      predecessor.requiresReview = true;
    }
    if (existing) {
      existing.amountCents = event.amountCents;
      existing.status = status;
      existing.pendingTransactionId = pendingTransactionId;
      existing.requiresReview = true;
    } else {
      const entry: FeedReplayEntry = {
        tenantId: input.tenantId,
        provider: input.provider,
        connectionId: input.connectionId,
        accountId: event.accountId,
        transactionId: event.transactionId,
        amountCents: event.amountCents,
        status,
        pendingTransactionId,
        requiresReview: true,
      };
      entries.push(entry);
      index.set(key, entry);
    }
    applied++;
  }
  return { entries, applied, replayed };
}
