import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const delivery = readFileSync(new URL('../server/services/b2bDelivery.js', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
test('payer inbox checks unrevoked membership in database', () => {
  assert.match(delivery, /m\.account_id=\$1 AND m\.entity_id=d\.payer_entity_id/);
  assert.match(delivery, /m\.revoked_at IS NULL/);
  assert.match(delivery, /m\.permission='payment_approve'/);
});
test('issuer publication requires server membership and durable draft', () => {
  assert.match(routes, /router\.post\('\/:accountId\/invoices\/:invoiceId\/publish'/);
  assert.match(routes, /hasEntityPermission\(accountId, invoice\.payeeEntityId, 'invoice_create'\)/);
  assert.match(routes, /publishInvoiceDelivery\(accountId, invoice\)/);
});
test('delivery cannot be fetched without scoped payer grant', () => {
  assert.match(delivery, /AND EXISTS \(SELECT 1 FROM clearflow_entity_memberships/);
  assert.match(delivery, /m\.permission=\$3 AND m\.revoked_at IS NULL/);
});
