import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

const scope = {
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  documentId: 'doc-a', versionId: 'version-1',
};
const content = Buffer.from('%PDF-1.7 finalized bytes', 'utf8');
const sha = createHash('sha256').update(content).digest('hex');
const appointment = (trusteeId, changes = {}) => ({
  tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
  trusteeId, effectiveOn: '2026-01-01', acceptedOn: '2026-01-02',
  acceptanceEvidenceRef: 'appointment-' + trusteeId,
  ...(changes.revokedOn != null && !Object.hasOwn(changes, 'revocationEvidenceRef')
    ? { revocationEvidenceRef: 'revocation-' + trusteeId } : {}),
  ...changes,
});
const attestation = (signerId, changes = {}) => ({
  ...scope, signerId, documentSha256: sha,
  signedAt: signerId === 'a' ? '2026-10-28T10:00:00.000Z' : '2026-10-28T11:00:00.000Z',
  explicitConsent: true,
  consentedAt: signerId === 'a' ? '2026-10-28T10:00:00.000Z' : '2026-10-28T11:00:00.000Z',
  identityEvidenceRef: 'identity-' + signerId,
  consentEvidenceRef: 'consent-' + signerId,
  signatureEvidenceRef: 'receipt-' + signerId,
  ...changes,
});
const packet = (changes = {}) => ({
  ...scope, content, finalizedAt: '2026-10-28T09:00:00.000Z',
  evaluatedAt: '2026-10-29T12:00:00.000Z',
  versionRegistry: {
    tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId, documentId: scope.documentId,
    versions: [{
      ...scope, sequence: 1, sha256: sha, status: 'current',
      finalizedAt: '2026-10-28T09:00:00.000Z',
      registeredAt: '2026-10-28T09:00:00.000Z', evidenceRef: 'version-registration-1',
    }],
  },
  governance: {
    tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
    mode: 'independent', appointments: [appointment('a'), appointment('b')],
  },
  attestations: [attestation('a')], ...changes,
});
const assess = changes => assessTrustDocumentSigningPacket(packet(changes));

test('independent trustee packet with distinct consent and receipt evidence is ready for review only', () => {
  assert.deepEqual(assess(), {
    status: 'evidence_ready_for_review', reason: 'supplied_policy_satisfied', signerCount: 1,
  });
  assert.equal(Object.hasOwn(assess(), 'signatureVerified'), false);
  assert.ok(Object.isFrozen(assess()));
});
test('joint signing requires both active accepted trustees', () => {
  const governance = { ...packet().governance, mode: 'joint' };
  assert.equal(assess({ governance }).reason, 'governance_signer_set_ineligible');
  assert.equal(assess({ governance, attestations: [attestation('a'), attestation('b')] }).status, 'evidence_ready_for_review');
});
test('empty attestations and absent explicit consent never imply execution', () => {
  assert.equal(assess({ attestations: [] }).reason, 'no_signing_attestations');
  assert.equal(assess({ attestations: [attestation('a', { explicitConsent: false })] }).reason, 'explicit_consent_not_recorded');
  assert.equal(assess({ attestations: [attestation('a', { explicitConsent: 'true' })] }).status, 'incomplete');
});
test('hash is recomputed from actual bytes; changed PDF or claimed hash fails', () => {
  assert.equal(assess({ content: Buffer.from('modified bytes') }).reason, 'document_bytes_mismatch');
  assert.equal(assess({ attestations: [attestation('a', { documentSha256: '0'.repeat(64) })] }).reason, 'document_bytes_mismatch');
  assert.throws(() => assess({ attestations: [attestation('a', { documentSha256: 'not-a-digest' })] }), /SHA-256/);
});
test('signing evidence must follow finalized document version, not an earlier draft', () => {
  assert.throws(() => assess({ attestations: [attestation('a', {
    signedAt: '2026-10-28T08:59:59.999Z',
  })] }), /predates finalized document/);
  assert.equal(assess({
    finalizedAt: '2026-10-28T10:00:00.000Z',
    versionRegistry: {
      ...packet().versionRegistry,
      versions: [{
        ...packet().versionRegistry.versions[0],
        finalizedAt: '2026-10-28T10:00:00.000Z',
        registeredAt: '2026-10-28T10:00:00.000Z',
      }],
    },
  }).status, 'evidence_ready_for_review');
  assert.throws(() => assess({
    finalizedAt: '2026-10-28T10:00:00.001Z',
  }), /predates finalized document/);
});

