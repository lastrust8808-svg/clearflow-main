import { timingSafeEqual } from 'node:crypto';
import { verifyTrustDocumentBytes } from './trustDocumentVersionPolicy.js';

/**
 * Pure, INTERNAL binding resolver for QR token SHA-256 digests.
 *
 * The caller MUST authenticate and authorize the tenant/entity/trust before reading
 * the immutable registry. The caller MUST NOT expose the returned documentId
 * or versionId to a public QR visitor. Resolve the document's actual current
 * status with the document-version policy after loading immutable bytes.
 * This does not persist bindings, rate-limit, validate signatures or prove
 * execution, and it must never be used as a public HTTP response directly.
 */
function id(value, field) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(field + ' must be a nonempty unpadded identifier without control characters');
  }
  return value;
}

function digest(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(field + ' must be a lowercase SHA-256 digest');
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
 * @param {{tenantId:string,entityId:string,bindings:Array<{
 *   tenantId:string,entityId:string,trustId:string,documentId:string,versionId:string,
 *   tokenHashSha256:string,status:'active'|'revoked',issuedAt:string,
 *   revokedAt?:string,revocationEvidenceRef?:string}>}} registry
 * @param {{tenantId:string,entityId:string,trustId:string,tokenHashSha256:string,asOfAt:string}} lookup
 * @returns {{status:'bound',documentId:string,versionId:string}|{status:'unknown'}}
 */
export function resolveTrustDocumentQrBinding(registry, lookup) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) ||
      !Array.isArray(registry.bindings)) {
    throw new TypeError('Tenant-scoped QR registry required');
  }
  const tenantId = id(registry.tenantId, 'registry.tenantId');
  const entityId = id(registry.entityId, 'registry.entityId');
  const trustId = id(registry.trustId, 'registry.trustId');
  if (!lookup || typeof lookup !== 'object' || Array.isArray(lookup)) {
    throw new TypeError('QR lookup required');
  }
  if (id(lookup.tenantId, 'lookup.tenantId') !== tenantId ||
      id(lookup.entityId, 'lookup.entityId') !== entityId ||
      id(lookup.trustId, 'lookup.trustId') !== trustId) {
    throw new Error('QR lookup tenant/entity scope mismatch');
  }
  // The caller MUST supply this instant from its trusted server clock and load
  // an as-of registry snapshot. A client-provided timestamp is not authority.
  const asOfAt = timestamp(lookup.asOfAt, 'lookup.asOfAt');
  const requested = Buffer.from(digest(lookup.tokenHashSha256, 'lookup.tokenHashSha256'), 'hex');
  const seenHashes = new Set();
  const activeVersions = new Set();
  // Each document version has a single non-overlapping QR-token validity
  // window. Revocation and replacement at the same instant are permitted.
  // These windows come from the caller's trusted, immutable registry.
  const versionWindows = new Map();
  let matched = null;
  for (const binding of registry.bindings) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
      throw new TypeError('Invalid QR binding');
    }
    if (binding.tenantId !== tenantId || binding.entityId !== entityId ||
        binding.trustId !== trustId) {
      throw new Error('QR binding tenant/entity scope mismatch');
    }
    const documentId = id(binding.documentId, 'binding.documentId');
    const versionId = id(binding.versionId, 'binding.versionId');
    const hash = digest(binding.tokenHashSha256, 'binding.tokenHashSha256');
    if (seenHashes.has(hash)) throw new Error('Duplicate QR token hash');
    seenHashes.add(hash);
    const issuedAt = timestamp(binding.issuedAt, 'binding.issuedAt');
    if (issuedAt > asOfAt) {
      throw new Error('QR binding issued after lookup as-of timestamp');
    }
    let revokedAt = null;
    if (binding.status === 'active') {
      if (binding.revokedAt != null || binding.revocationEvidenceRef != null) {
        throw new Error('Active QR binding cannot contain revocation evidence');
      }
      const versionKey = JSON.stringify([documentId, versionId]);
      if (activeVersions.has(versionKey)) throw new Error('Duplicate active QR document version');
      activeVersions.add(versionKey);
    } else if (binding.status === 'revoked') {
      revokedAt = timestamp(binding.revokedAt, 'binding.revokedAt');
      id(binding.revocationEvidenceRef, 'binding.revocationEvidenceRef');
      if (revokedAt <= issuedAt) throw new Error('QR revocation must follow issuance');
      if (revokedAt > asOfAt) {
        throw new Error('QR revocation occurs after lookup as-of timestamp');
      }
    } else {
      throw new TypeError('Invalid QR binding status');
    }
    const versionKey = JSON.stringify([documentId, versionId]);
    const windows = versionWindows.get(versionKey) ?? [];
    for (const prior of windows) {
      const overlaps = (prior.revokedAt === null || issuedAt < prior.revokedAt) &&
        (revokedAt === null || prior.issuedAt < revokedAt);
      if (overlaps) throw new Error('Overlapping QR bindings for document version');
    }
    windows.push({ issuedAt, revokedAt });
    versionWindows.set(versionKey, windows);
    if (timingSafeEqual(Buffer.from(hash, 'hex'), requested)) {
      matched = binding.status === 'active' ? { status: 'bound', documentId, versionId } : null;
    }
  }
  return Object.freeze(matched ?? { status: 'unknown' });
}

