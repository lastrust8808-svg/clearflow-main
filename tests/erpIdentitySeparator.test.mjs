import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reserveErpOperationJob,
  claimErpOperationJob,
} from '../server/services/erpJobReservation.js';

test('Unicode line and paragraph separators cannot split audited ERP identities', async () => {
  for (const separator of ['\u2028', '\u2029']) {
    let queries = 0;
    const db = { async query() { queries++; throw new Error('unexpected database call'); } };
    for (const field of ['tenantId', 'actorId']) {
      await assert.rejects(
        reserveErpOperationJob({
          db,
          authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a', [field]: 'safe' + separator + 'spoof' },
          operation: 'invoice_delivery',
          idempotencyKey: 'unique-key-123',
          payload: { invoiceId: 'inv-1' },
        }),
        /Invalid authenticated (tenant|actor)/,
      );
    }
    for (const field of ['tenantId', 'workerId']) {
      await assert.rejects(
        claimErpOperationJob({
          db,
          authenticatedWorker: { tenantId: 'tenant-a', workerId: 'worker-a', [field]: 'safe' + separator + 'spoof' },
          operation: 'invoice_delivery',
        }),
        /Invalid authenticated (tenant|worker)/,
      );
    }
    assert.equal(queries, 0, 'invalid identities must be rejected before SQL');
  }
});

test('Unicode nonbreaking spaces cannot disguise financial JSON field names', async () => {
  for (const separator of ['\u00a0', '\u2007', '\u202f']) {
    let queries = 0;
    const db = { async query() { queries++; throw new Error('unexpected database call'); } };
    await assert.rejects(
      reserveErpOperationJob({
        db,
        authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a' },
        operation: 'invoice_delivery',
        idempotencyKey: 'unique-key-123',
        payload: { ['amount' + separator + 'Cents']: 125 },
      }),
      /unsafe Unicode property name/,
    );
    assert.equal(queries, 0, 'confusable accounting keys must fail before SQL');
  }
});

test('embedded Unicode space separators cannot spoof authenticated ERP identities', async () => {
  for (const separator of ['\u00a0', '\u2007', '\u202f']) {
    let queries = 0;
    const db = { async query() { queries++; throw new Error('unexpected database call'); } };
    for (const field of ['tenantId', 'actorId']) {
      await assert.rejects(reserveErpOperationJob({
        db,
        authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a', [field]: 'safe' + separator + 'spoof' },
        operation: 'invoice_delivery',
        idempotencyKey: 'unique-key-123',
        payload: { invoiceId: 'inv-1' },
      }), /Invalid authenticated (tenant|actor)/);
    }
    for (const field of ['tenantId', 'workerId']) {
      await assert.rejects(claimErpOperationJob({
        db,
        authenticatedWorker: { tenantId: 'tenant-a', workerId: 'worker-a', [field]: 'safe' + separator + 'spoof' },
        operation: 'invoice_delivery',
      }), /Invalid authenticated (tenant|worker)/);
    }
    assert.equal(queries, 0, 'invalid identities must be rejected before SQL');
  }
});
