import crypto from 'node:crypto';

function getVaultKey() {
  const seed =
    process.env.REMITTANCE_VAULT_KEY ||
    process.env.ENCRYPTION_KEY ||
    'clearflow-dev-remittance-vault-key';

  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptJson(payload) {
  const iv = crypto.randomBytes(12);
  const key = getVaultKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export function decryptJson(record) {
  const key = getVaultKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(record.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}
