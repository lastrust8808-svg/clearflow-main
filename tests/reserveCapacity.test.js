import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const base = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', currency: 'USD' };
const asOfAt = '2026-10-30T06:00:00.000Z';
const entry = (id, amountMinor, options = {}) => ({ id, assetId: 'asset-' + id, evidenceRef: 'source-' + id, ...base, observedAt: '2026-10-30T05:00:00.000Z', kind: 'cash', sourceType: 'bank_balance', amountMinor, restrictedMinor: 0, pledgedMinor: 0, ...options });
const calculate = (entries, maxEvidenceAgeMs = 7 * 24 * 60 * 60 * 1000) =>
  calculateReserveCapacity({ ...base, asOfAt, maxEvidenceAgeMs, entries });

test('separates restricted and pledged cash from unencumbered cash', () => {
  const result = calculate([entry('one', 100_00, { restrictedMinor: 25_00, pledgedMinor: 30_00 })]);
  assert.equal(result.cashTotalMinor, 100_00);
  assert.equal(result.cashRestrictedMinor, 25_00);
  assert.equal(result.cashPledgedMinor, 30_00);
  assert.equal(result.unencumberedCashMinor, 45_00);
  assert.equal(result.noncashCollateralMinor, 0);
});

test('noncash collateral never increases unencumbered cash', () => {
  const result = calculate([entry('cash', 10_00), entry('note', 5_000_00, { kind: 'noncash_collateral', sourceType: 'private_note' })]);
  assert.equal(result.unencumberedCashMinor, 10_00);
  assert.equal(result.noncashCollateralMinor, 5_000_00);
});

test('rejects overpledged or negative and fractional balances', () => {
  assert.throws(() => calculate([entry('x', 100, { restrictedMinor: 70, pledgedMinor: 31 })]), /exceeds/);
  assert.throws(() => calculate([entry('x', -1)]), /safe integer/);
  assert.throws(() => calculate([entry('x', 1.5)]), /safe integer/);
});

test('explicitly unknown reserve encumbrances cannot be treated as zero', () => {
  for (const field of ['restrictedMinor', 'pledgedMinor']) {
    for (const unknown of [null, undefined]) {
      assert.throws(
        () => calculate([entry('cash-a', 100, { [field]: unknown })]),
        new RegExp(field + ' must be a nonnegative safe integer'),
      );
      // Noncash entries must not bypass the same integrity requirement.
      assert.throws(
        () => calculate([entry('note-a', 100, {
          kind: 'noncash_collateral', sourceType: 'private_note', [field]: unknown,
        })]),
        new RegExp(field + ' must be a nonnegative safe integer'),
      );
    }
  }
  // Only explicit numeric zeros count as reported zero encumbrances.
  assert.equal(calculate([entry('cash-a', 100)]).unencumberedCashMinor, 100);
  assert.equal(calculate([entry('cash-a', 100, {
    restrictedMinor: 0, pledgedMinor: 0,
  })]).unencumberedCashMinor, 100);
});

test('cash reserves require explicit zero or positive encumbrance declarations', () => {
  for (const missingField of ['restrictedMinor', 'pledgedMinor']) {
    const missing = entry('cash-a', 100);
    delete missing[missingField];
    assert.throws(() => calculate([missing]),
      /Cash reserve entries require explicit restrictedMinor and pledgedMinor/);
    // One missing encumbrance in a multi-asset snapshot invalidates the
    // entire classification, rather than overstating unencumbered cash.
    assert.throws(() => calculate([entry('cash-b', 200), missing]),
      /Cash reserve entries require explicit restrictedMinor and pledgedMinor/);
  }
  const bothMissing = entry('cash-a', 100);
  delete bothMissing.restrictedMinor;
  delete bothMissing.pledgedMinor;
  assert.throws(() => calculate([bothMissing]), /require explicit/);

  // Cash-specific fields are optional for noncash collateral, which must
  // never increase spendable cash even with no cash encumbrance fields.
  const noncash = entry('note-a', 500, {
    kind: 'noncash_collateral', sourceType: 'private_note',
  });
  delete noncash.restrictedMinor;
  delete noncash.pledgedMinor;
  const result = calculate([entry('cash-a', 100), noncash]);
  assert.equal(result.unencumberedCashMinor, 100);
  assert.equal(result.noncashCollateralMinor, 500);
});

