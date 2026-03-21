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

function accountFilePath(accountId, fileId) {
  return path.join(accountFilesDirectory(accountId), `${sanitizeSegment(fileId)}.json`);
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
