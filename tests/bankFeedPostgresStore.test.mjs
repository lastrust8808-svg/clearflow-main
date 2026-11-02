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

function mockPg({ failWrite = false, failCommit = false, failCas = false, failBegin = false, failRollback = false, tamperReadPayload = null, tamperCheckpointRow = null } = {}) {
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
            return { rows: matched ? [{ ...structuredClone(row), ...tamperCheckpointRow }] : [], rowCount: matched ? 1 : 0 };
          }
          if (/SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(sql)) {
            assert.match(sql, /account_id = ANY\(\$4::text\[\]\)/);
            const rows = working.entries.filter((entry) =>
              entry.tenantId === values[0] && entry.provider === values[1] &&
              entry.connectionId === values[2] && values[3].includes(entry.accountId)
            ).map((entry) => ({
              tenant_id: entry.tenantId,
              provider: entry.provider,
              connection_id: entry.connectionId,
              account_id: entry.accountId,
              transaction_id: entry.transactionId,
              payload: { ...structuredClone(entry), ...tamperReadPayload },
            }));
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
  const readsBefore = db.calls.filter((call) => /SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(call.sql)).length;
  await assert.rejects(
    commitAuthorizedBankFeedPage(store, scope(), page()),
    /Stale feed cursor checkpoint/
  );
  assert.equal(db.calls.filter((call) => /SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(call.sql)).length, readsBefore);
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
  assert.equal(db.calls.filter((call) => /SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(call.sql)).length, 0);
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

test('PostgreSQL adapter rejects mismatched persisted checkpoint identities before history reads', async () => {
  for (const field of ['tenant_id', 'provider', 'connection_id']) {
    const db = mockPg({ tamperCheckpointRow: { [field]: 'forged-scope' } });
    const store = createBankFeedPostgresStore(db.pool);
    await assert.rejects(
      store.withTransaction((tx) => tx.loadCheckpointForUpdate(scope())),
      /Persisted banking checkpoint identity does not match authorized scope/,
      field,
    );
    assert.equal(db.calls.filter(({ sql }) => sql.includes('FOR UPDATE')).length, 1);
    assert.equal(db.calls.filter(({ sql }) =>
      /SELECT tenant_id, provider, connection_id, account_id|INSERT INTO|UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)
    ).length, 0, 'foreign checkpoint must not read entries, write rows or advance cursor');
    assert.deepEqual(db.state, initial(), 'rejected checkpoint must preserve database state');
    assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
    assert.equal(db.releases, 1);
    assert.equal(db.releaseErrors[0], undefined, 'successful rollback safely releases the connection');
  }

  const valid = mockPg();
  const checkpoint = await createBankFeedPostgresStore(valid.pool).withTransaction(
    (tx) => tx.loadCheckpointForUpdate(scope()),
  );
  assert.deepEqual(checkpoint, {
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    cursor: null, revision: 0,
  });
});

test('PostgreSQL checkpoint CAS snapshots scope and rejects executable or mutable evidence', async () => {
  const checkpoint = (cursor, revision) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    cursor, revision,
  });
  // A malicious getter could previously mutate scope after the first
  // validation but before the second params(scope) call in the UPDATE.
  const mutableScope = scope();
  const poisonedPrevious = checkpoint(null, 0);
  Object.defineProperty(poisonedPrevious, 'tenantId', {
    enumerable: true,
    get() {
      mutableScope.tenantId = 'tenant-b';
      return 'tenant-b';
    },
  });
  const poisonedNext = checkpoint('cursor-1', 1);
  Object.defineProperty(poisonedNext, 'cursor', {
    enumerable: true,
    get() { throw new Error('checkpoint getter must not execute'); },
  });
  for (const [inputScope, previous, next] of [
    [mutableScope, poisonedPrevious, checkpoint('cursor-1', 1)],
    [scope(), checkpoint(null, 0), poisonedNext],
    [scope(), checkpoint(null, 0), new Proxy(checkpoint('cursor-1', 1), {})],
  ]) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.compareAndSwapCheckpoint(inputScope, previous, next)),
      /Refusing out-of-scope banking checkpoint update/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'invalid checkpoint evidence must not issue UPDATE');
    assert.deepEqual(db.state, initial());
    assert.equal(db.releases, 1);
  }
  assert.equal(mutableScope.tenantId, 'tenant-a',
    'checkpoint getter must not execute or retarget authorization');

  const valid = mockPg();
  const updated = await createBankFeedPostgresStore(valid.pool).withTransaction(
    (tx) => tx.compareAndSwapCheckpoint(
      scope(), checkpoint(null, 0), checkpoint('cursor-1', 1)),
  );
  assert.equal(updated, true, 'ordinary authorized checkpoint CAS still works');
  assert.equal(valid.state.checkpoint.cursor, 'cursor-1');
  assert.equal(valid.state.checkpoint.revision, '1');
});

