import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// A Proxy can forge an indexed read after structural admission. The
// assessment must consume the descriptor snapshot, not read the Proxy again.
test('signing receipt array never consults forged indexed Proxy reads', () => {
  let indexedReads = 0;
  const receipts = new Proxy([{
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version', signerId: 'signer',
    documentSha256: '0'.repeat(64), signedAt: '2026-10-29T09:00:00.000Z',
    explicitConsent: true, consentedAt: '2026-10-29T08:00:00.000Z',
    identityEvidenceRef: 'identity', consentEvidenceRef: 'consent',
    signatureEvidenceRef: 'signature',
  }], {
    get(target, key, receiver) {
      if (key === '0') {
        indexedReads++;
        throw new Error('forged indexed receipt read');
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const packet = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version',
    content: Buffer.from('finalized document'),
    finalizedAt: '2026-10-28T09:00:00.000Z',
    evaluatedAt: '2026-10-29T09:00:00.000Z',
    governance: {
      tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
      mode: 'independent', appointments: [],
    },
    versionRegistry: {}, attestations: receipts,
  };
  // A mismatched hash is a normal incomplete assessment. A forged indexed
  // read must never be reached before that deterministic decision.
  assert.deepEqual(assessTrustDocumentSigningPacket(packet), {
    status: 'incomplete', reason: 'document_bytes_mismatch', signerCount: 1,
  });
  assert.equal(indexedReads, 0);
});
