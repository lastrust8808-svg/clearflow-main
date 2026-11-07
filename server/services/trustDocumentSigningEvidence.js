import { createHash, timingSafeEqual } from 'node:crypto';
import { evaluateTrusteeSigningPolicy } from './trusteeSigningPolicy.js';
import { assertPlainTrustDocumentRegistry, assertPlainTrustDocumentVersions, verifyTrustDocumentBytes } from './trustDocumentVersionPolicy.js';

/**
 * INTERNAL, non-posting signature-evidence readiness assessment. The caller
 * MUST authenticate the tenant/trust, verify appointment and acceptance
 * evidence, independently validate signer identity, consent and signature
 * provider receipts, and load finalized bytes plus version registry from
 * immutable storage. An untrusted caller-supplied registry is NOT proof.
 *
 * "evidence_ready_for_review" is NOT a verified signature, notarization,
 * legally executed instrument or authorization to issue, enforce or pay.
 */
function identifier(value, field) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(field + ' must be a nonempty unpadded identifier without control characters');
  }
  // Canonically equivalent signer, document and evidence identifiers must
  // not become distinct audit subjects merely because their Unicode byte
  // representations differ. Do not rewrite an authenticated identifier.
  // Lone UTF-16 surrogates become replacement characters when encoded as UTF-8,
  // potentially aliasing distinct signer, scope and signing-receipt identities.
  // Preserve valid supplementary-plane characters; never normalize on write.
  if (/[\uD800-\uDFFF]/u.test(value)) {
    throw new TypeError(field + ' must contain well-formed Unicode');
  }
  // Reserved Unicode noncharacters are not valid audit identifiers. Reject
  // both BMP and supplementary-plane noncharacters before persistence.
  if (/[\uFDD0-\uFDEF\uFFFE\uFFFF]/u.test(value) ||
      [...value].some(char => {
        const point = char.codePointAt(0);
        return point > 0xFFFF && (point & 0xFFFE) === 0xFFFE;
      })) {
    throw new TypeError(field + ' must not contain Unicode noncharacters');
  }
  // Directional formatting controls can visually reorder signer and evidence
  // identifiers in review screens without changing their stored identity.
  if (/\p{Default_Ignorable_Code_Point}/u.test(value)) {
    throw new TypeError(field + ' must not contain invisible Unicode formatting controls');
  }
  // Bound every signing identity and evidence pointer before storage or hashing.
  // Count UTF-16 code units consistently with the trust ledger identifiers.
  if (value.length > 256) {
    throw new RangeError(field + ' exceeds 256 UTF-16 code units');
  }
  if (value.normalize('NFC') !== value) {
    throw new TypeError(field + ' must use NFC-normalized Unicode');
  }
  return value;
}

function timestamp(value, field) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(field + ' must be a canonical UTC timestamp');
  }
  return value;
}

function digest(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(field + ' must be a lowercase SHA-256 digest');
  }
  return Buffer.from(value, 'hex');
}

// Reject malformed signature lists before reading any element. A sparse,
// accessor-backed or extended array is not an independently reviewable set of
// signer receipts; an accessor could also execute arbitrary code on read.
function requirePlainAttestationList(attestations) {
  if (!Array.isArray(attestations) || Object.getPrototypeOf(attestations) !== Array.prototype) {
    throw new TypeError('Signature attestations must be a plain array');
  }
  // Bound untrusted receipt snapshots before allocating per-element descriptors.
  // Larger authenticated histories need pagination/checkpoints, never truncation.
  if (attestations.length > 10_000) {
    throw new RangeError('Signature attestations exceed the 10000-record review limit');
  }
  const descriptors = Object.getOwnPropertyDescriptors(attestations);
  const length = descriptors.length.value;
  let count = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' ? Number(key) : NaN;
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new TypeError('Signature attestations must contain only array indices');
    }
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError('Signature attestations must contain enumerable data elements');
    }
    count++;
  }
  if (count !== length) throw new TypeError('Signature attestations must not contain holes');
  // Snapshot validated data descriptors; never consult a caller-controlled iterator
  // or indexed Proxy read after structural admission.
  return Array.from({ length }, (_, i) => descriptors[String(i)].value);
}