test('negative-zero reserve amounts and encumbrances are not silently normalized', () => {
  // JSON serialization erases the sign of -0, so it cannot be accepted as
  // trustworthy exact-minor-unit evidence even though -0 is a safe integer.
  for (const field of ['amountMinor', 'restrictedMinor', 'pledgedMinor']) {
    assert.throws(
      () => calculate([entry('cash-a', 100, { [field]: -0 })]),
      new RegExp(field + ' must be a nonnegative safe integer'),
    );
    assert.throws(
      () => calculate([entry('note-a', 100, {
        kind: 'noncash_collateral', sourceType: 'private_note', [field]: -0,
      })]),
      new RegExp(field + ' must be a nonnegative safe integer'),
    );
  }
  assert.equal(calculate([entry('cash-a', 0, {
    restrictedMinor: 0, pledgedMinor: 0,
  })]).unencumberedCashMinor, 0);
});

test('rejects mixed tenant, entity, trust or currency rather than silently mixing books', () => {
  for (const change of [{ tenantId: 'tenant-b' }, { entityId: 'entity-b' }, { trustId: 'trust-b' }, { currency: 'EUR' }]) {
    assert.throws(() => calculate([entry('x', 100, change)]), /scope or currency mismatch/);
  }
});

test('trust scope is mandatory even when tenant and entity match', () => {
  assert.throws(() => calculateReserveCapacity({
    tenantId: base.tenantId, entityId: base.entityId, currency: 'USD',
    entries: [entry('cash-a', 100)],
  }), /trustId/);
  assert.throws(() => calculate([entry('cash-a', 100, { trustId: undefined })]), /scope or currency mismatch/);
  assert.throws(() => calculate([entry('cash-a', 100, { trustId: 'trust-b' })]), /scope or currency mismatch/);
  const result = calculate([entry('cash-a', 100)]);
  assert.equal(result.trustId, 'trust-a');
  assert.equal(result.unencumberedCashMinor, 100);
});

test('rejects duplicate entries and unsafe aggregate overflow', () => {
  assert.throws(() => calculate([entry('x', 10), entry('x', 10)]), /Duplicate/);
  assert.throws(() => calculate([entry('a', Number.MAX_SAFE_INTEGER), entry('b', 1)]), /safe integer range/);
});

test('rejects unsupported kinds and noncash cash allocations', () => {
  assert.throws(() => calculate([entry('x', 10, { kind: 'promissory_note_cash' })]), /Unsupported/);
  assert.throws(() => calculate([entry('x', 10, { kind: 'noncash_collateral', sourceType: 'private_note', pledgedMinor: 1 })]), /Noncash collateral/);
});

test('returns immutable snapshot without mutating entries', () => {
  const entries = [entry('x', 123)];
  const result = calculate(entries);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.unencumberedCashMinor, 123);
  assert.equal(result.asOfAt, asOfAt);
  assert.equal(result.oldestEvidenceAt, '2026-10-30T05:00:00.000Z');
  assert.equal(entries[0].amountMinor, 123);
  assert.deepEqual(calculate([]).unencumberedCashMinor, 0);
  assert.equal(calculate([]).oldestEvidenceAt, null);
});

test('rejects padded or control-character tenant, entity and trust identifiers', () => {
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    for (const bad of [' ' + base[key], base[key] + ' ', base[key] + '\u0000',
      base[key] + '\u001f', base[key] + '\u007f', base[key] + '\u009f']) {
      assert.throws(() => calculateReserveCapacity({ ...base, [key]: bad, asOfAt, maxEvidenceAgeMs: 3600000, entries: [] }),
        /unpadded|control characters/);
    }
  }
});

