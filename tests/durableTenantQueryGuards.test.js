import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const snapshots = readFileSync(new URL('../server/services/durableAccountSnapshots.js', import.meta.url), 'utf8');
const records = readFileSync(new URL('../server/services/durableAccountRecords.js', import.meta.url), 'utf8');
const deliveries = readFileSync(new URL('../server/services/b2bDelivery.js', import.meta.url), 'utf8');

test('snapshot reads and optimistic writes are scoped to account ID', () => {
  assert.match(snapshots, /WHERE account_id=\$1/);
  assert.match(snapshots, /WHERE account_id=\$1 AND revision=\$3/);
  assert.match(snapshots, /statusCode = 409/);
});
test('record lookup and idempotent inserts use composite tenant key', () => {
  assert.match(records, /PRIMARY KEY\(account_id,kind,record_key\)/);
  assert.match(records, /WHERE account_id=\$1 AND kind=\$2 AND record_key=\$3/);
  assert.match(records, /ON CONFLICT\(account_id,kind,record_key\) DO NOTHING/);
});
test('B2B deliveries require an active membership for payer visibility', () => {
  assert.match(deliveries, /m\.account_id=\$2 AND m\.entity_id=d\.\$\{column\}/);
  assert.match(deliveries, /m\.revoked_at IS NULL/);
  assert.match(deliveries, /m\.permission='payment_approve'/);
  assert.match(deliveries, /UNIQUE \(issuer_account_id, invoice_id\)/);
});
