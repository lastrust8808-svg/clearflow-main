import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { PlaidApi } from 'plaid';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('banking HTTP routes isolate two authenticated users and tolerate unavailable Auth', async t => {
  const originalFetch = globalThis.fetch;
  const originalCwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'clearflow-banking-'));
  const savedEnv = { ...process.env };
  process.chdir(directory);
  process.env.PLAID_CLIENT_ID = 'test';
  process.env.PLAID_SECRET = 'test';
  delete process.env.CLEARFLOW_STORAGE_DATABASE_URL;
  delete process.env.CLEARFLOW_OWNER_DATABASE_URL;
  const originals = new Map();
  const stub = (method, fn) => { originals.set(method, PlaidApi.prototype[method]); PlaidApi.prototype[method] = fn; };
  let authUnavailable = false, transactionsCalls = 0, linkRequest;
  stub('linkTokenCreate', async payload => { linkRequest = payload; return { data: { link_token: 'test-link' } }; });
  stub('itemPublicTokenExchange', async ({ public_token }) => ({ data: { item_id: public_token, access_token: 'secret-' + public_token } }));
  stub('accountsGet', async () => ({ data: { accounts: [{ account_id: 'bank-account', balances: {} }] } }));
  stub('authGet', async () => { if (authUnavailable) throw Object.assign(new Error('unsupported'), { response: { data: { error_code: 'PRODUCT_NOT_SUPPORTED' } } }); return { data: { accounts: [] } }; });
  stub('transactionsGet', async () => { transactionsCalls++; return { data: { transactions: [{ transaction_id: 'txn', amount: 25 }] } }; });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://openidconnect.googleapis.com/')) {
      const email = options.headers.Authorization.includes('alice') ? 'alice@example.com' : 'bob@example.com';
      return { ok: true, json: async () => ({ email, email_verified: true, sub: email }) };
    }
    return originalFetch(url, options);
  };
  const { default: router } = await import('../server/routes/plaid.js');
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const [method, fn] of originals) PlaidApi.prototype[method] = fn;
    globalThis.fetch = originalFetch; process.chdir(originalCwd);
    process.env = savedEnv; await rm(directory, { recursive: true, force: true });
  });
  const request = (user, route, body) => originalFetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${user}`, 'x-clearflow-account-id': `google:${user}@example.com`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request('alice', '/exchange_public_token', { userId: 'google:alice@example.com', public_token: 'alice-item' })).status, 200);
  const denied = await request('bob', '/transactions/alice-item');
  assert.equal(denied.status, 403);
  assert.equal(transactionsCalls, 0, 'foreign items must never reach the provider');
  assert.equal((await request('alice', '/transactions/alice-item')).status, 200);
  assert.equal(transactionsCalls, 1);
  assert.equal((await request('alice', '/link_token', { userId: 'google:alice@example.com' })).status, 200);
  assert.deepEqual(linkRequest.products, ['transactions']);
  assert.deepEqual(linkRequest.optional_products, ['auth']);
  authUnavailable = true;
  const investment = await request('alice', '/exchange_public_token', { userId: 'google:alice@example.com', public_token: 'investment-item' });
  assert.equal(investment.status, 200);
  const investmentPayload = await investment.json();
  assert.equal(investmentPayload.identityMatchScores.legal_name.score, 0, 'Unavailable bank identity must not match a self-entered name.');
  delete process.env.PLAID_SECRET;
  for (const [route, body] of [['/link_token', { userId: 'google:alice@example.com' }], ['/auth/get', { itemId: 'alice-item' }], ['/identity/get', { itemId: 'alice-item' }], ['/signal/evaluate', { itemId: 'alice-item' }]]) {
    assert.equal((await request('alice', route, body)).status, 503, route);
  }
});
