import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';

const packet = Object.freeze({
  tenantId: 'tenant-1', trustId: 'trust-1', noteId: 'note-1',
  noticeId: 'notice-1', noticeVersionId: 'version-1',
  preparedEvidenceRef: 'prepared-1', deliveryEvidenceRef: 'delivery-1',
  preparedAt: '2026-11-03T09:00:00.000Z',
  deliveredAt: '2026-11-03T10:00:00.000Z',
  evaluatedAt: '2026-11-03T11:00:00.000Z',
});

test('every notice identity enforces its 128-character canonical boundary', () => {
  const fields = ['tenantId', 'trustId', 'noteId', 'noticeId',
    'noticeVersionId', 'preparedEvidenceRef', 'deliveryEvidenceRef'];
  for (const field of fields) {
    const valid = 'x' + field.replace(/[^a-zA-Z0-9]/g, '') + 'a'.repeat(127 - field.length);
    assert.equal(valid.length, 128);
    assert.equal(assess({ ...packet, [field]: valid }).status,
      'evidence_ready_for_review', field);
    for (const invalid of [valid + 'a', '.leading', '-leading', ':leading',
      '_leading', 'trailing ', 'non ascii é', 'a\\u200b']) {
      assert.throws(() => assess({ ...packet, [field]: invalid }),
        /Invalid notice identifier|Invalid or reused delivery evidence reference/, field);
    }
  }
});
