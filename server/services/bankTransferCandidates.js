/**
 * Read-only transfer candidates. Never posts, reconciles, or confirms a transfer.
 * A trusted server must authorize the tenant and account set before calling.
 * Only a shared reference within the SAME provider connection supports a
 * candidate. Provider references are not globally unique; amount/date alone
 * cannot establish that two unrelated transactions are an internal transfer.
 */
import { types as nodeTypes } from 'node:util';

const MAX_TRANSACTIONS = 1000;
const MAX_DAY_GAP = 3;
const FIELDS = new Set([
  'tenantId', 'provider', 'connectionId', 'accountId', 'transactionId', 'amountCents', 'currency',
  'postedDate', 'status', 'providerReference',
]);
const REQUIRED = ['tenantId', 'provider', 'connectionId', 'accountId', 'transactionId', 'amountCents',
  'currency', 'postedDate', 'status'];

// Unicode noncharacters are not valid external banking identifiers; reject them
// rather than allowing visually opaque provider/account identity collisions.
function containsNoncharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if ((code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe) return true;
  }
  return false;
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 256 && value === value.trim() && value === value.normalize('NFC') && value.isWellFormed() &&
    !containsNoncharacter(value) &&
    // Reject invisible or lookalike Unicode spacing in provider identity keys.
    // Ordinary ASCII spaces remain allowed within human-readable references.
    !/[\u0000-\u001f\u007f-\u009f\p{Cf}\p{Zs}\u2028\u2029]/u.test(value.replaceAll(' ', ''));
}

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const epoch = Date.UTC(year, month - 1, day);
  const date = new Date(epoch);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;
  return epoch / 86400000;
}

function snapshotTransaction(value, tenantId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      nodeTypes.isProxy(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null)) {
    throw new Error('Invalid transfer source record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const row = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    const d = descriptors[key];
    if (typeof key !== 'string' || !FIELDS.has(key) ||
        !d.enumerable || !Object.hasOwn(d, 'value')) {
      throw new Error('Invalid transfer source record.');
    }
    row[key] = d.value;
  }
  if (REQUIRED.some((key) => !Object.hasOwn(row, key)) ||
      row.tenantId !== tenantId || !['plaid', 'mercury'].includes(row.provider) ||
      !validId(row.connectionId) || !validId(row.accountId) ||
      !validId(row.transactionId) ||
      !Number.isSafeInteger(row.amountCents) || row.amountCents === 0 ||
      Object.is(row.amountCents, -0) ||
      typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) ||
      !['posted', 'pending', 'removed', 'superseded'].includes(row.status) ||
      (row.providerReference !== undefined && !validId(row.providerReference))) {
    throw new Error('Invalid or unauthorized transfer source record.');
  }
  const day = calendarDay(row.postedDate);
  if (day === null) throw new Error('Invalid transfer posting date.');
  return { ...row, day };
}

function identity(row) {
  return JSON.stringify([row.provider, row.connectionId, row.accountId, row.transactionId]);
}

/**
 * Returns unique, review-only candidate pairs and ambiguous source IDs.
 * Neither returned array is a posting instruction or a controller approval.
 */
