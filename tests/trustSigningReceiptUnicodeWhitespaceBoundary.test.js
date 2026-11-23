import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// Structural Unicode admission only; never authenticates identity or signatures.
const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  documentId: 'document-a', versionId: 'version-a' };
const content = Buffer.from('immutable trust bytes');
const sha = createHash('sha256').update(content).digest('hex');
const base = () => ({
  ...scope, content, finalizedAt: '2026-10-28T09:00:00.000Z',
  evaluatedAt: '2026-10-29T09:00:00.000Z',
  governance: { tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
    mode: 'independent', appointments: [{
      tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
      trusteeId: 'trustee-a', effectiveOn: '2026-01-01', acceptedOn: '2026-01-02',
      acceptanceEvidenceRef: 'appointment-a',
    }] },
  versionRegistry: { tenantId: scope.tenantId, entityId: scope.entityId,
    trustId: scope.trustId, documentId: scope.documentId, versions: [{
      ...scope, sequence: 1, sha256: sha, status: 'current',
      finalizedAt: '2026-10-28T09:00:00.000Z',
      registeredAt: '2026-10-28T09:00:00.000Z',
      evidenceRef: 'registration-a',
    }] },
  attestations: [{
    ...scope, signerId: 'trustee-a', documentSha256: sha,
    signedAt: '2026-10-28T10:00:00.000Z',
    consentedAt: '2026-10-28T10:00:00.000Z', explicitConsent: true,
    identityEvidenceRef: 'identity-a', consentEvidenceRef: 'consent-a',
    signatureEvidenceRef: 'signature-a',
  }],
});

test('signing audit identifiers reject Unicode whitespace across signer and receipt roles', () => {
  for (const field of ['signerId', 'identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
    for (const space of ['\\u00a0', '\\u2003', '\\u2028', '\\u3000']) {
      const packet = base();
      packet.attestations[0][field] += space + 'suffix';
      assert.throws(() => assessTrustDocumentSigningPacket(packet),
        /whitespace/, field + ' U+' + space.codePointAt(0).toString(16));
    }
  }
});

test('ordinary distinct signer and receipt identifiers remain review-ready only', () => {
  const decision = assessTrustDocumentSigningPacket(base());
  assert.equal(decision.status, 'evidence_ready_for_review');
  assert.equal(Object.hasOwn(decision, 'signatureVerified'), false);
});
