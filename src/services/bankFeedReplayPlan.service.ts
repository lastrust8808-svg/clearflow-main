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

// The replay planner accepts normalized JSON evidence, not arbitrary provider
// objects. Inspect descriptors BEFORE spreading or reading fields: getters,
// hidden metadata, unknown keys, or sparse batches could otherwise change
// the proposed ledger evidence or be silently discarded during persistence.
const STORED_FEED_FIELDS = new Set([
  'tenantId', 'provider', 'connectionId', 'accountId', 'transactionId',
  'amountCents', 'status', 'pendingTransactionId', 'supersededBy', 'requiresReview',
]);
const EVENT_FEED_FIELDS = new Set([
  'kind', 'accountId', 'transactionId', 'amountCents', 'pending',
  'pendingTransactionId',
]);
const INPUT_FEED_FIELDS = new Set([
  'tenantId', 'provider', 'connectionId', 'allowedAccountIds', 'existing', 'events',
]);
const INPUT_REQUIRED_FIELDS = INPUT_FEED_FIELDS;
const STORED_REQUIRED_FIELDS = new Set([
  'tenantId', 'provider', 'connectionId', 'accountId', 'transactionId',
  'amountCents', 'status', 'requiresReview',
]);
const EVENT_IDENTITY_FIELDS = new Set(['kind', 'accountId', 'transactionId']);
const EVENT_POSTING_FIELDS = new Set([
  ...EVENT_IDENTITY_FIELDS, 'amountCents', 'pending',
]);

