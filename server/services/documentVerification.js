import { createHash, randomUUID } from 'node:crypto';

/**
 * Server-side document verification metadata. Never derive a verification token
 * from an entity name, document title, timestamp, or other guessable value.
 * The caller must persist this record transactionally alongside immutable bytes.
 */
export function createDocumentVerificationRecord({ entityId, documentId, content, version = 1 }) {
  if (!entityId || !documentId || !Number.isSafeInteger(version) || version < 1) {
    throw new TypeError('Valid entityId, documentId and positive version are required');
  }
  if (!Buffer.isBuffer(content) && !(content instanceof Uint8Array)) {
    throw new TypeError('Finalized document bytes are required');
  }
  return {
    entityId,
    documentId,
    version,
    verificationId: randomUUID(),
    sha256: createHash('sha256').update(content).digest('hex'),
    status: 'issued',
    issuedAt: new Date().toISOString(),
  };
}

export function verifyDocumentBytes(record, content) {
  if (!record || record.status !== 'issued' || !record.sha256) return false;
  if (!Buffer.isBuffer(content) && !(content instanceof Uint8Array)) return false;
  return createHash('sha256').update(content).digest('hex') === record.sha256;
}

/** Public scan responses must not expose documents, accounts or identities. */
export function publicVerificationSummary(record) {
  if (!record) return { status: 'not_found' };
  return {
    verificationId: record.verificationId,
    status: record.status,
    version: record.version,
    issuedAt: record.issuedAt,
  };
}
