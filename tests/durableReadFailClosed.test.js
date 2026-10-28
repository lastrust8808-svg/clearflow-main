import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../server/services/accountStorage.js', import.meta.url), 'utf8');

test('durable snapshot lookup is authoritative and does not fall through to local files', () => {
  assert.match(source, /return snapshot\?\.app_data \?\? null;/);
  assert.doesNotMatch(source, /if \(snapshot\) return snapshot\.app_data;/);
});
test('durable record lookup is authoritative for every vault category', () => {
  assert.equal((source.match(/return record \?\? null;/g) || []).length, 5);
  assert.doesNotMatch(source, /if \(record\) return record;/);
});
test('production refuses local file reads when durable database is missing', () => {
  assert.match(source, /if \(process\.env\.NODE_ENV === 'production'\) throw new Error\('Durable account database required in production\.'\);/);
  assert.equal((source.match(/if \(process\.env\.NODE_ENV === 'production'\) throw new Error\('Durable record database required in production\.'\);/g) || []).length, 5);
});
