import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizeStorageSegment as sanitizeSegment } from '../utils/storageSegment.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');


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

// Reject symlinked storage directories before reads and writes. A tenant
// directory symlink must never redirect an account operation into another
// account's records (or outside the storage tree). This local filesystem
// defense does not replace authenticated tenant authorization or eliminate
// all concurrent filesystem mutation races.
async function assertSafeStorageDirectory(directory) {
  const base = path.resolve(process.cwd());
  const relative = path.relative(base, directory);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Unsafe storage directory path.');
  }
  let current = base;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error('Unsafe storage directory path.');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function ensureDirectory(targetPath) {
  await assertSafeStorageDirectory(targetPath);
  await fs.mkdir(targetPath, { recursive: true });
  await assertSafeStorageDirectory(targetPath);
}

async function readJsonSafely(targetPath) {
  await assertSafeStorageDirectory(path.dirname(targetPath));
  // O_NOFOLLOW prevents a JSON record symlink from redirecting the read.
  const handle = await fs.open(targetPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    return JSON.parse(await handle.readFile('utf8'));
  } finally {
    await handle.close();
  }
}

// Replace JSON records atomically: readers see the old complete record or the
// new complete record, never a partially written/truncated JSON document.
// File sync precedes rename. Directory durability after sudden power loss and
// multi-writer ordering remain separate acceptance gates.
async function writeJsonAtomically(targetPath, value) {
  await assertSafeStorageDirectory(path.dirname(targetPath));
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2), 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await assertSafeStorageDirectory(path.dirname(targetPath));
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export async function loadAccountAppData(accountId) {
  try {
    return await readJsonSafely(appDataPath(accountId));
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
  await writeJsonAtomically(appDataPath(accountId), appData);

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountDocumentFile(accountId, fileId) {
  try {
    return await readJsonSafely(accountFilePath(accountId, fileId));
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
  await writeJsonAtomically(accountFilePath(accountId, fileId),
    {
        ...payload,
        accountId,
        fileId,
        savedAt: new Date().toISOString(),
      }
    );

  return {
    accountId,
    fileId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountRemittanceVault(accountId, vendorId) {
  try {
    return await readJsonSafely(accountRemittancePath(accountId, vendorId));
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
  await writeJsonAtomically(accountRemittancePath(accountId, vendorId),
    {
        ...payload,
        accountId,
        vendorId,
        savedAt: new Date().toISOString(),
      }
    );

  return {
    accountId,
    vendorId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountTransactionProofVault(accountId) {
  try {
    return await readJsonSafely(accountTransactionProofPath(accountId));
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
  await writeJsonAtomically(accountTransactionProofPath(accountId),
    {
        ...payload,
        accountId,
        savedAt: new Date().toISOString(),
      }
    );

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountPlaidVault(accountId) {
  try {
    return await readJsonSafely(accountPlaidPath(accountId));
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
  await writeJsonAtomically(accountPlaidPath(accountId),
    {
        ...payload,
        accountId,
        savedAt: new Date().toISOString(),
      }
    );

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountExtractionRecord(accountId, signature) {
  try {
    return await readJsonSafely(accountExtractionPath(accountId, signature));
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
  await writeJsonAtomically(accountExtractionPath(accountId, signature),
    {
        ...payload,
        accountId,
        signature,
        savedAt: new Date().toISOString(),
      }
    );

  return {
    accountId,
    signature,
    savedAt: new Date().toISOString(),
  };
}
