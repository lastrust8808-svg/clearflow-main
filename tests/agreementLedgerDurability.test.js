import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../server/services/clearflowInternalLedger.js', import.meta.url), 'utf8');
test('production agreement deposits cannot silently fall back to ephemeral JSON files', () => {
  assert.match(source, /if \(process\.env\.NODE_ENV === 'production'\) throw error;/);
  assert.match(source, /Durable platform agreement ledger database is required in production/);
});
