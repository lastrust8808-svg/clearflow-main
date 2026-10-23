import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockB2BWorkflow } from '../server/testing/mockB2BWorkflow.js';
const invoice = { id: 'invoice1', payerEntityId: 'payer', payeeEntityId: 'vendor', amount: 25.50, currency: 'USD' };

test('invoice approval and mock ACH settlement reconcile without provider execution', () => {
  const workflow = createMockB2BWorkflow({ payer: 5000, vendor: 0 });
  workflow.createInvoice(invoice);
  assert.throws(() => workflow.settle(invoice.id), /approval/);
  const instruction = workflow.approve(invoice.id, 'payer-operator');
  assert.equal(instruction.providerExecutionPermitted, false);
  assert.equal(instruction.settled, false);
  assert.equal(workflow.settle(invoice.id).status, 'settled');
  assert.equal(workflow.ledger.balance('payer'), 2450);
  assert.equal(workflow.ledger.balance('vendor'), 2550);
  assert.deepEqual(workflow.mockStatus(invoice.id), { invoiceId: invoice.id,
    simulated: true, paymentState: 'settled', settled: true, reconciled: true });
  assert.equal(workflow.status(invoice.id).settled, false);
});

test('mock workflow rejects duplicate invoice and idempotently handles duplicate settlement', () => {
  const workflow = createMockB2BWorkflow({ payer: 5000, vendor: 0 });
  workflow.createInvoice(invoice);
  assert.throws(() => workflow.createInvoice(invoice), /Duplicate/);
  workflow.approve(invoice.id, 'operator');
  workflow.settle(invoice.id);
  assert.equal(workflow.settle(invoice.id).duplicate, true);
  assert.equal(workflow.ledger.balance('vendor'), 2550);
});

test('mock failed transfer does not imply payment or bank confirmation', () => {
  const workflow = createMockB2BWorkflow({ payer: 100, vendor: 0 });
  workflow.createInvoice(invoice);
  workflow.approve(invoice.id, 'operator');
  assert.equal(workflow.settle(invoice.id).status, 'failed_insufficient_funds');
  assert.equal(workflow.mockStatus(invoice.id).settled, false);
  assert.equal(workflow.status(invoice.id).settled, false);
});
