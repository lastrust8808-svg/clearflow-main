import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

const scope = Object.freeze({ tenantId: 'tenant-a', actorId: 'actor-a' });

test('noncharacter Unicode in nested accounting values fails before database reservation', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('SQL must not run'); } };
  for (const cp of [0xfdd0, 0xfdef, 0xfffe, 0xffff, 0x1fffe, 0x10ffff]) {
    const hidden = String.fromCodePoint(cp);
    for (const payload of [
      { invoiceId: 'invoice-1', recipient: 'client' + hidden + '@example.test' },
      { invoiceId: 'invoice-1', lines: [{ description: 'repair' + hidden, amountCents: 125 }] },
      { invoiceId: 'invoice-1', metadata: { reference: hidden } },
    ]) {
      await assert.rejects(reserveErpOperationJob({
        db, authenticatedScope: scope, operation: 'invoice_delivery',
        idempotencyKey: 'invoice-noncharacter-1', payload,
      }), /ERP job payload contains a Unicode noncharacter/);
    }
  }
  assert.equal(queries, 0, 'noncharacter values must never reach SQL');
});

test('ordinary international accounting text remains permitted', async () => {
  let queries = 0;
  const db = { async query() {
    queries++;
    throw new Error('database unavailable');
  } };
  await assert.rejects(reserveErpOperationJob({
    db, authenticatedScope: scope, operation: 'invoice_delivery',
    idempotencyKey: 'invoice-unicode-valid-1',
    payload: { invoiceId: 'invoice-1', lines: [{ description: 'Réparation – إصلاح', amountCents: 125 }] },
  }), /database unavailable/);
  assert.equal(queries, 1, 'valid Unicode reaches durable storage, never an in-memory fallback');
});

test('unpaired UTF-16 surrogates in accounting values fail before SQL; valid astral text remains accepted', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('database unavailable'); } };
  for (const malformed of ['\\uD800', '\\uDC00', 'client\\uD800@example.test', 'repair\\uDC00']) {
    await assert.rejects(reserveErpOperationJob({
      db, authenticatedScope: scope, operation: 'invoice_delivery',
      idempotencyKey: 'invoice-surrogate-1',
      payload: { invoiceId: 'invoice-1', lines: [{ description: malformed, amountCents: 125 }] },
    }), /ERP job payload contains malformed Unicode/);
  }
  assert.equal(queries, 0, 'lossy UTF-8 replacement must not reach durable storage');
  await assert.rejects(reserveErpOperationJob({
    db, authenticatedScope: scope, operation: 'invoice_delivery',
    idempotencyKey: 'invoice-astral-valid-1',
    payload: { invoiceId: 'invoice-1', lines: [{ description: 'Repair 🔧', amountCents: 125 }] },
  }), /database unavailable/);
  assert.equal(queries, 1, 'valid supplementary Unicode must reach durable storage');
});