test('PostgreSQL adapter rejects unsafe BIGINT checkpoint revisions', async () => {
  const db = mockPg();
  db.state.checkpoint.revision = '9007199254740992';
  await assert.rejects(
    commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
    /Unsafe persisted banking checkpoint revision/,
  );
  assert.equal(db.calls.filter((call) => /SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(call.sql)).length, 0);
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

test('PostgreSQL adapter rejects persisted JSONB identities that disagree with scoped SQL keys', async () => {
  for (const field of ['tenantId', 'provider', 'connectionId', 'accountId', 'transactionId']) {
    const db = mockPg({ tamperReadPayload: { [field]: 'forged-identity' } });
    db.state.entries.push({
      tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
      accountId: 'acct-a', transactionId: 'tx-legacy', amountCents: 500,
      status: 'posted', requiresReview: true,
    });
    const before = structuredClone(db.state);
    await assert.rejects(
      commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
      /Persisted banking entry identity does not match its scoped database key/,
      field,
    );
    assert.deepEqual(db.state, before, 'corrupt historical evidence must not advance cursor');
    assert.equal(db.calls.filter(({ sql }) => /INSERT INTO|UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)).length, 0);
    assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
    assert.equal(db.releases, 1);
    assert.equal(db.releaseErrors[0], undefined, 'successful rollback permits safe pool reuse');
  }

  // Matching composite-key identities remain readable and process normally.
  const valid = mockPg();
  valid.state.entries.push({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId: 'tx-legacy', amountCents: 500,
    status: 'posted', requiresReview: true,
  });
  const result = await commitAuthorizedBankFeedPage(
    createBankFeedPostgresStore(valid.pool), scope(), page(),
  );
  assert.equal(result.applied, 1);
  assert.equal(valid.state.entries.length, 2);
  assert.equal(valid.state.checkpoint.cursor, 'cursor-1');
});


test('PostgreSQL adapter independently rejects ambiguous authorization scopes before scoped SQL', async () => {
  const invalidScopes = [
    { ...scope(), tenantId: 42 },
    { ...scope(), tenantId: ' tenant-a' },
    { ...scope(), tenantId: 'tenant-a\\u200b'.replace('\\u200b', '\u200b') },
    { ...scope(), connectionId: { toString: () => 'item-a' } },
    { ...scope(), connectionId: 'item-a\\n'.replace('\\n', '\n') },
    { ...scope(), connectionId: 'x'.repeat(257) },
    { ...scope(), allowedAccountIds: [7] },
    { ...scope(), allowedAccountIds: ['acct-a', 'acct-a'] },
    { ...scope(), allowedAccountIds: [' acct-a'] },
    { ...scope(), allowedAccountIds: ['acct-a\\u202e'.replace('\\u202e', '\u202e')] },
    { ...scope(), allowedAccountIds: ['x'.repeat(257)] },
    { ...scope(), provider: 'unknown' },
    { ...scope(), tenantId: 'tenant-' + String.fromCharCode(0xD800) },
  ];
  for (const badScope of invalidScopes) {
    const db = mockPg();
    const store = createBankFeedPostgresStore(db.pool);
    await assert.rejects(
      store.withTransaction((tx) => tx.loadCheckpointForUpdate(badScope)),
      /Invalid authenticated banking scope/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'invalid authorization must never issue scoped SELECT/UPDATE SQL');
    assert.deepEqual(db.state, initial(), 'rejected scope must preserve banking state');
    assert.equal(db.releases, 1);
  }

  // A direct store caller must not bypass this check through the write path.
  const db = mockPg();
  await assert.rejects(
    createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
      tx.saveEntries({ ...scope(), tenantId: 1 }, [])),
    /Invalid authenticated banking scope/,
  );
  assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(db.state, initial());
});

