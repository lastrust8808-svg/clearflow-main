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
  acceptanceEvidenceRef: 'appointment-' + trusteeId, ...changes,
});
const attestation = (signerId, changes = {}) => ({
  ...scope, signerId, documentSha256: sha,
  signedAt: signerId === 'a' ? '2026-10-28T10:00:00.000Z' : '2026-10-28T11:00:00.000Z',
  explicitConsent: true,
  identityEvidenceRef: 'identity-' + signerId,
  consentEvidenceRef: 'consent-' + signerId,
  signatureEvidenceRef: 'receipt-' + signerId,
  ...changes,
});
const packet = (changes = {}) => ({
  ...scope, content, finalizedAt: '2026-10-28T09:00:00.000Z',
  evaluatedAt: '2026-10-29T12:00:00.000Z',
  versionRegistry: {
    tenantId: scope.tenantId, entityId: scope.entityId, documentId: scope.documentId,
    versions: [{
      ...scope, sequence: 1, sha256: sha, status: 'current',
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
    appointment('a', { acceptedOn: undefined }), appointment('b'),
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
    ...current, versions: [{ ...current.versions[0], status: 'revoked' }],
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
