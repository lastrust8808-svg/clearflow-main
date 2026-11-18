import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-lifecycle-review';
const make = (accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId, provider: 'mercury', connectionId: 'connection-lifecycle-review',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-18', status, providerReference: 'shared-lifecycle-ref',
});

test('removed and superseded historical records do not create current-reference ambiguity', () => {
  for (const inactive of ['removed', 'superseded']) {
    const result = proposeBankTransferCandidates({ tenantId, transactions: [
      make('checking', 'debit', -12500),
      make('savings', 'credit', 12500),
      make('archive', 'historical-' + inactive, 12500, inactive),
    ] });
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.ambiguous, []);
    assert.equal(result.candidates[0].status, 'review_required');
  }
});

test('a pending event sharing the reference suppresses review candidates regardless of arrival order', () => {
  const posted = [make('checking', 'debit', -12500), make('savings', 'credit', 12500)];
  const pending = make('pending-account', 'pending-event', 12500, 'pending');
  for (const transactions of [[...posted, pending], [pending, ...posted], [posted[0], pending, posted[1]]]) {
    const result = proposeBankTransferCandidates({ tenantId, transactions });
    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.ambiguous.map(x => x.transactionId).sort(), ['credit', 'debit']);
  }
});
