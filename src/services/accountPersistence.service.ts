import { storageAuthHeaders } from './storageSession.service';
import type { AppData } from '../types/app.models';
import { getApiBaseUrl } from './runtimeConfig.service';

const STORAGE_API_BASE = getApiBaseUrl();
const accountRevisions = new Map<string, string>();

interface RemoteDocumentFilePayload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  base64Data: string;
}

function normalizeAccountId(accountId: string) {
  return encodeURIComponent(accountId);
}

function buildAppDataUrl(accountId: string) {
  return `${STORAGE_API_BASE}/api/storage/accounts/${normalizeAccountId(accountId)}/app-data`;
}

function buildPersistenceModeUrl(accountId: string) {
  return `${STORAGE_API_BASE}/api/storage/accounts/${normalizeAccountId(accountId)}/persistence-mode`;
}

function buildFileUrl(accountId: string, fileId?: string) {
  const base = `${STORAGE_API_BASE}/api/storage/accounts/${normalizeAccountId(accountId)}/files`;
  return fileId ? `${base}/${encodeURIComponent(fileId)}` : base;
}

function buildExtractionUrl(accountId: string, signature: string) {
  return `${STORAGE_API_BASE}/api/storage/accounts/${normalizeAccountId(accountId)}/extractions/${encodeURIComponent(signature)}`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [, base64Data = ''] = result.split(',');
      resolve(base64Data);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64Data: string, mimeType: string) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export async function getAccountPersistenceMode(
  accountId: string
): Promise<'owner_database' | 'legacy'> {
  const response = await fetch(buildPersistenceModeUrl(accountId), {
    method: 'GET',
    headers: {
      ...storageAuthHeaders(),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return 'legacy';
  }

  const payload = (await response.json()) as {
    success: boolean;
    mode?: 'owner_database' | 'legacy';
  };

  return payload.mode === 'owner_database' ? 'owner_database' : 'legacy';
}

export async function loadAccountAppData(accountId: string) {
  const response = await fetch(buildAppDataUrl(accountId), {
    method: 'GET',
    headers: {
      ...storageAuthHeaders(),
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    accountRevisions.delete(accountId);
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load durable account data.');
  }

  const payload = (await response.json()) as { success: boolean; appData: AppData; version?: string | number | null };
  if (payload.version != null) accountRevisions.set(accountId, String(payload.version));
  else accountRevisions.delete(accountId);
  return payload.appData;
}

const accountWriteQueues = new Map<string, Promise<unknown>>();

async function performAccountAppDataSave(accountId: string, appData: AppData) {
  const response = await fetch(buildAppDataUrl(accountId), {
    method: 'PUT',
    headers: {
      ...storageAuthHeaders(),
      'Content-Type': 'application/json',
      ...(accountRevisions.has(accountId) ? { 'If-Match': accountRevisions.get(accountId)! } : {}),
    },
    body: JSON.stringify(appData),
  });

  if (!response.ok) {
    throw new Error('Failed to save durable account data.');
  }

  const saved = await response.json();
  if (saved.result?.revision != null) accountRevisions.set(accountId, String(saved.result.revision));
  else if (saved.version != null) accountRevisions.set(accountId, String(saved.version));
  return saved;
}

export async function uploadAccountDocumentFile(
  accountId: string,
  fileId: string,
  file: File
) {
  const payload: RemoteDocumentFilePayload = {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    base64Data: await fileToBase64(file),
  };

  const response = await fetch(buildFileUrl(accountId), {
    method: 'POST',
    headers: {
      ...storageAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileId,
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to upload durable document file.');
  }

  return payload;
}

export async function loadAccountDocumentFile(accountId: string, fileId: string) {
  const response = await fetch(buildFileUrl(accountId, fileId), {
    method: 'GET',
    headers: {
      ...storageAuthHeaders(),
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load durable document file.');
  }

  const payload = (await response.json()) as {
    success: boolean;
    file: RemoteDocumentFilePayload;
  };

  return {
    fileName: payload.file.fileName,
    mimeType: payload.file.mimeType,
    sizeBytes: payload.file.sizeBytes,
    uploadedAt: payload.file.uploadedAt,
    blob: base64ToBlob(payload.file.base64Data, payload.file.mimeType),
  };
}

export async function loadAccountExtractionCache(accountId: string, signature: string) {
  const response = await fetch(buildExtractionUrl(accountId, signature), {
    method: 'GET',
    headers: {
      ...storageAuthHeaders(),
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load durable extraction cache.');
  }

  const payload = (await response.json()) as {
    success: boolean;
    result: unknown;
    savedAt?: string;
  };

  return {
    result: payload.result,
    savedAt: payload.savedAt,
  };
}

export async function saveAccountExtractionCache(
  accountId: string,
  signature: string,
  result: unknown
) {
  const response = await fetch(buildExtractionUrl(accountId, signature), {
    method: 'PUT',
    headers: {
      ...storageAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ result }),
  });

  if (!response.ok) {
    throw new Error('Failed to save durable extraction cache.');
  }

  return response.json();
}

/** Serialize writes per account so older responses cannot overwrite newer edits. */
export function saveAccountAppData(accountId: string, appData: AppData) {
  const previous = accountWriteQueues.get(accountId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() =>
    performAccountAppDataSave(accountId, appData)
  );
  accountWriteQueues.set(accountId, next);
  void next.finally(() => {
    if (accountWriteQueues.get(accountId) === next) accountWriteQueues.delete(accountId);
  }).catch(() => undefined);
  return next;
}
