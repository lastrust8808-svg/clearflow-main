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
const unacceptedAppointment = trusteeId => {
  const record = appointment(trusteeId);
  delete record.acceptedOn;
  delete record.acceptanceEvidenceRef;
  return record;
};
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

test('signing governance envelope rejects executable, inherited and unsupported claims before reading them', () => {
  const valid = packet().governance;
  for (const key of ['tenantId', 'entityId', 'trustId', 'mode', 'appointments']) {
    let getterCalls = 0;
    const malicious = { ...valid };
    Object.defineProperty(malicious, key, {
      enumerable: true, configurable: true,
      get() { getterCalls++; throw new Error('Governance getter must not execute'); },
    });
    assert.throws(() => assess({ governance: malicious }),
      /Signing governance fields must be enumerable own data properties/);
    assert.equal(getterCalls, 0, key + ' getter was executed');
  }
  const inherited = { ...valid };
  Object.setPrototypeOf(inherited, { tenantId: 'forged-tenant' });
  assert.throws(() => assess({ governance: inherited }), /Signing governance must be a plain data record/);
  const missing = { ...valid };
  delete missing.mode;
  assert.throws(() => assess({ governance: missing }), /Signing governance missing own field: mode/);
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'paymentReceived', { value: true, enumerable: false });
  assert.throws(() => assess({ governance: hidden }), /Signing governance contains unsupported fields/);
  const symbol = { ...valid, [Symbol('signed')]: true };
  assert.throws(() => assess({ governance: symbol }), /Signing governance contains unsupported fields/);
  assert.throws(() => assess({ governance: { ...valid, paymentAuthorized: true } }),
    /Signing governance contains unsupported fields/);
  assert.equal(assess({ governance: Object.freeze({ ...valid }) }).status, 'evidence_ready_for_review');
  assert.equal(assess({ governance: Object.assign(Object.create(null), valid) }).status,
    'evidence_ready_for_review');
});

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
test('signing evidence references cannot impersonate scope or signer identities', () => {
  for (const key of ['identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
    for (const alias of [...Object.values(scope), 'a']) {
      assert.throws(() => assess({ attestations: [attestation('a', { [key]: alias })] }),
        /Signing evidence reference collides with scope or signer identity/);
    }
  }
  assert.equal(assess().status, 'evidence_ready_for_review');
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
    unacceptedAppointment('a'), appointment('b'),
  ] };
  assert.equal(assess({ governance: unaccepted }).reason, 'signer_ineligible_at_signing');
});
test('later revocation prevents current readiness despite earlier recorded consent', () => {
  const governance = { ...packet().governance, appointments: [
    appointment('a', { revokedOn: '2026-10-29' }), appointment('b'),
  ] };
  assert.equal(assess({ governance }).reason, 'governance_signer_set_ineligible');
});
test('signing identities reject malformed UTF-16 without rejecting valid supplementary Unicode', () => {
  const loneSurrogate = String.fromCharCode(0xD800);
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId', 'versionId']) {
    assert.throws(() => assess({ [key]: 'id-' + loneSurrogate }), /well-formed Unicode/,
      key + ' must not silently encode a replacement character');
  }
  for (const key of ['signerId', 'identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
    assert.throws(() => assess({ attestations: [attestation('a', { [key]: 'id-' + loneSurrogate })] }),
      /well-formed Unicode/, key + ' must not alias another evidence subject');
  }
  const supplementary = String.fromCodePoint(0x1F4DC);
  const signerId = 'trustee-' + supplementary;
  const governance = { ...packet().governance, appointments: [appointment(signerId)] };
  const signed = attestation(signerId, {
    identityEvidenceRef: 'identity-' + supplementary,
    consentEvidenceRef: 'consent-' + supplementary,
    signatureEvidenceRef: 'signature-' + supplementary,
  });
  assert.equal(assess({ governance, attestations: [signed] }).status,
    'evidence_ready_for_review');
});

