import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { sanitizeStorageSegment as sanitizeSegment } from '../utils/storageSegment.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
// Never admit JSON object keys that can mutate prototypes when records are
// subsequently merged into application state by downstream consumers.
const UNSAFE_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Bound nested records before serialization and after legacy JSON parsing.
// Deeply nested user data can otherwise exhaust recursive application code.
const MAX_RECORD_NESTING_DEPTH = 128;
// Bound legacy JSON reads and new writes. Account metadata is not a binary
// file store; oversized records require a reviewed migration, not unbounded
// memory allocation during parsing or serialization.
const MAX_RECORD_JSON_BYTES = 32 * 1024 * 1024;


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

// The shared accounts root must also be private. Tightening only tenant
// directories leaves tenant names exposed through a legacy 0755/0777 root.
// Validate the path and chmod the opened directory without following symlinks.
async function secureStorageRoot() {
  await assertSafeStorageDirectory(STORAGE_ROOT);
  const handle = await fs.open(
    STORAGE_ROOT,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
  );
  try {
    const stat = await handle.stat();
    if (!stat.isDirectory()) throw new Error('Unsafe storage directory path.');
    if ((stat.mode & 0o077) !== 0) await handle.chmod(0o700);
  } finally {
    await handle.close();
  }
}

async function ensureDirectory(targetPath) {
  await assertSafeStorageDirectory(STORAGE_ROOT);
  await fs.mkdir(STORAGE_ROOT, { recursive: true, mode: 0o700 });
  await secureStorageRoot();
  // An existing account directory may predate private-directory creation.
  // Secure the tenant parent before creating a child record directory, so
  // legacy group/world permissions cannot expose newly saved records.
  const relative = path.relative(STORAGE_ROOT, targetPath);
  const segments = relative.split(path.sep);
  if (segments.length === 2) {
    await ensureDirectory(path.join(STORAGE_ROOT, segments[0]));
  }
  await assertSafeStorageDirectory(targetPath);
  await fs.mkdir(targetPath, { recursive: true, mode: 0o700 });
  await assertSafeStorageDirectory(targetPath);
  // chmod through an O_NOFOLLOW directory descriptor, not a pathname that
  // could be redirected to a symlink between validation and chmod.
  // Fail closed if legacy permissions cannot be tightened.
  const handle = await fs.open(
    targetPath,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
  );
  try {
    const stat = await handle.stat();
    if (!stat.isDirectory()) throw new Error('Unsafe storage directory path.');
    await handle.chmod(0o700);
  } finally {
    await handle.close();
  }
  await assertSafeStorageDirectory(targetPath);
}

// Reads must not create missing directories, but must not expose legacy
// records through permissive account/record directories either. Harden the
// tenant parent before its child, using no-follow directory descriptors.
// ENOENT remains observable to callers so a missing record still returns null.
async function secureExistingReadDirectories(directory) {
  await secureStorageRoot();
  await assertSafeStorageDirectory(directory);
  const relative = path.relative(STORAGE_ROOT, directory);
  const segments = relative.split(path.sep);
  if (
    !relative || relative === '..' || relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) || segments.length > 2
  ) {
    throw new Error('Unsafe storage directory path.');
  }
  let current = STORAGE_ROOT;
  for (const segment of segments) {
    current = path.join(current, segment);
    const handle = await fs.open(
      current,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
    );
    try {
      const stat = await handle.stat();
      if (!stat.isDirectory()) throw new Error('Unsafe storage directory path.');
      if ((stat.mode & 0o077) !== 0) await handle.chmod(0o700);
    } finally {
      await handle.close();
    }
  }
  await assertSafeStorageDirectory(directory);
}

// Iterate rather than recurse: even hostile legacy JSON must fail with a
// controlled error instead of overflowing the JavaScript call stack.
function assertBoundedParsedRecordDepth(record) {
  const pending = [[record, 0]];
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (depth > MAX_RECORD_NESTING_DEPTH) {
      throw new TypeError('Storage record nesting exceeds safety limit.');
    }
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') pending.push([child, depth + 1]);
      }
    }
  }
}

