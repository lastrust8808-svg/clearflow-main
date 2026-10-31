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


test('invisible Unicode account identifiers are rejected before storage access', async () => {
  for (const accountId of ['tenant\u200B-a', 'tenant\u202E-a', 'tenant\u2066-a']) {
    await assert.rejects(loadAccountAppData(accountId), TypeError);
    await assert.rejects(saveAccountAppData(accountId, { data: 'private' }), TypeError);
    await assert.rejects(loadAccountDocumentFile(accountId, 'file-1'), TypeError);
    await assert.rejects(saveAccountDocumentFile(accountId, 'file-1', { data: 'private' }), TypeError);
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
      chmod: (mode) => handle.chmod(mode),
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
    await assert.rejects(loadAccountDocumentFile(accountId, 'doc-1'), /Unsafe storage record payload/);
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});

test('explicit legacy app-data identity rejects copied records and conflicting writes', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const sourceId = `legacy-source-${randomUUID()}`;
  const destinationId = `legacy-destination-${randomUUID()}`;
  const sourcePath = path.join(root, sourceId);
  const destinationPath = path.join(root, destinationId);
  try {
    const original = { accountId: sourceId, revision: 1, ledger: { cents: 2500 } };
    await saveAccountAppData(sourceId, original);
    await fs.mkdir(destinationPath, { recursive: true });
    // A regular copy has no symlink/hard-link evidence. Explicit identity
    // must still reject cross-account reads for non-Google legacy records.
    await fs.copyFile(
      path.join(sourcePath, 'app-data.json'),
      path.join(destinationPath, 'app-data.json')
    );
    await assert.rejects(
      loadAccountAppData(destinationId),
      /Stored app data accountId does not match requested account/
    );
    await assert.rejects(
      saveAccountAppData(destinationId, { ...original, revision: 2 }),
      /Stored app data accountId does not match requested account/
    );
    assert.deepEqual(await loadAccountAppData(sourceId), original);
    // Correctly scoped explicit identities remain supported.
    const valid = { accountId: destinationId, revision: 3 };
    await saveAccountAppData(destinationId, valid);
    assert.deepEqual(await loadAccountAppData(destinationId), valid);
    // Existing legacy records without an embedded accountId remain readable.
    await saveAccountAppData(destinationId, { revision: 4 });
    assert.deepEqual(await loadAccountAppData(destinationId), { revision: 4 });
  } finally {
    await fs.rm(destinationPath, { recursive: true, force: true });
    await fs.rm(sourcePath, { recursive: true, force: true });
  }
});

test('google app-data scope rejects an independently copied workspace from another account', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const victimEmail = `victim-${randomUUID()}@example.test`;
  const aliasEmail = `alias-${randomUUID()}@example.test`;
  const victimId = `google:${victimEmail}`;
  const aliasId = `google:${aliasEmail}`;
  const victimPath = path.join(root, encodeURIComponent(victimId));
  const aliasPath = path.join(root, encodeURIComponent(aliasId));
  try {
    await saveAccountAppData(victimId, { user: { email: victimEmail }, revision: 1 });
    await fs.mkdir(aliasPath, { recursive: true });
    // A normal file copy has no symlink or hardlink marker; the embedded
    // account identity must still prevent it from being served to the alias.
    await fs.copyFile(path.join(victimPath, 'app-data.json'), path.join(aliasPath, 'app-data.json'));
    await assert.rejects(loadAccountAppData(aliasId), /Stored app data identity does not match requested account/);
    assert.equal((await loadAccountAppData(victimId)).user.email, victimEmail);
  } finally {
    await fs.rm(aliasPath, { recursive: true, force: true });
    await fs.rm(victimPath, { recursive: true, force: true });
  }
});

