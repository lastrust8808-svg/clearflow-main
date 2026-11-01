/**
 * Non-production atomic bank-feed page commit boundary.
 * The server MUST supply a scope derived from authenticated tenant permissions
 * and a real database transaction that rolls back rows and cursor together.
 * No provider calls, payments or ledger posting occur here.
 */
import {
  planBankFeedCursorPage,
  type FeedCursorCheckpoint,
  type FeedCursorPagePlan,
  type FeedProvider,
  type FeedReplayEntry,
  type FeedReplayEvent,
} from './bankFeedReplayPlan.service.ts';

export interface AuthorizedBankFeedScope {
  tenantId: string;
  provider: FeedProvider;
  connectionId: string;
  allowedAccountIds: string[];
}

export interface BankFeedPageEvidence {
  events: FeedReplayEvent[];
  nextCursor: string;
  hasMore: boolean;
}

export interface BankFeedTransaction {
  // Lock the checkpoint until commit, enforce tenant scope on EVERY query.
  loadCheckpointForUpdate(scope: AuthorizedBankFeedScope): Promise<FeedCursorCheckpoint>;
  loadEntries(scope: AuthorizedBankFeedScope): Promise<FeedReplayEntry[]>;
  saveEntries(scope: AuthorizedBankFeedScope, entries: FeedReplayEntry[]): Promise<void>;
  compareAndSwapCheckpoint(
    scope: AuthorizedBankFeedScope,
    previous: FeedCursorCheckpoint,
    next: FeedCursorCheckpoint,
  ): Promise<boolean>;
}

export interface BankFeedTransactionalStore {
  // Resolve only after COMMIT; reject and ROLLBACK on any callback error.
  withTransaction<T>(operation: (tx: BankFeedTransaction) => Promise<T>): Promise<T>;
}

// The authorization scope and provider page may be held by asynchronous
// callers. Snapshot inert canonical values BEFORE the first await: otherwise
// a caller can change tenant/account identities or page evidence while the
// transaction is waiting for its checkpoint lock. The planner still validates
// the financial semantics of these detached values inside the transaction.
const SCOPE_FIELDS = new Set(['tenantId', 'provider', 'connectionId', 'allowedAccountIds']);
const PAGE_FIELDS = new Set(['events', 'nextCursor', 'hasMore']);
const EVENT_FIELDS = new Set([
  'kind', 'accountId', 'transactionId', 'amountCents', 'pending',
  'pendingTransactionId', 'providerPayloadHash',
]);

function snapshotRecord<T extends object>(
  value: T, fields: ReadonlySet<string>, required: ReadonlySet<string>, label: string,
): T {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`Malformed bank feed ${label} envelope.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const field of required) {
    if (!Object.hasOwn(descriptors, field)) {
      throw new Error(`Malformed bank feed ${label} required field.`);
    }
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !fields.has(key) ||
        !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
        descriptor.value === undefined) {
      throw new Error(`Malformed bank feed ${label} field.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value, enumerable: true, configurable: true, writable: true,
    });
  }
  return snapshot as T;
}

function snapshotList<T>(value: T[], item: (value: T) => T, label: string): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`Malformed bank feed ${label} list.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
    throw new Error(`Malformed bank feed ${label} list.`);
  }
  const snapshot: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(`Malformed bank feed ${label} list.`);
    }
    snapshot.push(item(descriptor.value));
  }
  return snapshot;
}

function snapshotPageInput(scope: AuthorizedBankFeedScope, page: BankFeedPageEvidence): {
  scope: AuthorizedBankFeedScope; page: BankFeedPageEvidence;
} {
  const safeScope = snapshotRecord(scope, SCOPE_FIELDS, SCOPE_FIELDS, 'scope');
  safeScope.allowedAccountIds = snapshotList(safeScope.allowedAccountIds, (id) => id, 'accounts');
  const safePage = snapshotRecord(page, PAGE_FIELDS, PAGE_FIELDS, 'page');
  safePage.events = snapshotList(
    safePage.events,
    (event) => snapshotRecord(event, EVENT_FIELDS, new Set(['kind', 'accountId', 'transactionId']), 'event'),
    'events',
  );
  return { scope: safeScope, page: safePage };
}

/**
 * Commit exactly one provider page, or throw without acknowledging its cursor.
 * Store is injected: tests of this contract are NOT database/restore evidence.
 */
export async function commitAuthorizedBankFeedPage(
  store: BankFeedTransactionalStore,
  authorizedScope: AuthorizedBankFeedScope,
  page: BankFeedPageEvidence,
): Promise<FeedCursorPagePlan> {
  const { scope, page: detachedPage } = snapshotPageInput(authorizedScope, page);
  return store.withTransaction(async (tx) => {
    const checkpoint = await tx.loadCheckpointForUpdate(scope);
    const existing = await tx.loadEntries(scope);
    const proposal = planBankFeedCursorPage({
      feed: { ...scope, existing, events: detachedPage.events },
      checkpoint,
      expectedCursor: checkpoint.cursor,
      expectedRevision: checkpoint.revision,
      nextCursor: detachedPage.nextCursor,
      hasMore: detachedPage.hasMore,
    });
    if (!proposal.commitRequired) return proposal;
    if (proposal.applied > 0) {
      await tx.saveEntries(scope, proposal.entries);
    }
    const advanced = await tx.compareAndSwapCheckpoint(
      scope, checkpoint, proposal.nextCheckpoint,
    );
    if (advanced !== true) {
      throw new Error('Bank feed cursor compare-and-swap failed; transaction must roll back.');
    }
    return proposal;
  });
}
