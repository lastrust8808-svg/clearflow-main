import { timingSafeEqual } from 'node:crypto';
import { assertPlainTrustDocumentVersions, verifyTrustDocumentBytes } from './trustDocumentVersionPolicy.js';

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

// QR binding decisions must never consume inherited, accessor-backed, hidden or
// unreviewed identity/status claims. This is structural admission only; the
// caller remains responsible for authenticating immutable registry evidence.
function plainQrRecord(record, label, allowed, required = allowed) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      (Object.getPrototypeOf(record) !== Object.prototype &&
       Object.getPrototypeOf(record) !== null)) {
    throw new TypeError(label + ' must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(record);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(label + ' fields must be enumerable data properties');
    }
    if (typeof key !== 'string' || !allowed.includes(key)) {
      throw new TypeError('Unsupported ' + label + ' field');
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new TypeError('Missing own ' + label + ' field: ' + key);
    }
  }
}

function plainQrBindings(bindings) {
  if (!Array.isArray(bindings) || Object.getPrototypeOf(bindings) !== Array.prototype) {
    throw new TypeError('QR bindings must be a plain array');
  }
  const descriptors = Object.getOwnPropertyDescriptors(bindings);
  const length = descriptors.length.value;
  let count = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' ? Number(key) : NaN;
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new TypeError('QR bindings must contain only array indices');
    }
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError('QR bindings must contain enumerable data elements');
    }
    count++;
  }
  if (count !== length) throw new TypeError('QR bindings must not contain holes');
}

const QR_SCOPE_FIELDS = ['tenantId', 'entityId', 'trustId'];
const QR_BINDING_FIELDS = [
  ...QR_SCOPE_FIELDS, 'documentId', 'versionId', 'tokenHashSha256',
  'status', 'issuedAt', 'revokedAt', 'revocationEvidenceRef',
];
const QR_BINDING_REQUIRED = QR_BINDING_FIELDS.slice(0, 8);

/**
 * @param {{tenantId:string,entityId:string,bindings:Array<{
 *   tenantId:string,entityId:string,trustId:string,documentId:string,versionId:string,
 *   tokenHashSha256:string,status:'active'|'revoked',issuedAt:string,
 *   revokedAt?:string,revocationEvidenceRef?:string}>}} registry
 * @param {{tenantId:string,entityId:string,trustId:string,tokenHashSha256:string,asOfAt:string}} lookup
 * @returns {{status:'bound',documentId:string,versionId:string}|{status:'unknown'}}
 */
export function resolveTrustDocumentQrBinding(registry, lookup) {
  plainQrRecord(registry, 'QR registry', [...QR_SCOPE_FIELDS, 'bindings']);
  plainQrBindings(registry.bindings);
  const tenantId = id(registry.tenantId, 'registry.tenantId');
  const entityId = id(registry.entityId, 'registry.entityId');
  const trustId = id(registry.trustId, 'registry.trustId');
  plainQrRecord(lookup, 'QR lookup',
    [...QR_SCOPE_FIELDS, 'tokenHashSha256', 'asOfAt']);
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
  const seenRevocationEvidence = new Set();
  const activeVersions = new Set();
  // Each document version has a single non-overlapping QR-token validity
  // window. Revocation and replacement at the same instant are permitted.
  // These windows come from the caller's trusted, immutable registry.
  const versionWindows = new Map();
  let matched = null;
  for (const binding of registry.bindings) {
    plainQrRecord(binding, 'QR binding', QR_BINDING_FIELDS, QR_BINDING_REQUIRED);
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
      const revocationEvidenceRef = id(binding.revocationEvidenceRef, 'binding.revocationEvidenceRef');
      // One revocation receipt must not be replayed as proof that a second
      // token was independently revoked, even across document versions.
      // The caller still must authenticate the underlying receipt.
      if (seenRevocationEvidence.has(revocationEvidenceRef)) {
        throw new Error('Duplicate QR revocation evidence reference');
      }
      seenRevocationEvidence.add(revocationEvidenceRef);
      if (revokedAt <= issuedAt) throw new Error('QR revocation must follow issuance');
      if (revokedAt > asOfAt) {
        throw new Error('QR revocation occurs after lookup as-of timestamp');
      }
    } else {
      throw new TypeError('Invalid QR binding status');
    }
    const versionKey = JSON.stringify([documentId, versionId]);
    // Accumulate windows first: registry rows are not guaranteed to be in
    // issuance order. Checking each against all earlier rows is quadratic
    // for long-lived documents with many token rotations.
    const windows = versionWindows.get(versionKey) ?? [];
    windows.push({ issuedAt, revokedAt });
    versionWindows.set(versionKey, windows);
    if (timingSafeEqual(Buffer.from(hash, 'hex'), requested)) {
      matched = binding.status === 'active' ? { status: 'bound', documentId, versionId } : null;
    }
  }
  // Once sorted by issuance, any overlap must occur between adjacent
  // intervals. A revoked token's end is exclusive: a replacement may be
  // issued at the exact revocation instant, but never before it. An active
  // token has no end and therefore cannot precede another binding.
  // This keeps validation O(n log n) rather than O(n^2) per version.
  for (const windows of versionWindows.values()) {
    windows.sort((left, right) => left.issuedAt.localeCompare(right.issuedAt));
    for (let i = 1; i < windows.length; i++) {
      if (windows[i - 1].revokedAt === null ||
          windows[i].issuedAt < windows[i - 1].revokedAt) {
        throw new Error('Overlapping QR bindings for document version');
      }
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
  // Preflight the registry and the *entire* historical version list before
  // reading scope, status or chronology. Earlier scope checks and Array#some
  // could execute an untrusted getter before the core byte verifier ran.
  // Structural admission is not authentication of registry provenance.
  plainQrRecord(versionRegistry, 'QR document registry',
    [...QR_SCOPE_FIELDS, 'documentId', 'versions']);
  assertPlainTrustDocumentVersions(versionRegistry.versions);
  if (versionRegistry.tenantId !== qrRegistry.tenantId ||
      versionRegistry.entityId !== qrRegistry.entityId ||
      versionRegistry.trustId !== qrRegistry.trustId ||
      versionRegistry.documentId !== binding.documentId ||
      versionRegistry.versions.some(version => version.trustId !== qrRegistry.trustId)) {
    throw new Error('QR document registry scope mismatch');
  }
  // A later version must not retroactively supersede an earlier version in
  // a historical QR lookup. A trusted store must supply an as-of snapshot;
  // rejecting future registrations is safer than inferring historical status.
  const asOfAt = timestamp(lookup.asOfAt, 'lookup.asOfAt');
  for (const version of versionRegistry.versions) {
    const registeredAt = timestamp(version.registeredAt, 'version.registeredAt');
    if (registeredAt > asOfAt) {
      throw new Error('QR document version registered after lookup as-of timestamp');
    }
    // A future revocation must not rewrite a historical QR verification.
    // Revocation timestamps and status must come from an authenticated
    // append-only as-of registry; this structural check cannot prove either.
    if (version.status === 'revoked') {
      const revokedAt = timestamp(version.revokedAt, 'version.revokedAt');
      if (revokedAt <= registeredAt) {
        throw new Error('QR document revocation must follow registration');
      }
      if (revokedAt > asOfAt) {
        throw new Error('QR document revocation occurs after lookup as-of timestamp');
      }
    } else if (version.revokedAt != null) {
      throw new Error('Nonrevoked QR document version cannot carry revocation timestamp');
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
