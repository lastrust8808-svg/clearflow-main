import { timingSafeEqual } from 'node:crypto';

/**
 * Pure, INTERNAL binding resolver for QR token SHA-256 digests.
 *
 * The caller MUST authenticate and authorize the tenant/entity before reading
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
 *   tenantId:string,entityId:string,documentId:string,versionId:string,
 *   tokenHashSha256:string,status:'active'|'revoked',issuedAt:string,
 *   revokedAt?:string,revocationEvidenceRef?:string}>}} registry
 * @param {{tenantId:string,entityId:string,tokenHashSha256:string}} lookup
 * @returns {{status:'bound',documentId:string,versionId:string}|{status:'unknown'}}
 */
export function resolveTrustDocumentQrBinding(registry, lookup) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) ||
      !Array.isArray(registry.bindings)) {
    throw new TypeError('Tenant-scoped QR registry required');
  }
  const tenantId = id(registry.tenantId, 'registry.tenantId');
  const entityId = id(registry.entityId, 'registry.entityId');
  if (!lookup || typeof lookup !== 'object' || Array.isArray(lookup)) {
    throw new TypeError('QR lookup required');
  }
  if (id(lookup.tenantId, 'lookup.tenantId') !== tenantId ||
      id(lookup.entityId, 'lookup.entityId') !== entityId) {
    throw new Error('QR lookup tenant/entity scope mismatch');
  }
  const requested = Buffer.from(digest(lookup.tokenHashSha256, 'lookup.tokenHashSha256'), 'hex');
  const seenHashes = new Set();
  const activeVersions = new Set();
  let matched = null;
  for (const binding of registry.bindings) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
      throw new TypeError('Invalid QR binding');
    }
    if (binding.tenantId !== tenantId || binding.entityId !== entityId) {
      throw new Error('QR binding tenant/entity scope mismatch');
    }
    const documentId = id(binding.documentId, 'binding.documentId');
    const versionId = id(binding.versionId, 'binding.versionId');
    const hash = digest(binding.tokenHashSha256, 'binding.tokenHashSha256');
    if (seenHashes.has(hash)) throw new Error('Duplicate QR token hash');
    seenHashes.add(hash);
    const issuedAt = timestamp(binding.issuedAt, 'binding.issuedAt');
    if (binding.status === 'active') {
      if (binding.revokedAt != null || binding.revocationEvidenceRef != null) {
        throw new Error('Active QR binding cannot contain revocation evidence');
      }
      const versionKey = JSON.stringify([documentId, versionId]);
      if (activeVersions.has(versionKey)) throw new Error('Duplicate active QR document version');
      activeVersions.add(versionKey);
    } else if (binding.status === 'revoked') {
      const revokedAt = timestamp(binding.revokedAt, 'binding.revokedAt');
      id(binding.revocationEvidenceRef, 'binding.revocationEvidenceRef');
      if (revokedAt <= issuedAt) throw new Error('QR revocation must follow issuance');
    } else {
      throw new TypeError('Invalid QR binding status');
    }
    if (timingSafeEqual(Buffer.from(hash, 'hex'), requested)) {
      matched = binding.status === 'active' ? { status: 'bound', documentId, versionId } : null;
    }
  }
  return Object.freeze(matched ?? { status: 'unknown' });
}