test('rejects padded or control-character reserve entry IDs before classification', () => {
  for (const bad of [' x', 'x ', 'x\n', 'x\u0000', 'x\u007f', 'x\u009f']) {
    assert.throws(() => calculate([entry(bad, 100)]), /unpadded|control characters/);
  }
  assert.equal(calculate([entry('valid-entry', 100)]).unencumberedCashMinor, 100);
});

test('every reserve entry requires a distinct nonempty provenance reference', () => {
  for (const missing of [undefined, null, '', ' ', ' padded ', 123]) {
    assert.throws(() => calculate([entry('cash-a', 100, { evidenceRef: missing })]),
      /entry\.evidenceRef/);
  }
  assert.equal(calculate([entry('cash-a', 100)]).unencumberedCashMinor, 100);
});

test('same evidence cannot be replayed under different reserve entry IDs or asset kinds', () => {
  const source = 'source-bank-statement-1';
  assert.throws(() => calculate([
    entry('cash-a', 100, { evidenceRef: source }),
    entry('cash-b', 100, { evidenceRef: source }),
  ]), /Duplicate reserve evidence reference/);
  assert.throws(() => calculate([
    entry('cash-a', 100, { evidenceRef: source }),
    entry('collateral-b', 500, { kind: 'noncash_collateral', sourceType: 'private_note', evidenceRef: source }),
  ]), /Duplicate reserve evidence reference/);
  // Distinct pointers allow classification, but their authenticity and
  // whether they refer to independent assets must be checked by the caller.
  assert.equal(calculate([
    entry('cash-a', 100, { evidenceRef: 'bank-statement-a' }),
    entry('cash-b', 200, { evidenceRef: 'bank-statement-b' }),
  ]).unencumberedCashMinor, 300);
});

test('rejects control bytes and padding in reserve provenance references', () => {
  for (const invalid of [' source', 'source ', 'source\u0000', 'source\u001f',
    'source\u007f', 'source\u009f']) {
    assert.throws(() => calculate([entry('cash-a', 100, { evidenceRef: invalid })]),
      /unpadded|control characters/);
  }
});

test('reserve classification requires a canonical underlying asset identity', () => {
  for (const invalid of [undefined, null, '', ' ', ' padded ', 'asset\u0000', 42]) {
    assert.throws(() => calculate([entry('cash-a', 100, { assetId: invalid })]),
      /entry\.assetId/);
  }
  assert.equal(calculate([entry('cash-a', 100)]).unencumberedCashMinor, 100);
});

test('distinct evidence records cannot double-count the same underlying asset', () => {
  assert.throws(() => calculate([
    entry('cash-a', 100, { assetId: 'same-asset', evidenceRef: 'statement-jan' }),
    entry('cash-b', 100, { assetId: 'same-asset', evidenceRef: 'statement-feb' }),
  ]), /Duplicate reserve asset ID/);
  assert.throws(() => calculate([
    entry('cash-a', 100, { assetId: 'same-asset' }),
    entry('collateral-b', 500, { assetId: 'same-asset', kind: 'noncash_collateral', sourceType: 'private_note' }),
  ]), /Duplicate reserve asset ID/);
  assert.equal(calculate([
    entry('cash-a', 100, { assetId: 'bank-account-a' }),
    entry('cash-b', 200, { assetId: 'bank-account-b' }),
  ]).unencumberedCashMinor, 300);
});


test('rejects unclassified reserve sources instead of treating private notes as cash', () => {
  for (const sourceType of [undefined, null, '', ' ', ' bank_balance ', 'private_note', 'other_collateral']) {
    assert.throws(() => calculate([entry('cash-a', 100, { sourceType })]),
      /sourceType|Cash reserve entry requires a cash source classification/);
  }
  assert.equal(calculate([entry('cash-a', 100, { sourceType: 'physical_cash' })]).cashTotalMinor, 100);
});