test('invalid or missing evidence references and document bytes are rejected', () => {
  for (const key of ['consentEvidenceRef', 'signatureEvidenceRef']) {
    assert.throws(() => assess({ attestations: [attestation('a', { [key]: '' })] }), /EvidenceRef/);
  }
  assert.throws(() => assess({ content: Buffer.alloc(0) }), /Nonempty/);
  assert.throws(() => assess({ attestations: null }), /attestations/);
  assert.throws(() => assess({ attestations: [attestation('a', { signerId: 'a\u0000' })] }), /control characters/);
});
test('attestation list rejects sparse, accessor-backed and extended arrays without running getters', () => {
  const sparse = new Array(1);
  assert.throws(() => assess({ attestations: sparse }), /must not contain holes/);
  const getterList = [attestation('a')];
  let getterCalls = 0;
  Object.defineProperty(getterList, '0', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('Getter must never execute'); },
  });
  assert.throws(() => assess({ attestations: getterList }), /enumerable data elements/);
  assert.equal(getterCalls, 0);
  const hidden = [attestation('a')];
  Object.defineProperty(hidden, 'injectedClaim', { value: 'signed', enumerable: false });
  assert.throws(() => assess({ attestations: hidden }), /only array indices/);
  const symbol = [attestation('a')];
  symbol[Symbol('injectedClaim')] = 'signed';
  assert.throws(() => assess({ attestations: symbol }), /only array indices/);
  const inherited = [attestation('a')];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => assess({ attestations: inherited }), /plain array/);
});

test('signature receipt snapshots reject oversized histories before reading elements', () => {
  const oversized = new Array(10_001).fill(attestation('a'));
  let getterCalls = 0;
  Object.defineProperty(oversized, '0', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('Oversized receipt getter must not execute'); },
  });
  assert.throws(() => assess({ attestations: oversized }), /10000-record review limit/);
  assert.equal(getterCalls, 0);

  // Exactly 10,000 is within the structural bound; duplicate signers still
  // fail the independent integrity gate rather than being silently truncated.
  const boundary = new Array(10_000).fill(attestation('a'));
  assert.throws(() => assess({ attestations: boundary }), /Duplicate signer attestation/);
});

test('frozen plain attestation lists remain eligible for evidence review', () => {
  const attestations = Object.freeze([Object.freeze(attestation('a'))]);
  assert.equal(assess({ attestations }).status, 'evidence_ready_for_review');
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
  assert.throws(() => assess({
    versionRegistry: registryWith({
      finalizedAt: '2026-10-28T10:00:00.000Z',
    }),
  }), /Document finalization must not follow registration/);
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

test('signing preflights the entire version list before reading historical fields', () => {
  const valid = packet().versionRegistry.versions[0];
  const registryWith = versions => ({ ...packet().versionRegistry, versions });
  const sparse = new Array(1);
  assert.throws(() => assess({ versionRegistry: registryWith(sparse) }),
    /must not contain holes/);
  let getterCalls = 0;
  const accessorList = [valid];
  Object.defineProperty(accessorList, '0', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('Version list getter executed'); },
  });
  assert.throws(() => assess({ versionRegistry: registryWith(accessorList) }),
    /enumerable data elements/);
  assert.equal(getterCalls, 0);
  const hidden = [valid];
  Object.defineProperty(hidden, 'paymentReceived', { value: true, enumerable: false });
  assert.throws(() => assess({ versionRegistry: registryWith(hidden) }),
    /only array indices/);
  const inherited = [valid];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => assess({ versionRegistry: registryWith(inherited) }),
    /plain array/);
  assert.equal(assess({ versionRegistry: registryWith(Object.freeze([Object.freeze({ ...valid })])) }).status,
    'evidence_ready_for_review');
});