test('missing, invalid or future document finalization fails closed', () => {
  assert.throws(() => assess({ finalizedAt: undefined }), /finalizedAt.*canonical/);
  assert.throws(() => assess({ finalizedAt: '2026-02-30T10:00:00.000Z' }), /finalizedAt.*canonical/);
  assert.throws(() => assess({ finalizedAt: '2026-10-30T10:00:00.000Z' }), /finalization cannot follow/);
  assert.throws(() => assess({
    finalizedAt: '2026-10-30T10:00:00.000Z', attestations: [],
  }), /finalization cannot follow/);
});

test('document/version/tenant/entity/trust substitutions are rejected', () => {
  for (const key of Object.keys(scope)) {
    assert.throws(() => assess({ attestations: [attestation('a', { [key]: 'other' })] }), /scope mismatch/);
  }
  assert.throws(() => assess({ governance: { ...packet().governance, tenantId: 'other' } }), /scope mismatch/);
});
test('duplicate signers and reused evidence refs fail closed', () => {
  assert.throws(() => assess({ attestations: [attestation('a'), attestation('a', {
    signedAt: '2026-10-28T11:00:00.000Z',
  })] }), /Duplicate signer/);
  assert.throws(() => assess({ attestations: [attestation('a', {
    signatureEvidenceRef: 'consent-a',
  })] }), /Reused signing evidence/);
  assert.throws(() => assess({ attestations: [attestation('a'), attestation('b', {
    consentEvidenceRef: 'receipt-a',
  })] }), /Reused signing evidence/);
});
test('identity evidence is mandatory, unique, and distinct from consent and signature receipts', () => {
  assert.throws(() => assess({ attestations: [attestation('a', {
    identityEvidenceRef: undefined,
  })] }), /identityEvidenceRef/);
  assert.throws(() => assess({ attestations: [attestation('a', {
    identityEvidenceRef: 'consent-a',
  })] }), /Reused signing evidence/);
  assert.throws(() => assess({ attestations: [attestation('a', {
    signatureEvidenceRef: 'identity-a',
  })] }), /Reused signing evidence/);
  assert.throws(() => assess({ attestations: [
    attestation('a'),
    attestation('b', { identityEvidenceRef: 'receipt-a' }),
  ] }), /Reused signing evidence/);
  assert.equal(assess().status, 'evidence_ready_for_review');
  assert.equal(Object.hasOwn(assess(), 'identityVerified'), false);
});

test('future, malformed, tied and out-of-order timestamps fail closed', () => {
  assert.throws(() => assess({ attestations: [attestation('a', {
    signedAt: '2026-10-30T10:00:00.000Z',
  })] }), /chronological/);
  assert.throws(() => assess({ attestations: [attestation('a', {
    signedAt: '2026-02-30T10:00:00.000Z',
  })] }), /canonical/);
  assert.throws(() => assess({ attestations: [attestation('b'), attestation('a')] }), /chronological/);
  assert.throws(() => assess({ attestations: [attestation('a'), attestation('b', {
    signedAt: '2026-10-28T10:00:00.000Z',
  })] }), /chronological/);
});
test('revoked and unaccepted signers cannot satisfy packet review', () => {
  const revoked = { ...packet().governance, appointments: [
    appointment('a', { revokedOn: '2026-10-28' }), appointment('b'),
  ] };
  assert.equal(assess({ governance: revoked }).reason, 'signer_ineligible_at_signing');
  const unaccepted = { ...packet().governance, appointments: [
    appointment('a', { acceptedOn: undefined, acceptanceEvidenceRef: undefined }), appointment('b'),
  ] };
  assert.equal(assess({ governance: unaccepted }).reason, 'signer_ineligible_at_signing');
});
test('later revocation prevents current readiness despite earlier recorded consent', () => {
  const governance = { ...packet().governance, appointments: [
    appointment('a', { revokedOn: '2026-10-29' }), appointment('b'),
  ] };
  assert.equal(assess({ governance }).reason, 'governance_signer_set_ineligible');
});
test('invalid or missing evidence references and document bytes are rejected', () => {
  for (const key of ['consentEvidenceRef', 'signatureEvidenceRef']) {
    assert.throws(() => assess({ attestations: [attestation('a', { [key]: '' })] }), /EvidenceRef/);
  }
  assert.throws(() => assess({ content: Buffer.alloc(0) }), /Nonempty/);
  assert.throws(() => assess({ attestations: null }), /attestations/);
  assert.throws(() => assess({ attestations: [attestation('a', { signerId: 'a\u0000' })] }), /control characters/);
});
test('assessment never mutates evidence packet or governance snapshot', () => {
  const original = packet();
  const before = {
    ...original, content: Buffer.from(original.content),
    governance: structuredClone(original.governance),
    attestations: structuredClone(original.attestations),
  };
  assessTrustDocumentSigningPacket(original);
  assert.deepEqual(original, before);
});