test('rejects bank-balance classification for noncash collateral', () => {
  for (const sourceType of [undefined, null, '', 'bank_balance', 'physical_cash']) {
    assert.throws(() => calculate([entry('note-a', 100, { kind: 'noncash_collateral', sourceType })]),
      /sourceType|Noncash collateral requires a noncash source classification/);
  }
  const result = calculate([entry('note-a', 100, { kind: 'noncash_collateral', sourceType: 'private_note' })]);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(result.noncashCollateralMinor, 100);
});

test('requires canonical UTC snapshot and source-observation timestamps', () => {
  for (const invalid of [undefined, null, '', '2026-10-30', '2026-10-30T06:00:00Z',
    '2026-10-30T06:00:00.000+00:00', '2026-02-30T06:00:00.000Z']) {
    assert.throws(() => calculateReserveCapacity({ ...base, asOfAt: invalid, maxEvidenceAgeMs: 3600000, entries: [] }), /asOfAt/);
    assert.throws(() => calculate([entry('cash-a', 100, { observedAt: invalid })]), /entry.observedAt/);
  }
});

test('rejects future source observations and exposes oldest evidence for freshness review', () => {
  assert.throws(() => calculate([entry('cash-a', 100, {
    observedAt: '2026-10-30T06:00:00.001Z',
  })]), /Reserve evidence observed after snapshot as-of timestamp/);
  const result = calculate([
    entry('cash-a', 100, { observedAt: asOfAt }),
    entry('cash-b', 200, { observedAt: '2026-10-28T00:00:00.000Z' }),
  ]);
  assert.equal(result.unencumberedCashMinor, 300);
  assert.equal(result.oldestEvidenceAt, '2026-10-28T00:00:00.000Z');
  assert.equal(result.asOfAt, asOfAt);
  assert.equal(Object.isFrozen(result), true);
});


test('requires an explicit nonnegative safe-integer reserve freshness limit', () => {
  for (const invalid of [undefined, null, '', '3600000', -1, 1.5,
    Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculateReserveCapacity({
      ...base, asOfAt, maxEvidenceAgeMs: invalid, entries: [],
    }), /maxEvidenceAgeMs/);
  }
  const result = calculate([], 0);
  assert.equal(result.maxEvidenceAgeMs, 0);
  assert.equal(Object.isFrozen(result), true);
});

test('rejects stale cash and noncash reserve evidence at the exact millisecond boundary', () => {
  // Evidence at 05:00 is exactly one hour old in the 06:00 snapshot.
  const boundary = calculate([entry('cash-a', 100)], 60 * 60 * 1000);
  assert.equal(boundary.unencumberedCashMinor, 100);
  assert.equal(boundary.maxEvidenceAgeMs, 60 * 60 * 1000);
  assert.throws(() => calculate([entry('cash-a', 100)], 60 * 60 * 1000 - 1),
    /exceeds configured maximum age/);
  assert.throws(() => calculate([entry('note-a', 500, {
    kind: 'noncash_collateral', sourceType: 'private_note',
  })], 60 * 60 * 1000 - 1), /exceeds configured maximum age/);
  assert.deepEqual(calculate([entry('cash-a', 100, { observedAt: asOfAt })], 0)
    .unencumberedCashMinor, 100);
  assert.throws(() => calculate([entry('cash-a', 100, {
    observedAt: '2026-10-30T05:59:59.999Z',
  })], 0), /exceeds configured maximum age/);
});

test('reserve snapshots reject inherited, accessor, hidden and unsupported financial claims', () => {
  const valid = { ...base, asOfAt, maxEvidenceAgeMs: 3600000, entries: [entry('cash-a', 100)] };
  assert.throws(() => calculateReserveCapacity(Object.create(valid)), /plain data record/);
  let getterCalled = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'maxEvidenceAgeMs', {
    enumerable: true, get() { getterCalled = true; return 3600000; },
  });
  assert.throws(() => calculateReserveCapacity(accessor), /enumerable data properties/);
  assert.equal(getterCalled, false);
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'settled', { value: true, enumerable: false });
  assert.throws(() => calculateReserveCapacity(hidden), /Unsupported Reserve snapshot field/);
  assert.throws(() => calculateReserveCapacity({ ...valid, paymentAuthorized: true }), /Unsupported Reserve snapshot field/);
  const symbolKey = { ...valid, [Symbol('funded')]: true };
  assert.throws(() => calculateReserveCapacity(symbolKey), /Unsupported Reserve snapshot field/);
  assert.equal(calculateReserveCapacity(Object.assign(Object.create(null), valid)).unencumberedCashMinor, 100);
});

