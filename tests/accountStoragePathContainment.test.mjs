import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import {
  loadAccountAppData,
  loadAccountDocumentFile,
  loadAccountPlaidVault,
  loadAccountRemittanceVault,
  loadAccountTransactionProofVault,
  loadAccountExtractionRecord,
  saveAccountAppData,
  saveAccountDocumentFile,
  saveAccountRemittanceVault,
  saveAccountTransactionProofVault,
  saveAccountPlaidVault,
  saveAccountExtractionRecord,
} from '../server/services/accountStorage.js';

test('storage reads reject traversal account IDs before accessing disk', async () => {
  for (const accountId of ['.', '..', '', ' ']) {
    await assert.rejects(loadAccountAppData(accountId), TypeError);
    await assert.rejects(loadAccountPlaidVault(accountId), TypeError);
  }
});

test('storage writes reject traversal account IDs before creating directories', async () => {
  for (const accountId of ['.', '..', '', ' ']) {
    await assert.rejects(saveAccountAppData(accountId, { user: { id: 'test' } }), TypeError);
    await assert.rejects(
      saveAccountDocumentFile(accountId, 'test-file', { base64Data: 'dGVzdA==' }),
      TypeError
    );
  }
});


test('account JSON replacements are atomic and preserve object payloads during concurrent writes', async () => {
  const accountId = `atomic-regression-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  try {
    await saveAccountAppData(accountId, { revision: 0, data: 'x'.repeat(8192) });
    const writes = Array.from({ length: 16 }, (_, index) =>
      saveAccountAppData(accountId, { revision: index + 1, data: 'x'.repeat(8192) })
    );
    const reads = Array.from({ length: 32 }, async () => {
      const value = await loadAccountAppData(accountId);
      assert.equal(typeof value, 'object');
      assert.ok(Number.isInteger(value.revision));
      assert.equal(value.data.length, 8192);
    });
    await Promise.all([...writes, ...reads]);
    const final = await loadAccountAppData(accountId);
    assert.equal(typeof final, 'object');
    assert.ok(final.revision >= 1 && final.revision <= 16);
    assert.deepEqual(await fs.readdir(directory), ['app-data.json']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('symlinked account directories cannot redirect reads or writes into another tenant', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimId = `symlink-victim-${randomUUID()}`;
  const aliasId = `symlink-alias-${randomUUID()}`;
  const victimPath = path.join(root, victimId);
  const aliasPath = path.join(root, aliasId);
  try {
    await saveAccountAppData(victimId, { owner: 'victim' });
    await fs.symlink(victimPath, aliasPath, 'dir');
    await assert.rejects(loadAccountAppData(aliasId), /Unsafe storage directory path/);
    await assert.rejects(saveAccountAppData(aliasId, { owner: 'attacker' }), /Unsafe storage directory path/);
    assert.deepEqual(await loadAccountAppData(victimId), { owner: 'victim' });
  } finally {
    await fs.unlink(aliasPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('symlinked document subdirectories cannot cross account storage boundaries', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimId = `symlink-victim-${randomUUID()}`;
  const aliasId = `symlink-alias-${randomUUID()}`;
  const victimPath = path.join(root, victimId);
  const aliasPath = path.join(root, aliasId);
  try {
    await saveAccountDocumentFile(victimId, 'file-1', { contents: 'private' });
    await fs.mkdir(aliasPath);
    await fs.symlink(path.join(victimPath, 'files'), path.join(aliasPath, 'files'), 'dir');
    await assert.rejects(loadAccountDocumentFile(aliasId, 'file-1'), /Unsafe storage directory path/);
    await assert.rejects(saveAccountDocumentFile(aliasId, 'file-1', { contents: 'changed' }), /Unsafe storage directory path/);
    assert.equal((await loadAccountDocumentFile(victimId, 'file-1')).contents, 'private');
  } finally {
    await fs.rm(aliasPath, { recursive: true, force: true });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('symlinked JSON records are not followed during account reads', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimId = `record-victim-${randomUUID()}`;
  const aliasId = `record-alias-${randomUUID()}`;
  const victimPath = path.join(root, victimId);
  const aliasPath = path.join(root, aliasId);
  try {
    await saveAccountAppData(victimId, { secret: 'do-not-read' });
    await fs.mkdir(aliasPath);
    await fs.symlink(path.join(victimPath, 'app-data.json'), path.join(aliasPath, 'app-data.json'));
    await assert.rejects(loadAccountAppData(aliasId), (error) => error?.code === 'ELOOP');
    assert.deepEqual(await loadAccountAppData(victimId), { secret: 'do-not-read' });
  } finally {
    await fs.rm(aliasPath, { recursive: true, force: true });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('hard-linked account records cannot expose another tenant data', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimId = `hardlink-victim-${randomUUID()}`;
  const aliasId = `hardlink-alias-${randomUUID()}`;
  const victimPath = path.join(root, victimId);
  const aliasPath = path.join(root, aliasId);
  try {
    await saveAccountAppData(victimId, { secret: 'victim-only' });
    await fs.mkdir(aliasPath);
    await fs.link(path.join(victimPath, 'app-data.json'), path.join(aliasPath, 'app-data.json'));
    await assert.rejects(loadAccountAppData(aliasId), /Unsafe storage record file/);
    // Fail closed while a hard link exists, even for the original account.
    await assert.rejects(loadAccountAppData(victimId), /Unsafe storage record file/);
    await fs.unlink(path.join(aliasPath, 'app-data.json'));
    assert.deepEqual(await loadAccountAppData(victimId), { secret: 'victim-only' });
  } finally {
    await fs.rm(aliasPath, { recursive: true, force: true });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('atomic document replacement breaks hard links without modifying the victim record', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimId = `hardlink-document-victim-${randomUUID()}`;
  const aliasId = `hardlink-document-alias-${randomUUID()}`;
  const victimPath = path.join(root, victimId);
  const aliasPath = path.join(root, aliasId);
  try {
    await saveAccountDocumentFile(victimId, 'file-1', { contents: 'private' });
    await fs.mkdir(path.join(aliasPath, 'files'), { recursive: true });
    await fs.link(path.join(victimPath, 'files', 'file-1.json'), path.join(aliasPath, 'files', 'file-1.json'));
    await assert.rejects(loadAccountDocumentFile(aliasId, 'file-1'), /Unsafe storage record file/);
    await saveAccountDocumentFile(aliasId, 'file-1', { contents: 'replacement' });
    assert.equal((await loadAccountDocumentFile(aliasId, 'file-1')).contents, 'replacement');
    assert.equal((await loadAccountDocumentFile(victimId, 'file-1')).contents, 'private');
  } finally {
    await fs.rm(aliasPath, { recursive: true, force: true });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('account JSON reads refuse non-regular record paths', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const accountId = `directory-record-${randomUUID()}`;
  const accountPath = path.join(root, accountId);
  try {
    await fs.mkdir(path.join(accountPath, 'app-data.json'), { recursive: true });
    await assert.rejects(loadAccountAppData(accountId), /Unsafe storage record file/);
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});


test('atomic account saves fsync the containing directory and fail closed on sync errors', async () => {
  const accountId = `directory-sync-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const originalOpen = fs.open;
  let directorySyncs = 0;
  let injectFailure = false;
  // Intercept only directory handles; real file writes and real directory
  // fsync still execute. This tests the durability acknowledgment boundary.
  fs.open = async (target, flags, ...args) => {
    const handle = await originalOpen(target, flags, ...args);
    if (target !== directory || typeof flags !== 'number' ||
        (flags & fsConstants.O_DIRECTORY) !== fsConstants.O_DIRECTORY) {
      return handle;
    }
    return {
      stat: () => handle.stat(),
      sync: async () => {
        directorySyncs += 1;
        if (injectFailure) throw new Error('simulated directory sync failure');
        await handle.sync();
      },
      close: () => handle.close(),
    };
  };
  try {
    await saveAccountAppData(accountId, { revision: 1 });
    assert.equal(directorySyncs, 1, 'successful save must sync parent directory');
    assert.deepEqual(await loadAccountAppData(accountId), { revision: 1 });

    injectFailure = true;
    await assert.rejects(
      saveAccountAppData(accountId, { revision: 2 }),
      /simulated directory sync failure/
    );
    assert.equal(directorySyncs, 2, 'failed directory sync must not be acknowledged');
    assert.deepEqual(await fs.readdir(directory), ['app-data.json']);
    // Rename precedes directory fsync; the new complete record may already
    // be visible despite an error, so callers must not blindly retry a
    // non-idempotent operation based on this error.
    assert.deepEqual(await loadAccountAppData(accountId), { revision: 2 });
  } finally {
    fs.open = originalOpen;
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('scoped records reject independent copied JSON from a different account', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimId = `scope-victim-${randomUUID()}`;
  const aliasId = `scope-alias-${randomUUID()}`;
  const victimPath = path.join(root, victimId);
  const aliasPath = path.join(root, aliasId);
  const fixtures = [
    { directory: 'files', filename: 'doc-1.json', save: () => saveAccountDocumentFile(victimId, 'doc-1', { contents: 'private' }), read: () => loadAccountDocumentFile(aliasId, 'doc-1') },
    { directory: 'remittance', filename: 'vendor-1.json', save: () => saveAccountRemittanceVault(victimId, 'vendor-1', { secret: 'private' }), read: () => loadAccountRemittanceVault(aliasId, 'vendor-1') },
    { directory: 'transaction-proof-chains', filename: 'chains.json', save: () => saveAccountTransactionProofVault(victimId, { secret: 'private' }), read: () => loadAccountTransactionProofVault(aliasId) },
    { directory: 'plaid', filename: 'connections.json', save: () => saveAccountPlaidVault(victimId, { secret: 'private' }), read: () => loadAccountPlaidVault(aliasId) },
    { directory: 'extractions', filename: 'signature-1.json', save: () => saveAccountExtractionRecord(victimId, 'signature-1', { secret: 'private' }), read: () => loadAccountExtractionRecord(aliasId, 'signature-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save();
      const aliasDirectory = path.join(aliasPath, fixture.directory);
      await fs.mkdir(aliasDirectory, { recursive: true });
      // An ordinary copy (not a symlink or hard link) bypasses inode guards.
      await fs.copyFile(
        path.join(victimPath, fixture.directory, fixture.filename),
        path.join(aliasDirectory, fixture.filename)
      );
      await assert.rejects(fixture.read(), /Stored record scope does not match requested account/);
    }
    assert.equal((await loadAccountDocumentFile(victimId, 'doc-1')).contents, 'private');
  } finally {
    await fs.rm(aliasPath, { recursive: true, force: true });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('scoped records reject missing or incorrect record identifiers without suppressing legitimate reads', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const accountId = `scope-integrity-${randomUUID()}`;
  const accountPath = path.join(root, accountId);
  try {
    await saveAccountDocumentFile(accountId, 'doc-1', { contents: 'legitimate' });
    await saveAccountRemittanceVault(accountId, 'vendor-1', { amount: 123 });
    await saveAccountTransactionProofVault(accountId, { proof: true });
    await saveAccountPlaidVault(accountId, { connections: [] });
    await saveAccountExtractionRecord(accountId, 'signature-1', { extraction: true });
    assert.equal((await loadAccountDocumentFile(accountId, 'doc-1')).contents, 'legitimate');
    assert.equal((await loadAccountRemittanceVault(accountId, 'vendor-1')).amount, 123);
    assert.equal((await loadAccountTransactionProofVault(accountId)).proof, true);
    assert.deepEqual((await loadAccountPlaidVault(accountId)).connections, []);
    assert.equal((await loadAccountExtractionRecord(accountId, 'signature-1')).extraction, true);
    const filePath = path.join(accountPath, 'files', 'doc-1.json');
    await fs.writeFile(filePath, JSON.stringify({ accountId, contents: 'missing fileId' }));
    await assert.rejects(loadAccountDocumentFile(accountId, 'doc-1'), /Stored record scope does not match requested account/);
    await fs.writeFile(filePath, JSON.stringify({ accountId, fileId: 'other-doc', contents: 'wrong fileId' }));
    await assert.rejects(loadAccountDocumentFile(accountId, 'doc-1'), /Stored record scope does not match requested account/);
    await fs.writeFile(filePath, JSON.stringify(['not a record']));
    await assert.rejects(loadAccountDocumentFile(accountId, 'doc-1'), /Stored record scope does not match requested account/);
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});
