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
  const targetDirectory = accountDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await fs.writeFile(appDataPath(accountId), JSON.stringify(appData, null, 2), 'utf8');

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountDocumentFile(accountId, fileId) {
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
