import test from 'node:test';
import assert from 'node:assert/strict';
import { planBankFeedCursorPage } from '../src/services/bankFeedReplayPlan.service.ts';

const page = (cursor) => ({
  feed: { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['acct-a'], existing: [], events: [] },
  checkpoint: { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', cursor: null, revision: 0 },
  expectedCursor: null,
  expectedRevision: 0,
  nextCursor: cursor,
  hasMore: false,
});

test('cursor proposal rejects Unicode noncharacters and unpaired surrogates before persistence', () => {
  for (const cp of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF, 0xD800, 0xDC00]) {
    assert.throws(() => planBankFeedCursorPage(page('cursor-' + String.fromCodePoint(cp))), /Invalid feed cursor checkpoint or page metadata/);
  }
});

test('cursor proposal accepts ordinary Unicode and advances the revision without posting', () => {
  const result = planBankFeedCursorPage(page('cursor-商店-🙂'));
  assert.equal(result.nextCheckpoint.cursor, 'cursor-商店-🙂');
  assert.equal(result.nextCheckpoint.revision, 1);
  assert.equal(result.commitRequired, true);
  assert.equal(result.applied, 0);
});
