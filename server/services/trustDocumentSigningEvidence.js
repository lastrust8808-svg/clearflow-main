import { createHash, timingSafeEqual } from 'node:crypto';
import { evaluateTrusteeSigningPolicy } from './trusteeSigningPolicy.js';
import { verifyTrustDocumentBytes } from './trustDocumentVersionPolicy.js';

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
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new TypeError('Signing packet required');
  }
  const scope = {};
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId', 'versionId']) {
    scope[key] = identifier(packet[key], key);
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
  if (!packet.governance || typeof packet.governance !== 'object' ||
      Array.isArray(packet.governance)) {
    throw new TypeError('Governance snapshot required');
  }
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    if (packet.governance[key] !== scope[key]) {
      throw new Error('Signing governance ' + key + ' scope mismatch');
    }
  }
  if (!Array.isArray(packet.attestations)) {
    throw new TypeError('Signature attestations must be an array');
  }
  const documentHash = createHash('sha256').update(packet.content).digest();
  const signers = new Set();
  const evidenceRefs = new Set();
  let lastSignedAt = null;
  let earliestConsentAt = null;
  const result = (status, reason) => Object.freeze({ status, reason, signerCount: signers.size });

  for (const attestation of packet.attestations) {
    if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
      throw new TypeError('Invalid signature attestation');
    }
    for (const [key, value] of Object.entries(scope)) {
      if (attestation[key] !== value) {
        throw new Error('Signature attestation ' + key + ' scope mismatch');
      }
    }
    const signerId = identifier(attestation.signerId, 'attestation.signerId');
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
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId']) {
    if (versionRegistry[key] !== scope[key]) {
      throw new Error('Signing document version registry ' + key + ' scope mismatch');
    }
  }
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
  if (packet.attestations[0].signedAt < registeredAt) {
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
