const DB_NAME = 'clearflow-document-vault';
const STORE_NAME = 'document-files';
const DB_VERSION = 1;

interface StoredDocumentFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  blob: Blob;
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

export async function saveDocumentFile(fileId: string, file: File) {
  const record: StoredDocumentFile = {
    id: fileId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    blob: file,
  };

  await withStore('readwrite', (store) => store.put(record));

  return {
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    uploadedAt: record.uploadedAt,
    sourceFileId: record.id,
  };
}

export async function getDocumentFile(fileId: string) {
  return withStore<StoredDocumentFile | undefined>('readonly', (store) => store.get(fileId));
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
