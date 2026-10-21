import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.CLEARFLOW_OWNER_DATABASE_URL || process.env.DATABASE_URL;
let databasePool;
let schemaPromise;
function durablePool() {
  if (!databaseUrl) return null;
  if (!databasePool) {
    databasePool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('.render.com') && !databaseUrl.includes('.internal')
        ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return databasePool;
}
async function durableSchema() {
  if (!durablePool()) return false;
  if (!schemaPromise) {
    schemaPromise = durablePool().query(`
      CREATE TABLE IF NOT EXISTS clearflow_account_records (
        account_id TEXT NOT NULL,
        record_type TEXT NOT NULL,
        record_key TEXT NOT NULL,
        payload JSONB NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (account_id, record_type, record_key)
      )
    `).catch(error => { schemaPromise = undefined; throw error; });
  }
  await schemaPromise;
  return true;
}
async function readDurable(accountId, recordType, recordKey = 'default') {
  if (!(await durableSchema())) return undefined;
  const result = await durablePool().query(
    'SELECT payload FROM clearflow_account_records WHERE account_id=$1 AND record_type=$2 AND record_key=$3',
    [accountId, recordType, recordKey]
  );
  return result.rows[0]?.payload ?? null;
}
async function writeDurable(accountId, recordType, recordKey, payload) {
  if (!(await durableSchema())) return false;
  await durablePool().query(`
    INSERT INTO clearflow_account_records(account_id,record_type,record_key,payload)
    VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(account_id,record_type,record_key)
    DO UPDATE SET payload=EXCLUDED.payload,
      version=clearflow_account_records.version+1,updated_at=NOW()
  `, [accountId, recordType, recordKey, JSON.stringify(payload)]);
  return true;
}
import { promises as fs } from 'node:fs';
import path from 'node:path';

const STORAGE_ROOT = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');

function sanitizeSegment(value) {
  return encodeURIComponent(String(value || 'unknown'));
}

function accountDirectory(accountId) {
  return path.join(STORAGE_ROOT, sanitizeSegment(accountId));
}

function appDataPath(accountId) {
  return path.join(accountDirectory(accountId), 'app-data.json');
}

function accountFilesDirectory(accountId) {
  return path.join(accountDirectory(accountId), 'files');
}

function accountRemittanceDirectory(accountId) {
  return path.join(accountDirectory(accountId), 'remittance');
}

function accountTransactionProofDirectory(accountId) {
  return path.join(accountDirectory(accountId), 'transaction-proof-chains');
}

function accountPlaidDirectory(accountId) {
  return path.join(accountDirectory(accountId), 'plaid');
}

function accountExtractionDirectory(accountId) {
  return path.join(accountDirectory(accountId), 'extractions');
}

function accountFilePath(accountId, fileId) {
  return path.join(accountFilesDirectory(accountId), `${sanitizeSegment(fileId)}.json`);
}

function accountRemittancePath(accountId, vendorId) {
  return path.join(accountRemittanceDirectory(accountId), `${sanitizeSegment(vendorId)}.json`);
}

function accountTransactionProofPath(accountId) {
  return path.join(accountTransactionProofDirectory(accountId), 'chains.json');
}

function accountPlaidPath(accountId) {
  return path.join(accountPlaidDirectory(accountId), 'connections.json');
}

function accountExtractionPath(accountId, signature) {
  return path.join(accountExtractionDirectory(accountId), `${sanitizeSegment(signature)}.json`);
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function loadAccountAppData(accountId) {
  const durable = await readDurable(accountId, 'app-data', 'default');
  if (durable !== undefined) return durable;
  try {
    const raw = await fs.readFile(appDataPath(accountId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountAppData(accountId, appData) {
  if (await writeDurable(accountId, 'app-data', 'default', appData)) {
    return { accountId, savedAt: new Date().toISOString() };
  }
  const targetDirectory = accountDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(appDataPath(accountId), JSON.stringify(appData, null, 2), 'utf8');

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountDocumentFile(accountId, fileId) {
  const durable = await readDurable(accountId, 'file', fileId);
  if (durable !== undefined) return durable;
  try {
    const raw = await fs.readFile(accountFilePath(accountId, fileId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountDocumentFile(accountId, fileId, payload) {
  if (await writeDurable(accountId, 'file', fileId, { ...payload, accountId, fileId, savedAt: new Date().toISOString() })) {
    return { accountId, savedAt: new Date().toISOString() };
  }
  const targetDirectory = accountFilesDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(
    accountFilePath(accountId, fileId),
    JSON.stringify(
      {
        ...payload,
        accountId,
        fileId,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    accountId,
    fileId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountRemittanceVault(accountId, vendorId) {
  const durable = await readDurable(accountId, 'remittance', vendorId);
  if (durable !== undefined) return durable;
  try {
    const raw = await fs.readFile(accountRemittancePath(accountId, vendorId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountRemittanceVault(accountId, vendorId, payload) {
  if (await writeDurable(accountId, 'remittance', vendorId, { ...payload, accountId, vendorId, savedAt: new Date().toISOString() })) {
    return { accountId, savedAt: new Date().toISOString() };
  }
  const targetDirectory = accountRemittanceDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(
    accountRemittancePath(accountId, vendorId),
    JSON.stringify(
      {
        ...payload,
        accountId,
        vendorId,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    accountId,
    vendorId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountTransactionProofVault(accountId) {
  const durable = await readDurable(accountId, 'proof', 'default');
  if (durable !== undefined) return durable;
  try {
    const raw = await fs.readFile(accountTransactionProofPath(accountId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountTransactionProofVault(accountId, payload) {
  if (await writeDurable(accountId, 'proof', 'default', { ...payload, accountId, savedAt: new Date().toISOString() })) {
    return { accountId, savedAt: new Date().toISOString() };
  }
  const targetDirectory = accountTransactionProofDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(
    accountTransactionProofPath(accountId),
    JSON.stringify(
      {
        ...payload,
        accountId,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountPlaidVault(accountId) {
  const durable = await readDurable(accountId, 'plaid', 'default');
  if (durable !== undefined) return durable;
  try {
    const raw = await fs.readFile(accountPlaidPath(accountId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountPlaidVault(accountId, payload) {
  if (await writeDurable(accountId, 'plaid', 'default', { ...payload, accountId, savedAt: new Date().toISOString() })) {
    return { accountId, savedAt: new Date().toISOString() };
  }
  const targetDirectory = accountPlaidDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(
    accountPlaidPath(accountId),
    JSON.stringify(
      {
        ...payload,
        accountId,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountExtractionRecord(accountId, signature) {
  const durable = await readDurable(accountId, 'extraction', signature);
  if (durable !== undefined) return durable;
  try {
    const raw = await fs.readFile(accountExtractionPath(accountId, signature), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountExtractionRecord(accountId, signature, payload) {
  if (await writeDurable(accountId, 'extraction', signature, { ...payload, accountId, signature, savedAt: new Date().toISOString() })) {
    return { accountId, savedAt: new Date().toISOString() };
  }
  const targetDirectory = accountExtractionDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(
    accountExtractionPath(accountId, signature),
    JSON.stringify(
      {
        ...payload,
        accountId,
        signature,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    accountId,
    signature,
    savedAt: new Date().toISOString(),
  };
}
