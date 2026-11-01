import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';
import { commitAuthorizedBankFeedPage } from '../src/services/bankFeedAtomicCommit.service.ts';

const scope = () => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  allowedAccountIds: ['acct-a'],
});
const page = (cursor = null, nextCursor = 'cursor-1') => ({
  requestedCursor: cursor, nextCursor, hasMore: false,
  events: [{ kind: 'added', accountId: 'acct-a', transactionId: 'tx-1',
    amountCents: 1200, pending: false }],
});
const initial = () => ({
  checkpoint: { tenant_id: 'tenant-a', provider: 'plaid',
    connection_id: 'item-a', cursor: null, revision: '0' },
  entries: [],
});

function mockPg({ failWrite = false, failCommit = false, failCas = false, failBegin = false, failRollback = false } = {}) {
  const state = initial();
  const calls = [];
  let releases = 0;
  const releaseErrors = [];
  const pool = {
    async connect() {
      let working = null;
      return {
        async query(sql, values = []) {
          calls.push({ sql, values });
          if (sql === 'BEGIN') {
            if (failBegin) throw new Error('simulated BEGIN failure');
            working = structuredClone(state);
            return { rows: [], rowCount: null };
          }
          if (sql === 'ROLLBACK') {
            if (failRollback) throw new Error('simulated ROLLBACK failure');
            working = null;
            return { rows: [], rowCount: null };
          }
          if (sql === 'COMMIT') {
            if (failCommit) throw new Error('simulated commit failure');
            Object.assign(state, working);
            working = null;
            return { rows: [], rowCount: null };
          }
          if (!working) throw new Error('query outside transaction');
          if (/SELECT tenant_id, provider, connection_id, cursor/.test(sql)) {
            assert.match(sql, /tenant_id = \$1 AND provider = \$2 AND connection_id = \$3/);
            assert.match(sql, /FOR UPDATE/);
            const row = working.checkpoint;
            const matched = row.tenant_id === values[0] &&
              row.provider === values[1] && row.connection_id === values[2];
            return { rows: matched ? [structuredClone(row)] : [], rowCount: matched ? 1 : 0 };
          }
          if (/SELECT payload FROM/.test(sql)) {
            assert.match(sql, /account_id = ANY\(\$4::text\[\]\)/);
            const rows = working.entries.filter((entry) =>
              entry.tenantId === values[0] && entry.provider === values[1] &&
              entry.connectionId === values[2] && values[3].includes(entry.accountId)
            ).map((payload) => ({ payload: structuredClone(payload) }));
            return { rows, rowCount: rows.length };
          }
          if (/INSERT INTO public.clearflow_bank_feed_entries/.test(sql)) {
            if (failWrite) throw new Error('simulated entry write failure');
            assert.match(sql, /ON CONFLICT \(tenant_id, provider, connection_id, account_id, transaction_id\)/);
            const entry = JSON.parse(values[5]);
            assert.deepEqual(values.slice(0, 5), [
              entry.tenantId, entry.provider, entry.connectionId,
              entry.accountId, entry.transactionId,
            ]);
            const index = working.entries.findIndex((item) =>
              item.tenantId === entry.tenantId && item.provider === entry.provider &&
              item.connectionId === entry.connectionId && item.accountId === entry.accountId &&
              item.transactionId === entry.transactionId
            );
            if (index < 0) working.entries.push(entry);
            else working.entries[index] = entry;
            return { rows: [], rowCount: 1 };
          }
          if (/UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)) {
            assert.match(sql, /cursor IS NOT DISTINCT FROM \$6/);
            assert.match(sql, /revision = \$7/);
            const row = working.checkpoint;
            const matched = !failCas && row.tenant_id === values[0] &&
              row.provider === values[1] && row.connection_id === values[2] &&
              row.cursor === values[5] && Number(row.revision) === values[6];
            if (matched) {
              row.cursor = values[3];
              row.revision = String(values[4]);
            }
            return { rows: matched ? [{ revision: values[4] }] : [], rowCount: matched ? 1 : 0 };
          }
          throw new Error('Unexpected SQL: ' + sql);
        },
        release(error) { releases++; releaseErrors.push(error); },
      };
    },
  };
  return { pool, state, calls, get releases() { return releases; }, get releaseErrors() { return releaseErrors; } };
}

