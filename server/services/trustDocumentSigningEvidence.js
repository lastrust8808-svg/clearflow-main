import { createHash, timingSafeEqual } from 'node:crypto';
import { evaluateTrusteeSigningPolicy } from './trusteeSigningPolicy.js';

/**
 * INTERNAL, non-posting signature-evidence readiness assessment. The caller
 * MUST authenticate the tenant/trust, verify appointment and acceptance
 * evidence, independently validate signer identity, consent and signature
 * provider receipts, and load finalized bytes from immutable storage.
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
 *   versionId:string,content:Buffer|Uint8Array,evaluatedAt:string,
 *   governance:object,attestations:Array<{
 *     tenantId:string,entityId:string,trustId:string,documentId:string,
 *     versionId:string,signerId:string,documentSha256:string,signedAt:string,
 *     explicitConsent:boolean,consentEvidenceRef:string,signatureEvidenceRef:string
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
  const evaluatedAt = timestamp(packet.evaluatedAt, 'evaluatedAt');
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
    lastSignedAt = signedAt;
    const consentEvidenceRef = identifier(attestation.consentEvidenceRef, 'consentEvidenceRef');
    const signatureEvidenceRef = identifier(attestation.signatureEvidenceRef, 'signatureEvidenceRef');
    for (const evidenceRef of [consentEvidenceRef, signatureEvidenceRef]) {
      if (evidenceRefs.has(evidenceRef)) throw new Error('Reused signing evidence reference');
      evidenceRefs.add(evidenceRef);
    }
    if (attestation.explicitConsent !== true) {
      return result('incomplete', 'explicit_consent_not_recorded');
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
