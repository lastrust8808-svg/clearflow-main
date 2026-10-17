import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
test('invoice acceptance requires explicit consent and verified payer permission', () => {
  assert.match(route, /req\.body\?\.accepted !== true/);
  assert.match(route, /hasEntityPermission\(accountId, invoice\.payerEntityId, 'payment_approve'\)/);
});
test('invoice acceptance is idempotent and never represents a bank settlement', () => {
  assert.match(route, /createRecordOnce\(accountId, 'b2b_invoice_acceptance', invoiceId, acceptance\)/);
  assert.match(route, /accepted_not_paid/);
  assert.doesNotMatch(route, /bankTransfer\(|initiatePayment\(/);
});
