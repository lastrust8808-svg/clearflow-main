import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// Date.UTC treats years 0–99 specially. Verify the supported four-digit
// provider date range does not silently normalize an invalid year or day.
const tenantId = 'tenant-year-limits';
function review(firstDate, secondDate) {
  const row = (accountId, transactionId, amountCents, postedDate) => ({
    tenantId, provider: 'plaid', connectionId: 'year-limit-connection',
    accountId, transactionId, amountCents, currency: 'USD',
    postedDate, status: 'posted', providerReference: 'year-limit-reference',
  });
  return proposeBankTransferCandidates({
    tenantId,
    transactions: [
      row('checking', 'outgoing', -2500, firstDate),
      row('savings', 'incoming', 2500, secondDate),
    ],
  });
}

test('supported lower and upper Gregorian years retain exact calendar day gaps', () => {
  for (const [start, end] of [
    ['0100-01-01', '0100-01-04'],
    ['9999-12-28', '9999-12-31'],
  ]) {
    const result = review(start, end);
    assert.equal(result.candidates.length, 1, start);
    assert.equal(result.candidates[0].dayGap, 3, start);
    assert.deepEqual(result.ambiguous, [], start);
  }
});

test('out-of-range and non-leap-century dates fail closed', () => {
  for (const invalid of ['0000-12-31', '0099-12-31', '1900-02-29', '9999-02-29', '10000-01-01']) {
    assert.throws(() => review(invalid, '2000-01-01'), /Invalid transfer posting date/, invalid);
  }
  const leapCentury = review('2000-02-28', '2000-03-02');
  assert.equal(leapCentury.candidates.length, 1);
  assert.equal(leapCentury.candidates[0].dayGap, 3);
});
