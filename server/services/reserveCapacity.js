/**
 * Pure, non-posting reserve classification for one authorized tenant/entity.
 * Amounts are integer minor currency units. A reserve snapshot is NOT a bank
 * balance, credit facility, settlement, or authorization to spend funds.
 *
 * Caller MUST authenticate/authorize the requested tenant/entity, independently
 * verify each evidenceRef against the underlying asset/source, and persist
 * entries with audit history. Distinct evidence pointers prevent exact replay,
 * but do not prove independent assets or available bank cash.
 */
const KINDS = new Set(['cash', 'noncash_collateral']);

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
 * @param {{tenantId:string, entityId:string, currency:string, entries:Array<{
 *   id:string, assetId:string, evidenceRef:string, tenantId:string, entityId:string, currency:string,
 *   kind:'cash'|'noncash_collateral', amountMinor:number,
 *   restrictedMinor?:number, pledgedMinor?:number
 * }>}} snapshot
 */
export function calculateReserveCapacity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Snapshot required');
  const tenantId = requiredString(snapshot.tenantId, 'tenantId');
  const entityId = requiredString(snapshot.entityId, 'entityId');
  const currency = requiredString(snapshot.currency, 'currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('currency must be a three-letter uppercase code');
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
    if (entry.tenantId !== tenantId || entry.entityId !== entityId || entry.currency !== currency) {
      throw new Error('Reserve entry scope or currency mismatch');
    }
    if (!KINDS.has(entry.kind)) throw new TypeError('Unsupported reserve kind');
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
  return Object.freeze({ tenantId, entityId, currency, ...totals });
}