function assertCanonicalFeedList(value: unknown, label: string): void {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`malformed canonical feed ${label} array.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1 || keys.some((key) => {
    if (key === 'length') return false;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) ||
        Number(key) >= value.length) return true;
    const descriptor = descriptors[key];
    return !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
  })) {
    throw new Error(`malformed canonical feed ${label} array.`);
  }
}

function assertCanonicalFeedObject(
  value: unknown, fields: ReadonlySet<string>, label: string,
  requiredFields: ReadonlySet<string> = new Set()
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`malformed canonical feed ${label} object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`malformed canonical feed ${label} object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  // A missing own field must not be filled from a polluted Object.prototype.
  // This also avoids silently accepting incomplete provider or stored records.
  for (const key of requiredFields) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new Error(`malformed canonical feed ${label} required property.`);
    }
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !fields.has(key)) {
      throw new Error(`malformed canonical feed ${label} property.`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
        descriptor.value === undefined) {
      throw new Error(`malformed canonical feed ${label} property.`);
    }
  }
}

function requireAmount(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new Error('Feed amount must be an exact, safe integer number of cents.');
  }
}

/** Returns a detached proposal. A thrown error leaves all caller data unchanged. */
export function planBankFeedReplay(input: FeedReplayInput): {
  entries: FeedReplayEntry[];
  applied: number;
  replayed: number;
} {
  // Validate the input envelope before accessing its fields: accessor-backed
  // authorization scope and inherited values must never influence replay.
  assertCanonicalFeedObject(input, INPUT_FEED_FIELDS, 'input', INPUT_REQUIRED_FIELDS);
  if (!validId(input.tenantId) || !validId(input.connectionId) ||
      (input.provider !== 'plaid' && input.provider !== 'mercury') ||
      !Array.isArray(input.allowedAccountIds) ||
      !Array.isArray(input.existing) || !Array.isArray(input.events)) {
    throw new Error('Invalid authorized feed scope or event collection.');
  }
  assertCanonicalFeedList(input.allowedAccountIds, 'authorized accounts');
  assertCanonicalFeedList(input.existing, 'existing records');
  assertCanonicalFeedList(input.events, 'provider events');
  if (!input.allowedAccountIds.length ||
      input.allowedAccountIds.some((id) => !validId(id)) ||
      new Set(input.allowedAccountIds).size !== input.allowedAccountIds.length) {
    throw new Error('Invalid authorized feed scope or event collection.');
  }
  // Validate all canonical envelopes before cloning or processing a page.
  // Removed events carry only identity; attached financial fields must never
  // be silently ignored as though the provider supplied a clean tombstone.
  for (const entry of input.existing) {
    assertCanonicalFeedObject(entry, STORED_FEED_FIELDS, 'stored record', STORED_REQUIRED_FIELDS);
  }
  for (const event of input.events) {
    // Inspect descriptors before reading kind; a malicious getter must not run.
    assertCanonicalFeedObject(event, EVENT_FEED_FIELDS, 'provider event');
    assertCanonicalFeedObject(
      event, EVENT_FEED_FIELDS, 'provider event',
      event.kind === 'removed' ? EVENT_IDENTITY_FIELDS : EVENT_POSTING_FIELDS,
    );
    if (event.kind === 'removed' &&
        (Object.hasOwn(event, 'amountCents') ||
         Object.hasOwn(event, 'pending') ||
         Object.hasOwn(event, 'pendingTransactionId'))) {
      throw new Error('malformed canonical feed removal metadata.');
    }
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
    // A repeated provider modification with no observable change must not
    // create another applied event. Preserve review eligibility: an existing
    // record that has not yet been flagged for review must still be flagged
    // on the first modification, even when the tracked fields are unchanged.
    if (event.kind === 'modified' && existing && existing.requiresReview &&
        existing.status === status && existing.amountCents === event.amountCents &&
        (existing.pendingTransactionId ?? null) === pendingTransactionId) {
      replayed++;
      continue;
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

/**
 * Cursor-page checkpoint contract for a normalized provider adapter.
 *
 * This is a pure proposal, NOT a durable cursor acknowledgement. The server
 * must load the checkpoint under authenticated tenant/connection scope, then
 * compare-and-swap its revision and write all proposed entries plus the cursor
 * in the SAME database transaction. A failed transaction must acknowledge
 * neither rows nor cursor. Raw provider payload hashes belong in that audit.
 */
export interface FeedCursorCheckpoint {
  tenantId: string;
  provider: FeedProvider;
  connectionId: string;
  cursor: string | null;
  revision: number;
}

export interface FeedCursorPageInput {
  feed: FeedReplayInput;
  checkpoint: FeedCursorCheckpoint;
  expectedCursor: string | null;
  expectedRevision: number;
  nextCursor: string;
  hasMore: boolean;
}

export interface FeedCursorPagePlan {
  entries: FeedReplayEntry[];
  applied: number;
  replayed: number;
  nextCheckpoint: FeedCursorCheckpoint;
  commitRequired: boolean;
}

const CURSOR_PAGE_FIELDS = new Set([
  'feed', 'checkpoint', 'expectedCursor', 'expectedRevision', 'nextCursor', 'hasMore',
]);
const CURSOR_CHECKPOINT_FIELDS = new Set([
  'tenantId', 'provider', 'connectionId', 'cursor', 'revision',
]);
const validCursor = (value: unknown): value is string | null =>
  value === null ||
  (typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
   value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value));

/**
 * Fail closed on stale checkpoints and non-advancing nonempty pages.
 * Empty terminal polls may legitimately retain the same provider cursor.
 */
export function planBankFeedCursorPage(input: FeedCursorPageInput): FeedCursorPagePlan {
  assertCanonicalFeedObject(input, CURSOR_PAGE_FIELDS, 'cursor page', CURSOR_PAGE_FIELDS);
  assertCanonicalFeedObject(
    input.checkpoint, CURSOR_CHECKPOINT_FIELDS, 'cursor checkpoint', CURSOR_CHECKPOINT_FIELDS,
  );
  const checkpoint = input.checkpoint;
  if (!validId(checkpoint.tenantId) || !validId(checkpoint.connectionId) ||
      (checkpoint.provider !== 'plaid' && checkpoint.provider !== 'mercury') ||
      !validCursor(checkpoint.cursor) || !validCursor(input.expectedCursor) ||
      !validCursor(input.nextCursor) || input.nextCursor === null ||
      !Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      typeof input.hasMore !== 'boolean') {
    throw new Error('Invalid feed cursor checkpoint or page metadata.');
  }
  // The inner planner independently validates the canonical feed envelope and
  // every row before any proposed state can be returned.
  const replay = planBankFeedReplay(input.feed);
  if (checkpoint.tenantId !== input.feed.tenantId ||
      checkpoint.provider !== input.feed.provider ||
      checkpoint.connectionId !== input.feed.connectionId) {
    throw new Error('Feed cursor checkpoint is outside the authorized connection scope.');
  }
  if (checkpoint.revision !== input.expectedRevision ||
      checkpoint.cursor !== input.expectedCursor) {
    throw new Error('Stale feed cursor checkpoint; reload and retry under transaction lock.');
  }
  if (input.nextCursor === checkpoint.cursor) {
    if (input.hasMore || input.feed.events.length !== 0) {
      throw new Error('Nonempty or incomplete provider page cannot retain its cursor.');
    }
    return {
      ...replay,
      nextCheckpoint: { ...checkpoint },
      commitRequired: false,
    };
  }
  if (checkpoint.revision === Number.MAX_SAFE_INTEGER) {
    throw new Error('Feed cursor revision would exceed safe integer precision.');
  }
  return {
    ...replay,
    nextCheckpoint: {
      ...checkpoint,
      cursor: input.nextCursor,
      revision: checkpoint.revision + 1,
    },
    commitRequired: true,
  };
}