test('signing rejects accessor-backed and hidden historical version records without executing getters', () => {
  const valid = packet().versionRegistry.versions[0];
  const registryWith = version => ({
    ...packet().versionRegistry, versions: [version],
  });
  for (const key of ['trustId', 'status', 'registeredAt', 'versionId']) {
    let getterCalls = 0;
    const malicious = { ...valid };
    Object.defineProperty(malicious, key, {
      enumerable: true, configurable: true,
      get() { getterCalls++; throw new Error('Historical version getter executed'); },
    });
    assert.throws(() => assess({ versionRegistry: registryWith(malicious) }),
      /enumerable own data properties/);
    assert.equal(getterCalls, 0);
  }
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'settledMinor', { value: 100, enumerable: false });
  assert.throws(() => assess({ versionRegistry: registryWith(hidden) }),
    /unsupported fields/);
  const symbol = { ...valid, [Symbol('paymentAuthorized')]: true };
  assert.throws(() => assess({ versionRegistry: registryWith(symbol) }),
    /unsupported fields/);
});

test('signing preflights every receipt record without executing later receipt getters', () => {
  let getterCalls = 0;
  const malicious = attestation('b');
  Object.defineProperty(malicious, 'signerId', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('Untrusted signer getter executed'); },
  });
  assert.throws(() => assess({
    attestations: [attestation('a'), malicious],
  }), /enumerable own data properties/);
  assert.equal(getterCalls, 0);
  const hidden = attestation('b');
  Object.defineProperty(hidden, 'consentEvidenceRef', {
    enumerable: false, configurable: true, value: 'hidden-consent',
  });
  assert.throws(() => assess({ attestations: [attestation('a'), hidden] }),
    /enumerable own data properties/);
});

test('signing rejects unsupported receipt claims and custom prototypes; frozen plain receipts remain valid', () => {
  const unknown = { ...attestation('a'), paymentReceived: true };
  assert.throws(() => assess({ attestations: [unknown] }), /unsupported fields/);
  const symbol = { ...attestation('a'), [Symbol('settled')]: true };
  assert.throws(() => assess({ attestations: [symbol] }), /unsupported fields/);
  const inherited = attestation('a');
  Object.setPrototypeOf(inherited, { paymentAuthorized: true });
  assert.throws(() => assess({ attestations: [inherited] }), /plain record/);
  assert.equal(assess({
    attestations: [Object.freeze(attestation('a'))],
  }).status, 'evidence_ready_for_review');
  assert.equal(assess({
    attestations: [Object.assign(Object.create(null), attestation('a'))],
  }).status, 'evidence_ready_for_review');
});

test('signing packet envelope rejects executable and hidden claims before reading scope', () => {
  assert.equal(assess().status, 'evidence_ready_for_review');
  for (const field of ['tenantId', 'governance', 'versionRegistry', 'attestations']) {
    let calls = 0;
    const malicious = packet();
    Object.defineProperty(malicious, field, {
      enumerable: true, configurable: true,
      get() { calls++; throw new Error('Untrusted packet getter executed'); },
    });
    assert.throws(() => assessTrustDocumentSigningPacket(malicious),
      /Signing packet fields must be enumerable own data properties/);
    assert.equal(calls, 0);
  }
  const hidden = packet();
  Object.defineProperty(hidden, 'paymentReceived', { value: true, enumerable: false });
  assert.throws(() => assessTrustDocumentSigningPacket(hidden),
    /Signing packet contains unsupported fields/);
  assert.throws(() => assessTrustDocumentSigningPacket({
    ...packet(), [Symbol('settled')]: true,
  }), /Signing packet contains unsupported fields/);
  assert.throws(() => assessTrustDocumentSigningPacket({
    ...packet(), paymentAuthorized: true,
  }), /Signing packet contains unsupported fields/);
  const inherited = packet();
  Object.setPrototypeOf(inherited, { tenantId: 'forged-tenant' });
  assert.throws(() => assessTrustDocumentSigningPacket(inherited),
    /Signing packet must be a plain data record/);
  const missing = packet();
  delete missing.trustId;
  assert.throws(() => assessTrustDocumentSigningPacket(missing),
    /Signing packet missing own field: trustId/);
  assert.equal(assessTrustDocumentSigningPacket(Object.freeze(packet())).status,
    'evidence_ready_for_review');
  assert.equal(assessTrustDocumentSigningPacket(Object.assign(Object.create(null), packet())).status,
    'evidence_ready_for_review');
});

