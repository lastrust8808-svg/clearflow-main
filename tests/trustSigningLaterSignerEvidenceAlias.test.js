import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// A later signer must not reuse a previous receipt pointer as an identity.
// This is a structural evidence check, not signature or identity verification.
const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  documentId: 'document-a', versionId: 'version-a' };
const content = Buffer.from('finalized trust instrument');
const sha = createHash('sha256').update(content).digest('hex');
const at = (signerId, signedAt, ref) => ({
  ...scope, signerId, documentSha256: sha, signedAt,
  consentedAt: signedAt, explicitConsent: true,
  identityEvidenceRef: 'identity-' + ref,
  consentEvidenceRef: 'consent-' + ref,
  signatureEvidenceRef: 'signature-' + ref,
});
const appointment = trusteeId => ({
  tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
  trusteeId, effectiveOn: '2026-01-01', acceptedOn: '2026-01-02',
  acceptanceEvidenceRef: 'appointment-' + trusteeId,
});
const packet = (secondSignerId) => ({
  ...scope, content, finalizedAt: '2026-10-28T09:00:00.000Z',
  evaluatedAt: '2026-10-29T12:00:00.000Z',
  governance: { tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
    mode: 'independent', appointments: [appointment('a'), appointment(secondSignerId)] },
  versionRegistry: {
    tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
    documentId: scope.documentId,
    versions: [{ ...scope, sequence: 1, sha256: sha, status: 'current',
      finalizedAt: '2026-10-28T09:00:00.000Z',
      registeredAt: '2026-10-28T09:00:00.000Z',
      evidenceRef: 'version-registration-a' }],
  },
  attestations: [
    at('a', '2026-10-28T10:00:00.000Z', 'a'),
    at(secondSignerId, '2026-10-28T11:00:00.000Z', 'b'),
  ],
});

test('later signer identity cannot reuse an earlier identity, consent, or signature evidence pointer', () => {
  for (const alias of ['identity-a', 'consent-a', 'signature-a']) {
    assert.throws(() => assessTrustDocumentSigningPacket(packet(alias)),
      /Signing principal identifier collides with earlier signing evidence reference/,
      alias);
  }
});

test('distinct second signer remains review-ready, without claiming verified execution', () => {
  const result = assessTrustDocumentSigningPacket(packet('b'));
  assert.equal(result.status, 'evidence_ready_for_review');
  assert.equal(result.signerCount, 2);
  assert.equal(Object.hasOwn(result, 'signatureVerified'), false);
});
