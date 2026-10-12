import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const root = path.resolve(process.cwd(), 'server/storage-data/accounts');
const apply = process.argv.includes('--apply');
const url = process.env.CLEARFLOW_STORAGE_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL;
if (!url) throw new Error('A persistent database connection is required.');
const pool = new pg.Pool({ connectionString: url, max: 2 });
const kinds = [
  ['files', 'file', '.json'],
  ['remittance', 'remittance', '.json'],
  ['plaid', 'plaid', '.json'],
  ['transaction-proof-chains', 'proof', '.json'],
  ['extractions', 'extraction', '.json'],
];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const list = async dir => fs.readdir(dir).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
let examined = 0, pending = 0, alreadyPresent = 0;
try {
  for (const folder of await list(root)) {
    const accountId = decodeURIComponent(folder);
    const base = path.join(root, folder);
    const records = [['app-data.json', 'snapshot', 'workspace']];
    for (const [dir, kind] of kinds) {
      for (const file of await list(path.join(base, dir))) {
        if (file.endsWith('.json')) records.push([path.join(dir, file), kind, file.slice(0, -5)]);
      }
    }
    for (const [relative, kind, key] of records) {
      let raw;
      try { raw = await fs.readFile(path.join(base, relative), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const payload = JSON.parse(raw);
      examined++;
      const table = kind === 'snapshot' ? 'clearflow_account_snapshots' : 'clearflow_account_records';
      const found = kind === 'snapshot'
        ? await pool.query('SELECT 1 FROM clearflow_account_snapshots WHERE account_id=$1', [accountId])
        : await pool.query('SELECT 1 FROM clearflow_account_records WHERE account_id=$1 AND kind=$2 AND record_key=$3', [accountId, kind, key]);
      if (found.rowCount) { alreadyPresent++; continue; }
      pending++;
      if (apply) {
        if (kind === 'snapshot') await pool.query('INSERT INTO clearflow_account_snapshots(account_id,app_data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING', [accountId, JSON.stringify(payload)]);
        else await pool.query('INSERT INTO clearflow_account_records(account_id,kind,record_key,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING', [accountId,kind,key,JSON.stringify(payload)]);
      }
      process.stdout.write(JSON.stringify({ accountId, relative, sha256: sha(raw), action: apply ? 'insert-if-absent' : 'would-insert' }) + '\n');
    }
  }
  process.stdout.write(JSON.stringify({ examined, pending, alreadyPresent, mode: apply ? 'apply' : 'dry-run' }) + '\n');
} finally { await pool.end(); }
