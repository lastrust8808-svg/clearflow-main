import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
test('invoice dispute intake requires verified payer permission', () => {
  assert.match(route, /hasEntityPermission\(accountId, invoice\.payerEntityId, 'payment_approve'\)/);
  assert.match(route, /readRecord\(accountId, 'b2b_invoice_draft', invoiceId\)/);
});
test('disputes are immutable account-scoped records, not settlement evidence', () => {
  assert.match(route, /createRecordOnce\(accountId, 'b2b_invoice_dispute', disputeId, dispute\)/);
  assert.doesNotMatch(route, /settled:\s*true/);
});
