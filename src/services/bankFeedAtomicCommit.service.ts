/**
 * Non-production atomic bank-feed page commit boundary.
 * The server MUST supply a scope derived from authenticated tenant permissions
 * and a real database transaction that rolls back rows and cursor together.
 * No provider calls, payments or ledger posting occur here.
 */
import {
  planBankFeedCursorPage,
  planBankFeedReplay,
  MAX_FEED_PAGE_EVENTS,
  MAX_FEED_ACCOUNT_SCOPE,
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
  // Cursor supplied to the provider when THIS page was fetched. A page from
  // an older poll must never be committed against a newer locked checkpoint.
  requestedCursor: string | null;
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
const PAGE_FIELDS = new Set(['requestedCursor', 'events', 'nextCursor', 'hasMore']);
const EVENT_FIELDS = new Set([
  'kind', 'accountId', 'transactionId', 'amountCents', 'pending',
  'pendingTransactionId', 'providerPayloadHash',
]);
// The database adapter's locked checkpoint is also an evidence boundary.
// Reject accessors, inherited identities, hidden metadata and missing fields
// before reading tenant identifiers or loading historical financial records.
const CHECKPOINT_FIELDS = new Set([
  'tenantId', 'provider', 'connectionId', 'cursor', 'revision',
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

function snapshotList<T>(value: T[], item: (value: T) => T, label: string, maxItems: number): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maxItems) {
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

// Reject invalid cursor evidence before a DB lock or historical-row read.
// The pure planner revalidates this metadata after loading canonical records.
const validCursorEvidence = (value: unknown): value is string | null =>
  value === null ||
  (typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
   value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value));

function assertPageCursorEvidence(page: BankFeedPageEvidence): void {
  if (!validCursorEvidence(page.requestedCursor) ||
      !validCursorEvidence(page.nextCursor) || page.nextCursor === null ||
      typeof page.hasMore !== 'boolean') {
    throw new Error('Invalid feed cursor checkpoint or page metadata.');
  }
  if (page.nextCursor === page.requestedCursor &&
      (page.hasMore || page.events.length !== 0)) {
    throw new Error('Nonempty or incomplete provider page cannot retain its cursor.');
  }
}

function assertLockedCheckpointEvidence(
  checkpoint: FeedCursorCheckpoint, page: BankFeedPageEvidence,
): void {
  if (!validCursorEvidence(checkpoint.cursor) ||
      !Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0 ||
      Object.is(checkpoint.revision, -0)) {
    throw new Error('Invalid feed cursor checkpoint or page metadata.');
  }
  if (checkpoint.revision === Number.MAX_SAFE_INTEGER &&
      checkpoint.cursor !== page.nextCursor) {
    throw new Error('Feed cursor revision would exceed safe integer precision.');
  }
}

// Check the provider page's account/transaction identities before obtaining
// a database lock. A malformed or cross-account event cannot require a
// historical-record read merely to be rejected by the replay planner.
function assertPageEventIdentities(
  scope: AuthorizedBankFeedScope, page: BankFeedPageEvidence,
): void {
  const allowed = new Set(scope.allowedAccountIds);
  const identities = new Set<string>();
  const validId = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value);
  for (const event of page.events) {
    if (!allowed.has(event.accountId) || !validId(event.transactionId) ||
        (event.kind !== 'added' && event.kind !== 'modified' && event.kind !== 'removed')) {
      throw new Error('Feed event has an invalid or unauthorized account/transaction identity.');
    }
    const identity = JSON.stringify([event.accountId, event.transactionId]);
    if (identities.has(identity)) {
      throw new Error('Duplicate provider event identity within one feed page.');
    }
    identities.add(identity);
    // Financially malformed pages must fail before a checkpoint lock or a
    // historical-row read, not only after the replay planner loads entries.
    // Keep the same posting/removal contract as planBankFeedReplay.
    if (event.kind === 'removed') {
      if (Object.hasOwn(event, 'amountCents') ||
          Object.hasOwn(event, 'pending') ||
          Object.hasOwn(event, 'pendingTransactionId') ||
          Object.hasOwn(event, 'providerPayloadHash')) {
        throw new Error('Malformed provider removal financial evidence.');
      }
      continue;
    }
    if (!Number.isSafeInteger(event.amountCents) ||
        Object.is(event.amountCents, -0) ||
        typeof event.pending !== 'boolean') {
      throw new Error('Invalid provider posting amount or state.');
    }
    if (event.pendingTransactionId != null &&
        (!validId(event.pendingTransactionId) || event.pending ||
         event.pendingTransactionId === event.transactionId)) {
      throw new Error('Invalid provider pending-to-posted linkage.');
    }
    if (Object.hasOwn(event, 'providerPayloadHash') &&
        (typeof event.providerPayloadHash !== 'string' ||
         !/^[a-f0-9]{64}$/.test(event.providerPayloadHash))) {
      throw new Error('Invalid provider payload fingerprint.');
    }
  }
}

function snapshotPageInput(scope: AuthorizedBankFeedScope, page: BankFeedPageEvidence): {
  scope: AuthorizedBankFeedScope; page: BankFeedPageEvidence;
} {
  const safeScope = snapshotRecord(scope, SCOPE_FIELDS, SCOPE_FIELDS, 'scope');
  safeScope.allowedAccountIds = snapshotList(
    safeScope.allowedAccountIds, (id) => id, 'accounts', MAX_FEED_ACCOUNT_SCOPE,
  );
  const safePage = snapshotRecord(page, PAGE_FIELDS, PAGE_FIELDS, 'page');
  safePage.events = snapshotList(
    safePage.events,
    (event) => snapshotRecord(event, EVENT_FIELDS, new Set(['kind', 'accountId', 'transactionId']), 'event'),
    'events', MAX_FEED_PAGE_EVENTS,
  );
  assertPageCursorEvidence(safePage);
  // Fail closed on malformed or ambiguous tenant/account scope before opening
  // a database transaction. Reuse the canonical planner's ID, provider and
  // duplicate-account checks rather than letting a store interpret bad scope.
  // This is input validation, NOT proof of authenticated authorization.
  planBankFeedReplay({ ...safeScope, existing: [], events: [] });
  assertPageEventIdentities(safeScope, safePage);
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
    const loadedCheckpoint = await tx.loadCheckpointForUpdate(scope);
    if (!loadedCheckpoint) {
      throw new Error('Feed cursor checkpoint is outside the authorized connection scope.');
    }
    const checkpoint = snapshotRecord(
      loadedCheckpoint, CHECKPOINT_FIELDS, CHECKPOINT_FIELDS, 'checkpoint',
    );
    // Reject a foreign checkpoint or an obsolete provider response BEFORE
    // loading potentially large historical transaction sets under the lock.
    // The replay planner independently validates the complete checkpoint and
    // page after the scoped rows are loaded; this is an early rejection gate.
    if (!checkpoint || checkpoint.tenantId !== scope.tenantId ||
        checkpoint.provider !== scope.provider ||
        checkpoint.connectionId !== scope.connectionId) {
      throw new Error('Feed cursor checkpoint is outside the authorized connection scope.');
    }
    assertLockedCheckpointEvidence(checkpoint, detachedPage);
    if (checkpoint.cursor !== detachedPage.requestedCursor) {
      throw new Error('Stale feed cursor checkpoint; reload and retry under transaction lock.');
    }
    const existing = await tx.loadEntries(scope);
    const proposal = planBankFeedCursorPage({
      feed: { ...scope, existing, events: detachedPage.events },
      checkpoint,
      // Never manufacture the expected cursor from the freshly locked state:
      // that would accept a stale response fetched before another poll advanced.
      expectedCursor: detachedPage.requestedCursor,
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
