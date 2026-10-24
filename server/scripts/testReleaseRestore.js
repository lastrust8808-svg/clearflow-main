// Restore only into a dedicated empty test database. Requires PostgreSQL client tools.
import pg from 'pg';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { decryptJson } from '../utils/secureVault.js';

const source = new URL(process.env.CLEARFLOW_STAGING_DATABASE_URL || 'invalid:');
const target = new URL(process.env.CLEARFLOW_RESTORE_TEST_DATABASE_URL || 'invalid:');
if (source.pathname !== '/clearflow_staging' || target.pathname !== '/clearflow_restore_test' ||
    source.hostname !== target.hostname || source.port !== target.port) throw new Error('Dedicated staging and restore test databases on the same host required.');
const pgEnv = url => ({ ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1), PGSSLMODE: url.searchParams.get('sslmode') || 'prefer' });
const from = new pg.Client({ connectionString: source.toString() });
const to = new pg.Client({ connectionString: target.toString() });
// In CI, use the service container's own client binaries so their major version matches.
const container = process.env.CLEARFLOW_POSTGRES_CONTAINER;
const runPg = (binary, args, url, input) => execFileSync(container ? 'docker' : binary,
  container ? ['exec', ...(input ? ['-i'] : []),
    ...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE'].flatMap(name => ['-e', name]),
    container, binary, ...args] : args,
  { env: { ...pgEnv(url), ...(container ? { PGHOST: '127.0.0.1', PGPORT: '5432' } : {}) },
    input, stdio: 'pipe', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
const quote = name => '"' + name.replaceAll('"','""') + '"';
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);
try {
  await from.connect(); await to.connect();
  assert.equal((await to.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0, 'Restore target must be empty; no existing data is removed.');
  const tables = (await from.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  for (const required of ['clearflow_account_snapshots','clearflow_account_records','clearflow_entity_memberships','clearflow_b2b_deliveries','clearflow_plaid_items','clearflow_login_sessions']) assert.ok(tables.includes(required), required);
  const snapshot = async client => {
    const result = {};
    for (const table of tables) result[table] = (await client.query(`SELECT row_to_json(t) AS row FROM public.${quote(table)} t`)).rows.map(r => canonical(r.row)).sort();
    return result;
  };
  const before = await snapshot(from);
  assert.ok(before.clearflow_plaid_items.length > 0, 'Seeded encrypted records required.');
  const backup = runPg('pg_dump', ['--format=custom','--no-owner','--no-privileges'], source);
  runPg('pg_restore', ['--exit-on-error','--no-owner','--no-privileges','--dbname',target.pathname.slice(1)], target, backup);
  assert.deepEqual(await snapshot(to), before, 'Every public table and retained record must match.');
  const vaults = await to.query('SELECT account_id,encrypted_payload FROM clearflow_plaid_items');
  for (const row of vaults.rows) assert.equal(decryptJson(row.encrypted_payload).userId,row.account_id);
  console.log('Backup/restore verified: all rows, memberships, sessions, revisions and decryptable banking items preserved.');
} finally {
  await Promise.allSettled([from.end(),to.end()]);
}
