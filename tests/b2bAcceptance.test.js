import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
const delivery = readFileSync(new URL('../server/services/b2bDelivery.js', import.meta.url), 'utf8');
test('invoice acceptance requires explicit consent and delivery-scoped verified payer permission', () => {
  assert.match(route, /req\.body\?\.accepted !== true/);
  assert.match(route, /getDeliveredInvoice\(deliveryId, accountId, 'payer'\)/);
  assert.match(delivery, /m\.permission=\$3 AND m\.revoked_at IS NULL/);
});
test('invoice acceptance is idempotent and never represents a bank settlement', () => {
  assert.match(route, /createRecordOnce\(accountId, 'b2b_delivery_acceptance', deliveryId, acceptance\)/);
  assert.match(route, /accepted_not_paid/);
  assert.doesNotMatch(route, /bankTransfer\(|initiatePayment\(/);
});
