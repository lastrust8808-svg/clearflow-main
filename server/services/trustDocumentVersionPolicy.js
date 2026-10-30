import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Pure, non-posting verification decision for an already authorized,
 * tenant/entity/trust-scoped document-version registry.
 *
 * The caller MUST authenticate/authorize registry access, compute the SHA-256
 * digest from the actual document bytes, verify registration/revocation evidence,
 * and read versions from immutable durable storage. A QR identifier or a hash
 * supplied by a user is not itself proof of authenticity or legal execution.
 * Never expose tenant, trust, beneficiary or asset metadata in public responses.
 */
const VERSION_STATUSES = new Set(['current', 'superseded', 'revoked']);

function identifier(value, field) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(field + ' must be a nonempty unpadded identifier without control characters');
  }
  return value;
}

function digest(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(field + ' must be a lowercase SHA-256 hex digest');
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

/**
 * @param {{tenantId:string,entityId:string,trustId:string,documentId:string,versions:Array<{
 *   versionId:string,tenantId:string,entityId:string,trustId:string,documentId:string,sequence:number,sha256:string,status:'current'|'superseded'|'revoked',
 *   registeredAt:string,evidenceRef:string}>}} registry
 * @param {{versionId:string,sha256:string}} proof sha256 MUST be computed from the supplied file bytes
 * @returns {{status:'valid'|'superseded'|'revoked'|'unknown'}} Frozen, metadata-free result
 */
export function verifyTrustDocumentVersion(registry, proof) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('Document registry required');
  }
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId']) identifier(registry[key], key);
  if (!Array.isArray(registry.versions)) throw new TypeError('versions must be an array');
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    throw new TypeError('Document proof required');
  }
  const versionId = identifier(proof.versionId, 'proof.versionId');
  const providedDigest = Buffer.from(digest(proof.sha256, 'proof.sha256'), 'hex');

  const seenIds = new Set();
  const seenEvidence = new Set();
  let lastRegisteredAt = null;
  let target = null;
  for (let i = 0; i < registry.versions.length; i++) {
    const version = registry.versions[i];
    if (!version || typeof version !== 'object' || Array.isArray(version)) {
      throw new TypeError('Invalid document version');
    }
    const id = identifier(version.versionId, 'version.versionId');
    for (const key of ['tenantId', 'entityId', 'trustId', 'documentId']) {
      if (version[key] !== registry[key]) throw new Error('Document version ' + key + ' scope mismatch');
    }
    if (seenIds.has(id)) throw new Error('Duplicate document version ID');
    seenIds.add(id);
    const evidenceRef = identifier(version.evidenceRef, 'version.evidenceRef');
    if (seenEvidence.has(evidenceRef)) throw new Error('Duplicate document version evidence reference');
    seenEvidence.add(evidenceRef);
    if (version.sequence !== i + 1) throw new Error('Document version sequence must be contiguous');
    const sha256 = digest(version.sha256, 'version.sha256');
    const registeredAt = timestamp(version.registeredAt, 'version.registeredAt');
    if (lastRegisteredAt !== null && registeredAt <= lastRegisteredAt) {
      throw new Error('Document versions must have increasing registration timestamps');
    }
    lastRegisteredAt = registeredAt;
    if (!VERSION_STATUSES.has(version.status)) throw new TypeError('Invalid document version status');
    // A revoked document version must have its own independently verifiable
    // revocation receipt. Registration evidence cannot double as revocation
    // evidence, and one receipt cannot revoke multiple versions. The caller
    // must authenticate this pointer against durable append-only records.
    if (version.status === 'revoked') {
      // Direct byte/version verification must enforce the same revocation
      // chronology as QR and signing review, even without a QR lookup.
      // The caller must authenticate these immutable timestamps separately.
      const revokedAt = timestamp(version.revokedAt, 'version.revokedAt');
      if (revokedAt <= registeredAt) {
        throw new Error('Document revocation must follow registration');
      }
      const revocationEvidenceRef = identifier(version.revocationEvidenceRef, 'version.revocationEvidenceRef');
      if (seenEvidence.has(revocationEvidenceRef)) {
        throw new Error('Reused document version revocation evidence reference');
      }
      seenEvidence.add(revocationEvidenceRef);
    } else {
      if (version.revocationEvidenceRef != null) {
        throw new Error('Nonrevoked document version cannot carry revocation evidence');
      }
      if (version.revokedAt != null) {
        throw new Error('Nonrevoked document version cannot carry revocation timestamp');
      }
    }
    if (i === registry.versions.length - 1 && version.status === 'superseded') {
      throw new Error('Latest document version cannot be superseded without a successor');
    }
    if (i < registry.versions.length - 1 && version.status === 'current') {
      throw new Error('Historical document version cannot be current');
    }
    if (id === versionId) target = { sha256, status: version.status };
  }
  if (!target) return Object.freeze({ status: 'unknown' });
  // A wrong digest must not reveal whether a known version was revoked or
  // superseded; compare fixed-size digests without a content-dependent branch.
  if (!timingSafeEqual(Buffer.from(target.sha256, 'hex'), providedDigest)) {
    return Object.freeze({ status: 'unknown' });
  }
  return Object.freeze({ status: target.status === 'current' ? 'valid' : target.status });
}

/**
 * Verify a finalized document against the scoped version registry using its
 * actual bytes. The caller must first authenticate tenant/entity/trust registry access and read
 * the immutable registry; this function does not establish signer identity,
 * legal execution, or QR-token authorization.
 *
 * @param {object} registry Already-authorized, tenant-scoped version registry
 * @param {{versionId:string,content:Buffer|Uint8Array}} proof Final document bytes
 * @returns {{status:'valid'|'superseded'|'revoked'|'unknown'}}
 */
export function verifyTrustDocumentBytes(registry, proof) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    throw new TypeError('Document byte proof required');
  }
  const { content } = proof;
  if ((!Buffer.isBuffer(content) && !(content instanceof Uint8Array)) || content.byteLength === 0) {
    throw new TypeError('Nonempty finalized document bytes required');
  }
  const sha256 = createHash('sha256').update(content).digest('hex');
  return verifyTrustDocumentVersion(registry, { versionId: proof.versionId, sha256 });
}
