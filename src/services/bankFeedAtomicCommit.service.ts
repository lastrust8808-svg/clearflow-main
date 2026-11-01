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

/**
 * Commit exactly one provider page, or throw without acknowledging its cursor.
 * Store is injected: tests of this contract are NOT database/restore evidence.
 */
export async function commitAuthorizedBankFeedPage(
  store: BankFeedTransactionalStore,
  authorizedScope: AuthorizedBankFeedScope,
  page: BankFeedPageEvidence,
): Promise<FeedCursorPagePlan> {
  return store.withTransaction(async (tx) => {
    const checkpoint = await tx.loadCheckpointForUpdate(authorizedScope);
    const existing = await tx.loadEntries(authorizedScope);
    const proposal = planBankFeedCursorPage({
      feed: { ...authorizedScope, existing, events: page.events },
      checkpoint,
      expectedCursor: checkpoint.cursor,
      expectedRevision: checkpoint.revision,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
    if (!proposal.commitRequired) return proposal;
    if (proposal.applied > 0) {
      await tx.saveEntries(authorizedScope, proposal.entries);
    }
    const advanced = await tx.compareAndSwapCheckpoint(
      authorizedScope, checkpoint, proposal.nextCheckpoint,
    );
    if (advanced !== true) {
      throw new Error('Bank feed cursor compare-and-swap failed; transaction must roll back.');
    }
    return proposal;
  });
}
