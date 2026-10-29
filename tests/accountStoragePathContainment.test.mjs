import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  loadAccountAppData,
  loadAccountDocumentFile,
  loadAccountPlaidVault,
  saveAccountAppData,
  saveAccountDocumentFile,
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
