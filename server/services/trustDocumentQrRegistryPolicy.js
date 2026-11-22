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
  if (typeof value !== 'string' || !value || value.length > 256 || value.trim() !== value ||
      /[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFDD0-\uFDEF\uFFFE\uFFFF]/u.test(value) ||
      /[\u{1FFFE}\u{1FFFF}\u{2FFFE}\u{2FFFF}\u{3FFFE}\u{3FFFF}\u{4FFFE}\u{4FFFF}\u{5FFFE}\u{5FFFF}\u{6FFFE}\u{6FFFF}\u{7FFFE}\u{7FFFF}\u{8FFFE}\u{8FFFF}\u{9FFFE}\u{9FFFF}\u{AFFFE}\u{AFFFF}\u{BFFFE}\u{BFFFF}\u{CFFFE}\u{CFFFF}\u{DFFFE}\u{DFFFF}\u{EFFFE}\u{EFFFF}\u{FFFFE}\u{FFFFF}\u{10FFFE}\u{10FFFF}]/u.test(value)) {
    throw new TypeError(field + ' must be a nonempty unpadded identifier without control characters');
  }
  // Reject malformed UTF-16 before a lossy UTF-8 encoding can collapse
  // distinct registry, document, and revocation-evidence identities.
  // The Unicode-aware regex preserves valid supplementary-plane characters.
  if (/[\uD800-\uDFFF]/u.test(value)) {
    throw new TypeError(field + ' must contain well-formed Unicode');
  }
  // Canonically equivalent IDs must not create distinct token windows or
  // revocation-evidence subjects. Reject aliases; never rewrite stored IDs.
  if (value.normalize('NFC') !== value) {
    throw new TypeError(field + ' must use NFC-normalized Unicode');
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
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(label + ' must be a plain data record');
  }
  // Read the prototype only once: a hostile Proxy may change its reported
  // prototype between inspections, bypassing plain-record admission.
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
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
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}

// Bound untrusted in-memory QR registry snapshots before enumerating indexed
// descriptors or comparing token digests. Larger authenticated registries need
// server-side checkpointing/pagination, not silent truncation.
const MAX_QR_BINDINGS = 10000;