test('PostgreSQL adapter preflights duplicate, malformed and rewritten entry identities before SQL', async () => {
  const valid = (transactionId, amountCents = 1200) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents,
    status: 'posted', requiresReview: true,
  });
  const rewritten = valid('tx-original');
  rewritten.toJSON = () => valid('tx-rewritten');

  for (const [entries, expected] of [
    [[valid('tx-duplicate', 100), valid('tx-duplicate', 200)], /Duplicate banking entry identity/],
    [[valid('tx-valid'), valid(' tx-padded')], /out-of-scope banking entry write/],
    [[valid('tx-valid'), valid(7)], /out-of-scope banking entry write/],
    [[valid('tx-valid'), rewritten], /non-JSON banking entry/],
  ]) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) => tx.saveEntries(scope(), entries)),
      expected,
    );
    assert.equal(db.calls.filter(({ sql }) => /INSERT INTO/.test(sql)).length, 0,
      'the entire batch must be rejected before the first financial INSERT');
    assert.deepEqual(db.state, initial(), 'rejected batches must preserve banking records');
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK']);
  }

  // Distinct authorized identities still persist and commit as expected.
  const db = mockPg();
  await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.saveEntries(scope(), [valid('tx-one'), valid('tx-two')]));
  assert.deepEqual(db.state.entries.map(({ transactionId }) => transactionId), ['tx-one', 'tx-two']);
  assert.equal(db.calls.filter(({ sql }) => /INSERT INTO/.test(sql)).length, 2);
});


test('PostgreSQL adapter rejects malformed persisted and proposed cursors before financial SQL', async () => {
  for (const badCursor of [42, '', ' padded', 'cursor\\n'.replace('\\n', '\n'), 'x'.repeat(4097)]) {
    const db = mockPg();
    db.state.checkpoint.cursor = badCursor;
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.loadCheckpointForUpdate(scope())),
      /Invalid persisted banking checkpoint cursor/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql).filter((sql) => /SELECT|UPDATE|INSERT/.test(sql))
      .map((sql) => sql.includes('FOR UPDATE') ? 'checkpoint SELECT' : sql),
      ['checkpoint SELECT'], 'bad persisted cursor must not trigger historical reads or writes');
    assert.deepEqual(db.state.entries, []);
    assert.equal(db.state.checkpoint.cursor, badCursor);
  }

  const previous = {
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    cursor: null, revision: 0,
  };
  for (const [prior, next] of [
    [previous, { ...previous, cursor: 123, revision: 1 }],
    [previous, { ...previous, cursor: '', revision: 1 }],
    [previous, { ...previous, cursor: ' padded', revision: 1 }],
    [previous, { ...previous, cursor: 'x'.repeat(4097), revision: 1 }],
    // Direct adapter callers must not inflate revisions on terminal no-op polls.
    [previous, { ...previous, cursor: null, revision: 1 }],
    [{ ...previous, cursor: 'cursor-1', revision: 4 },
      { ...previous, cursor: 'cursor-1', revision: 5 }],
    [{ ...previous, cursor: 'invalid\\u200b'.replace('\\u200b', '\u200b') },
      { ...previous, cursor: 'cursor-1', revision: 1 }],
    [{ ...previous, revision: -1 }, { ...previous, cursor: 'cursor-1', revision: 0 }],
    [null, { ...previous, cursor: 'cursor-1', revision: 1 }],
    [previous, null],
  ]) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.compareAndSwapCheckpoint(scope(), prior, next)),
      /Refusing out-of-scope banking checkpoint update/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'invalid cursor/revision must be rejected before any checkpoint UPDATE');
    assert.deepEqual(db.state, initial());
  }

  const db = mockPg();
  const success = await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.compareAndSwapCheckpoint(scope(), previous, {
      ...previous, cursor: 'cursor-1', revision: 1,
    }));
  assert.equal(success, true);
  assert.equal(db.state.checkpoint.cursor, 'cursor-1');
  assert.equal(db.state.checkpoint.revision, '1');
});

