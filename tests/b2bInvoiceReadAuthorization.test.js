import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
test('invoice detail GET rechecks unrevoked entity membership', () => {
  const start = route.indexOf("router.get('/:accountId/invoices/:invoiceId'");
  const end = route.indexOf("const ID =", start);
  const detail = route.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(detail, /hasEntityPermission\(req\.params\.accountId, invoice\.payeeEntityId, 'invoice_create'\)/);
  assert.match(detail, /hasEntityPermission\(req\.params\.accountId, invoice\.payerEntityId, 'payment_approve'\)/);
  assert.match(detail, /if \(!issuer && !payer\) return res\.status\(403\)/);
});
