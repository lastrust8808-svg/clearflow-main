import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, postedDate) => ({
  tenantId: 'tenant-century', provider: 'mercury', connectionId: 'connection-century',
  accountId, transactionId, amountCents, currency: 'USD', postedDate,
  status: 'posted', providerReference: 'century-transfer',
});
const review = (a, b) => proposeBankTransferCandidates({
  tenantId: 'tenant-century',
  transactions: [row('checking', 'debit', -1500, a), row('savings', 'credit', 1500, b)],
});

test('Gregorian century rules reject 2100 leap day but accept 2000 leap day', () => {
  assert.throws(() => review('2100-02-29', '2100-03-01'), /Invalid transfer posting date/);
  const result = review('2000-02-29', '2000-03-03');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dayGap, 3);
  assert.equal(result.candidates[0].status, 'review_required');
});

test('nonleap century boundary preserves the inclusive three-day review window', () => {
  assert.equal(review('2100-02-28', '2100-03-03').candidates[0].dayGap, 3);
  assert.deepEqual(review('2100-02-28', '2100-03-04'), { candidates: [], ambiguous: [] });
  assert.equal(review('2099-12-30', '2100-01-02').candidates[0].dayGap, 3);
});
