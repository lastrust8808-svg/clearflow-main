import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockLedger } from '../server/testing/mockTransactionLedger.js';

test('mock ledger rejects same-party and malformed counterparties', () => {
  const ledger = createMockLedger({ alice: 10000 });
  for (const [from, to] of [['alice', 'alice'], ['', 'bob'], ['alice', '']]) {
    assert.throws(() => ledger.post({ id: 'invalid', from, to, amountCents: 100 }), /counterparties/);
  }
  assert.equal(ledger.events().length, 0);
});

test('mock ledger preserves isolation of unrelated entity balances', () => {
  const ledger = createMockLedger({ alice: 10000, bob: 500, charlie: 800 });
  ledger.post({ id: 'transfer-1', from: 'alice', to: 'bob', amountCents: 300 });
  assert.equal(ledger.balance('charlie'), 800);
  assert.equal(ledger.reconcile().balanced, true);
});

test('duplicate event with conflicting payload does not move funds twice', () => {
  const ledger = createMockLedger({ alice: 10000, bob: 0, charlie: 0 });
  ledger.post({ id: 'event-1', from: 'alice', to: 'bob', amountCents: 100 });
  assert.throws(() => ledger.post({ id: 'event-1', from: 'alice', to: 'charlie', amountCents: 500 }), /Conflicting duplicate/);
  assert.equal(ledger.balance('alice'), 9900);
  assert.equal(ledger.balance('bob'), 100);
  assert.equal(ledger.balance('charlie'), 0);
  assert.equal(ledger.events().length, 1);
});