test('PostgreSQL adapter refuses lossy or executable JSONB evidence before any batch INSERT', async () => {
  const valid = (transactionId) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents: 1200,
    details: { posted: true, adjustments: [1.25, 2] },
  });
  const getter = valid('tx-getter');
  Object.defineProperty(getter.details, 'amount', {
    enumerable: true, get() { throw new Error('getter must never execute'); },
  });
  const customSerializer = valid('tx-tojson');
  customSerializer.details.toJSON = () => ({ amount: 999999 });
  const sparse = valid('tx-sparse');
  sparse.details.adjustments = [, 1];
  const cycle = valid('tx-cycle');
  cycle.details.self = cycle.details;
  const hidden = valid('tx-hidden');
  Object.defineProperty(hidden.details, 'hidden', { value: 'lost', enumerable: false });
  const poisoned = valid('tx-poison');
  Object.defineProperty(poisoned.details, '__proto__', {
    value: { admin: true }, enumerable: true,
  });
  const invalid = [
    { ...valid('tx-nan'), amountCents: NaN },
    { ...valid('tx-infinity'), amountCents: Infinity },
    { ...valid('tx-precision'), amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid('tx-negative-zero'), amountCents: -0 },
    { ...valid('tx-undefined'), details: { amount: undefined } },
    { ...valid('tx-date'), details: { posted: new Date() } },
    getter, customSerializer, sparse, cycle, hidden, poisoned,
    { ...valid('tx-proxy'), details: new Proxy({ amount: 12 }, {}) },
  ];
  for (const entry of invalid) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.saveEntries(scope(), [valid('tx-first'), entry])),
      /Refusing non-JSON banking entry write/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'a rejected later entry must prevent all earlier INSERTs');
    assert.deepEqual(db.state, initial());
  }

  const db = mockPg();
  await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.saveEntries(scope(), [valid('tx-safe'), valid('tx-other')]));
  assert.equal(db.state.entries.length, 2);
  assert.deepEqual(db.state.entries[0].details.adjustments, [1.25, 2]);
});


test('PostgreSQL adapter rejects malformed Unicode evidence before any batch INSERT', async () => {
  const broken = String.fromCharCode(0xD800);
  const valid = (transactionId) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents: 1200,
    memo: 'café / 東京 / 🏦',
  });
  for (const corrupted of [
    { ...valid('tx-bad-value'), memo: 'memo-' + broken },
    { ...valid('tx-bad-key'), ['memo-' + broken]: 'bad' },
    { ...valid('tx-bad-nested'), details: [{ note: broken }] },
  ]) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.saveEntries(scope(), [valid('tx-good-first'), corrupted])),
      /Refusing non-JSON banking entry write/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'malformed Unicode must reject the entire batch before INSERT');
    assert.deepEqual(db.state, initial());
  }
  const db = mockPg();
  await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.saveEntries(scope(), [valid('tx-valid-unicode')]));
  assert.equal(db.state.entries[0].memo, 'café / 東京 / 🏦');
});

test('PostgreSQL adapter rejects malformed persisted Unicode before advancing a cursor', async () => {
  const broken = String.fromCharCode(0xD800);
  for (const tamperReadPayload of [
    { memo: broken },
    { ['memo-' + broken]: 'bad' },
  ]) {
    const db = mockPg({ tamperReadPayload });
    db.state.entries.push({
      tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
      accountId: 'acct-a', transactionId: 'tx-legacy', amountCents: 500,
      status: 'posted', requiresReview: true,
    });
    const before = structuredClone(db.state);
    await assert.rejects(
      commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
      /Malformed Unicode banking evidence/,
    );
    assert.deepEqual(db.state, before);
    assert.equal(db.calls.filter(({ sql }) => /INSERT INTO|UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)).length, 0);
    assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
  }
});


test('PostgreSQL adapter rejects oversized JSONB entries and batches before any financial INSERT', async () => {
  const entry = (transactionId, memo) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents: 1200,
    status: 'posted', requiresReview: true, memo,
  });
  const cases = [
    [entry('tx-first', 'valid'), entry('tx-oversized', 'x'.repeat(1024 * 1024))],
    Array.from({ length: 18 }, (_, index) =>
      entry('tx-' + index, 'x'.repeat(960 * 1024))),
  ];
  for (const entries of cases) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.saveEntries(scope(), entries)),
      /Refusing oversized banking (entry|batch) write/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'no financial INSERT may occur when any entry or total batch exceeds budget');
    assert.deepEqual(db.state, initial(), 'rejected page must not persist any evidence');
    assert.equal(db.releases, 1);
  }

  const db = mockPg();
  await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.saveEntries(scope(), [entry('tx-small', 'café / 東京')]));
  assert.equal(db.state.entries.length, 1, 'ordinary records remain writable');
});

test('PostgreSQL adapter refuses oversized persisted JSONB before cursor advancement', async () => {
  const db = mockPg();
  db.state.entries.push({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId: 'tx-legacy', amountCents: 500,
    status: 'posted', requiresReview: true, memo: 'x'.repeat(1024 * 1024),
  });
  const before = structuredClone(db.state);
  await assert.rejects(
    commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
    /Oversized persisted banking entry evidence/,
  );
  assert.deepEqual(db.state, before, 'oversized historical evidence must not advance cursor');
  assert.equal(db.calls.filter(({ sql }) =>
    /INSERT INTO|UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)).length, 0);
  assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
});