// Signature receipts are evidence claims, not executable application objects.
// Validate every receipt before reading any receipt field, including receipts
// later in the list. This is structural admission, not receipt authentication.
const ATTESTATION_FIELDS = new Set([
  'tenantId', 'entityId', 'trustId', 'documentId', 'versionId',
  'signerId', 'documentSha256', 'signedAt', 'explicitConsent',
  'consentedAt', 'identityEvidenceRef', 'consentEvidenceRef',
  'signatureEvidenceRef',
]);

function requirePlainAttestationRecord(attestation) {
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation) ||
      (Object.getPrototypeOf(attestation) !== Object.prototype &&
       Object.getPrototypeOf(attestation) !== null)) {
    throw new TypeError('Signature attestation must be a plain record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(attestation);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !ATTESTATION_FIELDS.has(key)) {
      throw new TypeError('Signature attestation contains unsupported fields');
    }
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError('Signature attestation fields must be enumerable own data properties');
    }
  }
  // Consume the admitted data descriptors, not a second round of potentially
  // adversarial Proxy property reads. Preserve only the validated receipt fields.
  const snapshot = Object.create(null);
  for (const key of Object.keys(descriptors)) snapshot[key] = descriptors[key].value;
  return Object.freeze(snapshot);
}

// The packet envelope itself must be inert before any scope or document
// field is read. Do not allow a caller to manufacture authority by exposing
// an inherited identity, executing a getter, or smuggling payment claims.
const SIGNING_PACKET_FIELDS = new Set([
  'tenantId', 'entityId', 'trustId', 'documentId', 'versionId',
  'content', 'finalizedAt', 'evaluatedAt', 'governance',
  'versionRegistry', 'attestations',
]);

function requirePlainSigningPacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) ||
      (Object.getPrototypeOf(packet) !== Object.prototype &&
       Object.getPrototypeOf(packet) !== null)) {
    throw new TypeError('Signing packet must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(packet);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !SIGNING_PACKET_FIELDS.has(key)) {
      throw new TypeError('Signing packet contains unsupported fields');
    }
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError('Signing packet fields must be enumerable own data properties');
    }
  }
  for (const key of SIGNING_PACKET_FIELDS) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new TypeError('Signing packet missing own field: ' + key);
    }
  }
  const snapshot = Object.create(null);
  for (const key of SIGNING_PACKET_FIELDS) snapshot[key] = descriptors[key].value;
  return Object.freeze(snapshot);
}

// Governance is later spread into a policy snapshot. An accessor on the
// original governance object would execute during that spread, before the
// policy evaluator could validate the copied object. Admit only inert, own
// data fields before reading scope or constructing derived policy snapshots.
const SIGNING_GOVERNANCE_FIELDS = new Set([
  'tenantId', 'entityId', 'trustId', 'mode', 'appointments',
]);

function requirePlainSigningGovernance(governance) {
  if (!governance || typeof governance !== 'object' || Array.isArray(governance) ||
      (Object.getPrototypeOf(governance) !== Object.prototype &&
       Object.getPrototypeOf(governance) !== null)) {
    throw new TypeError('Signing governance must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(governance);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !SIGNING_GOVERNANCE_FIELDS.has(key)) {
      throw new TypeError('Signing governance contains unsupported fields');
    }
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError('Signing governance fields must be enumerable own data properties');
    }
  }
  for (const key of SIGNING_GOVERNANCE_FIELDS) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new TypeError('Signing governance missing own field: ' + key);
    }
  }
}

/**
 * @param {{tenantId:string,entityId:string,trustId:string,documentId:string,
 *   versionId:string,content:Buffer|Uint8Array,finalizedAt:string,evaluatedAt:string,
 *   governance:object,versionRegistry:object,attestations:Array<{
 *     tenantId:string,entityId:string,trustId:string,documentId:string,
 *     versionId:string,signerId:string,documentSha256:string,signedAt:string,
 *     explicitConsent:boolean,consentedAt:string,identityEvidenceRef:string,consentEvidenceRef:string,signatureEvidenceRef:string
 *   }>}} packet
 * @returns {{status:'evidence_ready_for_review'|'incomplete',
 *   reason:string,signerCount:number}} Frozen internal decision.
 */