test('signing preflights document registry envelope before reading any registry scope', () => {
  const valid = packet().versionRegistry;
  for (const field of ['tenantId', 'trustId', 'versions']) {
    let getterCalls = 0;
    const malicious = { ...valid };
    Object.defineProperty(malicious, field, {
      enumerable: true, configurable: true,
      get() { getterCalls++; throw new Error('Registry getter executed in signing'); },
    });
    assert.throws(() => assess({ versionRegistry: malicious }),
      /Document registry fields must be enumerable own data properties/);
    assert.equal(getterCalls, 0, field + ' getter executed');
  }
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'paymentReceived', { value: true, enumerable: false });
  assert.throws(() => assess({ versionRegistry: hidden }),
    /Document registry contains unsupported fields/);
  const inherited = { ...valid };
  Object.setPrototypeOf(inherited, { trustId: 'forged-trust' });
  assert.throws(() => assess({ versionRegistry: inherited }),
    /Document registry must be a plain data record/);
  const missing = { ...valid };
  delete missing.versions;
  assert.throws(() => assess({ versionRegistry: missing }),
    /Document registry missing own field: versions/);
  assert.equal(assess({ versionRegistry: Object.freeze(valid) }).status,
    'evidence_ready_for_review');
  assert.equal(assess({ versionRegistry: Object.assign(Object.create(null), valid) }).status,
    'evidence_ready_for_review');
});

test('signing evidence rejects Unicode-normalization aliases without excluding canonical names', () => {
  const decomposed = 'e\u0301';
  const canonical = '\u00e9';
  // A visually identical alternate encoding must not become a distinct
  // document, trust, signer, or evidence reference in the signing review.
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId', 'versionId']) {
    assert.throws(() => assess({ [key]: 'id-' + decomposed }), /NFC-normalized Unicode/);
  }
  for (const key of ['signerId', 'identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
    assert.throws(() => assess({
      attestations: [attestation('a', { [key]: 'ref-' + decomposed })],
    }), /NFC-normalized Unicode/);
  }
  // Canonical international identifiers remain structurally admissible.
  assert.equal(assess({
    governance: {
      ...packet().governance,
      appointments: [...packet().governance.appointments, appointment(canonical)],
    },
    attestations: [attestation(canonical)],
  }).status, 'evidence_ready_for_review');
});

test('signing packet keeps owner, document, version, principal and provenance namespaces distinct', () => {
  // All five packet scope roles must remain distinct before governance or
  // registry matching can treat the same alias as a legitimate identity.
  for (const [key, alias] of [
    ['entityId', scope.tenantId],
    ['trustId', scope.entityId],
    ['documentId', scope.trustId],
    ['versionId', scope.documentId],
  ]) {
    assert.throws(() => assess({ [key]: alias }), /identifiers must be distinct/, key);
  }
  // A trustee ID can be syntactically valid and still impersonate the
  // document identity; a matching appointment must not make it admissible.
  const documentSigner = scope.documentId;
  assert.throws(() => assess({
    governance: { ...packet().governance, appointments: [appointment(documentSigner)] },
    attestations: [attestation(documentSigner)],
  }), /principal identifier collides/);

  for (const [field, alias] of [
    ['identityEvidenceRef', scope.tenantId],
    ['consentEvidenceRef', 'a'],
    ['signatureEvidenceRef', scope.versionId],
  ]) {
    assert.throws(() => assess({
      attestations: [attestation('a', { [field]: alias })],
    }), /(?:provenance reference collides|Signing evidence reference collides with scope or signer identity)/, field);
  }
  assert.throws(() => assess({
    governance: {
      ...packet().governance,
      appointments: [appointment('a', { acceptanceEvidenceRef: scope.documentId })],
    },
  }), /provenance reference collides/);
  assert.equal(assess().status, 'evidence_ready_for_review');
});


