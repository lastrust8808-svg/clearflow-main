import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const base = { tenantId: 'tenant-a', entityId: 'trust-a', currency: 'USD' };
const entry = (id, amountMinor, options = {}) => ({ id, evidenceRef: 'source-' + id, ...base, kind: 'cash', amountMinor, ...options });
const calculate = (entries) => calculateReserveCapacity({ ...base, entries });

test('separates restricted and pledged cash from unencumbered cash', () => {
  const result = calculate([entry('one', 100_00, { restrictedMinor: 25_00, pledgedMinor: 30_00 })]);
  assert.equal(result.cashTotalMinor, 100_00);
  assert.equal(result.cashRestrictedMinor, 25_00);
  assert.equal(result.cashPledgedMinor, 30_00);
  assert.equal(result.unencumberedCashMinor, 45_00);
  assert.equal(result.noncashCollateralMinor, 0);
});

test('noncash collateral never increases unencumbered cash', () => {
  const result = calculate([entry('cash', 10_00), entry('note', 5_000_00, { kind: 'noncash_collateral' })]);
  assert.equal(result.unencumberedCashMinor, 10_00);
  assert.equal(result.noncashCollateralMinor, 5_000_00);
});

test('rejects overpledged or negative and fractional balances', () => {
  assert.throws(() => calculate([entry('x', 100, { restrictedMinor: 70, pledgedMinor: 31 })]), /exceeds/);
  assert.throws(() => calculate([entry('x', -1)]), /safe integer/);
  assert.throws(() => calculate([entry('x', 1.5)]), /safe integer/);
});

test('rejects mixed tenant, entity or currency rather than silently mixing books', () => {
  for (const change of [{ tenantId: 'tenant-b' }, { entityId: 'trust-b' }, { currency: 'EUR' }]) {
    assert.throws(() => calculate([entry('x', 100, change)]), /scope or currency mismatch/);
  }
});

test('rejects duplicate entries and unsafe aggregate overflow', () => {
  assert.throws(() => calculate([entry('x', 10), entry('x', 10)]), /Duplicate/);
  assert.throws(() => calculate([entry('a', Number.MAX_SAFE_INTEGER), entry('b', 1)]), /safe integer range/);
});

test('rejects unsupported kinds and noncash cash allocations', () => {
  assert.throws(() => calculate([entry('x', 10, { kind: 'promissory_note_cash' })]), /Unsupported/);
  assert.throws(() => calculate([entry('x', 10, { kind: 'noncash_collateral', pledgedMinor: 1 })]), /Noncash collateral/);
});

test('returns immutable snapshot without mutating entries', () => {
  const entries = [entry('x', 123)];
  const result = calculate(entries);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.unencumberedCashMinor, 123);
  assert.equal(entries[0].amountMinor, 123);
  assert.deepEqual(calculate([]).unencumberedCashMinor, 0);
});

test('rejects padded or control-character tenant and entity identifiers', () => {
  for (const key of ['tenantId', 'entityId']) {
    for (const bad of [' ' + base[key], base[key] + ' ', base[key] + '\u0000',
      base[key] + '\u001f', base[key] + '\u007f', base[key] + '\u009f']) {
      assert.throws(() => calculateReserveCapacity({ ...base, [key]: bad, entries: [] }),
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
    entry('collateral-b', 500, { kind: 'noncash_collateral', evidenceRef: source }),
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
