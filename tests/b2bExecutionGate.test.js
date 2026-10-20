import test from 'node:test';
import assert from 'node:assert/strict';
import { b2bPaymentMode, evaluateB2BExecution } from '../server/services/b2bExecutionGate.js';
const authorization = { approved: true, invoiceId: 'INV1', payerEntityId: 'PAYER', actorId: 'USER' };
const providerAdapter = { environment: 'sandbox', verified: true };
test('production and unknown modes fail closed', () => {
  for (const mode of ['live', 'enabled', 'production', '', 'disabled']) {
    assert.equal(b2bPaymentMode({ CLEARFLOW_B2B_PAYMENT_MODE: mode }), 'disabled');
    assert.equal(evaluateB2BExecution({ mode, authorization, providerAdapter }).allowed, false);
  }
});
test('sandbox requires explicit payer authorization', () => {
  assert.equal(evaluateB2BExecution({ mode: 'test', authorization: { approved: false }, providerAdapter }).allowed, false);
});
test('sandbox refuses unverified or live provider', () => {
  assert.equal(evaluateB2BExecution({ mode: 'test', authorization, providerAdapter: { environment: 'live', verified: true } }).allowed, false);
});
test('authorized sandbox permits simulation without moving money', () => {
  assert.deepEqual(evaluateB2BExecution({ mode: 'test', authorization, providerAdapter }),
    { allowed: true, simulationOnly: true, fundsMoved: false });
});
