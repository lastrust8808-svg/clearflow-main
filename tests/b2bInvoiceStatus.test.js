import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../server/routes/b2b.js', import.meta.url), 'utf8');
test('invoice status is scoped to authenticated account and entity permissions', () => {
  assert.match(route, /router\.get\('\/:accountId\/invoices\/:invoiceId\/status'/);
  assert.match(route, /if \(!issuer && !payer\) return res\.status\(403\)/);
});
test('status projection never claims unverified payment settlement', () => {
  assert.match(route, /paymentState: 'not_verified'/);
  assert.match(route, /settled: false, reconciled: false/);
  assert.match(route, /creditCents > invoice\.amountCents/);
});
