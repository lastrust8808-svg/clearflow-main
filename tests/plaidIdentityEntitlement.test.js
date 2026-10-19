import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plaid = readFileSync(new URL('../server/routes/plaid.js', import.meta.url), 'utf8');
const fn = plaid.slice(plaid.indexOf('async function getIdentityDataOrFallback('), plaid.indexOf("\nrouter.post('/link_token'"));
test('Plaid Identity is opt-in only', () => {
  assert.match(fn, /CLEARFLOW_PLAID_IDENTITY_ENABLED !== 'true'/);
});
test('unentitled Plaid Identity never returns inferred verified ownership', () => {
  assert.doesNotMatch(fn, /buildMockIdentity/);
  assert.match(fn, /identityAvailable: false/);
  assert.match(fn, /accounts: \[\]/);
});