test('only the currently registered document version can be evidence-ready', () => {
  const current = packet().versionRegistry;
  assert.equal(assess().status, 'evidence_ready_for_review');
  assert.equal(assess({ versionRegistry: {
    ...current, versions: [{ ...current.versions[0], status: 'revoked',
      revocationEvidenceRef: 'version-revocation-1',
      revokedAt: '2026-10-28T09:15:00.000Z' }],
  } }).reason, 'document_version_not_current');
  assert.equal(assess({ versionRegistry: {
    ...current, versions: [
      { ...current.versions[0], status: 'superseded' },
      { ...current.versions[0], versionId: 'version-2', sequence: 2,
        status: 'current', registeredAt: '2026-10-29T09:00:00.000Z',
        evidenceRef: 'version-registration-2' },
    ],
  } }).reason, 'document_version_not_current');
  assert.equal(assess({ versionRegistry: {
    ...current, versions: [{ ...current.versions[0], versionId: 'other-version' }],
  } }).reason, 'document_version_not_current');
});

test('document version registry is required, scoped and bound to finalized bytes', () => {
  const current = packet().versionRegistry;
  assert.throws(() => assess({ versionRegistry: undefined }), /version registry required/);
  for (const key of ['tenantId', 'entityId', 'documentId']) {
    assert.throws(() => assess({ versionRegistry: { ...current, [key]: 'other' } }),
      /registry .* scope mismatch/);
  }
  assert.equal(assess({ versionRegistry: {
    ...current, versions: [{ ...current.versions[0], sha256: '0'.repeat(64) }],
  } }).reason, 'document_version_not_current');
  assert.equal(Object.hasOwn(assess(), 'documentVerified'), false);
});

test('finalization timestamp must be anchored to the immutable registered version', () => {
  const version = packet().versionRegistry.versions[0];
  const registryWith = changes => ({
    ...packet().versionRegistry,
    versions: [{ ...version, ...changes }],
  });
  assert.equal(assess({
    versionRegistry: registryWith({ finalizedAt: undefined }),
  }).reason, 'document_finalization_provenance_missing');
  assert.equal(assess({
    finalizedAt: '2026-10-28T08:00:00.000Z',
  }).reason, 'document_finalization_provenance_mismatch');
  assert.equal(assess({
    versionRegistry: registryWith({
      finalizedAt: '2026-10-28T10:00:00.000Z',
    }),
  }).reason, 'document_finalization_provenance_mismatch');
  assert.throws(() => assess({
    versionRegistry: registryWith({ finalizedAt: '2026-02-30T09:00:00.000Z' }),
  }), /version.finalizedAt.*canonical/);
  assert.equal(assess().status, 'evidence_ready_for_review');
});

test('future-dated registration cannot authorize an earlier signing review', () => {
  const version = packet().versionRegistry.versions[0];
  const versionRegistry = registeredAt => ({
    ...packet().versionRegistry,
    versions: [{ ...version, registeredAt }],
  });
  assert.equal(assess({
    versionRegistry: versionRegistry('2026-10-29T12:00:00.001Z'),
  }).reason, 'document_registration_after_evaluation');
  assert.equal(assess({
    versionRegistry: versionRegistry('2026-10-29T12:00:00.000Z'),
  }).reason, 'document_registered_after_signature');
  assert.equal(assess({
    versionRegistry: versionRegistry('2026-10-28T09:00:00.000Z'),
  }).status, 'evidence_ready_for_review');
});

test('version registration must precede the earliest signer attestation', () => {
  const version = packet().versionRegistry.versions[0];
  const withRegistration = registeredAt => ({
    ...packet().versionRegistry,
    versions: [{ ...version, registeredAt }],
  });
  // Both timestamps are after finalization and before evaluation. A signature
  // cannot become eligible retroactively when its version is registered later.
  assert.equal(assess({
    versionRegistry: withRegistration('2026-10-28T10:00:00.001Z'),
  }).reason, 'document_registered_after_signature');
  // Registration at the exact signing instant is allowed.
  assert.equal(assess({
    versionRegistry: withRegistration('2026-10-28T10:00:00.000Z'),
  }).status, 'evidence_ready_for_review');
  // The first of multiple joint signatures also has to follow registration.
  assert.equal(assess({
    governance: { ...packet().governance, mode: 'joint' },
    attestations: [attestation('a'), attestation('b')],
    versionRegistry: withRegistration('2026-10-28T10:30:00.000Z'),
  }).reason, 'document_registered_after_signature');
});

