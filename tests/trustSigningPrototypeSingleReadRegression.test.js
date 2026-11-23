import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// Proxy prototype traps must not be consulted twice: the second answer could
// claim an inherited authority that the first admission check did not see.
function changingPrototype(record, reads) {
  return new Proxy(record, {
    getPrototypeOf(target) {
      reads.count++;
      return reads.count === 1 ? Object.prototype : { forgedAuthority: true };
    },
  });
}

function packet() {
  return {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version',
    content: Buffer.from('finalized document'),
    finalizedAt: '2026-10-28T09:00:00.000Z',
    evaluatedAt: '2026-10-29T09:00:00.000Z',
    governance: {
      tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
      mode: 'independent', appointments: [],
    },
    versionRegistry: {}, attestations: [],
  };
}

test('signing packet admission reads an adversarial prototype once', () => {
  const reads = { count: 0 };
  const input = changingPrototype(packet(), reads);
  const result = assessTrustDocumentSigningPacket(input);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'no_signing_attestations');
  assert.equal(reads.count, 1);
});

test('signing governance admission reads an adversarial prototype once', () => {
  const reads = { count: 0 };
  const input = packet();
  input.governance = changingPrototype(input.governance, reads);
  const result = assessTrustDocumentSigningPacket(input);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'no_signing_attestations');
  assert.equal(reads.count, 1);
});

test('signing receipt admission reads an adversarial prototype once', () => {
  const reads = { count: 0 };
  const input = packet();
  input.attestations = [changingPrototype({
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version',
    signerId: 'signer', documentSha256: '0'.repeat(64),
    signedAt: '2026-10-28T10:00:00.000Z',
    explicitConsent: false, consentedAt: '2026-10-28T09:30:00.000Z',
    identityEvidenceRef: 'identity', consentEvidenceRef: 'consent',
    signatureEvidenceRef: 'signature',
  }, reads)];
  const result = assessTrustDocumentSigningPacket(input);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'explicit_consent_not_recorded');
  assert.equal(reads.count, 1);
});
