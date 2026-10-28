import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAccountAccess } from '../server/middleware/accountAuthorization.js';

function response() {
  return { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}
function request(accountId, token) {
  return { params: { accountId }, get(name) { return name === 'authorization' ? 'Bearer ' + token : ''; } };
}
async function verify(accountId, token) {
  const req = request(accountId, token), res = response();
  let allowed = false;
  await requireAccountAccess(req, res, () => { allowed = true; });
  return { allowed, res, req };
}

test('verified Google identity can access its own account, not another tenant', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const token = options.headers.Authorization.replace('Bearer ', '');
    const email = token === 'alice-token' ? 'alice@example.com' : 'bob@example.com';
    return { ok: true, json: async () => ({ email, email_verified: true, sub: 'mock-' + email }) };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal((await verify('google:alice@example.com', 'alice-token')).allowed, true);
  const denied = await verify('google:bob@example.com', 'alice-token');
  assert.equal(denied.allowed, false);
  assert.equal(denied.res.statusCode, 403);
  assert.equal((await verify('google:bob@example.com', 'bob-token')).allowed, true);
});

test('unverified Google email is denied even when account matches', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ email: 'alice@example.com', email_verified: false }) });
  t.after(() => { globalThis.fetch = originalFetch; });
  const denied = await verify('google:alice@example.com', 'alice-token');
  assert.equal(denied.allowed, false);
  assert.equal(denied.res.statusCode, 403);
});

test('identity provider errors fail closed', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const denied = await verify('google:alice@example.com', 'alice-token');
  assert.equal(denied.allowed, false);
  assert.equal(denied.res.statusCode, 503);
});
