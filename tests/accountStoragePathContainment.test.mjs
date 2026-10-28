import test from 'node:test';
import assert from 'node:assert/strict';
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