/**
 * INTERNAL end-to-end decision from an authorized QR digest lookup and actual
 * finalized document bytes. Neither the token nor a caller-supplied hash is
 * evidence of document authenticity, execution, signature or notarization.
 *
 * The caller MUST authenticate tenant/entity/trust access before reading both
 * registries, fetch immutable version records and finalized bytes from trusted
 * durable storage, and enforce its own rate limits and public disclosure policy.
 * Do not return the internal QR binding's document/version identifiers publicly.
 *
 * @returns {{status:'valid'|'superseded'|'revoked'|'unknown'}} Metadata-free result
 */
export function verifyTrustDocumentQrBytes(qrRegistry, lookup, versionRegistry, content) {
  const binding = resolveTrustDocumentQrBinding(qrRegistry, lookup);
  // An unknown or revoked QR token must not reveal whether a document exists.
  if (binding.status !== 'bound') return Object.freeze({ status: 'unknown' });
  if (!versionRegistry || typeof versionRegistry !== 'object' || Array.isArray(versionRegistry) ||
      versionRegistry.tenantId !== qrRegistry.tenantId ||
      versionRegistry.entityId !== qrRegistry.entityId ||
      versionRegistry.trustId !== qrRegistry.trustId ||
      versionRegistry.documentId !== binding.documentId ||
      !Array.isArray(versionRegistry.versions) ||
      versionRegistry.versions.some(version => !version || version.trustId !== qrRegistry.trustId)) {
    throw new Error('QR document registry scope mismatch');
  }
  // A later version must not retroactively supersede an earlier version in
  // a historical QR lookup. A trusted store must supply an as-of snapshot;
  // rejecting future registrations is safer than inferring historical status.
  const asOfAt = timestamp(lookup.asOfAt, 'lookup.asOfAt');
  for (const version of versionRegistry.versions) {
    if (timestamp(version.registeredAt, 'version.registeredAt') > asOfAt) {
      throw new Error('QR document version registered after lookup as-of timestamp');
    }
  }
  const decision = verifyTrustDocumentBytes(versionRegistry, {
    versionId: binding.versionId,
    content,
  });
  // A QR locator cannot predate registration of the immutable document version
  // it claims to identify. Do not let a token created for an earlier draft be
  // retroactively attached to finalized bytes. Registry timestamps must come
  // from trusted, append-only storage; this pure check does not authenticate them.
  if (decision.status !== 'unknown') {
    const tokenBinding = qrRegistry.bindings.find(
      row => row.tokenHashSha256 === lookup.tokenHashSha256,
    );
    const documentVersion = versionRegistry.versions.find(
      row => row.versionId === binding.versionId,
    );
    if (tokenBinding.issuedAt < documentVersion.registeredAt) {
      throw new Error('QR binding issued before document version registration');
    }
  }
  return decision;
}