test('reserve entries require own plain-data values and reject unreviewed settlement claims', () => {
  const valid = entry('cash-a', 100);
  assert.throws(() => calculate([Object.create(valid)]), /plain data record/);
  let getterCalled = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'amountMinor', {
    enumerable: true, get() { getterCalled = true; return 100; },
  });
  assert.throws(() => calculate([accessor]), /enumerable data properties/);
  assert.equal(getterCalled, false);
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'paymentReceived', { value: true, enumerable: false });
  assert.throws(() => calculate([hidden]), /Unsupported Reserve entry field/);
  assert.throws(() => calculate([{ ...valid, settledMinor: 100 }]), /Unsupported Reserve entry field/);
  assert.throws(() => calculate([{ ...valid, [Symbol('confirmed')]: true }]), /Unsupported Reserve entry field/);
  const missing = { ...valid };
  delete missing.amountMinor;
  assert.throws(() => calculate([missing]), /Reserve entry.amountMinor/);
  assert.equal(calculate([Object.assign(Object.create(null), valid)]).unencumberedCashMinor, 100);
});

test('reserve entry lists reject sparse, inherited, accessor and hidden metadata without running getters', () => {
  const valid = entry('cash-a', 100);
  const sparse = new Array(2);
  sparse[0] = valid;
  assert.throws(() => calculate(sparse), /must not contain holes/);

  const inherited = [valid];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => calculate(inherited), /plain array/);

  let getterCalled = false;
  const accessor = [valid];
  Object.defineProperty(accessor, '0', {
    enumerable: true, configurable: true,
    get() { getterCalled = true; return valid; },
  });
  assert.throws(() => calculate(accessor), /enumerable data elements/);
  assert.equal(getterCalled, false);

  const extended = [valid];
  extended.paymentReceived = true;
  assert.throws(() => calculate(extended), /only array indices/);
  const hidden = [valid];
  Object.defineProperty(hidden, 'settled', { value: true, enumerable: false });
  assert.throws(() => calculate(hidden), /only array indices/);
  const symbol = [valid];
  symbol[Symbol('funded')] = true;
  assert.throws(() => calculate(symbol), /only array indices/);

  assert.equal(calculate(Object.freeze([Object.freeze(valid)])).unencumberedCashMinor, 100);
});

test('reserve entry preflight rejects a malformed later record without executing its getter', () => {
  let getterCalled = false;
  const invalid = entry('cash-b', 200);
  Object.defineProperty(invalid, 'amountMinor', {
    enumerable: true, get() { getterCalled = true; return 200; },
  });
  assert.throws(() => calculate([entry('cash-a', 100), invalid]), /enumerable data properties/);
  assert.equal(getterCalled, false);
  assert.equal(calculate([entry('cash-a', 100), entry('cash-b', 200)]).unencumberedCashMinor, 300);
});

test('rejects non-NFC reserve scope, asset and provenance aliases before classification', () => {
  const composed = 'scope-\u00e9';
  const decomposed = 'scope-e\u0301';
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    assert.throws(
      () => calculateReserveCapacity({ ...base, [key]: decomposed, asOfAt,
        maxEvidenceAgeMs: 3600000, entries: [] }),
      new RegExp(key + '.*NFC'),
    );
    assert.equal(calculateReserveCapacity({ ...base, [key]: composed, asOfAt,
      maxEvidenceAgeMs: 3600000, entries: [] })[key], composed);
    assert.throws(() => calculate([entry('a', 100, { [key]: decomposed })]),
      /scope or currency mismatch/);
  }
  for (const key of ['id', 'assetId', 'evidenceRef']) {
    assert.throws(() => calculate([entry('a', 100, { [key]: decomposed })]),
      new RegExp('entry\\.' + key + '.*NFC'));
    assert.equal(calculate([entry('a', 100, { [key]: composed })]).unencumberedCashMinor, 100);
  }
  // Without canonical identity admission, equivalent names can bypass the
  // duplicate-asset and duplicate-evidence safeguards and overstate reserves.
  for (const key of ['assetId', 'evidenceRef']) {
    assert.throws(() => calculate([
      entry('a', 100, { [key]: composed }),
      entry('b', 200, { [key]: decomposed }),
    ]), new RegExp('entry\\.' + key + '.*NFC'));
  }
});

