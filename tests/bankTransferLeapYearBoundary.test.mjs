import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, postedDate) => ({
  tenantId: 'tenant-calendar', provider: 'plaid', connectionId: 'item-calendar',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate, status: 'posted', providerReference: 'transfer-calendar',
});
const review = (debitDate, creditDate) => proposeBankTransferCandidates({
  tenantId: 'tenant-calendar',
  transactions: [
    row('checking', 'debit', -2500, debitDate),
    row('savings', 'credit', 2500, creditDate),
  ],
});

test('leap-year February transfer matching counts actual calendar days', () => {
  const result = review('2028-02-28', '2028-03-02');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dayGap, 3);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(review('2028-02-28', '2028-03-03').candidates, []);
});

test('non-leap February boundary is validated without date rollover', () => {
  assert.equal(review('2027-02-28', '2027-03-03').candidates[0].dayGap, 3);
  assert.deepEqual(review('2027-02-28', '2027-03-04').candidates, []);
  for (const invalid of ['2027-02-29', '2028-02-30', '2028-13-01', '2028-00-01']) {
    assert.throws(() => review(invalid, '2028-03-01'), /Invalid transfer posting date/);
  }
});

test('calendar review results remain deterministic under reversed input order', () => {
  const input = [row('checking', 'debit', -2500, '2028-02-29'),
    row('savings', 'credit', 2500, '2028-03-03')];
  const plan = (transactions) => proposeBankTransferCandidates({
    tenantId: 'tenant-calendar', transactions,
  });
  assert.deepEqual(plan(input), plan([...input].reverse()));
  assert.equal(plan(input).candidates[0].dayGap, 3);
});
