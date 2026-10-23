import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAccountAccess, requireInternalLedgerAuthorization } from '../server/middleware/accountAuthorization.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function request(accountId, authorization = '') {
  return { params: { accountId }, get(name) { return name === 'authorization' ? authorization : ''; } };
}

test('account storage refuses missing bearer authentication', async () => {
  for (const accountId of ['local:alice', 'google:alice@example.com', 'arbitrary']) {
    const res = response();
    let allowed = false;
    await requireAccountAccess(request(accountId), res, () => { allowed = true; });
    assert.equal(allowed, false);
    assert.equal(res.statusCode, 401);
  }
});

test('unknown account identifiers fail closed even with a bearer', async () => {
  const res = response();
  let allowed = false;
  await requireAccountAccess(request('arbitrary', 'Bearer example'), res, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
});

test('internal ledger ingestion refuses unauthenticated writes', () => {
  const res = response();
  requireInternalLedgerAuthorization({}, res);
  assert.equal(res.statusCode, 403);
});
