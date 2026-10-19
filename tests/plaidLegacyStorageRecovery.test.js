import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../server/routes/plaid.js', import.meta.url), 'utf8');
test('missing legacy Plaid storage directory is handled without crashing', () => {
  assert.match(source, /accountDirectories\s*=\s*await readdir\(accountsRoot/);
  assert.match(source, /error\?\.code\s*===\s*'ENOENT'\)\s*return null/);
});
test('unexpected Plaid storage errors are not silently treated as empty', () => {
  assert.match(source, /if \(error\?\.code === 'ENOENT'\) return null;\s*throw error;/);
});
