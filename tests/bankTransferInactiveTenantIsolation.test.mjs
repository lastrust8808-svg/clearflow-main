import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (transactionId, accountId, amountCents, status = 'posted', tenantId = 'tenant-a') => ({
  tenantId, provider: 'mercury', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-19', status, providerReference: 'reference-a',
});

test('foreign-tenant pending evidence fails closed instead of influencing local review', () => {
  const local = [row('out', 'checking', -1900), row('in', 'savings', 1900)];
  const mixed = [...local, row('pending-foreign', 'other', 1900, 'pending', 'tenant-b')];
  const snapshot = structuredClone(mixed);
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: mixed }),
    /Invalid or unauthorized transfer source record/,
  );
  assert.deepEqual(mixed, snapshot);
  const clean = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: local });
  assert.equal(clean.candidates.length, 1);
  assert.deepEqual(clean.ambiguous, []);
});

test('foreign-tenant removed and superseded evidence is rejected even though inactive', () => {
  for (const status of ['removed', 'superseded']) {
    const mixed = [
      row('out', 'checking', -1900),
      row('in', 'savings', 1900),
      row('foreign-' + status, 'other', 1900, status, 'tenant-b'),
    ];
    assert.throws(
      () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: mixed }),
      /Invalid or unauthorized transfer source record/,
      status,
    );
  }
});