test('reserve classification bounds entry history before enumerating oversized arrays', () => {
  let enumerated = false;
  const oversized = new Proxy(new Array(10001), {
    ownKeys() {
      enumerated = true;
      throw new Error('Oversized reserve entries must not be enumerated');
    },
  });
  assert.throws(() => calculate(oversized), /exceeds maximum entry count/);
  assert.equal(enumerated, false);

  // The exact limit remains valid: no silently dropped reserve entries.
  const atLimit = Array.from({ length: 10000 }, (_, index) =>
    entry('bounded-' + index, 1));
  const result = calculate(atLimit);
  assert.equal(result.cashTotalMinor, 10000);
  assert.equal(result.unencumberedCashMinor, 10000);
  assert.equal(result.oldestEvidenceAt, '2026-10-30T05:00:00.000Z');
});

test('reserve identifiers reject ill-formed Unicode without rewriting valid supplementary characters', () => {
  const malformed = [String.fromCharCode(0xD800), String.fromCharCode(0xDC00),
    'x' + String.fromCharCode(0xD800) + 'y'];
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    for (const bad of malformed) {
      assert.throws(() => calculateReserveCapacity({ ...base, [key]: 'scope-' + bad,
        asOfAt, maxEvidenceAgeMs: 3600000, entries: [] }),
      new RegExp(key + '.*well-formed Unicode'));
    }
    const valid = 'scope-\u{1F4B0}';
    assert.equal(calculateReserveCapacity({ ...base, [key]: valid,
      asOfAt, maxEvidenceAgeMs: 3600000, entries: [] })[key], valid);
  }
  for (const key of ['id', 'assetId', 'evidenceRef']) {
    for (const bad of malformed) {
      assert.throws(() => calculate([entry('cash-a', 100, { [key]: 'asset-' + bad })]),
        new RegExp('entry\\.' + key + '.*well-formed Unicode'));
    }
    assert.equal(calculate([entry('cash-a', 100, { [key]: 'asset-\u{1F4B0}' })]).unencumberedCashMinor, 100);
  }
});

test('reserve asset and evidence references cannot impersonate one another across entries', () => {
  assert.throws(() => calculate([
    entry('cash-a', 100, { assetId: 'shared-ref', evidenceRef: 'shared-ref' }),
  ]), /Reserve asset and evidence identifiers must be distinct/);
  // Cross-entry reuse is rejected even when each individual entry looks valid.
  assert.throws(() => calculate([
    entry('cash-a', 100, { assetId: 'asset-a', evidenceRef: 'asset-b' }),
    entry('cash-b', 200, { assetId: 'asset-b', evidenceRef: 'evidence-b' }),
  ]), /Reserve asset and evidence identifiers must be distinct/);
  assert.throws(() => calculate([
    entry('cash-a', 100, { assetId: 'asset-a', evidenceRef: 'evidence-a' }),
    entry('cash-b', 200, { assetId: 'evidence-a', evidenceRef: 'evidence-b' }),
  ]), /Reserve asset and evidence identifiers must be distinct/);
  const valid = calculate([
    entry('cash-a', 100, { assetId: 'asset-a', evidenceRef: 'evidence-a' }),
    entry('cash-b', 200, { assetId: 'asset-b', evidenceRef: 'evidence-b' }),
  ]);
  assert.equal(valid.unencumberedCashMinor, 300);
});