test('PostgreSQL batch INSERTs retain the originally authorized scope across asynchronous queries', async () => {
  const db = mockPg();
  const mutableScope = scope();
  const entry = (transactionId) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents: 1200,
    status: 'posted', requiresReview: false,
  });
  const originalConnect = db.pool.connect.bind(db.pool);
  let mutated = false;
  db.pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, values) => {
      const result = await originalQuery(sql, values);
      if (!mutated && /INSERT INTO public.clearflow_bank_feed_entries/.test(sql)) {
        mutated = true;
        // Another async caller changes the same object after the first INSERT.
        mutableScope.tenantId = 'tenant-other';
        mutableScope.connectionId = 'item-other';
        mutableScope.allowedAccountIds.splice(0, 1, 'acct-other');
      }
      return result;
    };
    return client;
  };
  await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.saveEntries(mutableScope, [entry('tx-first'), entry('tx-second')]));
  assert.equal(mutated, true);
  assert.equal(db.state.entries.length, 2);
  assert.deepEqual(db.state.entries.map((row) => row.transactionId), ['tx-first', 'tx-second']);
  const inserts = db.calls.filter(({ sql }) => /INSERT INTO public.clearflow_bank_feed_entries/.test(sql));
  assert.equal(inserts.length, 2);
  for (const { values } of inserts) {
    assert.deepEqual(values.slice(0, 5).slice(0, 3), ['tenant-a', 'plaid', 'item-a']);
    assert.equal(values[3], 'acct-a');
  }
});

test('PostgreSQL historical entry reads validate against the original scope after query awaits', async () => {
  const db = mockPg();
  db.state.entries.push({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId: 'tx-existing',
    amountCents: 500, status: 'posted', requiresReview: false,
  });
  const mutableScope = scope();
  const originalConnect = db.pool.connect.bind(db.pool);
  let mutated = false;
  db.pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, values) => {
      const result = await originalQuery(sql, values);
      if (/SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(sql)) {
        mutated = true;
        mutableScope.tenantId = 'tenant-other';
        mutableScope.connectionId = 'item-other';
        mutableScope.allowedAccountIds.splice(0, 1, 'acct-other');
      }
      return result;
    };
    return client;
  };
  const entries = await createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
    tx.loadEntries(mutableScope));
  assert.equal(mutated, true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].transactionId, 'tx-existing');
  assert.deepEqual(db.calls.find(({ sql }) => /SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload/.test(sql)).values,
    ['tenant-a', 'plaid', 'item-a', ['acct-a']]);
});

test('PostgreSQL scope getters and sparse account grants fail before scoped SQL', async () => {
  const entry = {
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId: 'tx-1', amountCents: 100,
  };
  let getterCalls = 0;
  const accessorScope = scope();
  Object.defineProperty(accessorScope, 'tenantId', {
    enumerable: true, get() { getterCalls++; return 'tenant-a'; },
  });
  const sparseScope = { ...scope(), allowedAccountIds: Array(1) };
  const proxyScope = new Proxy(scope(), { get() { throw new Error('scope trap executed'); } });
  for (const invalid of [accessorScope, sparseScope, proxyScope]) {
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.saveEntries(invalid, [entry])),
      /Invalid authenticated banking scope/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(db.state, initial());
  }
  assert.equal(getterCalls, 0, 'scope getters must never execute');
});

