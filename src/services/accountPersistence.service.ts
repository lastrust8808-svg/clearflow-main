import type { AppData } from '../types/app.models';

const STORAGE_API_BASE =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin.includes('localhost')
      ? 'http://localhost:8000'
      : window.location.origin
    : 'http://localhost:8000';

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

function buildFileUrl(accountId: string, fileId?: string) {
  const base = `${STORAGE_API_BASE}/api/storage/accounts/${normalizeAccountId(accountId)}/files`;
  return fileId ? `${base}/${encodeURIComponent(fileId)}` : base;
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

export async function loadAccountAppData(accountId: string) {
  const response = await fetch(buildAppDataUrl(accountId), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load durable account data.');
  }

  const payload = (await response.json()) as { success: boolean; appData: AppData };
  return payload.appData;
}

export async function saveAccountAppData(accountId: string, appData: AppData) {
  const response = await fetch(buildAppDataUrl(accountId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(appData),
  });

  if (!response.ok) {
    throw new Error('Failed to save durable account data.');
  }

  return response.json();
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
