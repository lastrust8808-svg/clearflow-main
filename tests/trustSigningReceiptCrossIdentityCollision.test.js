import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

test('later trustee identity cannot alias an earlier signing receipt pointer', () => {
  const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version' };
  const content = Buffer.from('finalized document');
  const sha = createHash('sha256').update(content).digest('hex');
  const appointment = trusteeId => ({
    tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
    trusteeId, effectiveOn: '2026-01-01', acceptedOn: '2026-01-02',
    acceptanceEvidenceRef: 'appointment-' + trusteeId,
  });
  const receipt = (signerId, signedAt, suffix) => ({
    ...scope, signerId, documentSha256: sha, signedAt,
    explicitConsent: true, consentedAt: signedAt,
    identityEvidenceRef: 'identity-' + suffix,
    consentEvidenceRef: 'consent-' + suffix,
    signatureEvidenceRef: 'receipt-' + suffix,
  });
  const first = receipt('alice', '2026-10-28T10:00:00.000Z', 'alice');
  const second = receipt('receipt-alice', '2026-10-28T11:00:00.000Z', 'second');
  const packet = {
    ...scope, content, finalizedAt: '2026-10-28T09:00:00.000Z',
    evaluatedAt: '2026-10-29T12:00:00.000Z',
    governance: { tenantId: scope.tenantId, entityId: scope.entityId,
      trustId: scope.trustId, mode: 'independent',
      appointments: [appointment('alice'), appointment('receipt-alice')] },
    attestations: [first, second],
    versionRegistry: { ...scope, versions: [{
      ...scope, sequence: 1, sha256: sha, status: 'current',
      finalizedAt: '2026-10-28T09:00:00.000Z',
      registeredAt: '2026-10-28T09:00:00.000Z',
      evidenceRef: 'registration-evidence',
    }] },
  };
  assert.throws(() => assessTrustDocumentSigningPacket(packet),
    /Signing principal identifier collides with earlier signing evidence reference/);
  assert.equal(assessTrustDocumentSigningPacket({
    ...packet, attestations: [first, { ...second, signerId: 'bob' }],
    governance: { ...packet.governance, appointments: [appointment('alice'), appointment('bob')] },
  }).status, 'evidence_ready_for_review');
});
