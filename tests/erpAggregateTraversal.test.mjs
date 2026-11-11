import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

test('aggregate payload traversal fails closed before SQL reservation', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('SQL must not execute'); } };
  const payload = { rows: Array.from({ length: 201 }, () => Array(100).fill(null)) };
  await assert.rejects(
    reserveErpOperationJob({
      db,
      authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
      operation: 'invoice_delivery',
      idempotencyKey: 'aggregate-budget-001',
      payload,
    }),
    /aggregate traversal limit exceeded/,
  );
  assert.equal(queries, 0);
});

test('Unicode noncharacters in invoice recipient and memo fail before SQL', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('SQL must not execute'); } };
  for (const invalid of ['\uFDD0', String.fromCodePoint(0x1fffe), String.fromCodePoint(0x10ffff)]) {
    await assert.rejects(
      reserveErpOperationJob({
        db,
        authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
        operation: 'invoice_delivery',
        idempotencyKey: 'noncharacter-001',
        payload: { recipient: 'customer' + invalid, memo: 'invoice' },
      }),
      /Unicode noncharacter/,
    );
  }
  assert.equal(queries, 0);
});

test('valid supplementary Unicode remains permitted through payload validation', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('test database unavailable'); } };
  await assert.rejects(
    reserveErpOperationJob({
      db,
      authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
      operation: 'invoice_delivery',
      idempotencyKey: 'unicode-valid-001',
      payload: { recipient: 'customer ' + String.fromCodePoint(0x1f600) },
    }),
    /test database unavailable/,
  );
  assert.equal(queries, 1);
});

test('Unicode noncharacters in accounting field names fail before SQL', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('SQL must not execute'); } };
  for (const invalid of [String.fromCodePoint(0xfdd0), String.fromCodePoint(0x1fffe), String.fromCodePoint(0x10ffff)]) {
    await assert.rejects(
      reserveErpOperationJob({
        db,
        authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
        operation: 'invoice_delivery',
        idempotencyKey: 'noncharacter-key-001',
        payload: { ['invoice' + invalid]: 'value' },
      }),
      /unsafe Unicode property name/,
    );
  }
  assert.equal(queries, 0);
});

test('valid supplementary Unicode accounting field names pass validation', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('test database unavailable'); } };
  await assert.rejects(
    reserveErpOperationJob({
      db,
      authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
      operation: 'invoice_delivery',
      idempotencyKey: 'unicode-key-valid-001',
      payload: { ['invoice' + String.fromCodePoint(0x1f600)]: 'value' },
    }),
    /test database unavailable/,
  );
  assert.equal(queries, 1);
});

test('nested accounting field names with noncharacters fail before SQL', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('SQL must not execute'); } };
  for (const invalid of [String.fromCodePoint(0xfdef), String.fromCodePoint(0x2ffff), String.fromCodePoint(0x10fffe)]) {
    await assert.rejects(
      reserveErpOperationJob({
        db,
        authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
        operation: 'invoice_delivery',
        idempotencyKey: 'nested-noncharacter-001',
        payload: { lineItems: [{ ['amount' + invalid]: 1200 }] },
      }),
      /unsafe Unicode property name/,
    );
  }
  assert.equal(queries, 0);
});