function plainQrBindings(bindings) {
  if (!Array.isArray(bindings) || Object.getPrototypeOf(bindings) !== Array.prototype) {
    throw new TypeError('QR bindings must be a plain array');
  }
  // Array length is an own non-accessor data property. Do not read any
  // binding or indexed descriptor until the bounded size has been checked.
  const length = Object.getOwnPropertyDescriptor(bindings, 'length').value;
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_QR_BINDINGS) {
    throw new RangeError('QR binding list exceeds maximum entry count');
  }
  const descriptors = Object.getOwnPropertyDescriptors(bindings);
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
  return Array.from({ length }, (_, index) => descriptors[String(index)].value);
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
  const registrySnapshot = plainQrRecord(registry, 'QR registry', [...QR_SCOPE_FIELDS, 'bindings']);
  const tenantId = id(registrySnapshot.tenantId, 'registry.tenantId');
  const entityId = id(registrySnapshot.entityId, 'registry.entityId');
  const trustId = id(registrySnapshot.trustId, 'registry.trustId');
  const lookupSnapshot = plainQrRecord(lookup, 'QR lookup',
    [...QR_SCOPE_FIELDS, 'tokenHashSha256', 'asOfAt']);
  if (id(lookupSnapshot.tenantId, 'lookup.tenantId') !== tenantId ||
      id(lookupSnapshot.entityId, 'lookup.entityId') !== entityId ||
      id(lookupSnapshot.trustId, 'lookup.trustId') !== trustId) {
    throw new Error('QR lookup tenant/entity scope mismatch');
  }
  // Validate the entire lookup before touching any untrusted binding rows.
  // A malformed timestamp or digest must not cause registry traversal.
  // The caller MUST supply this instant from its trusted server clock and load
  // an as-of registry snapshot. A client-provided timestamp is not authority.
  const asOfAt = timestamp(lookupSnapshot.asOfAt, 'lookup.asOfAt');
  const requested = Buffer.from(digest(lookupSnapshot.tokenHashSha256, 'lookup.tokenHashSha256'), 'hex');
  const bindingSnapshots = plainQrBindings(registrySnapshot.bindings);
  const seenHashes = new Set();
  const seenRevocationEvidence = new Set();
  // Keep document and version identities separate from independent revocation
  // receipts, including identities introduced by later registry rows.
  const documentIds = new Set();
  const versionIds = new Set();
  const activeVersions = new Set();
  // Each document version has a single non-overlapping QR-token validity
  // window. Revocation and replacement at the same instant are permitted.
  // These windows come from the caller's trusted, immutable registry.
  const versionWindows = new Map();
  let matched = null;
  for (const originalBinding of bindingSnapshots) {
    const binding = plainQrRecord(originalBinding, 'QR binding', QR_BINDING_FIELDS, QR_BINDING_REQUIRED);
    if (binding.tenantId !== tenantId || binding.entityId !== entityId ||
        binding.trustId !== trustId) {
      throw new Error('QR binding tenant/entity scope mismatch');
    }
    const documentId = id(binding.documentId, 'binding.documentId');
    const versionId = id(binding.versionId, 'binding.versionId');
    documentIds.add(documentId);
    versionIds.add(versionId);
    const hash = digest(binding.tokenHashSha256, 'binding.tokenHashSha256');
    if (seenHashes.has(hash)) throw new Error('Duplicate QR token hash');
    seenHashes.add(hash);
    const issuedAt = timestamp(binding.issuedAt, 'binding.issuedAt');
    if (issuedAt > asOfAt) {
      throw new Error('QR binding issued after lookup as-of timestamp');
    }
    let revokedAt = null;
    if (binding.status === 'active') {
      // Even explicit null/undefined revocation fields are ambiguous evidence:
      // active token records must omit revocation metadata entirely.
      if (Object.hasOwn(binding, 'revokedAt') ||
          Object.hasOwn(binding, 'revocationEvidenceRef')) {
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
  // Ownership, document, version and token-digest identifiers have distinct
  // roles. Check all rows together so a later document/version cannot reuse an
  // earlier role's identity, even when the queried token is unknown. This is
  // structural registry integrity, not authenticated tenant authorization.
  const identityScope = new Set([tenantId, entityId, trustId]);
  if (identityScope.size !== 3) {
    throw new Error('QR tenant, entity and trust identifiers must be distinct');
  }
  for (const documentId of documentIds) {
    if (identityScope.has(documentId) || versionIds.has(documentId) || seenHashes.has(documentId)) {
      throw new Error('QR document identifier collides with registry identity');
    }
  }
  for (const versionId of versionIds) {
    if (identityScope.has(versionId) || seenHashes.has(versionId)) {
      throw new Error('QR version identifier collides with registry identity');
    }
  }
  for (const tokenHash of seenHashes) {
    if (identityScope.has(tokenHash)) {
      throw new Error('QR token digest collides with registry scope');
    }
  }
  // Revocation evidence is an independent receipt, never a tenant/entity/trust
  // identity, document/version ID, or QR token digest. Check after all rows
  // so registry order cannot hide a later cross-role identity collision.
  const scopeIds = new Set([tenantId, entityId, trustId]);
  for (const receipt of seenRevocationEvidence) {
    if (scopeIds.has(receipt) || documentIds.has(receipt) ||
        versionIds.has(receipt) || seenHashes.has(receipt)) {
      throw new Error('QR revocation evidence identifier collides with registry identity');
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
  const qrHeader = plainQrRecord(qrRegistry, 'QR registry', [...QR_SCOPE_FIELDS, 'bindings']);
  // Reject a mismatched lookup before inspecting potentially hostile binding rows.
  // The resolver performs the same check, but only after this wrapper snapshots rows.
  const earlyLookup = plainQrRecord(lookup, 'QR lookup',
    [...QR_SCOPE_FIELDS, 'tokenHashSha256', 'asOfAt']);
  if (QR_SCOPE_FIELDS.some(field =>
    id(earlyLookup[field], 'lookup.' + field) !== id(qrHeader[field], 'registry.' + field))) {
    throw new Error('QR lookup tenant/entity scope mismatch');
  }
  const qrRows = plainQrBindings(qrHeader.bindings).map(row =>
    plainQrRecord(row, 'QR binding', QR_BINDING_FIELDS, QR_BINDING_REQUIRED));
  const qrSnapshot = { ...qrHeader, bindings: qrRows };
  const lookupSnapshot = plainQrRecord(lookup, 'QR lookup',
    [...QR_SCOPE_FIELDS, 'tokenHashSha256', 'asOfAt']);
  const binding = resolveTrustDocumentQrBinding(qrSnapshot, lookupSnapshot);
  if (binding.status !== 'bound') return Object.freeze({ status: 'unknown' });
  const registrySnapshot = plainQrRecord(versionRegistry, 'QR document registry',
    [...QR_SCOPE_FIELDS, 'documentId', 'versions']);
  // Snapshot the array and each record exactly once before structural admission.
  // Preserve descriptors while validating: copying only values would silently
  // erase accessors, hidden properties, and symbols that must be rejected.
  const originalVersions = registrySnapshot.versions;
  if (!Array.isArray(originalVersions) ||
      Object.getPrototypeOf(originalVersions) !== Array.prototype) {
    throw new TypeError('Document versions must be a plain array');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(originalVersions, 'length');
  if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 || lengthDescriptor.value > 10000) {
    throw new RangeError('Document versions exceed the 10000-record review limit');
  }
  const versionDescriptors = Object.getOwnPropertyDescriptors(originalVersions);
  const versionSnapshotDescriptors = { ...versionDescriptors };
  const versions = [];
  for (let index = 0; index < lengthDescriptor.value; index++) {
    const entry = versionDescriptors[String(index)];
    if (!entry) {
      throw new TypeError('Document versions must not contain holes');
    }
    if (!Object.hasOwn(entry, 'value')) {
      throw new TypeError('Document versions must contain enumerable data elements');
    }
    const originalRecord = entry.value;
    if (!originalRecord || typeof originalRecord !== 'object' ||
        Array.isArray(originalRecord)) {
      throw new TypeError('Document version must be a plain record');
    }
    const prototype = Object.getPrototypeOf(originalRecord);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Document version must be a plain record');
    }
    const record = Object.defineProperties(Object.create(prototype),
      Object.getOwnPropertyDescriptors(originalRecord));
    versions.push(record);
    versionSnapshotDescriptors[String(index)] = { ...entry, value: record };
  }
  // Construct once: a legitimate frozen history may contain non-configurable
  // indices, which cannot be redefined after the first descriptor copy.
  const versionSnapshot = Object.defineProperties([], versionSnapshotDescriptors);
  assertPlainTrustDocumentVersions(versionSnapshot);
  const safeRegistry = { ...registrySnapshot, versions };
  if (safeRegistry.tenantId !== qrSnapshot.tenantId ||
      safeRegistry.entityId !== qrSnapshot.entityId ||
      safeRegistry.trustId !== qrSnapshot.trustId ||
      safeRegistry.documentId !== binding.documentId ||
      versions.some(version => version.trustId !== qrSnapshot.trustId)) {
    throw new Error('QR document registry scope mismatch');
  }
  const asOfAt = timestamp(lookupSnapshot.asOfAt, 'lookup.asOfAt');
  for (const version of versions) {
    const registeredAt = timestamp(version.registeredAt, 'version.registeredAt');
    if (registeredAt > asOfAt) {
      throw new Error('QR document version registered after lookup as-of timestamp');
    }
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
  const decision = verifyTrustDocumentBytes(safeRegistry, {
    versionId: binding.versionId,
    content,
  });
  // A QR locator cannot predate registration of the immutable document version
  // it claims to identify. Do not let a token created for an earlier draft be
  // retroactively attached to finalized bytes. Registry timestamps must come
  // from trusted, append-only storage; this pure check does not authenticate them.
  if (decision.status !== 'unknown') {
    const tokenBinding = qrRows.find(row => row.tokenHashSha256 === lookupSnapshot.tokenHashSha256);
    const documentVersion = versions.find(row => row.versionId === binding.versionId);
    if (tokenBinding.issuedAt < documentVersion.registeredAt) {
      throw new Error('QR binding issued before document version registration');
    }
  }
  return decision;
}
