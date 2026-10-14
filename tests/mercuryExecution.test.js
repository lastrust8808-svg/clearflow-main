import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMercuryAccount, resolveMercuryRecipient, queueMercuryPaymentApproval } from '../server/services/mercuryExecution.js';

const originalFetch = globalThis.fetch;
const originalToken = process.env.MERCURY_API_TOKEN;
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.MERCURY_API_TOKEN;
  else process.env.MERCURY_API_TOKEN = originalToken;
});

function mockMercury(accounts, recipients, onPayment = () => {}) {
  process.env.MERCURY_API_TOKEN = 'unit-test-token';
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/accounts')) return new Response(JSON.stringify({ accounts }), { status: 200 });
    if (pathname.endsWith('/recipients')) return new Response(JSON.stringify({ recipients }), { status: 200 });
    if (pathname.endsWith('/request-send-money')) {
      onPayment(init);
      return new Response(JSON.stringify({ id: 'approval-1' }), { status: 200 });
    }
    throw new Error('Unexpected Mercury request: ' + pathname);
  };
}

const account = { id: 'source-1', status: 'active', type: 'mercury', accountNumber: '123456789', routingNumber: '111000025', name: 'Operating' };
const recipient = { id: 'recipient-1', status: 'active', name: 'Supplier', contactEmail: 'supplier@example.com', electronicRoutingInfo: { routingNumber: '222000111', accountNumber: '987654321' } };

test('rejects a source matched by name only', async () => {
  mockMercury([account], [recipient]);
  await assert.rejects(resolveMercuryAccount({ accountName: 'Operating' }), /could not match/);
});

test('rejects a recipient matched by name or email only', async () => {
  mockMercury([account], [recipient]);
  await assert.rejects(resolveMercuryRecipient({ beneficiaryName: 'Supplier', remittanceEmail: 'supplier@example.com' }), /not yet matched/);
});

test('rejects ambiguous account numbers', async () => {
  mockMercury([account, { ...account, id: 'source-2' }], [recipient]);
  await assert.rejects(resolveMercuryAccount({ accountNumber: '123456789' }), /More than one/);
});

test('validates matching source and recipient without sending money', async () => {
  mockMercury([account], [recipient]);
  assert.equal((await resolveMercuryAccount({ accountNumber: '123456789' })).id, account.id);
  assert.equal((await resolveMercuryRecipient({ routingNumber: '222000111', accountNumber: '987654321' })).id, recipient.id);
});

test('payment request remains an approval request and uses idempotency', async () => {
  let captured;
  mockMercury([account], [recipient], init => { captured = JSON.parse(init.body); });
  await queueMercuryPaymentApproval({ settlementId: 'test-settlement', amount: 12.34, method: 'ach', sourceBankAccount: { accountNumber: '123456789' }, vendorInstruction: { routingNumber: '222000111', accountNumber: '987654321' } });
  assert.equal(captured.idempotencyKey, 'clearflow-test-settlement');
  assert.equal(captured.recipientId, 'recipient-1');
  assert.equal(captured.amount, 12.34);
});