test('reserve entry, asset, evidence and owning-scope identities remain distinct', () => {
  // An entry's journal ID cannot masquerade as the underlying asset or an
  // independent provenance record, including when the collision is in a
  // different entry or appears earlier in the list.
  for (const key of ['assetId', 'evidenceRef']) {
    assert.throws(() => calculate([entry('cash-a', 100, { [key]: 'cash-a' })]),
      /Reserve entry, asset and evidence identifiers must be distinct/);
    for (const rows of [
      [entry('cash-a', 100), entry('cash-b', 200, { [key]: 'cash-a' })],
      [entry('cash-a', 100, { [key]: 'cash-b' }), entry('cash-b', 200)],
    ]) {
      assert.throws(() => calculate(rows),
        /Reserve entry, asset and evidence identifiers must be distinct/);
    }
  }
  // Tenant/entity/trust identifiers must not be repurposed as an entry,
  // asset or evidence ID. This is not independent proof of asset ownership.
  for (const scopeId of Object.values(base).filter(value => value !== 'USD')) {
    for (const key of ['id', 'assetId', 'evidenceRef']) {
      assert.throws(() => calculate([entry('cash-a', 100, { [key]: scopeId })]),
        /identifier collides with reserve scope/);
      assert.throws(() => calculate([
        entry('cash-a', 100), entry('cash-b', 200, { [key]: scopeId }),
      ]), /identifier collides with reserve scope/);
    }
  }
  assert.equal(calculate([
    entry('cash-a', 100), entry('cash-b', 200),
  ]).unencumberedCashMinor, 300);
});

test('reserve snapshots reject all pairwise tenant, entity and trust identity aliases', () => {
  const scopeRoles = ['tenantId', 'entityId', 'trustId'];
  for (let i = 0; i < scopeRoles.length; i++) {
    for (let j = i + 1; j < scopeRoles.length; j++) {
      const aliasedScope = { ...base, [scopeRoles[j]]: base[scopeRoles[i]] };
      // Empty snapshots must not bypass scope validation.
      assert.throws(() => calculateReserveCapacity({
        ...aliasedScope, asOfAt, maxEvidenceAgeMs: 3600000, entries: [],
      }), /Reserve tenant, entity and trust identifiers must be distinct/);
      // Matching aliases on every row are still ambiguous ownership.
      const aliasedEntry = { ...entry('cash-a', 100), ...aliasedScope };
      assert.throws(() => calculateReserveCapacity({
        ...aliasedScope, asOfAt, maxEvidenceAgeMs: 3600000,
        entries: [aliasedEntry],
      }), /Reserve tenant, entity and trust identifiers must be distinct/);
    }
  }
  const valid = calculate([entry('cash-a', 100)]);
  assert.equal(valid.unencumberedCashMinor, 100);
  assert.deepEqual([valid.tenantId, valid.entityId, valid.trustId],
    [base.tenantId, base.entityId, base.trustId]);
});

test('reserve identifiers accept valid supplementary Unicode and reject unpaired surrogates', () => {
  const valid = 'asset-\u{1F4C4}';
  assert.equal(calculate([entry('cash-a', 100, { assetId: valid })]).unencumberedCashMinor, 100);
  for (const invalid of ['asset-\uD800', 'asset-\uDC00']) {
    assert.throws(() => calculate([entry('cash-a', 100, { assetId: invalid })]), /well-formed Unicode/);
  }
});

test('reserve identifiers reject invisible Unicode aliases and embedded whitespace', () => {
  for (const invalid of ['asset-\u200B', 'asset-\u2060', 'asset-\u00A0', 'asset\tkey', 'asset key']) {
    assert.throws(() => calculate([entry('cash-a', 100, { assetId: invalid })]),
      /invisible or whitespace|control characters|nonempty unpadded/);
  }
  assert.equal(calculate([entry('cash-a', 100, { assetId: 'asset-key' })]).unencumberedCashMinor, 100);
});