test('PostgreSQL adapter preflights entry identity descriptors before any getter or Proxy trap', async () => {
  const valid = (transactionId) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents: 1200,
  });
  let getterCalls = 0;
  for (const field of ['tenantId', 'provider', 'connectionId', 'accountId', 'transactionId']) {
    const unsafe = valid('tx-unsafe');
    Object.defineProperty(unsafe, field, {
      enumerable: true,
      get() {
        getterCalls++;
        throw new Error('untrusted banking identity getter executed');
      },
    });
    const db = mockPg();
    await assert.rejects(
      createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
        tx.saveEntries(scope(), [valid('tx-safe-first'), unsafe])),
      /Refusing non-JSON banking entry write/,
    );
    assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
      'a later unsafe identity must reject the whole batch before INSERT');
    assert.deepEqual(db.state, initial());
  }
  const proxied = new Proxy(valid('tx-proxy'), {
    get() {
      getterCalls++;
      throw new Error('untrusted banking Proxy trap executed');
    },
  });
  const db = mockPg();
  await assert.rejects(
    createBankFeedPostgresStore(db.pool).withTransaction((tx) =>
      tx.saveEntries(scope(), [valid('tx-safe-first'), proxied])),
    /Refusing non-JSON banking entry write/,
  );
  assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(db.state, initial());
  assert.equal(getterCalls, 0, 'no untrusted entry getter or Proxy trap may execute');

  const normal = mockPg();
  await createBankFeedPostgresStore(normal.pool).withTransaction((tx) =>
    tx.saveEntries(scope(), [valid('tx-ordinary')]));
  assert.deepEqual(normal.state.entries.map(({ transactionId }) => transactionId), ['tx-ordinary']);
});


test('PostgreSQL adapter rejects inherited JSON serializers before banking evidence is rewritten', async () => {
  const entry = (transactionId) => ({
    tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
    accountId: 'acct-a', transactionId, amountCents: 1250,
    details: { tags: ['verified'] },
  });
  for (const prototype of [Object.prototype, Array.prototype]) {
    const db = mockPg();
    db.state.entries.push(entry('tx-historical'));
    const store = createBankFeedPostgresStore(db.pool);
    const original = Object.getOwnPropertyDescriptor(prototype, 'toJSON');
    let serializerCalls = 0;
    Object.defineProperty(prototype, 'toJSON', {
      configurable: true,
      value() {
        serializerCalls++;
        return { transactionId: 'tx-forged', amountCents: 0 };
      },
    });
    try {
      await assert.rejects(
        store.withTransaction((tx) => tx.saveEntries(scope(), [entry('tx-new')])),
        /Refusing non-JSON banking entry write/,
      );
      assert.deepEqual(db.calls.map(({ sql }) => sql), ['BEGIN', 'ROLLBACK'],
        'unsafe prototype must reject before any financial INSERT');
      await assert.rejects(
        store.withTransaction((tx) => tx.loadEntries(scope())),
        /Inherited banking JSON serializer would alter evidence/,
      );
      assert.equal(serializerCalls, 0, 'inherited serializer must never execute');
      assert.equal(db.calls.filter(({ sql }) =>
        /INSERT INTO|UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)).length, 0);
      assert.equal(db.state.entries.length, 1, 'failed reads/writes preserve historical records');
      assert.equal(db.state.entries[0].transactionId, 'tx-historical');
      assert.equal(db.state.checkpoint.cursor, null, 'cursor must not advance');
    } finally {
      if (original) Object.defineProperty(prototype, 'toJSON', original);
      else delete prototype.toJSON;
    }
    // A normal runtime must still accept the same ordinary financial evidence.
    await store.withTransaction((tx) => tx.saveEntries(scope(), [entry('tx-new')]));
    const historical = await store.withTransaction((tx) => tx.loadEntries(scope()));
    assert.deepEqual(historical.map(({ transactionId }) => transactionId),
      ['tx-historical', 'tx-new']);
  }
});

test('PostgreSQL adapter rejects malformed persisted transaction IDs before replay or checkpoint advance', async () => {
  const invalidIds = [
    '', ' tx-padded', 'tx-trailing ', 'tx\\nnewline'.replace('\\n', '\n'),
    'tx\\u200bhidden'.replace('\\u200b', '\u200b'), 'x'.repeat(257), 7,
  ];
  for (const transactionId of invalidIds) {
    const db = mockPg();
    db.state.entries.push({
      tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
      accountId: 'acct-a', transactionId, amountCents: 500,
      status: 'posted', requiresReview: true,
    });
    const before = structuredClone(db.state);
    await assert.rejects(
      commitAuthorizedBankFeedPage(createBankFeedPostgresStore(db.pool), scope(), page()),
      /Persisted banking entry identity does not match its scoped database key/,
      String(transactionId),
    );
    assert.deepEqual(db.state, before, 'invalid historical identity must not change bank evidence');
    assert.equal(db.calls.filter(({ sql }) =>
      /INSERT INTO|UPDATE public.clearflow_bank_feed_checkpoints/.test(sql)
    ).length, 0, 'corrupt history must not insert rows or advance cursor');
    assert.equal(db.calls.filter(({ sql }) => sql === 'ROLLBACK').length, 1);
    assert.equal(db.releases, 1);
  }
});
