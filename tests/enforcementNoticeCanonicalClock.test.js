import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';

const base = Object.freeze({
  tenantId:'tenant-1', trustId:'trust-1', noteId:'note-1',
  noticeId:'notice-1', noticeVersionId:'version-1',
  preparedEvidenceRef:'prepared-1', deliveryEvidenceRef:'delivery-1',
  preparedAt:'2026-11-03T09:00:00.000Z',
  deliveredAt:'2026-11-03T10:00:00.000Z',
  evaluatedAt:'2026-11-03T11:00:00.000Z'
});

test('notice chronology refuses noncanonical clock encodings in every timestamp role', () => {
  const invalid = [
    '2026-11-03T10:00:00Z',
    '2026-11-03T10:00:00.000+00:00',
    '2026-11-03T10:00:00.000-05:00',
    '2026-11-03T10:00:00.000z',
    '2026-11-03T24:00:00.000Z',
    '2026-11-03T10:00:60.000Z',
    '2026-13-03T10:00:00.000Z',
    '2026-11-31T10:00:00.000Z',
    '2026-11-03T10:00:00.0000Z'
  ];
  for (const field of ['preparedAt', 'deliveredAt', 'evaluatedAt']) {
    for (const value of invalid) {
      assert.throws(() => assess({...base, [field]:value}),
        /Invalid canonical UTC timestamp/, field + ': ' + value);
    }
  }
});

test('malformed partial delivery time is rejected rather than hidden by missing reference', () => {
  const {deliveryEvidenceRef, ...partial} = base;
  assert.throws(() => assess({...partial, deliveredAt:'2026-11-03T10:00:00-05:00'}),
    /Invalid canonical UTC timestamp/);
  assert.deepEqual(assess(partial), {status:'incomplete', reason:'partial_delivery_evidence'});
});