test('reserve array symbol accessors are rejected without invoking metadata getters', () => {
  let getterReads = 0;
  const entries = [entry('cash-a', 100)];
  Object.defineProperty(entries, Symbol('settlement-claim'), {
    enumerable: false,
    get() { getterReads++; throw new Error('metadata accessor executed'); },
  });
  assert.throws(() => calculate(entries), /only array indices/);
  assert.equal(getterReads, 0);
});

test('reserve record symbol accessors are rejected without invoking metadata getters', () => {
  for (const target of ['snapshot', 'entry']) {
    let getterReads = 0;
    const snapshot = { ...base, asOfAt, maxEvidenceAgeMs: 3600000, entries: [entry('cash-a', 100)] };
    const record = target === 'snapshot' ? snapshot : snapshot.entries[0];
    Object.defineProperty(record, Symbol('settlement-claim'), {
      enumerable: false,
      get() { getterReads++; throw new Error('metadata accessor executed'); },
    });
    assert.throws(() => calculateReserveCapacity(snapshot), /Unsupported Reserve (snapshot|entry) field/);
    assert.equal(getterReads, 0);
  }
});

test('reserve scope, asset and evidence IDs reject Unicode noncharacters across planes', () => {
  const invalid = [0xFDD0, 0xFFFF, 0x1FFFE, 0x10FFFF].map(cp => 'id-' + String.fromCodePoint(cp));
  for (const value of invalid) {
    for (const field of ['tenantId', 'entityId', 'trustId']) {
      assert.throws(() => calculateReserveCapacity({
        ...base, [field]: value, asOfAt, maxEvidenceAgeMs: 3600000, entries: [],
      }), /Unicode noncharacters/, field);
    }
    for (const field of ['id', 'assetId', 'evidenceRef']) {
      assert.throws(() => calculate([entry('cash-a', 100, { [field]: value })]),
        /Unicode noncharacters/, field);
    }
  }
  assert.equal(calculate([entry('cash-a', 100, { assetId: 'asset-' + String.fromCodePoint(0x1F680) })]).unencumberedCashMinor, 100);
});


test('reserve scope and provenance identifiers enforce bounded length without truncation', () => {
  const atLimit = 'x'.repeat(1024);
  const tooLong = 'x'.repeat(1025);
  for (const field of ['tenantId', 'entityId', 'trustId']) {
    assert.throws(() => calculateReserveCapacity({
      ...base, [field]: tooLong, asOfAt, maxEvidenceAgeMs: 3600000, entries: [],
    }), /maximum identifier length/);
    assert.equal(calculateReserveCapacity({
      ...base, [field]: atLimit, asOfAt, maxEvidenceAgeMs: 3600000, entries: [],
    })[field], atLimit);
  }
  for (const field of ['id', 'assetId', 'evidenceRef']) {
    assert.throws(() => calculate([entry('cash-a', 100, { [field]: tooLong })]),
      /maximum identifier length/);
    assert.equal(calculate([entry('cash-a', 100, { [field]: atLimit })]).unencumberedCashMinor, 100);
  }
});


test('reserve identifier length boundary counts UTF-16 units without splitting supplementary characters', () => {
  const valid = 'x'.repeat(1022) + String.fromCodePoint(0x1F680);
  const oversized = 'x'.repeat(1023) + String.fromCodePoint(0x1F680);
  assert.equal(valid.length, 1024);
  assert.equal(oversized.length, 1025);
  for (const field of ['tenantId', 'entityId', 'trustId']) {
    const accepted = calculateReserveCapacity({
      ...base, [field]: valid, asOfAt, maxEvidenceAgeMs: 3600000, entries: [],
    });
    assert.equal(accepted[field], valid);
    assert.throws(() => calculateReserveCapacity({
      ...base, [field]: oversized, asOfAt, maxEvidenceAgeMs: 3600000, entries: [],
    }), /maximum identifier length/);
  }
  for (const field of ['id', 'assetId', 'evidenceRef']) {
    assert.equal(calculate([entry('cash-a', 100, { [field]: valid })]).unencumberedCashMinor, 100);
    assert.throws(() => calculate([entry('cash-a', 100, { [field]: oversized })]),
      /maximum identifier length/);
  }
});