test('PostgreSQL adapter atomically persists scoped entries and cursor after COMMIT', async () => {
  const db = mockPg();
  const store = createBankFeedPostgresStore(db.pool);
  const result = await commitAuthorizedBankFeedPage(store, scope(), page());
  assert.equal(result.applied, 1);
  assert.equal(db.state.entries.length, 1);
  assert.equal(db.state.entries[0].transactionId, 'tx-1');
  assert.equal(db.state.checkpoint.cursor, 'cursor-1');
  assert.equal(db.state.checkpoint.revision, '1');
  assert.equal(db.calls.filter((call) => call.sql === 'COMMIT').length, 1);
  assert.equal(db.releases, 1);
  // A stale page cannot load historical entries or acknowledge its cursor.
  const readsBefore = db.calls.filter((call) => /SELECT payload FROM/.test(call.sql)).length;
  await assert.rejects(
    commitAuthorizedBankFeedPage(store, scope(), page()),
    /Stale feed cursor checkpoint/
  );
  assert.equal(db.calls.filter((call) => /SELECT payload FROM/.test(call.sql)).length, readsBefore);
  assert.equal(db.state.entries.length, 1);
  assert.equal(db.state.checkpoint.cursor, 'cursor-1');
  assert.equal(db.releases, 2);
});

test('PostgreSQL entry write, CAS and COMMIT failures never acknowledge a page', async () => {
  for (const [options, expected] of [
    [{ failWrite: true }, /simulated entry write failure/],
    [{ failCas: true }, /compare-and-swap failed/],
    [{ failCommit: true }, /simulated commit failure/],
  ]) {
    const db = mockPg(options);
    await assert.rejects(
      commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
      expected,
    );
    assert.deepEqual(db.state, initial(), 'failed transaction must not commit cursor or rows');
    assert.equal(db.calls.filter((call) => call.sql === 'ROLLBACK').length, 1);
    assert.equal(db.releases, 1);
  }
});

test('PostgreSQL adapter refuses cross-tenant checkpoint reads and out-of-scope entry writes', async () => {
  const db = mockPg();
  const store = createBankFeedPostgresStore(db.pool);
  await assert.rejects(
    commitAuthorizedBankFeedPage(store, { ...scope(), tenantId: 'tenant-b' }, page()),
    /outside the authorized connection scope/,
  );
  assert.equal(db.calls.filter((call) => /SELECT payload FROM/.test(call.sql)).length, 0);
  await assert.rejects(
    store.withTransaction(async (tx) => {
      await tx.saveEntries(scope(), [{
        tenantId: 'tenant-b', provider: 'plaid', connectionId: 'item-a',
        accountId: 'acct-a', transactionId: 'tx-forged',
      }]);
    }),
    /out-of-scope banking entry write/,
  );
  assert.equal(db.calls.filter((call) => /INSERT INTO/.test(call.sql)).length, 0);
  assert.deepEqual(db.state, initial());
  assert.equal(db.releases, 2);
});

test('PostgreSQL adapter rejects unsafe BIGINT checkpoint revisions', async () => {
  const db = mockPg();
  db.state.checkpoint.revision = '9007199254740992';
  await assert.rejects(
    commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
    /Unsafe persisted banking checkpoint revision/,
  );
  assert.equal(db.calls.filter((call) => /SELECT payload FROM/.test(call.sql)).length, 0);
  assert.equal(db.releases, 1);
});

test('PostgreSQL pool discards clients after uncertain BEGIN, COMMIT or ROLLBACK outcomes', async () => {
  for (const [options, expected, rollbackCount] of [
    [{ failBegin: true }, /simulated BEGIN failure/, 0],
    [{ failCommit: true }, /simulated commit failure/, 1],
    [{ failWrite: true, failRollback: true }, /simulated entry write failure/, 1],
  ]) {
    const db = mockPg(options);
    await assert.rejects(
      commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
      expected,
    );
    assert.equal(db.releases, 1, 'failed transaction must release exactly once');
    assert.ok(db.releaseErrors[0] instanceof Error,
      'uncertain connection must be discarded, not reused by pg pool');
    assert.match(db.releaseErrors[0].message, /uncertain transaction state/);
    assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, rollbackCount);
    assert.deepEqual(db.state, initial(), 'no failed transaction can acknowledge rows or cursor');
  }

  // Ordinary operation errors with successful rollback may safely reuse the client.
  const ordinary = mockPg({ failWrite: true });
  await assert.rejects(
    commitAuthorizedBankFeedPage(createBankFeedPostgresStore(ordinary.pool), scope(), page()),
    /simulated entry write failure/,
  );
  assert.equal(ordinary.releases, 1);
  assert.equal(ordinary.releaseErrors[0], undefined);
});