// Read at most the configured byte budget, even if another process appends
// after fstat. A size-only check followed by readFile() is not a memory bound.
async function readBoundedRecordText(handle, stat) {
  if (stat.size > MAX_RECORD_JSON_BYTES) {
    throw new Error('Storage record exceeds size limit.');
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_RECORD_JSON_BYTES + 1 - total));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > MAX_RECORD_JSON_BYTES) {
      throw new Error('Storage record exceeds size limit.');
    }
    chunks.push(buffer.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function readJsonSafely(targetPath) {
  await secureExistingReadDirectories(path.dirname(targetPath));
  // O_NOFOLLOW prevents a JSON record symlink from redirecting the read.
  const handle = await fs.open(targetPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    // O_NOFOLLOW rejects symbolic links, but hard links can still alias a
    // different tenant's record. Refuse multi-linked or non-regular records
    // before reading any bytes. This is a filesystem defense in depth;
    // authenticated account authorization remains a separate requirement.
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error('Unsafe storage record file.');
    }
    // Records written by older versions may still be group/world readable.
    // Tighten permissions on the already-validated, O_NOFOLLOW descriptor
    // before exposing their contents. Fail closed if hardening fails; do not
    // follow a pathname that could be swapped between check and chmod.
    if ((stat.mode & 0o077) !== 0) {
      await handle.chmod(0o600);
    }
    // Legacy or externally altered app-data may bypass the write validator.
    // Do not return a JSON primitive or array as a tenant workspace/vault;
    // all account storage APIs persist top-level JSON objects. In particular,
    // non-Google app-data has no separate embedded identity scope check.
    const record = JSON.parse(await readBoundedRecordText(handle, stat), (key, value) => {
      if (UNSAFE_JSON_KEYS.has(key)) throw new Error('Unsafe storage record property.');
      return value;
    });
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Unsafe storage record payload.');
    }
    assertBoundedParsedRecordDepth(record);
    return record;
  } finally {
    await handle.close();
  }
}

// Replace JSON records atomically: readers see the old complete record or the
// new complete record, never a partially written/truncated JSON document.
// File sync precedes rename and the containing directory is synced after
// rename. Hardware power-loss guarantees, multi-writer ordering and database
// transaction durability remain separate acceptance gates.
async function writeJsonAtomically(targetPath, value) {
  await assertSafeStorageDirectory(path.dirname(targetPath));
  const serialized = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_JSON_BYTES) {
    throw new Error('Storage record exceeds size limit.');
  }
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await assertSafeStorageDirectory(path.dirname(targetPath));
    await fs.rename(temporaryPath, targetPath);
    // fsync the containing directory so the rename itself is durable on
    // Linux filesystems after an abrupt restart. Syncing only the temporary
    // file does not guarantee that the new directory entry survives.
    // Fail closed if this cannot be confirmed: callers must not report a
    // successful durable save. A failed directory sync may still leave the
    // complete new record visible; retries must not imply exactly-once writes.
    const directoryHandle = await fs.open(
      path.dirname(targetPath),
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
    );
    try {
      const stat = await directoryHandle.stat();
      if (!stat.isDirectory()) throw new Error('Unsafe storage directory path.');
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

// Record identity is untrusted even when its filesystem path is contained.
// A copied or misrouted JSON file must not be returned as another tenant's
// document, remittance, transaction proof, Plaid vault, or extraction record.
// This is defense in depth; it does not replace route-level authorization.
function assertStoredRecordScope(record, expected) {
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    Object.entries(expected).some(([key, value]) => record[key] !== value)
  ) {
    throw new Error('Stored record scope does not match requested account.');
  }
  return record;
}

// Validate the full JSON tree before account-scope checks or filesystem I/O.
// A nested getter can change the Google identity between validation and
// serialization; a nested toJSON can silently replace persisted financial
// evidence. Inspect property descriptors without invoking accessors. Reject
// non-plain nested instances whose inherited serializers would run.
function assertNoCustomSerialization(value, ancestors = new WeakSet(), depth = 0) {
  // JSON.stringify silently drops undefined/functions/symbols, changes
  // non-finite numbers to null, and throws on bigint. Do not acknowledge a
  // durable save whose data is silently different from the submitted record.
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') {
    throw new TypeError('Storage record payload must contain JSON-compatible values.');
  }
  if (depth > MAX_RECORD_NESTING_DEPTH) {
    throw new TypeError('Storage record nesting exceeds safety limit.');
  }
  // Proxy traps can change a previously inspected identity or payload before
  // JSON serialization. Node's native check does not invoke user traps.
  if (nodeTypes.isProxy(value)) {
    throw new TypeError('Storage record payload must not contain Proxy objects.');
  }
  if (ancestors.has(value)) {
    throw new TypeError('Storage record payload must be acyclic JSON data.');
  }
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray
    ? prototype !== Array.prototype
    : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Storage record payload must contain plain nested JSON objects and arrays.');
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    // The built-in array length is not serialized. Other hidden or symbol
    // properties, including a hidden toJSON method, must not be discarded.
    if (isArray && key === 'length') continue;
    if (UNSAFE_JSON_KEYS.has(key)) {
      throw new TypeError('Unsafe storage record property.');
    }
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable ||
        (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
      throw new TypeError('Storage record payload must contain JSON-compatible enumerable properties.');
    }
    if (!Object.hasOwn(descriptor, 'value') ||
        (key === 'toJSON' && typeof descriptor.value === 'function')) {
      throw new TypeError('Storage record payload must not contain custom serialization or accessors.');
    }
    assertNoCustomSerialization(descriptor.value, ancestors, depth + 1);
  }
  // Sparse arrays serialize holes as null, so they must be rejected as well.
  if (isArray && Object.keys(value).length !== value.length) {
    throw new TypeError('Storage record payload must not contain sparse arrays.');
  }
  ancestors.delete(value);
}

