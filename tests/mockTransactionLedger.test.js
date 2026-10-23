import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockLedger } from '../server/testing/mockTransactionLedger.js';

test('mock settlement posts balanced transfers without external banking calls', () => {
  const ledger = createMockLedger({ alice: 10000, bob: 1000 });
  assert.equal(ledger.post({ id: 'payment-1', from: 'alice', to: 'bob', amountCents: 2500 }).status, 'settled');
  assert.equal(ledger.balance('alice'), 7500);
  assert.equal(ledger.balance('bob'), 3500);
  assert.equal(ledger.reconcile().balanced, true);
});

test('duplicate webhook delivery cannot post the same payment twice', () => {
  const ledger = createMockLedger({ alice: 10000, bob: 0 });
  const payment = { id: 'webhook-1', from: 'alice', to: 'bob', amountCents: 3000 };
  ledger.post(payment);
  assert.equal(ledger.post(payment).duplicate, true);
  assert.equal(ledger.balance('bob'), 3000);
  assert.equal(ledger.events().length, 1);
});

test('failed and pending transfers never move funds', () => {
  const ledger = createMockLedger({ alice: 100, bob: 0 });
  assert.equal(ledger.post({ id: 'insufficient', from: 'alice', to: 'bob', amountCents: 200 }).status, 'failed_insufficient_funds');
  assert.equal(ledger.post({ id: 'pending', from: 'alice', to: 'bob', amountCents: 50, outcome: 'pending' }).status, 'pending');
  assert.equal(ledger.post({ id: 'declined', from: 'alice', to: 'bob', amountCents: 50, outcome: 'failed' }).status, 'failed');
  assert.equal(ledger.balance('alice'), 100);
  assert.equal(ledger.reconcile().balanced, true);
});

test('mock simulator rejects invalid and negative amounts', () => {
  const ledger = createMockLedger({ alice: 100, bob: 0 });
  for (const amountCents of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => ledger.post({ id: 'bad', from: 'alice', to: 'bob', amountCents }));
  }
  assert.equal(ledger.events().length, 0);
});