test('google app-data scope rejects mismatched or missing identity before writing', async () => {
  const accountEmail = `owner-${randomUUID()}@example.test`;
  const accountId = `google:${accountEmail}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', encodeURIComponent(accountId));
  try {
    for (const payload of [
      { user: { email: 'someone-else@example.test' } },
      { user: { email: '' } },
      { user: {} },
      {},
    ]) {
      await assert.rejects(saveAccountAppData(accountId, payload), /Stored app data identity does not match requested account/);
    }
    await assert.rejects(fs.stat(directory), (error) => error?.code === 'ENOENT');
    // Case/outer whitespace in a profile email is normalized; account ID
    // itself remains canonical and the existing app-data shape is preserved.
    const original = { user: { email: ` ${accountEmail.toUpperCase()} ` }, revision: 2 };
    await saveAccountAppData(accountId, original);
    assert.deepEqual(await loadAccountAppData(accountId), original);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('malformed top-level write payloads never overwrite existing app data', async () => {
  const accountId = `payload-app-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  try {
    const original = { revision: 1, settings: { retained: true } };
    await saveAccountAppData(accountId, original);
    for (const invalid of [null, [], ['bad'], 'bad', 42, new Date()]) {
      await assert.rejects(
        saveAccountAppData(accountId, invalid),
        /Storage record payload must be a plain JSON object/
      );
      assert.deepEqual(await loadAccountAppData(accountId), original);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('malformed top-level write payloads never overwrite scoped vault and document records', async () => {
  const accountId = `payload-scoped-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'signature-1', value), read: () => loadAccountExtractionRecord(accountId, 'signature-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: true });
      const before = await fixture.read();
      for (const invalid of [null, [], 'bad', 42, new Date()]) {
        await assert.rejects(
          fixture.save(invalid),
          /Storage record payload must be a plain JSON object/
        );
        assert.deepEqual(await fixture.read(), before);
      }
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('custom JSON serialization and accessors cannot replace valid tenant storage records', async () => {
  const accountId = `serialization-guard-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (value) => saveAccountAppData(accountId, value), read: () => loadAccountAppData(accountId) },
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'signature-1', value), read: () => loadAccountExtractionRecord(accountId, 'signature-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: true });
      const before = await fixture.read();
      const customSerializer = { retained: false, toJSON() { return []; } };
      const accessor = { get retained() { return false; } };
      for (const invalid of [customSerializer, accessor]) {
        await assert.rejects(
          fixture.save(invalid),
          /Storage record payload must not contain custom serialization or accessors/
        );
        assert.deepEqual(await fixture.read(), before);
      }
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('nested serializers and accessors cannot replace persisted account records', async () => {
  const accountId = `nested-serialization-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (value) => saveAccountAppData(accountId, value), read: () => loadAccountAppData(accountId) },
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'signature-1', value), read: () => loadAccountExtractionRecord(accountId, 'signature-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: { revision: 1 } });
      const before = await fixture.read();
      let accessorCalls = 0;
      const nestedAccessor = { get revision() { accessorCalls += 1; return 2; } };
      const invalid = [
        { retained: { toJSON() { return { revision: 2 }; } } },
        { retained: [nestedAccessor] },
        { retained: [new Date()] },
      ];
      for (const payload of invalid) {
        await assert.rejects(fixture.save(payload), /custom serialization or accessors|plain nested JSON/);
        assert.deepEqual(await fixture.read(), before);
      }
      assert.equal(accessorCalls, 0, 'nested getter must not execute during validation');
      await fixture.save({ retained: [{ revision: 2 }] });
      assert.deepEqual((await fixture.read()).retained, [{ revision: 2 }]);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('nested Google identity accessors and cyclic objects fail before storage writes', async () => {
  const email = `nested-google-${randomUUID()}@example.test`;
  const accountId = `google:${email}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', encodeURIComponent(accountId));
  let getterCalls = 0;
  const cyclic = { user: { email } };
  cyclic.self = cyclic;
  try {
    await assert.rejects(
      saveAccountAppData(accountId, { user: { get email() { getterCalls += 1; return email; } } }),
      /custom serialization or accessors/
    );
    assert.equal(getterCalls, 0, 'identity getter must not execute during scope validation');
    await assert.rejects(saveAccountAppData(accountId, cyclic), /acyclic JSON data/);
    await assert.rejects(fs.stat(directory), (error) => error?.code === 'ENOENT');
    await saveAccountAppData(accountId, { user: { email }, settings: [{ enabled: true }] });
    assert.deepEqual((await loadAccountAppData(accountId)).settings, [{ enabled: true }]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('lossy JSON values and hidden properties cannot overwrite account or vault records', async () => {
  const accountId = `lossy-json-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (value) => saveAccountAppData(accountId, value), read: () => loadAccountAppData(accountId) },
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'signature-1', value), read: () => loadAccountExtractionRecord(accountId, 'signature-1') },
  ];
  const hidden = Object.defineProperty({ retained: true }, 'hidden', { value: 'lost', enumerable: false });
  const symbolKey = { retained: true, [Symbol('hidden')]: 'lost' };
  const extraArrayProperty = Object.assign([1], { ignored: 'lost' });
  const invalid = [
    { data: { amount: NaN } },
    { data: [Infinity] },
    { data: { missing: undefined } },
    { data: [() => 'lost'] },
    { data: [Symbol('lost')] },
    { data: [1n] },
    { data: Array(1) },
    { data: hidden },
    { data: symbolKey },
    { data: extraArrayProperty },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: true });
      const before = await fixture.read();
      for (const payload of invalid) {
        await assert.rejects(fixture.save(payload), /JSON-compatible|sparse arrays/);
        assert.deepEqual(await fixture.read(), before, 'invalid payload must preserve the previous record');
      }
      await fixture.save({ data: [0, 1, 2], nested: { finite: 0.25, empty: null } });
      const saved = await fixture.read();
      assert.deepEqual(saved.data, [0, 1, 2]);
      assert.deepEqual(saved.nested, { finite: 0.25, empty: null });
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('conflicting scoped payload identities fail before replacing tenant records', async () => {
  const accountId = `payload-scope-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    {
      save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value),
      read: () => loadAccountDocumentFile(accountId, 'doc-1'),
      identity: { accountId, fileId: 'doc-1' },
      conflictingResource: { fileId: 'doc-2' },
    },
    {
      save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value),
      read: () => loadAccountRemittanceVault(accountId, 'vendor-1'),
      identity: { accountId, vendorId: 'vendor-1' },
      conflictingResource: { vendorId: 'vendor-2' },
    },
    {
      save: (value) => saveAccountTransactionProofVault(accountId, value),
      read: () => loadAccountTransactionProofVault(accountId),
      identity: { accountId },
    },
    {
      save: (value) => saveAccountPlaidVault(accountId, value),
      read: () => loadAccountPlaidVault(accountId),
      identity: { accountId },
    },
    {
      save: (value) => saveAccountExtractionRecord(accountId, 'signature-1', value),
      read: () => loadAccountExtractionRecord(accountId, 'signature-1'),
      identity: { accountId, signature: 'signature-1' },
      conflictingResource: { signature: 'signature-2' },
    },
  ];
  try {
    for (const fixture of fixtures) {
      // Existing clients may omit identity fields or supply matching ones.
      await fixture.save({ retained: true });
      const original = await fixture.read();
      await assert.rejects(
        fixture.save({ accountId: 'another-tenant', retained: false }),
        /Storage record payload scope does not match requested account/
      );
      if (fixture.conflictingResource) {
        await assert.rejects(
          fixture.save({ ...fixture.conflictingResource, retained: false }),
          /Storage record payload scope does not match requested account/
        );
      }
      assert.deepEqual(await fixture.read(), original, 'rejected scope must preserve existing data');
      await fixture.save({ ...fixture.identity, retained: 'valid' });
      assert.equal((await fixture.read()).retained, 'valid');
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('conflicting scoped identities cannot create new account directories', async () => {
  const accountId = `payload-scope-new-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  try {
    await assert.rejects(
      saveAccountPlaidVault(accountId, { accountId: 'other-tenant', connections: [] }),
      /Storage record payload scope does not match requested account/
    );
    await assert.rejects(fs.stat(root), (error) => error?.code === 'ENOENT');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('Proxy-backed top-level payloads cannot execute traps or replace any tenant record', async () => {
  const accountId = `proxy-top-level-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (value) => saveAccountAppData(accountId, value), read: () => loadAccountAppData(accountId) },
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'sig-1', value), read: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  let trapCalls = 0;
  const handler = {
    getPrototypeOf() { trapCalls++; return Object.prototype; },
    ownKeys() { trapCalls++; return ['retained']; },
    get(target, key) { trapCalls++; return Reflect.get(target, key); },
  };
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: true });
      const before = await fixture.read();
      const proxy = new Proxy({ retained: false }, handler);
      await assert.rejects(fixture.save(proxy), /must not contain Proxy objects/);
      assert.deepEqual(await fixture.read(), before);
    }
    assert.equal(trapCalls, 0, 'validation must not invoke Proxy traps');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('nested and revoked Proxy objects fail before serialization and preserve tenant data', async () => {
  const accountId = `proxy-nested-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  let trapCalls = 0;
  const handler = {
    getPrototypeOf() { trapCalls++; return Object.prototype; },
    ownKeys() { trapCalls++; return ['amount']; },
    get(target, key) { trapCalls++; return Reflect.get(target, key); },
  };
  const revoked = Proxy.revocable({ amount: 2 }, handler);
  revoked.revoke();
  const fixtures = [
    { save: (value) => saveAccountAppData(accountId, value), read: () => loadAccountAppData(accountId) },
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'sig-1', value), read: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: { amount: 1 } });
      const before = await fixture.read();
      for (const nested of [new Proxy({ amount: 2 }, handler), new Proxy([2], handler), revoked.proxy]) {
        await assert.rejects(fixture.save({ retained: [nested] }), /must not contain Proxy objects/);
        assert.deepEqual(await fixture.read(), before);
      }
      await fixture.save({ retained: [{ amount: 3 }] });
      assert.deepEqual((await fixture.read()).retained, [{ amount: 3 }]);
    }
    assert.equal(trapCalls, 0, 'nested Proxy traps must not run during validation');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('storage writers snapshot validated nested evidence before asynchronous filesystem I/O', async () => {
  const accountId = `snapshot-write-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (value) => saveAccountAppData(accountId, value), read: () => loadAccountAppData(accountId) },
    { save: (value) => saveAccountDocumentFile(accountId, 'doc-1', value), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (value) => saveAccountRemittanceVault(accountId, 'vendor-1', value), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (value) => saveAccountTransactionProofVault(accountId, value), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (value) => saveAccountPlaidVault(accountId, value), read: () => loadAccountPlaidVault(accountId) },
    { save: (value) => saveAccountExtractionRecord(accountId, 'signature-1', value), read: () => loadAccountExtractionRecord(accountId, 'signature-1') },
  ];
  try {
    for (const fixture of fixtures) {
      const submitted = { evidence: { amountMinor: 1250 }, status: 'reviewed' };
      const pending = fixture.save(submitted);
      // save() has already validated the object but has yielded at its first
      // filesystem await. A caller may legitimately reuse or mutate it now.
      submitted.evidence.amountMinor = 999999;
      submitted.status = 'tampered';
      await pending;
      const stored = await fixture.read();
      assert.deepEqual(stored.evidence, { amountMinor: 1250 });
      assert.equal(stored.status, 'reviewed');
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('Google workspace identity cannot change after save validation while filesystem work is pending', async () => {
  const email = `snapshot-owner-${randomUUID()}@example.test`;
  const accountId = `google:${email}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', encodeURIComponent(accountId));
  try {
    const submitted = { user: { email }, settings: { revision: 1 } };
    const pending = saveAccountAppData(accountId, submitted);
    submitted.user.email = 'other@example.test';
    submitted.settings.revision = 2;
    await pending;
    const stored = await loadAccountAppData(accountId);
    assert.equal(stored.user.email, email);
    assert.deepEqual(stored.settings, { revision: 1 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('shared account storage root is private for writes and legacy reads', async () => {
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const accountId = `private-storage-root-${randomUUID()}`;
  const accountPath = path.join(root, accountId);
  const absentId = `missing-storage-root-record-${randomUUID()}`;
  try {
    await saveAccountAppData(accountId, { revision: 1 });
    assert.equal((await fs.stat(root)).mode & 0o777, 0o700);

    // A legacy installation may have made the shared root world-writable.
    // Writes must harden it before acknowledging another saved record.
    await fs.chmod(root, 0o777);
    await saveAccountDocumentFile(accountId, 'doc-1', { revision: 2 });
    assert.equal((await fs.stat(root)).mode & 0o777, 0o700);

    // Reads must harden the root too, without manufacturing missing records.
    await fs.chmod(root, 0o755);
    assert.deepEqual(await loadAccountAppData(accountId), { revision: 1 });
    assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
    assert.equal(await loadAccountAppData(absentId), null);
    await assert.rejects(fs.stat(path.join(root, absentId)), { code: 'ENOENT' });
  } finally {
    await fs.chmod(root, 0o700).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});

test('new account and record directories restrict access to their owning OS user', async () => {
  const accountId = `private-directory-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
  const accountPath = path.join(root, accountId);
  try {
    await saveAccountAppData(accountId, { revision: 1 });
    await saveAccountDocumentFile(accountId, 'doc-1', { contents: 'private' });
    for (const directory of [accountPath, path.join(accountPath, 'files')]) {
      const stat = await fs.stat(directory);
      assert.ok(stat.isDirectory());
      assert.equal(stat.mode & 0o077, 0, `${directory} must not allow group/other access`);
    }
    assert.deepEqual(await loadAccountAppData(accountId), { revision: 1 });
    assert.equal((await loadAccountDocumentFile(accountId, 'doc-1')).contents, 'private');
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});


test('existing permissive tenant directories are tightened before saving records', async () => {
  const accountId = `legacy-permissions-${randomUUID()}`;
  const accountPath = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const filesPath = path.join(accountPath, 'files');
  try {
    await fs.mkdir(filesPath, { recursive: true, mode: 0o700 });
    // Simulate legacy directories created under a permissive umask.
    await fs.chmod(accountPath, 0o755);
    await fs.chmod(filesPath, 0o777);
    await saveAccountDocumentFile(accountId, 'doc-1', { contents: 'private' });
    for (const directory of [accountPath, filesPath]) {
      const stat = await fs.stat(directory);
      assert.equal(stat.mode & 0o077, 0, `${directory} must be private after save`);
    }
    assert.equal((await loadAccountDocumentFile(accountId, 'doc-1')).contents, 'private');
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});

test('legacy permissive record files become owner-only before their contents are returned', async () => {
  const accountId = `legacy-record-mode-${randomUUID()}`;
  const accountPath = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    {
      file: 'app-data.json',
      save: () => saveAccountAppData(accountId, { revision: 1 }),
      load: () => loadAccountAppData(accountId),
    },
    {
      file: path.join('files', 'doc-1.json'),
      save: () => saveAccountDocumentFile(accountId, 'doc-1', { revision: 1 }),
      load: () => loadAccountDocumentFile(accountId, 'doc-1'),
    },
    {
      file: path.join('remittance', 'vendor-1.json'),
      save: () => saveAccountRemittanceVault(accountId, 'vendor-1', { revision: 1 }),
      load: () => loadAccountRemittanceVault(accountId, 'vendor-1'),
    },
    {
      file: path.join('transaction-proof-chains', 'chains.json'),
      save: () => saveAccountTransactionProofVault(accountId, { revision: 1 }),
      load: () => loadAccountTransactionProofVault(accountId),
    },
    {
      file: path.join('plaid', 'connections.json'),
      save: () => saveAccountPlaidVault(accountId, { revision: 1 }),
      load: () => loadAccountPlaidVault(accountId),
    },
    {
      file: path.join('extractions', 'sig-1.json'),
      save: () => saveAccountExtractionRecord(accountId, 'sig-1', { revision: 1 }),
      load: () => loadAccountExtractionRecord(accountId, 'sig-1'),
    },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save();
      const recordPath = path.join(accountPath, fixture.file);
      // Emulate a legacy installation where record files were world-readable
      // or writable. The read path must harden the actual opened inode.
      await fs.chmod(recordPath, 0o666);
      assert.equal((await fs.stat(recordPath)).mode & 0o077, 0o066);
      assert.equal((await fixture.load()).revision, 1);
      assert.equal((await fs.stat(recordPath)).mode & 0o777, 0o600);
    }
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});


test('read-only access hardens legacy tenant directories without creating missing records', async () => {
  const accountId = `legacy-read-directories-${randomUUID()}`;
  const accountPath = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    {
      file: 'app-data.json',
      save: () => saveAccountAppData(accountId, { revision: 1 }),
      load: () => loadAccountAppData(accountId),
    },
    {
      file: path.join('files', 'doc-1.json'),
      save: () => saveAccountDocumentFile(accountId, 'doc-1', { revision: 1 }),
      load: () => loadAccountDocumentFile(accountId, 'doc-1'),
    },
    {
      file: path.join('remittance', 'vendor-1.json'),
      save: () => saveAccountRemittanceVault(accountId, 'vendor-1', { revision: 1 }),
      load: () => loadAccountRemittanceVault(accountId, 'vendor-1'),
    },
    {
      file: path.join('transaction-proof-chains', 'chains.json'),
      save: () => saveAccountTransactionProofVault(accountId, { revision: 1 }),
      load: () => loadAccountTransactionProofVault(accountId),
    },
    {
      file: path.join('plaid', 'connections.json'),
      save: () => saveAccountPlaidVault(accountId, { revision: 1 }),
      load: () => loadAccountPlaidVault(accountId),
    },
    {
      file: path.join('extractions', 'sig-1.json'),
      save: () => saveAccountExtractionRecord(accountId, 'sig-1', { revision: 1 }),
      load: () => loadAccountExtractionRecord(accountId, 'sig-1'),
    },
  ];
  const absentAccountId = `missing-read-directory-${randomUUID()}`;
  const absentAccountPath = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', absentAccountId);
  try {
    for (const fixture of fixtures) await fixture.save();
    await fs.chmod(accountPath, 0o755);
    for (const fixture of fixtures) {
      const directory = path.dirname(path.join(accountPath, fixture.file));
      if (directory !== accountPath) await fs.chmod(directory, 0o777);
    }
    for (const fixture of fixtures) {
      assert.equal((await fixture.load()).revision, 1);
      const directory = path.dirname(path.join(accountPath, fixture.file));
      for (const candidate of [accountPath, directory]) {
        assert.equal((await fs.stat(candidate)).mode & 0o777, 0o700, candidate);
      }
    }
    assert.equal(await loadAccountDocumentFile(accountId, 'missing-document'), null);
    assert.equal(await loadAccountAppData(absentAccountId), null);
    await assert.rejects(fs.stat(absentAccountPath), { code: 'ENOENT' });
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
    await fs.rm(absentAccountPath, { recursive: true, force: true });
  }
});

test('legacy malformed JSON roots fail closed across all account storage readers', async () => {
  const accountId = `legacy-json-root-${randomUUID()}`;
  const accountPath = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { file: 'app-data.json', save: () => saveAccountAppData(accountId, { revision: 1 }), load: () => loadAccountAppData(accountId) },
    { file: path.join('files', 'doc-1.json'), save: () => saveAccountDocumentFile(accountId, 'doc-1', { revision: 1 }), load: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { file: path.join('remittance', 'vendor-1.json'), save: () => saveAccountRemittanceVault(accountId, 'vendor-1', { revision: 1 }), load: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { file: path.join('transaction-proof-chains', 'chains.json'), save: () => saveAccountTransactionProofVault(accountId, { revision: 1 }), load: () => loadAccountTransactionProofVault(accountId) },
    { file: path.join('plaid', 'connections.json'), save: () => saveAccountPlaidVault(accountId, { revision: 1 }), load: () => loadAccountPlaidVault(accountId) },
    { file: path.join('extractions', 'sig-1.json'), save: () => saveAccountExtractionRecord(accountId, 'sig-1', { revision: 1 }), load: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save();
      const recordPath = path.join(accountPath, fixture.file);
      for (const malformedRoot of ['null', '[]', '"text"', '42', 'true']) {
        // Simulate an older writer or external corruption bypassing today's
        // strict write validation; never return these as valid tenant data.
        await fs.writeFile(recordPath, malformedRoot);
        await assert.rejects(fixture.load(), /Unsafe storage record payload/);
      }
      await fixture.save();
      assert.equal((await fixture.load()).revision, 1);
    }
    assert.equal(await loadAccountAppData(`absent-json-root-${randomUUID()}`), null);
  } finally {
    await fs.rm(accountPath, { recursive: true, force: true });
  }
});


test('stored account JSON rejects prototype-polluting keys on writes and legacy reads', async () => {
  const accountId = `unsafe-json-key-${randomUUID()}`;
  const directory = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { file: 'app-data.json', save: (v) => saveAccountAppData(accountId, v), read: () => loadAccountAppData(accountId) },
    { file: 'files/doc-1.json', save: (v) => saveAccountDocumentFile(accountId, 'doc-1', v), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { file: 'remittance/vendor-1.json', save: (v) => saveAccountRemittanceVault(accountId, 'vendor-1', v), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { file: 'transaction-proof-chains/chains.json', save: (v) => saveAccountTransactionProofVault(accountId, v), read: () => loadAccountTransactionProofVault(accountId) },
    { file: 'plaid/connections.json', save: (v) => saveAccountPlaidVault(accountId, v), read: () => loadAccountPlaidVault(accountId) },
    { file: 'extractions/signature-1.json', save: (v) => saveAccountExtractionRecord(accountId, 'signature-1', v), read: () => loadAccountExtractionRecord(accountId, 'signature-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: true });
      for (const key of ['__proto__', 'constructor', 'prototype']) {
        // JSON.parse preserves these own keys without invoking JS setters.
        const unsafe = JSON.parse(`{"nested":{"${key}":{"polluted":true}}}`);
        const before = await fixture.read();
        await assert.rejects(fixture.save(unsafe), /Unsafe storage record property/);
        assert.deepEqual(await fixture.read(), before, 'rejected write preserves prior record');
        // Older or externally modified records must also fail closed on read.
        await fs.writeFile(path.join(directory, fixture.file), JSON.stringify({ ...before, ...unsafe }));
        await assert.rejects(fixture.read(), /Unsafe storage record property/);
        await fixture.save({ retained: true });
      }
    }
    assert.equal({}.polluted, undefined, 'no prototype mutation escapes validation');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('deeply nested records fail closed on writes and legacy reads across all storage categories', async () => {
  const accountId = `depth-guard-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { file: 'app-data.json', save: (data) => saveAccountAppData(accountId, data), load: () => loadAccountAppData(accountId) },
    { file: path.join('files', 'doc-1.json'), save: (data) => saveAccountDocumentFile(accountId, 'doc-1', data), load: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { file: path.join('remittance', 'vendor-1.json'), save: (data) => saveAccountRemittanceVault(accountId, 'vendor-1', data), load: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { file: path.join('transaction-proof-chains', 'chains.json'), save: (data) => saveAccountTransactionProofVault(accountId, data), load: () => loadAccountTransactionProofVault(accountId) },
    { file: path.join('plaid', 'connections.json'), save: (data) => saveAccountPlaidVault(accountId, data), load: () => loadAccountPlaidVault(accountId) },
    { file: path.join('extractions', 'sig-1.json'), save: (data) => saveAccountExtractionRecord(accountId, 'sig-1', data), load: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  let deep = { amountMinor: 1250 };
  for (let index = 0; index < 130; index++) deep = { nested: deep };
  try {
    for (const fixture of fixtures) {
      await fixture.save({ revision: 1 });
      const before = await fixture.load();
      await assert.rejects(fixture.save({ evidence: deep }), /nesting exceeds safety limit/);
      assert.deepEqual(await fixture.load(), before, 'rejected write must retain existing record');
      // Simulate a legacy writer bypassing today's write validator.
      await fs.writeFile(path.join(root, fixture.file), JSON.stringify({ evidence: deep }));
      await assert.rejects(fixture.load(), /nesting exceeds safety limit/);
      await fixture.save({ evidence: { nested: { amountMinor: 1250 } } });
      assert.equal((await fixture.load()).evidence.nested.amountMinor, 1250);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('oversized legacy JSON records fail closed before parsing across storage categories', async () => {
  const accountId = `oversized-legacy-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { file: 'app-data.json', save: (v) => saveAccountAppData(accountId, v), load: () => loadAccountAppData(accountId) },
    { file: path.join('files', 'doc-1.json'), save: (v) => saveAccountDocumentFile(accountId, 'doc-1', v), load: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { file: path.join('remittance', 'vendor-1.json'), save: (v) => saveAccountRemittanceVault(accountId, 'vendor-1', v), load: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { file: path.join('transaction-proof-chains', 'chains.json'), save: (v) => saveAccountTransactionProofVault(accountId, v), load: () => loadAccountTransactionProofVault(accountId) },
    { file: path.join('plaid', 'connections.json'), save: (v) => saveAccountPlaidVault(accountId, v), load: () => loadAccountPlaidVault(accountId) },
    { file: path.join('extractions', 'sig-1.json'), save: (v) => saveAccountExtractionRecord(accountId, 'sig-1', v), load: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ revision: 1 });
      // Sparse truncation simulates a corrupt or hostile legacy record
      // without allocating a giant test fixture in memory.
      await fs.truncate(path.join(root, fixture.file), 32 * 1024 * 1024 + 1);
      await assert.rejects(fixture.load(), /Storage record exceeds size limit/);
      await fixture.save({ revision: 2 });
      assert.equal((await fixture.load()).revision, 2);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('oversized multibyte JSON writes preserve existing records', async () => {
  const accountId = `oversized-write-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  try {
    await saveAccountAppData(accountId, { revision: 1 });
    const before = await loadAccountAppData(accountId);
    // Character count is below 32 MiB; UTF-8 byte count is above it.
    await assert.rejects(
      saveAccountAppData(accountId, { content: 'é'.repeat(17 * 1024 * 1024) }),
      /Storage record exceeds size limit/
    );
    assert.deepEqual(await loadAccountAppData(accountId), before);
    await saveAccountAppData(accountId, { revision: 2 });
    assert.equal((await loadAccountAppData(accountId)).revision, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('malformed UTF-8 legacy records fail closed without replacing bank evidence', async () => {
  const accountId = `invalid-utf8-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { file: 'app-data.json', save: (v) => saveAccountAppData(accountId, v), load: () => loadAccountAppData(accountId) },
    { file: path.join('files', 'doc-1.json'), save: (v) => saveAccountDocumentFile(accountId, 'doc-1', v), load: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { file: path.join('remittance', 'vendor-1.json'), save: (v) => saveAccountRemittanceVault(accountId, 'vendor-1', v), load: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { file: path.join('transaction-proof-chains', 'chains.json'), save: (v) => saveAccountTransactionProofVault(accountId, v), load: () => loadAccountTransactionProofVault(accountId) },
    { file: path.join('plaid', 'connections.json'), save: (v) => saveAccountPlaidVault(accountId, v), load: () => loadAccountPlaidVault(accountId) },
    { file: path.join('extractions', 'sig-1.json'), save: (v) => saveAccountExtractionRecord(accountId, 'sig-1', v), load: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ memo: 'valid' });
      const recordPath = path.join(root, fixture.file);
      const original = await fs.readFile(recordPath);
      const marker = Buffer.from('"valid"');
      const offset = original.indexOf(marker);
      assert.ok(offset >= 0, 'test fixture must contain the memo marker');
      // A lossy UTF-8 decoder would replace these invalid bytes with U+FFFD
      // and JSON.parse would still accept the altered financial memo.
      const corrupted = Buffer.concat([
        original.subarray(0, offset + 1),
        Buffer.from([0xc3, 0x28]),
        original.subarray(offset + marker.length - 1),
      ]);
      assert.equal(JSON.parse(corrupted.toString('utf8')).memo, '\uFFFD(');
      await fs.writeFile(recordPath, corrupted);
      await assert.rejects(fixture.load(), /invalid UTF-8|encoded data was not valid/i);
      // Legitimate multibyte names and descriptions must remain supported.
      await fixture.save({ memo: 'é 漢字 💳' });
      assert.equal((await fixture.load()).memo, 'é 漢字 💳');
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('unsafe-precision numbers cannot be saved as exact financial evidence', async () => {
  const accountId = `unsafe-numeric-write-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { save: (v) => saveAccountAppData(accountId, v), read: () => loadAccountAppData(accountId) },
    { save: (v) => saveAccountDocumentFile(accountId, 'doc-1', v), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { save: (v) => saveAccountRemittanceVault(accountId, 'vendor-1', v), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { save: (v) => saveAccountTransactionProofVault(accountId, v), read: () => loadAccountTransactionProofVault(accountId) },
    { save: (v) => saveAccountPlaidVault(accountId, v), read: () => loadAccountPlaidVault(accountId) },
    { save: (v) => saveAccountExtractionRecord(accountId, 'sig-1', v), read: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ retained: true });
      const before = await fixture.read();
      for (const payload of [
        { amount: Number.MAX_SAFE_INTEGER + 1 },
        { nested: { amountMinor: -(Number.MAX_SAFE_INTEGER + 1) } },
        { nested: [{ amount: 1e100 }] },
      ]) {
        await assert.rejects(fixture.save(payload), /Unsafe storage record numeric value/);
        assert.deepEqual(await fixture.read(), before, 'rejected numeric write must preserve the prior record');
      }
      await fixture.save({ amount: 125.25, largestExactInteger: Number.MAX_SAFE_INTEGER });
      const saved = await fixture.read();
      assert.equal(saved.amount, 125.25);
      assert.equal(saved.largestExactInteger, Number.MAX_SAFE_INTEGER);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('legacy JSON numeric overflow and precision loss fail closed on all storage reads', async () => {
  const accountId = `unsafe-numeric-read-${randomUUID()}`;
  const root = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts', accountId);
  const fixtures = [
    { file: 'app-data.json', save: (v) => saveAccountAppData(accountId, v), read: () => loadAccountAppData(accountId) },
    { file: 'files/doc-1.json', save: (v) => saveAccountDocumentFile(accountId, 'doc-1', v), read: () => loadAccountDocumentFile(accountId, 'doc-1') },
    { file: 'remittance/vendor-1.json', save: (v) => saveAccountRemittanceVault(accountId, 'vendor-1', v), read: () => loadAccountRemittanceVault(accountId, 'vendor-1') },
    { file: 'transaction-proof-chains/chains.json', save: (v) => saveAccountTransactionProofVault(accountId, v), read: () => loadAccountTransactionProofVault(accountId) },
    { file: 'plaid/connections.json', save: (v) => saveAccountPlaidVault(accountId, v), read: () => loadAccountPlaidVault(accountId) },
    { file: 'extractions/sig-1.json', save: (v) => saveAccountExtractionRecord(accountId, 'sig-1', v), read: () => loadAccountExtractionRecord(accountId, 'sig-1') },
  ];
  try {
    for (const fixture of fixtures) {
      await fixture.save({ amount: 125.25 });
      for (const corrupted of [
        '{"amount":1e400}', // JSON.parse yields Infinity, not a valid financial amount.
        '{"nested":[{"amountMinor":9007199254740993}]}', // Rounded by JSON.parse.
        '{"nested":{"amountMinor":-9007199254740993}}',
      ]) {
        await fs.writeFile(path.join(root, fixture.file), corrupted);
        await assert.rejects(fixture.read(), /Unsafe storage record numeric value/);
      }
      await fixture.save({ amount: -125.25, largestExactInteger: Number.MAX_SAFE_INTEGER });
      const recovered = await fixture.read();
      assert.equal(recovered.amount, -125.25);
      assert.equal(recovered.largestExactInteger, Number.MAX_SAFE_INTEGER);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
