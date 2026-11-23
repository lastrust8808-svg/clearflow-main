import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// Receipt metadata must not execute user code or disappear in a snapshot.
test('signing receipt symbol accessor is rejected before executing its getter', () => {
  let getterCalls = 0;
  const receipt = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version',
    signerId: 'signer', documentSha256: '0'.repeat(64),
    signedAt: '2026-10-29T09:00:00.000Z', explicitConsent: true,
    consentedAt: '2026-10-29T08:00:00.000Z',
    identityEvidenceRef: 'identity', consentEvidenceRef: 'consent',
    signatureEvidenceRef: 'signature',
  };
  Object.defineProperty(receipt, Symbol('unreviewed-signing-claim'), {
    enumerable: true,
    get() { getterCalls++; throw new Error('unexpected symbol getter'); },
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
    versionRegistry: {}, attestations: [receipt],
  };
  assert.throws(() => assessTrustDocumentSigningPacket(packet),
    /Signature attestation contains unsupported fields/);
  assert.equal(getterCalls, 0);
});