// Reject malformed top-level records before opening or replacing any file.
// Nested values must also be inert JSON data: top-level validation alone does
// not protect app-data identities or scoped records from nested serializers.
function assertWritableRecordPayload(payload) {
  // Check before getPrototypeOf/Array.isArray, which may invoke or reject
  // revoked Proxy objects. A Proxy must not execute traps during validation.
  if (nodeTypes.isProxy(payload)) {
    throw new TypeError('Storage record payload must not contain Proxy objects.');
  }
  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    (Object.getPrototypeOf(payload) !== Object.prototype && Object.getPrototypeOf(payload) !== null)
  ) {
    throw new TypeError('Storage record payload must be a plain JSON object.');
  }
  assertNoCustomSerialization(payload);
  return payload;
}

// An untrusted caller may provide a record carrying another account's or
// resource's identity. Do not silently replace that evidence with the route
// parameters and acknowledge the write as if the scopes had agreed.
// Omitted scope fields are allowed for new records; supplied fields must agree.
// Capture an inert JSON snapshot synchronously, before the first filesystem
// await. Otherwise a caller can mutate a previously validated object while
// directory creation is pending, changing identity or financial evidence
// between validation and the eventual JSON.stringify.
function snapshotWritableRecord(payload) {
  assertWritableRecordPayload(payload);
  return JSON.parse(JSON.stringify(payload));
}

function assertWritableRecordScope(payload, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (Object.hasOwn(payload, key) && payload[key] !== value) {
      throw new Error('Storage record payload scope does not match requested account.');
    }
  }
}

// Google-backed workspaces must retain the authenticated account's email in
// their stored app-data identity. A regular file copied into a different
// account directory is otherwise readable even without a symlink/hard link.
// Legacy non-Google storage identifiers remain unchanged until their
// identity migration is designed and verified.
function assertGoogleAppDataScope(accountId, appData) {
  if (typeof accountId !== 'string' || !accountId.startsWith('google:')) {
    return appData;
  }
  const expectedEmail = accountId.slice('google:'.length);
  const actualEmail = appData?.user?.email;
  if (
    !expectedEmail ||
    expectedEmail !== expectedEmail.trim().toLowerCase() ||
    typeof actualEmail !== 'string' ||
    actualEmail.trim().toLowerCase() !== expectedEmail
  ) {
    throw new Error('Stored app data identity does not match requested account.');
  }
  return appData;
}

export async function loadAccountAppData(accountId) {
  try {
    return assertGoogleAppDataScope(accountId, await readJsonSafely(appDataPath(accountId)));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountAppData(accountId, appData) {
  const snapshot = snapshotWritableRecord(appData);
  assertGoogleAppDataScope(accountId, snapshot);
  const targetDirectory = accountDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await writeJsonAtomically(appDataPath(accountId), snapshot);

  return {
    accountId,
    savedAt: new Date().toISOString(),
  };
}

export async function loadAccountDocumentFile(accountId, fileId) {
  try {
    return assertStoredRecordScope(await readJsonSafely(accountFilePath(accountId, fileId)), { accountId, fileId });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountDocumentFile(accountId, fileId, payload) {
  const snapshot = snapshotWritableRecord(payload);
  assertWritableRecordScope(snapshot, { accountId, fileId });
  const targetDirectory = accountFilesDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await writeJsonAtomically(accountFilePath(accountId, fileId),
    {
        ...snapshot,
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
    return assertStoredRecordScope(await readJsonSafely(accountRemittancePath(accountId, vendorId)), { accountId, vendorId });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountRemittanceVault(accountId, vendorId, payload) {
  const snapshot = snapshotWritableRecord(payload);
  assertWritableRecordScope(snapshot, { accountId, vendorId });
  const targetDirectory = accountRemittanceDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await writeJsonAtomically(accountRemittancePath(accountId, vendorId),
    {
        ...snapshot,
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
    return assertStoredRecordScope(await readJsonSafely(accountTransactionProofPath(accountId)), { accountId });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountTransactionProofVault(accountId, payload) {
  const snapshot = snapshotWritableRecord(payload);
  assertWritableRecordScope(snapshot, { accountId });
  const targetDirectory = accountTransactionProofDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await writeJsonAtomically(accountTransactionProofPath(accountId),
    {
        ...snapshot,
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
    return assertStoredRecordScope(await readJsonSafely(accountPlaidPath(accountId)), { accountId });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountPlaidVault(accountId, payload) {
  const snapshot = snapshotWritableRecord(payload);
  assertWritableRecordScope(snapshot, { accountId });
  const targetDirectory = accountPlaidDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await writeJsonAtomically(accountPlaidPath(accountId),
    {
        ...snapshot,
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
    return assertStoredRecordScope(await readJsonSafely(accountExtractionPath(accountId, signature)), { accountId, signature });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveAccountExtractionRecord(accountId, signature, payload) {
  const snapshot = snapshotWritableRecord(payload);
  assertWritableRecordScope(snapshot, { accountId, signature });
  const targetDirectory = accountExtractionDirectory(accountId);
  await ensureDirectory(targetDirectory);
  await writeJsonAtomically(accountExtractionPath(accountId, signature),
    {
        ...snapshot,
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
