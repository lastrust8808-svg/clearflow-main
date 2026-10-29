import { timingSafeEqual } from 'node:crypto';

/**
 * Pure, non-posting verification decision for an already authorized,
 * tenant-scoped document-version registry.
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
 * @param {{tenantId:string,entityId:string,documentId:string,versions:Array<{
 *   versionId:string,sequence:number,sha256:string,status:'current'|'superseded'|'revoked',
 *   registeredAt:string,evidenceRef:string}>}} registry
 * @param {{versionId:string,sha256:string}} proof sha256 MUST be computed from the supplied file bytes
 * @returns {{status:'valid'|'superseded'|'revoked'|'unknown'}} Frozen, metadata-free result
 */
export function verifyTrustDocumentVersion(registry, proof) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('Document registry required');
  }
  for (const key of ['tenantId', 'entityId', 'documentId']) identifier(registry[key], key);
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
