/**
 * Pure, non-posting reserve classification for one authorized tenant/entity/trust.
 * Amounts are integer minor currency units. A reserve snapshot is NOT a bank
 * balance, credit facility, settlement, or authorization to spend funds.
 *
 * Caller MUST authenticate/authorize the requested tenant/entity/trust, independently
 * verify each evidenceRef against the underlying asset/source, and persist
 * entries with audit history. The caller MUST supply maxEvidenceAgeMs from
 * trusted server-side policy, never from an untrusted request. Supplied as-of
 * timestamps are not authenticated evidence or a guarantee that reserve
 * values are current. Distinct evidence
 * pointers prevent exact replay,
 * but do not prove independent assets or available bank cash.
 */
const KINDS = new Set(['cash', 'noncash_collateral']);
// These are structural source classifications, NOT independently verified
// evidence of bank balances, cash custody, or collateral ownership.
const CASH_SOURCES = new Set(['bank_balance', 'physical_cash']);
const NONCASH_SOURCES = new Set(['private_note', 'other_collateral']);

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} must be a nonempty unpadded string`);
  }
  // Match Security's storage identifier boundary before these values reach
  // a durable ledger. Invisible controls can alias or corrupt record keys.
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${field} must not contain control characters`);
  }
  return value;
}

function canonicalInstant(value, field) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${field} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function minorUnits(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a nonnegative safe integer`);
  }
  return value;
}

function safeAdd(left, right, field) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw new RangeError(`${field} exceeds safe integer range`);
  return sum;
}

/**
 * @param {{tenantId:string, entityId:string, trustId:string, currency:string, asOfAt:string, maxEvidenceAgeMs:number, entries:Array<{
 *   id:string, assetId:string, evidenceRef:string, observedAt:string, tenantId:string, entityId:string, trustId:string, currency:string,
 *   kind:'cash'|'noncash_collateral', sourceType:string, amountMinor:number,
 *   restrictedMinor?:number, pledgedMinor?:number
 * }>}} snapshot
 */
export function calculateReserveCapacity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Snapshot required');
  const tenantId = requiredString(snapshot.tenantId, 'tenantId');
  const entityId = requiredString(snapshot.entityId, 'entityId');
  const trustId = requiredString(snapshot.trustId, 'trustId');
  const currency = requiredString(snapshot.currency, 'currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('currency must be a three-letter uppercase code');
  const asOfAt = canonicalInstant(snapshot.asOfAt, 'asOfAt');
  const maxEvidenceAgeMs = snapshot.maxEvidenceAgeMs;
  if (!Number.isSafeInteger(maxEvidenceAgeMs) || maxEvidenceAgeMs < 0) {
    throw new RangeError('maxEvidenceAgeMs must be a nonnegative safe integer');
  }
  const asOfEpochMs = Date.parse(asOfAt);
  if (!Array.isArray(snapshot.entries)) throw new TypeError('entries must be an array');

  const totals = {
    cashTotalMinor: 0,
    cashRestrictedMinor: 0,
    cashPledgedMinor: 0,
    unencumberedCashMinor: 0,
    noncashCollateralMinor: 0,
  };
  const ids = new Set();
  // A different evidence record must not make the same identified underlying
  // asset count twice. The caller still must verify canonical asset identity.
  const assetIds = new Set();
  const evidenceRefs = new Set();
  let oldestEvidenceAt = null;
  for (const entry of snapshot.entries) {
    if (!entry || typeof entry !== 'object') throw new TypeError('Invalid reserve entry');
    const id = requiredString(entry.id, 'entry.id');
    if (ids.has(id)) throw new Error(`Duplicate reserve entry ID: ${id}`);
    ids.add(id);
    const assetId = requiredString(entry.assetId, 'entry.assetId');
    if (assetIds.has(assetId)) throw new Error('Duplicate reserve asset ID');
    assetIds.add(assetId);
    // Every classified asset needs its own provenance pointer. Reusing the
    // same source record under a different entry ID must not double-count it.
    // Authentication and verification of the referenced record are external.
    const evidenceRef = requiredString(entry.evidenceRef, 'entry.evidenceRef');
    if (evidenceRefs.has(evidenceRef)) {
      throw new Error('Duplicate reserve evidence reference');
    }
    evidenceRefs.add(evidenceRef);
    const observedAt = canonicalInstant(entry.observedAt, 'entry.observedAt');
    if (observedAt > asOfAt) {
      throw new Error('Reserve evidence observed after snapshot as-of timestamp');
    }
    if (asOfEpochMs - Date.parse(observedAt) > maxEvidenceAgeMs) {
      throw new Error('Reserve evidence exceeds configured maximum age');
    }
    if (oldestEvidenceAt === null || observedAt < oldestEvidenceAt) oldestEvidenceAt = observedAt;
    if (entry.tenantId !== tenantId || entry.entityId !== entityId || entry.trustId !== trustId || entry.currency !== currency) {
      throw new Error('Reserve entry scope or currency mismatch');
    }
    if (!KINDS.has(entry.kind)) throw new TypeError('Unsupported reserve kind');
    const sourceType = requiredString(entry.sourceType, 'entry.sourceType');
    if (entry.kind === 'cash' && !CASH_SOURCES.has(sourceType)) {
      throw new TypeError('Cash reserve entry requires a cash source classification');
    }
    if (entry.kind === 'noncash_collateral' && !NONCASH_SOURCES.has(sourceType)) {
      throw new TypeError('Noncash collateral requires a noncash source classification');
    }
    const amount = minorUnits(entry.amountMinor, 'amountMinor');
    const restricted = minorUnits(entry.restrictedMinor ?? 0, 'restrictedMinor');
    const pledged = minorUnits(entry.pledgedMinor ?? 0, 'pledgedMinor');
    if (entry.kind === 'noncash_collateral') {
      if (restricted !== 0 || pledged !== 0) {
        throw new Error('Noncash collateral cannot be classified as restricted/pledged cash');
      }
      totals.noncashCollateralMinor = safeAdd(totals.noncashCollateralMinor, amount, 'noncashCollateralMinor');
      continue;
    }
    const encumbered = safeAdd(restricted, pledged, 'encumberedMinor');
    if (encumbered > amount) throw new RangeError('Restricted plus pledged cash exceeds entry amount');
    totals.cashTotalMinor = safeAdd(totals.cashTotalMinor, amount, 'cashTotalMinor');
    totals.cashRestrictedMinor = safeAdd(totals.cashRestrictedMinor, restricted, 'cashRestrictedMinor');
    totals.cashPledgedMinor = safeAdd(totals.cashPledgedMinor, pledged, 'cashPledgedMinor');
    totals.unencumberedCashMinor = safeAdd(totals.unencumberedCashMinor, amount - encumbered, 'unencumberedCashMinor');
  }
  return Object.freeze({ tenantId, entityId, trustId, currency, asOfAt, maxEvidenceAgeMs, oldestEvidenceAt, ...totals });
}
