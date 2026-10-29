import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const base = { tenantId: 'tenant-a', entityId: 'trust-a', currency: 'USD' };
const entry = (id, amountMinor, options = {}) => ({ id, assetId: 'asset-' + id, evidenceRef: 'source-' + id, ...base, kind: 'cash', sourceType: 'bank_balance', amountMinor, ...options });
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
  const result = calculate([entry('cash', 10_00), entry('note', 5_000_00, { kind: 'noncash_collateral', sourceType: 'private_note' })]);
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
  assert.throws(() => calculate([entry('x', 10, { kind: 'noncash_collateral', sourceType: 'private_note', pledgedMinor: 1 })]), /Noncash collateral/);
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
      /entry\\.sourceType|Cash reserve entry requires a cash source classification/);
  }
  assert.equal(calculate([entry('cash-a', 100, { sourceType: 'physical_cash' })]).cashTotalMinor, 100);
});

test('rejects bank-balance classification for noncash collateral', () => {
  for (const sourceType of [undefined, null, '', 'bank_balance', 'physical_cash']) {
    assert.throws(() => calculate([entry('note-a', 100, { kind: 'noncash_collateral', sourceType })]),
      /entry\\.sourceType|Noncash collateral requires a noncash source classification/);
  }
  const result = calculate([entry('note-a', 100, { kind: 'noncash_collateral', sourceType: 'private_note' })]);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(result.noncashCollateralMinor, 100);
});
