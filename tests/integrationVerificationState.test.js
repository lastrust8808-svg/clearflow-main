import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server/routes/auth.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/integrationStatus.service.ts', import.meta.url), 'utf8');

test('public integration status does not equate credentials with successful provider connectivity', () => {
  for (const provider of ['plaid', 'smtp', 'sms']) {
    assert.match(server, new RegExp(provider + ": \\{ configured:"));
  }
  assert.match(server, /state: 'unverified'/);
  assert.doesNotMatch(server, /state: 'verified'/);
  assert.doesNotMatch(server, /state: 'connected'/);
});

test('client preserves explicit verification state and defaults legacy status to unverified', () => {
  assert.match(client, /ProviderVerificationState/);
  assert.match(client, /integrationStates\?\./);
  assert.match(client, /state: 'unverified'/);
});
