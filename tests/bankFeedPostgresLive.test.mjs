/**
 * Real PostgreSQL adapter acceptance test. Only runs against the disposable
 * clearflow_banking_ci database on loopback. Never use a production connection.
 * No Mercury/Plaid calls, payment initiation, or ledger posting occur.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';
import { commitAuthorizedBankFeedPage } from '../src/services/bankFeedAtomicCommit.service.ts';

const connectionString = process.env.BANKING_PG_TEST_URL;
if (!connectionString) throw new Error('BANKING_PG_TEST_URL is required for disposable PostgreSQL test.');
const url = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/clearflow_banking_ci' || url.username !== 'postgres') {
  throw new Error('Refusing non-disposable PostgreSQL connection.');
}
// Isolated test-only installation; avoids editing the shared production lockfile.
const require = createRequire(join(process.env.RUNNER_TEMP || '.', 'banking-pg', 'package.json'));
const { Pool } = require('pg');

const scope = (tenantId) => ({
  tenantId, provider: 'plaid', connectionId: 'ci-shared-item',
  allowedAccountIds: ['ci-account'],
});
const event = (kind, transactionId, amountCents) => ({
  kind, accountId: 'ci-account', transactionId, amountCents, pending: false,
});
const page = (requestedCursor, nextCursor, events) => ({
  requestedCursor, nextCursor, hasMore: false, events,
});

test('real pg adapter: tenant isolation, durable restart, rollback and concurrent stale-cursor rejection', async () => {
  const poolOptions = { connectionString, max: 4, connectionTimeoutMillis: 5000 };
  let pool = new Pool(poolOptions);
  const a = scope('ci-bank-adapter-tenant-a');
  const b = scope('ci-bank-adapter-tenant-b');
  const checkpoint = async (tenantId) => {
    const { rows } = await pool.query(
      `SELECT cursor, revision::text AS revision
       FROM public.clearflow_bank_feed_checkpoints
       WHERE tenant_id = $1 AND provider = 'plaid' AND connection_id = 'ci-shared-item'`,
      [tenantId],
    );
    assert.equal(rows.length, 1);
    return rows[0];
  };
  const entries = async (tenantId) => {
    const { rows } = await pool.query(
      `SELECT payload FROM public.clearflow_bank_feed_entries
       WHERE tenant_id = $1 AND provider = 'plaid' AND connection_id = 'ci-shared-item'
       ORDER BY transaction_id`,
      [tenantId],
    );
    return rows.map((row) => row.payload);
  };

  try {
    for (const tenantId of [a.tenantId, b.tenantId]) {
      await pool.query(
        `INSERT INTO public.clearflow_bank_feed_checkpoints
           (tenant_id, provider, connection_id, revision)
         VALUES ($1, 'plaid', 'ci-shared-item', 0)`,
        [tenantId],
      );
    }
    let store = createBankFeedPostgresStore(pool);
    const first = await commitAuthorizedBankFeedPage(
      store, a, page(null, 'cursor-a1', [event('added', 'ci-tx1', 1200)]),
    );
    assert.equal(first.applied, 1);
    await commitAuthorizedBankFeedPage(
      store, b, page(null, 'cursor-b1', [event('added', 'ci-tx1', 9900)]),
    );
    assert.deepEqual(await checkpoint(a.tenantId), { cursor: 'cursor-a1', revision: '1' });
    assert.deepEqual(await checkpoint(b.tenantId), { cursor: 'cursor-b1', revision: '1' });
    assert.equal((await entries(a.tenantId))[0].amountCents, 1200);
    assert.equal((await entries(b.tenantId))[0].amountCents, 9900);

    await assert.rejects(
      commitAuthorizedBankFeedPage(
        store, a, page(null, 'cursor-stale', [event('added', 'ci-stale', 100)]),
      ),
      /Stale feed cursor checkpoint/,
    );
    assert.equal((await entries(a.tenantId)).length, 1);

    // Closing and reopening every connection proves this isn't an in-memory mock.
    await pool.end();
    pool = new Pool(poolOptions);
    store = createBankFeedPostgresStore(pool);
    assert.deepEqual(await checkpoint(a.tenantId), { cursor: 'cursor-a1', revision: '1' });
    await commitAuthorizedBankFeedPage(
      store, a, page('cursor-a1', 'cursor-a2', [event('modified', 'ci-tx1', 1300)]),
    );
    assert.equal((await entries(a.tenantId))[0].amountCents, 1300);

    // A thrown error after a real INSERT must roll back the entire transaction.
    await assert.rejects(
      store.withTransaction(async (tx) => {
        await tx.saveEntries(a, [{
          ...a, accountId: 'ci-account', transactionId: 'ci-rolled-back',
          amountCents: 100, status: 'posted', requiresReview: true,
        }]);
        throw new Error('intentional transaction rollback');
      }),
      /intentional transaction rollback/,
    );
    assert.equal((await entries(a.tenantId)).length, 1);

    // Malformed persisted financial evidence must block cursor acknowledgement.
    await pool.query(
      `INSERT INTO public.clearflow_bank_feed_entries
         (tenant_id, provider, connection_id, account_id, transaction_id, payload)
       VALUES ($1, 'plaid', 'ci-shared-item', 'ci-account', 'ci-poison', $2::jsonb)`,
      [a.tenantId, JSON.stringify({ malformed: true })],
    );
    await assert.rejects(
      commitAuthorizedBankFeedPage(
        store, a, page('cursor-a2', 'cursor-a3', [event('added', 'ci-tx2', 200)]),
      ),
      /malformed canonical feed stored record/,
    );
    assert.deepEqual(await checkpoint(a.tenantId), { cursor: 'cursor-a2', revision: '2' });
    await pool.query(
      `DELETE FROM public.clearflow_bank_feed_entries
       WHERE tenant_id = $1 AND transaction_id = 'ci-poison'`,
      [a.tenantId],
    );

    // Two real connections race the same cursor; row locking permits one commit.
    const outcomes = await Promise.allSettled([
      commitAuthorizedBankFeedPage(
        store, a, page('cursor-a2', 'cursor-a3', [event('added', 'ci-tx2', 200)]),
      ),
      commitAuthorizedBankFeedPage(
        store, a, page('cursor-a2', 'cursor-a4', [event('added', 'ci-tx2', 300)]),
      ),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.match(String(rejected?.reason), /Stale feed cursor checkpoint/);
    const finalEntries = await entries(a.tenantId);
    assert.equal(finalEntries.length, 2);
    assert.equal(finalEntries.filter((entry) => entry.transactionId === 'ci-tx2').length, 1);
    const finalCheckpoint = await checkpoint(a.tenantId);
    assert.equal(finalCheckpoint.revision, '3');
    assert.ok(['cursor-a3', 'cursor-a4'].includes(finalCheckpoint.cursor));
    assert.deepEqual(await checkpoint(b.tenantId), { cursor: 'cursor-b1', revision: '1' });
    assert.equal((await entries(b.tenantId))[0].amountCents, 9900);
  } finally {
    await pool.end();
  }
});
