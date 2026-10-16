import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('B2B invoice creation cannot trust client-asserted entity ownership', () => {
  const route = fs.readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
  assert.match(route, /Verified entity membership is required before invoice creation/);
  assert.match(route, /hasEntityPermission\(req\.params\.accountId, invoice\.payeeEntityId, 'invoice_create'\)/);
  assert.doesNotMatch(route, /ownerEntityId\s*!==\s*invoice\.payerEntityId/);
});
test('B2B account route enforces account authentication', () => {
  const route = fs.readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
  assert.match(route, /router\.use\('\/:accountId', requireAccountAccess\)/);
});
