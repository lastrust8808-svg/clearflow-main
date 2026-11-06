import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

function scope() {
  return { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['acct-a'] };
}

test('banking scope rejects Unicode noncharacters on all SQL identity fields', async () => {
  for (const code of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF]) {
    for (const field of ['tenantId', 'connectionId', 'allowedAccountIds']) {
      const calls = [];
      const pool = { async connect() {
        return { async query(sql) { calls.push(sql); return { rows: [], rowCount: 0 }; }, release() {} };
      } };
      const bad = scope();
      const identifier = 'id-' + String.fromCodePoint(code);
      if (field === 'allowedAccountIds') bad.allowedAccountIds = [identifier];
      else bad[field] = identifier;
      await assert.rejects(
        createBankFeedPostgresStore(pool).withTransaction(tx => tx.loadCheckpointForUpdate(bad)),
        /Invalid authenticated banking scope/,
        field + ' U+' + code.toString(16),
      );
      assert.deepEqual(calls, ['BEGIN', 'ROLLBACK'], 'invalid identities must never reach scoped SQL');
    }
  }
});

test('ordinary Unicode scope identities still reach a parameterized scoped SELECT', async () => {
  const calls = [];
  const pool = { async connect() {
    return { async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }, release() {} };
  } };
  const good = { tenantId: 'équipe', provider: 'plaid', connectionId: '商店-一号', allowedAccountIds: ['🙂'] };
  const checkpoint = await createBankFeedPostgresStore(pool).withTransaction(
    tx => tx.loadCheckpointForUpdate(good),
  );
  assert.equal(checkpoint, null);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].params, ['équipe', 'plaid', '商店-一号']);
  assert.equal(calls[2].sql, 'COMMIT');
});
