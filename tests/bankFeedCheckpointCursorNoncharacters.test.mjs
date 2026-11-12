import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['acct-a'] };

function poolWithCheckpoint(cursor) {
  const calls = [];
  const pool = { async connect() {
    return { async query(sql) {
      calls.push(sql);
      if (sql.includes('SELECT tenant_id')) {
        return { rows: [{ tenant_id: 'tenant-a', provider: 'plaid', connection_id: 'item-a', cursor, revision: '1' }] };
      }
      return { rows: [], rowCount: 1 };
    }, release() {} };
  } };
  return { pool, calls };
}

test('persisted checkpoint cursor rejects Unicode noncharacters and rolls back', async () => {
  for (const cp of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF]) {
    const { pool, calls } = poolWithCheckpoint('cursor-' + String.fromCodePoint(cp));
    await assert.rejects(
      createBankFeedPostgresStore(pool).withTransaction(tx => tx.loadCheckpointForUpdate(scope)),
      /Invalid persisted banking checkpoint cursor/,
    );
    assert.equal(calls.at(-1), 'ROLLBACK');
  }
});

test('ordinary Unicode persisted checkpoint cursor remains readable', async () => {
  const { pool, calls } = poolWithCheckpoint('cursor-商店-🙂');
  const result = await createBankFeedPostgresStore(pool).withTransaction(tx => tx.loadCheckpointForUpdate(scope));
  assert.equal(result.cursor, 'cursor-商店-🙂');
  assert.equal(result.revision, 1);
  assert.equal(calls.at(-1), 'COMMIT');
});

test('persisted checkpoint cursor rejects unpaired UTF-16 surrogates before commit', async () => {
  for (const cursor of ['cursor-\\uD800', 'cursor-\\uDC00', '\\uD800cursor', 'cursor\\uDC00']) {
    const { pool, calls } = poolWithCheckpoint(cursor);
    await assert.rejects(
      createBankFeedPostgresStore(pool).withTransaction(tx => tx.loadCheckpointForUpdate(scope)),
      /Invalid persisted banking checkpoint cursor/,
    );
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.equal(calls.filter(sql => sql === 'COMMIT').length, 0);
  }
});