test('signing scope, principals and evidence references enforce 256 UTF-16 code units', () => {
  const over = 'x'.repeat(257);
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId', 'versionId']) {
    assert.throws(() => assess({ [key]: over }), /256 UTF-16 code units/);
  }
  for (const key of ['signerId', 'identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
    assert.throws(() => assess({ attestations: [attestation('a', { [key]: over })] }),
      /256 UTF-16 code units/);
  }
  const supplementary = '\u{1F680}'.repeat(129);
  assert.throws(() => assess({ attestations: [attestation('a', {
    signatureEvidenceRef: supplementary,
  })] }), /256 UTF-16 code units/);
  assert.equal(assess({ attestations: [attestation('a', {
    signatureEvidenceRef: 'x'.repeat(256),
  })] }).status, 'evidence_ready_for_review');
});

test('signing audit identifiers reject bidirectional display controls', () => {
  for (const control of ['\u200E', '\u200F', '\u202A', '\u202E', '\u2066', '\u2069']) {
    for (const key of ['tenantId', 'entityId', 'trustId', 'documentId', 'versionId']) {
      assert.throws(() => assess({ [key]: 'id-' + control + 'suffix' }),
        /invisible Unicode formatting controls/);
    }
    for (const key of ['signerId', 'identityEvidenceRef', 'consentEvidenceRef', 'signatureEvidenceRef']) {
      assert.throws(() => assess({ attestations: [attestation('a', { [key]: 'ref-' + control + 'suffix' })] }),
        /invisible Unicode formatting controls/);
    }
  }
  assert.equal(assess().status, 'evidence_ready_for_review');
});

test('signing audit identifiers reject invisible default-ignorable Unicode', () => {
  const invisible = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFE0F', '\u00AD'];
  for (const character of invisible) {
    assert.throws(() => assess({ tenantId: 'tenant' + character + '-a' }),
      /invisible Unicode formatting controls/);
    assert.throws(() => assess({ attestations: [
      attestation('a', { signerId: 'signer' + character + '-a' }),
    ] }), /invisible Unicode formatting controls/);
    assert.throws(() => assess({ attestations: [
      attestation('a', { signatureEvidenceRef: 'receipt' + character + '-a' }),
    ] }), /invisible Unicode formatting controls/);
  }
  assert.equal(assess().status, 'evidence_ready_for_review');
});


test('signing evidence uses descriptor snapshot despite adversarial array iteration and reads', () => {
  const valid = attestation('a');
  const tampered = attestation('a', { explicitConsent: false });
  const target = [valid];
  const adversarial = new Proxy(target, {
    get(object, key, receiver) {
      if (key === Symbol.iterator) {
        return function* () { yield tampered; };
      }
      if (key === '0') return tampered;
      return Reflect.get(object, key, receiver);
    },
  });
  assert.equal(assess({ attestations: adversarial }).status, 'evidence_ready_for_review');
});


test('signing receipt field reads use admitted data descriptors, not Proxy get substitutions', () => {
  const original = attestation('a');
  let reads = 0;
  const adversarial = new Proxy(original, {
    get(target, key, receiver) {
      if (key === 'signerId') {
        reads++;
        return 'impostor';
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const result = assess({ attestations: [adversarial] });
  assert.equal(result.status, 'evidence_ready_for_review');
  assert.equal(result.signerCount, 1);
  assert.equal(reads, 0, 'validated receipt fields must never be reread through Proxy get');
});


test('signing packet uses validated descriptors instead of Proxy field reads', () => {
  const original = packet();
  let reads = 0;
  const malicious = new Proxy(original, {
    get(target, key, receiver) {
      if (key === 'trustId') {
        reads++;
        return 'forged-trust';
      }
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(assessTrustDocumentSigningPacket(malicious).status, 'evidence_ready_for_review');
  assert.equal(reads, 0);
});