export function proposeBankTransferCandidates(scope) {
  // Never invoke an accessor while obtaining the trusted caller's review scope.
  // Authorization must be established by the server, not by executable input.
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
      nodeTypes.isProxy(scope) ||
      (Object.getPrototypeOf(scope) !== Object.prototype &&
       Object.getPrototypeOf(scope) !== null)) {
    throw new Error('Invalid authorized transfer scope or batch.');
  }
  const scopeDescriptors = Object.getOwnPropertyDescriptors(scope);
  if (Reflect.ownKeys(scopeDescriptors).length !== 2 ||
      !['tenantId', 'transactions'].every((key) =>
        Object.hasOwn(scopeDescriptors, key) &&
        scopeDescriptors[key].enumerable &&
        Object.hasOwn(scopeDescriptors[key], 'value'))) {
    throw new Error('Invalid authorized transfer scope or batch.');
  }
  const { tenantId, transactions } = scope;
  if (!validId(tenantId) || !Array.isArray(transactions) ||
      nodeTypes.isProxy(transactions) ||
      Object.getPrototypeOf(transactions) !== Array.prototype ||
      transactions.length > MAX_TRANSACTIONS) {
    throw new Error('Invalid authorized transfer scope or batch.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(transactions);
  if (Reflect.ownKeys(descriptors).length !== transactions.length + 1) {
    throw new Error('Malformed transfer transaction batch.');
  }
  const rows = [];
  // Pending rows cannot be matched, but a pending row sharing a provider
  // reference can prove that the reference is not a unique transfer ID.
  // Count posted + pending evidence before proposing any posted pair.
  const referenceCounts = new Map();
  const pendingReferences = new Set();
  const seen = new Set();
  // Provider transaction IDs identify one source transaction within a
  // connection, even when a malformed feed attributes it to two accounts.
  // Never propose a transfer between two copies of the same provider event.
  const seenProviderTransactions = new Set();
  for (let index = 0; index < transactions.length; index++) {
    const d = descriptors[String(index)];
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) {
      throw new Error('Malformed transfer transaction batch.');
    }
    const row = snapshotTransaction(d.value, tenantId);
    const key = identity(row);
    if (seen.has(key)) throw new Error('Duplicate transfer source identity.');
    const providerTransactionKey = JSON.stringify([row.provider, row.connectionId, row.transactionId]);
    if (seenProviderTransactions.has(providerTransactionKey)) {
      throw new Error('Duplicate provider transaction identity across accounts.');
    }
    seen.add(key);
    seenProviderTransactions.add(providerTransactionKey);
    if ((row.status === 'posted' || row.status === 'pending') &&
        row.providerReference !== undefined) {
      const referenceKey = JSON.stringify([row.provider, row.connectionId, row.providerReference]);
      referenceCounts.set(referenceKey, (referenceCounts.get(referenceKey) ?? 0) + 1);
      if (row.status === 'pending') pendingReferences.add(referenceKey);
      if (row.status === 'posted') rows.push(row);
    }
  }
  // A provider reference may be a batch or statement identifier, not a
  // unique transfer ID. Three or more posted/pending records with the same
  // connection-scoped reference make every posted source ambiguous. Removed
  // and superseded records do not count as current transfer evidence.
  const hasReferenceCollision = (row) =>
    referenceCounts.get(JSON.stringify([row.provider, row.connectionId, row.providerReference])) > 2 ||
    pendingReferences.has(JSON.stringify([row.provider, row.connectionId, row.providerReference]));

  const adjacency = new Map(rows.map((row) => [identity(row), []]));
  const byId = new Map(rows.map((row) => [identity(row), row]));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.provider !== b.provider || a.connectionId !== b.connectionId ||
          a.accountId === b.accountId || a.currency !== b.currency ||
          a.providerReference !== b.providerReference ||
          a.amountCents !== -b.amountCents ||
          Math.abs(a.day - b.day) > MAX_DAY_GAP) continue;
      adjacency.get(identity(a)).push(identity(b));
      adjacency.get(identity(b)).push(identity(a));
    }
  }
  const ambiguous = [];
  const candidates = [];
  // Stable provider/connection/account/transaction ordering makes repeated
  // read-only reviews reproducible when bank feeds arrive in a new row order.
  // Never let provider arrival order become an implicit approval or audit key.
  for (const id of [...adjacency.keys()].sort()) {
    const matches = adjacency.get(id);
    const row = byId.get(id);
    // A source with one apparent match is still ambiguous when its partner
    // has multiple possible matches. Surface every affected source for review.
    if (hasReferenceCollision(row) || matches.length > 1 ||
        (matches.length === 1 && adjacency.get(matches[0]).length !== 1)) {
      ambiguous.push({ provider: row.provider, connectionId: row.connectionId,
        accountId: row.accountId, transactionId: row.transactionId,
        candidateCount: matches.length });
    }
    if (hasReferenceCollision(row) || matches.length !== 1) continue;
    const partnerId = matches[0];
    if (adjacency.get(partnerId).length !== 1 || id >= partnerId) continue;
    const partner = byId.get(partnerId);
    candidates.push({
      provider: row.provider, connectionId: row.connectionId,
      left: { accountId: row.accountId, transactionId: row.transactionId },
      right: { accountId: partner.accountId, transactionId: partner.transactionId },
      amountCents: Math.abs(row.amountCents), currency: row.currency,
      providerReference: row.providerReference,
      dayGap: Math.abs(row.day - partner.day),
      status: 'review_required',
    });
  }
  return { candidates, ambiguous };
}
