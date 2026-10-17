import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const routes = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
test('payer actions use delivery-scoped lookup', () => {
  assert.ok(routes.includes("router.post('/:accountId/deliveries/:deliveryId/disputes'"));
  assert.ok(routes.includes("router.post('/:accountId/deliveries/:deliveryId/acceptances'"));
  assert.ok(routes.includes("getDeliveredInvoice(deliveryId, accountId, 'payer')"));
});