test('signing registry and all historical versions must belong to the same trust', () => {
  const registry = packet().versionRegistry;
  assert.equal(assess().status, 'evidence_ready_for_review');
  for (const trustId of [undefined, 'trust-b']) {
    assert.throws(() => assess({
      versionRegistry: { ...registry, trustId },
    }), /registry trustId scope mismatch/);
    assert.throws(() => assess({
      versionRegistry: {
        ...registry, versions: [{ ...registry.versions[0], trustId }],
      },
    }), /version trustId scope mismatch/);
  }
  // Reject a foreign historical version even when the latest version and
  // registry carry the correct trust ID. No mixed-trust version histories.
  assert.throws(() => assess({
    versionRegistry: {
      ...registry,
      versions: [
        { ...registry.versions[0], trustId: 'trust-b', status: 'superseded' },
        { ...registry.versions[0], versionId: 'version-2', sequence: 2,
          registeredAt: '2026-10-29T09:00:00.000Z',
          evidenceRef: 'registration-2' },
      ],
    },
  }), /version trustId scope mismatch/);
});

test('signing receipts and identity evidence cannot replay appointment acceptance or version registration', () => {
  assert.equal(assess().status, 'evidence_ready_for_review');
  for (const evidenceRef of ['appointment-a', 'version-registration-1']) {
    for (const key of ['identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
      assert.throws(() => assess({
        attestations: [attestation('a', { [key]: evidenceRef })],
      }), /Reused cross-role signing provenance reference/);
    }
  }
});

test('appointment acceptance and document registration require distinct provenance events', () => {
  const current = packet();
  assert.throws(() => assess({
    versionRegistry: {
      ...current.versionRegistry,
      versions: [{
        ...current.versionRegistry.versions[0],
        evidenceRef: 'appointment-b',
      }],
    },
  }), /Reused cross-role signing provenance reference/);
  // Independent, unrelated references remain valid for review.
  assert.equal(assess({
    versionRegistry: {
      ...current.versionRegistry,
      versions: [{
        ...current.versionRegistry.versions[0],
        evidenceRef: 'registration-distinct',
      }],
    },
  }).status, 'evidence_ready_for_review');
});

test('consent must be timestamped for finalized bytes and no later than signing', () => {
  assert.equal(assess().status, 'evidence_ready_for_review');
  assert.throws(() => assess({
    attestations: [attestation('a', { consentedAt: undefined })],
  }), /attestation.consentedAt.*canonical/);
  assert.throws(() => assess({
    attestations: [attestation('a', { consentedAt: '2026-02-30T10:00:00.000Z' })],
  }), /attestation.consentedAt.*canonical/);
  assert.equal(assess({
    attestations: [attestation('a', { consentedAt: '2026-10-28T10:00:00.001Z' })],
  }).reason, 'consent_chronology_invalid');
  assert.equal(assess({
    attestations: [attestation('a', { consentedAt: '2026-10-28T08:59:59.999Z' })],
  }).reason, 'consent_chronology_invalid');
  // Exact document finalization and signing boundaries are allowed.
  assert.equal(assess({
    attestations: [attestation('a', { consentedAt: '2026-10-28T09:00:00.000Z' })],
  }).status, 'evidence_ready_for_review');
});

test('consent cannot precede immutable version registration, including joint signing', () => {
  const original = packet();
  const registry = {
    ...original.versionRegistry,
    versions: [{ ...original.versionRegistry.versions[0],
      registeredAt: '2026-10-28T09:30:00.000Z' }],
  };
  assert.equal(assess({
    versionRegistry: registry,
    attestations: [attestation('a', { consentedAt: '2026-10-28T09:29:59.999Z' })],
  }).reason, 'document_registered_after_consent');
  assert.equal(assess({
    versionRegistry: registry,
    attestations: [attestation('a', { consentedAt: '2026-10-28T09:30:00.000Z' })],
  }).status, 'evidence_ready_for_review');
  // The earliest consent can belong to the second signer even though signing
  // attestations themselves are strictly chronological.
  assert.equal(assess({
    versionRegistry: registry,
    governance: { ...original.governance, mode: 'joint' },
    attestations: [
      attestation('a'),
      attestation('b', { consentedAt: '2026-10-28T09:29:59.999Z' }),
    ],
  }).reason, 'document_registered_after_consent');
});


test('trustee revocation evidence cannot be recycled as signing or version evidence', () => {
  const withRevocation = ref => ({
    ...packet().governance,
    appointments: [
      appointment('a'),
      appointment('b', { revokedOn: '2026-10-28', revocationEvidenceRef: ref }),
    ],
  });
  assert.equal(assess({ governance: withRevocation('revocation-b') }).status,
    'evidence_ready_for_review');
  for (const reused of ['identity-a', 'consent-a', 'receipt-a', 'version-registration-1', 'appointment-a']) {
    assert.throws(() => assess({ governance: withRevocation(reused) }),
      /Reused cross-role signing provenance reference|Reused trustee governance evidence reference/);
  }
  assert.throws(() => assess({
    governance: withRevocation(undefined),
  }), /appointment.revocationEvidenceRef/);
});

function historicalRevocationReview(revokedAt) {
  const original = packet();
  const first = original.versionRegistry.versions[0];
  return {
    versionId: 'version-2',
    attestations: [attestation('a', { versionId: 'version-2' })],
    versionRegistry: {
      ...original.versionRegistry,
      versions: [
        { ...first, status: 'revoked', revokedAt,
          revocationEvidenceRef: 'historical-revocation-evidence' },
        { ...first, versionId: 'version-2', sequence: 2, status: 'current',
          registeredAt: '2026-10-28T09:30:00.000Z',
          evidenceRef: 'version-registration-2' },
      ],
    },
  };
}

test('historical revoked versions require a canonical revocation timestamp for signing review', () => {
  assert.equal(assess(historicalRevocationReview('2026-10-28T09:15:00.000Z')).status,
    'evidence_ready_for_review');
  for (const invalid of [undefined, null, '', '2026-10-28',
    '2026-02-30T09:15:00.000Z']) {
    assert.throws(() => assess(historicalRevocationReview(invalid)),
      /version.revokedAt.*canonical/);
  }
});

test('historical revocation must follow registration and cannot be future-dated', () => {
  for (const invalid of ['2026-10-28T08:59:59.999Z', '2026-10-28T09:00:00.000Z',
    '2026-10-29T12:00:00.001Z']) {
    assert.equal(assess(historicalRevocationReview(invalid)).reason,
      'historical_revocation_chronology_invalid');
  }
  // The exact evaluation instant is allowed; authenticated provenance is
  // still required before any real signing or execution decision.
  assert.equal(assess(historicalRevocationReview('2026-10-29T12:00:00.000Z')).status,
    'evidence_ready_for_review');
});

test('historical document revocation receipts cannot be replayed as signing or trustee evidence', () => {
  const original = packet();
  const registeredVersion = original.versionRegistry.versions[0];
  const withHistory = (revocationEvidenceRef, governance = original.governance) => ({
    versionId: 'version-2',
    attestations: [attestation('a', { versionId: 'version-2' })],
    governance,
    versionRegistry: {
      ...original.versionRegistry,
      versions: [
        { ...registeredVersion, status: 'revoked', revocationEvidenceRef,
          revokedAt: '2026-10-28T09:15:00.000Z' },
        {
          ...registeredVersion, versionId: 'version-2', sequence: 2,
          status: 'current', evidenceRef: 'version-registration-2',
          registeredAt: '2026-10-28T09:30:00.000Z',
        },
      ],
    },
  });
  // A distinct receipt for a historical revoked version does not block
  // independent trustee signing of the later, currently registered version.
  assert.equal(assess(withHistory('historical-revocation-1')).status,
    'evidence_ready_for_review');
  for (const reused of [
    'identity-a', 'consent-a', 'receipt-a', 'appointment-a', 'appointment-b',
  ]) {
    assert.throws(() => assess(withHistory(reused)),
      /Reused cross-role signing provenance reference/);
  }
  const governanceWithRevocation = {
    ...original.governance,
    appointments: [
      appointment('a'),
      appointment('b', {
        revokedOn: '2026-10-28',
        revocationEvidenceRef: 'trustee-revocation-b',
      }),
    ],
  };
  assert.throws(() => assess(withHistory('trustee-revocation-b', governanceWithRevocation)),
    /Reused cross-role signing provenance reference/);
});