export function assessTrustDocumentSigningPacket(packet) {
  packet = requirePlainSigningPacket(packet);
  const scope = {};
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId', 'versionId']) {
    scope[key] = identifier(packet[key], key);
  }
  // Scope and document/version identities have separate audit roles. A shared
  // identifier would make a receipt or registry key ambiguous even when the
  // caller repeats the same malformed scope in every supplied record.
  if (new Set(Object.values(scope)).size !== Object.keys(scope).length) {
    throw new Error('Signing tenant, entity, trust, document and version identifiers must be distinct');
  }
  // finalizedAt must originate from the immutable document-version record,
  // not from an untrusted signer or request body. A signature on a draft must
  // never be counted as evidence for a subsequently finalized document.
  const finalizedAt = timestamp(packet.finalizedAt, 'finalizedAt');
  const evaluatedAt = timestamp(packet.evaluatedAt, 'evaluatedAt');
  if (finalizedAt > evaluatedAt) {
    throw new Error('Document finalization cannot follow signing packet evaluation');
  }
  if ((!Buffer.isBuffer(packet.content) && !(packet.content instanceof Uint8Array)) ||
      packet.content.byteLength === 0) {
    throw new TypeError('Nonempty finalized document bytes required');
  }
  requirePlainSigningGovernance(packet.governance);
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    if (packet.governance[key] !== scope[key]) {
      throw new Error('Signing governance ' + key + ' scope mismatch');
    }
  }
  const attestations = requirePlainAttestationList(packet.attestations)
    .map(requirePlainAttestationRecord);
  const documentHash = createHash('sha256').update(packet.content).digest();
  const signers = new Set();
  const evidenceRefs = new Set();
  let lastSignedAt = null;
  let earliestConsentAt = null;
  const result = (status, reason) => Object.freeze({ status, reason, signerCount: signers.size });

  for (const attestation of attestations) {
    if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
      throw new TypeError('Invalid signature attestation');
    }
    for (const [key, value] of Object.entries(scope)) {
      if (attestation[key] !== value) {
        throw new Error('Signature attestation ' + key + ' scope mismatch');
      }
    }
    const signerId = identifier(attestation.signerId, 'attestation.signerId');
    if (Object.values(scope).includes(signerId)) {
      throw new Error('Signing principal identifier collides with document or ownership scope');
    }
    if (signers.has(signerId)) throw new Error('Duplicate signer attestation');
    signers.add(signerId);
    const signedAt = timestamp(attestation.signedAt, 'attestation.signedAt');
    if (signedAt > evaluatedAt || (lastSignedAt !== null && signedAt <= lastSignedAt)) {
      throw new Error('Signature attestations must be chronological and not future dated');
    }
    if (signedAt < finalizedAt) {
      throw new Error('Signature attestation predates finalized document version');
    }
    lastSignedAt = signedAt;
    // A signer identity-evidence pointer is mandatory, but is NOT proof that
    // identity was independently verified. That remains an authenticated
    // provider/manual-review integration gate outside this pure assessment.
    const identityEvidenceRef = identifier(attestation.identityEvidenceRef, 'identityEvidenceRef');
    const consentEvidenceRef = identifier(attestation.consentEvidenceRef, 'consentEvidenceRef');
    const signatureEvidenceRef = identifier(attestation.signatureEvidenceRef, 'signatureEvidenceRef');
    for (const evidenceRef of [identityEvidenceRef, consentEvidenceRef, signatureEvidenceRef]) {
      // Receipt pointers must not alias ownership or document identifiers.
      // Such aliases obscure the distinction between a record and its evidence.
      if (Object.values(scope).includes(evidenceRef) || evidenceRef === signerId) {
        throw new Error('Signing evidence reference collides with scope or signer identity');
      }
      if (evidenceRefs.has(evidenceRef)) throw new Error('Reused signing evidence reference');
      evidenceRefs.add(evidenceRef);
    }
    if (attestation.explicitConsent !== true) {
      return result('incomplete', 'explicit_consent_not_recorded');
    }
    // Explicit consent must be recorded for these finalized bytes no later
    // than the signing instant. These timestamps are only structural inputs:
    // integration must authenticate the consent record and its server clock.
    const consentedAt = timestamp(attestation.consentedAt, 'attestation.consentedAt');
    if (consentedAt < finalizedAt || consentedAt > signedAt) {
      return result('incomplete', 'consent_chronology_invalid');
    }
    if (earliestConsentAt === null || consentedAt < earliestConsentAt) {
      earliestConsentAt = consentedAt;
    }
    if (!timingSafeEqual(digest(attestation.documentSha256, 'documentSha256'), documentHash)) {
      return result('incomplete', 'document_bytes_mismatch');
    }
    // Check appointment eligibility at the individual signing date, without
    // treating a single signature as satisfaction of a joint signing policy.
    const atSigning = evaluateTrusteeSigningPolicy({
      ...packet.governance, mode: 'independent',
      asOfDate: signedAt.slice(0, 10), signerIds: [signerId],
    });
    if (!atSigning.eligible) return result('incomplete', 'signer_ineligible_at_signing');
  }
  if (signers.size === 0) return result('incomplete', 'no_signing_attestations');
  // A signature packet for a superseded/revoked/unregistered version must not
  // be marked ready for current-document review. The registry and bytes MUST
  // be loaded from authenticated, immutable storage by the caller.
  const versionRegistry = packet.versionRegistry;
  if (!versionRegistry || typeof versionRegistry !== 'object' ||
      Array.isArray(versionRegistry)) {
    throw new TypeError('Immutable document version registry required');
  }
  assertPlainTrustDocumentRegistry(versionRegistry);
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId']) {
    if (versionRegistry[key] !== scope[key]) {
      throw new Error('Signing document version registry ' + key + ' scope mismatch');
    }
  }
  // Fail closed on the complete historical version list before any loop
  // reads trust ownership, revocation status or timestamps. The core verifier
  // runs later and cannot protect these earlier reads on its own.
  assertPlainTrustDocumentVersions(versionRegistry.versions);
  // A tenant may own multiple trusts. A matching tenant/entity/document ID
  // does not authorize substituting a version registered for another trust.
  // Require trust ownership on the registry AND every historical version.
  // Legacy records lacking this provenance intentionally fail closed.
  if (Array.isArray(versionRegistry.versions)) {
    for (const version of versionRegistry.versions) {
      if (!version || typeof version !== 'object' || Array.isArray(version) ||
          version.trustId !== scope.trustId) {
        throw new Error('Signing document version trustId scope mismatch');
      }
    }
  }
  // Historical revocations must have a dated, independently verifiable
  // record before they can contribute to an as-of signing review. A future
  // revocation cannot be applied retroactively. The caller must authenticate
  // these timestamps against an append-only registry; this is only a
  // structural chronology check over supplied records.
  for (const version of versionRegistry.versions ?? []) {
    if (version.status !== 'revoked' || version.versionId === scope.versionId) continue;
    const registeredAt = timestamp(version.registeredAt, 'version.registeredAt');
    const revokedAt = timestamp(version.revokedAt, 'version.revokedAt');
    if (revokedAt <= registeredAt || revokedAt > evaluatedAt) {
      return result('incomplete', 'historical_revocation_chronology_invalid');
    }
  }
  const versionStatus = verifyTrustDocumentBytes(versionRegistry, {
    versionId: scope.versionId, content: packet.content,
  });
  if (versionStatus.status !== 'valid') {
    return result('incomplete', 'document_version_not_current');
  }
  // The finalization instant is security-sensitive. A request-supplied value
  // alone could be backdated to make a draft signature appear valid. Bind it
  // to the immutable, matching version record and its registration chronology.
  // Older records without this provenance cannot be evidence-ready.
  const currentVersion = versionRegistry.versions.find(v => v.versionId === scope.versionId);
  if (!currentVersion || typeof currentVersion.finalizedAt !== 'string') {
    return result('incomplete', 'document_finalization_provenance_missing');
  }
  const recordedFinalizedAt = timestamp(currentVersion.finalizedAt, 'version.finalizedAt');
  const registeredAt = timestamp(currentVersion.registeredAt, 'version.registeredAt');
  if (recordedFinalizedAt > registeredAt || recordedFinalizedAt !== finalizedAt) {
    return result('incomplete', 'document_finalization_provenance_mismatch');
  }
  // A version registered after the review instant cannot establish current
  // signing readiness at that earlier instant, even if its bytes and hash
  // match. Registration timestamps MUST come from immutable storage.
  if (registeredAt > evaluatedAt) {
    return result('incomplete', 'document_registration_after_evaluation');
  }
  // A later registry entry must not retroactively authenticate a signature
  // recorded against an unregistered version. The first attestation is the
  // earliest because signing timestamps are validated in strict order above.
  // Registration and signature timestamps must come from trusted storage.
  if (attestations[0].signedAt < registeredAt) {
    return result('incomplete', 'document_registered_after_signature');
  }
  // A later registration must not retroactively validate consent collected
  // against an unregistered document. Check all signers, not just the first.
  if (earliestConsentAt < registeredAt) {
    return result('incomplete', 'document_registered_after_consent');
  }
  // A signature identity/consent/receipt record must not be recycled as
  // trustee-appointment acceptance or document-version registration evidence.
  // These represent distinct provenance events even when the same signer and
  // document are involved. References remain unverified until authenticated
  // storage and evidence-provider integration.
  const provenanceRefs = new Set(evidenceRefs);
  for (const appointment of packet.governance.appointments) {
    if (appointment.acceptedOn != null) {
      const ref = identifier(appointment.acceptanceEvidenceRef, 'appointment.acceptanceEvidenceRef');
      if (provenanceRefs.has(ref)) throw new Error('Reused cross-role signing provenance reference');
      provenanceRefs.add(ref);
    }
    if (appointment.revokedOn != null) {
      const ref = identifier(appointment.revocationEvidenceRef, 'appointment.revocationEvidenceRef');
      if (provenanceRefs.has(ref)) throw new Error('Reused cross-role signing provenance reference');
      provenanceRefs.add(ref);
    }
  }
  for (const version of versionRegistry.versions) {
    const ref = identifier(version.evidenceRef, 'version.evidenceRef');
    if (provenanceRefs.has(ref)) throw new Error('Reused cross-role signing provenance reference');
    provenanceRefs.add(ref);
    // A historical document revocation is a separate governance-sensitive
    // event. Its receipt cannot double as signing, trustee or registration
    // evidence even when the currently signed version remains valid.
    if (version.status === 'revoked') {
      const revocationRef = identifier(version.revocationEvidenceRef, 'version.revocationEvidenceRef');
      if (provenanceRefs.has(revocationRef)) {
        throw new Error('Reused cross-role signing provenance reference');
      }
      provenanceRefs.add(revocationRef);
    }
  }
  // Signing, trustee and document-version evidence receipts must never
  // masquerade as an owner, signer, document or version identifier. Check the
  // full collected set so later receipts cannot alias earlier identities.
  const identityRefs = new Set([...Object.values(scope), ...signers]);
  for (const appointment of packet.governance.appointments) {
    identityRefs.add(identifier(appointment.trusteeId, 'appointment.trusteeId'));
  }
  for (const evidenceRef of provenanceRefs) {
    if (identityRefs.has(evidenceRef)) {
      throw new Error('Signing provenance reference collides with principal or document identity');
    }
  }
  // The actual independent/joint governance rule is applied to the COMPLETE
  // signer set, not to any single event.
  const atReview = evaluateTrusteeSigningPolicy({
    ...packet.governance, asOfDate: evaluatedAt.slice(0, 10),
    signerIds: [...signers],
  });
  return atReview.eligible
    ? result('evidence_ready_for_review', 'supplied_policy_satisfied')
    : result('incomplete', 'governance_signer_set_ineligible');
}
