import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentVerificationRecord, verifyDocumentBytes, publicVerificationSummary } from '../server/services/documentVerification.js';

test('finalized document gets opaque unique ID and stable SHA-256 fingerprint', () => {
  const a = createDocumentVerificationRecord({ entityId: 'entity-1', documentId: 'doc-1', content: Buffer.from('final PDF bytes') });
  const b = createDocumentVerificationRecord({ entityId: 'entity-1', documentId: 'doc-1', content: Buffer.from('final PDF bytes') });
  assert.notEqual(a.verificationId, b.verificationId);
  assert.match(a.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verifyDocumentBytes(a, Buffer.from('final PDF bytes')), true);
  assert.equal(verifyDocumentBytes(a, Buffer.from('tampered PDF bytes')), false);
  assert.equal(verifyDocumentBytes({ ...a, status: 'revoked' }, Buffer.from('final PDF bytes')), false);
});
test('public verification summary never discloses entity, document or fingerprint', () => {
  const record = createDocumentVerificationRecord({ entityId: 'private-entity', documentId: 'private-document', content: Buffer.from('secret') });
  const result = publicVerificationSummary(record);
  assert.equal(result.verificationId, record.verificationId);
  assert.equal(result.entityId, undefined);
  assert.equal(result.documentId, undefined);
  assert.equal(result.sha256, undefined);
  assert.equal(publicVerificationSummary(null).status, 'not_found');
});
test('missing or invalid final bytes are rejected', () => {
  assert.throws(() => createDocumentVerificationRecord({ entityId: 'e', documentId: 'd', content: 'not-bytes' }));
  assert.throws(() => createDocumentVerificationRecord({ entityId: 'e', documentId: 'd', content: Buffer.from('a'), version: 0 }));
});
