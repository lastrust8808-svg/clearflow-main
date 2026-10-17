import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAccountAccess, requireInternalLedgerAuthorization } from '../server/middleware/accountAuthorization.js';

function response() {
  return {
    code: null, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
test('storage denies missing bearer token', async () => {
  const res = response();
  await requireAccountAccess({ params: { accountId: 'google:user@example.com' }, get: () => '' }, res, () => assert.fail('must not authorize'));
  assert.equal(res.code, 401);
});
test('storage rejects unsupported local account IDs pending migration', async () => {
  const res = response();
  await requireAccountAccess({ params: { accountId: 'local-user' }, get: () => 'Bearer fake' }, res, () => assert.fail('must not authorize'));
  assert.equal(res.code, 403);
});
test('internal ledger ingestion denies browser requests', () => {
  const res = response();
  requireInternalLedgerAuthorization({}, res);
  assert.equal(res.code, 403);
});

test('storage rejects a valid Google identity for another tenant', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ sub: 'google-sub-1', email_verified: true, email: 'other@example.com' }),
  });
  try {
    const res = response();
    await requireAccountAccess(
      { params: { accountId: 'google:owner@example.com' }, get: () => 'Bearer example-token' },
      res,
      () => assert.fail('cross-tenant access must be denied'),
    );
    assert.equal(res.code, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('storage permits a matching verified Google identity', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ sub: 'google-sub-1', email_verified: true, email: 'owner@example.com' }),
  });
  try {
    const res = response();
    let allowed = false;
    await requireAccountAccess(
      { params: { accountId: 'google:owner@example.com' }, get: () => 'Bearer example-token' },
      res,
      () => { allowed = true; },
    );
    assert.equal(allowed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
