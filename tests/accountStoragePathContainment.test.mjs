import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  loadAccountAppData,
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
