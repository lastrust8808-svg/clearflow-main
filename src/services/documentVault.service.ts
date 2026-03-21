import {
  loadAccountDocumentFile,
  uploadAccountDocumentFile,
} from './accountPersistence.service';

const DB_NAME = 'clearflow-document-vault';
const STORE_NAME = 'document-files';
const DB_VERSION = 1;
const GLOBAL_VAULT_SCOPE = 'global';

let activeVaultScopeId = GLOBAL_VAULT_SCOPE;

interface StoredDocumentFile {
  id: string;
  ownerScopeId: string;
  scopedId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  blob: Blob;
}

function buildScopedId(scopeId: string, fileId: string) {
  return `${scopeId}::${fileId}`;
}

function normalizeScopedFileId(scopeId: string, fileId: string) {
  const prefix = `${scopeId}::`;
  return fileId.startsWith(prefix) ? fileId.slice(prefix.length) : fileId;
}

function getActiveScopeId() {
  return activeVaultScopeId || GLOBAL_VAULT_SCOPE;
}

export function setDocumentVaultScope(scopeId: string | null | undefined) {
  activeVaultScopeId = scopeId || GLOBAL_VAULT_SCOPE;
}

function openDocumentVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open the document vault.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDocumentVault();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = runner(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Document vault request failed.'));

    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Document vault transaction failed.'));
      database.close();
    };
  });
}

async function cacheStoredFile(record: StoredDocumentFile) {
  await withStore('readwrite', (store) => store.put(record));
}

export async function saveDocumentFile(fileId: string, file: File) {
  const ownerScopeId = getActiveScopeId();
  const scopedId = normalizeScopedFileId(ownerScopeId, fileId);
  const record: StoredDocumentFile = {
    id: buildScopedId(ownerScopeId, scopedId),
    ownerScopeId,
    scopedId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    blob: file,
  };

  await withStore('readwrite', (store) => store.put(record));

  if (ownerScopeId !== GLOBAL_VAULT_SCOPE) {
    try {
      await uploadAccountDocumentFile(ownerScopeId, scopedId, file);
    } catch (error) {
      console.warn('Failed to mirror document file to durable account storage.', error);
    }
  }

  return {
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    uploadedAt: record.uploadedAt,
    sourceFileId: record.id,
  };
}

export async function getDocumentFile(fileId: string) {
  const activeScopeId = getActiveScopeId();
  const scopedLookupId = buildScopedId(activeScopeId, normalizeScopedFileId(activeScopeId, fileId));
  const scopedResult = await withStore<StoredDocumentFile | undefined>('readonly', (store) =>
    store.get(scopedLookupId)
  );

  if (scopedResult) {
    return scopedResult;
  }

  const legacyLocalResult = await withStore<StoredDocumentFile | undefined>('readonly', (store) =>
    store.get(fileId)
  );

  if (legacyLocalResult) {
    return legacyLocalResult;
  }

  if (activeScopeId === GLOBAL_VAULT_SCOPE) {
    return undefined;
  }

  try {
    const remoteFile = await loadAccountDocumentFile(
      activeScopeId,
      normalizeScopedFileId(activeScopeId, fileId)
    );

    if (!remoteFile) {
      return undefined;
    }

    const cachedRecord: StoredDocumentFile = {
      id: scopedLookupId,
      ownerScopeId: activeScopeId,
      scopedId: normalizeScopedFileId(activeScopeId, fileId),
      fileName: remoteFile.fileName,
      mimeType: remoteFile.mimeType,
      sizeBytes: remoteFile.sizeBytes,
      uploadedAt: remoteFile.uploadedAt,
      blob: remoteFile.blob,
    };

    await cacheStoredFile(cachedRecord);
    return cachedRecord;
  } catch (error) {
    console.warn('Failed to load document file from durable account storage.', error);
    return undefined;
  }
}

export async function downloadDocumentFile(fileId: string, fallbackName?: string) {
  const storedFile = await getDocumentFile(fileId);
  if (!storedFile) {
    return false;
  }

  const downloadUrl = URL.createObjectURL(storedFile.blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = fallbackName || storedFile.fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);

  return true;
}
