import test from 'node:test';
import assert from 'node:assert/strict';
import { readErpOperationJobStatus } from '../server/services/erpJobReservation.js';

const jobId = '123e4567-e89b-42d3-a456-426614174000';
const scope = { tenantId: 'tenant-a', actorId: 'actor-a' };
const valid = {
  id: jobId, tenant_id: 'tenant-a', actor_id: 'actor-a',
  operation: 'invoice_delivery', status: 'queued',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

test('ERP status lookup fails closed on unexpected visible, hidden, or symbol claims', async () => {
  const hidden = Object.defineProperty({ ...valid }, 'delivered', {
    value: true, enumerable: false,
  });
  const symbol = { ...valid, [Symbol('settled')]: true };
  for (const row of [{ ...valid, delivered: true }, hidden, symbol]) {
    const db = { async query() { return { rows: [row] }; } };
    await assert.rejects(
      readErpOperationJobStatus({ db, authenticatedScope: scope, jobId }),
      /unexpected status fields/,
    );
  }
});

test('ERP status lookup accepts exact ordinary database status receipt', async () => {
  const db = { async query() { return { rows: [{ ...valid }] }; } };
  const result = await readErpOperationJobStatus({ db, authenticatedScope: scope, jobId });
  assert.equal(result.status, 'queued');
  assert.equal(result.id, jobId);
});
