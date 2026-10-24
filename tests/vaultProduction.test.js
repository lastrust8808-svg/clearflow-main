import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson, decryptJson } from '../server/utils/secureVault.js';

test('production vault refuses missing keys and detects ciphertext tampering', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.REMITTANCE_VAULT_KEY; delete process.env.ENCRYPTION_KEY;
    assert.throws(() => encryptJson({ token: 'secret' }), /key/i);
    process.env.ENCRYPTION_KEY = 'test-only-key-with-at-least-32-characters';
    const payload = { token: 'secret' }, encrypted = encryptJson(payload);
    assert.deepEqual(decryptJson(encrypted), payload);
    encrypted.authTag = Buffer.alloc(16).toString('base64');
    assert.throws(() => decryptJson(encrypted));
  } finally { process.env = saved; }
});
