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

test('ERP status lookup rejects accessor receipt without invoking getter', async () => {
  let invoked = false;
  const row = { ...valid };
  Object.defineProperty(row, 'tenant_id', { enumerable: true, get() {
    invoked = true;
    throw Error('untrusted getter invoked');
  } });
  const db = { async query() { return { rows: [row] }; } };
  await assert.rejects(
    readErpOperationJobStatus({ db, authenticatedScope: scope, jobId }),
    /unsafe status field/,
  );
  assert.equal(invoked, false);
});

test('ERP status lookup rejects Proxy receipt without invoking traps', async () => {
  let invoked = false;
  const row = new Proxy({ ...valid }, { get() { invoked = true; throw Error('trap invoked'); } });
  const db = { async query() { return { rows: [row] }; } };
  await assert.rejects(
    readErpOperationJobStatus({ db, authenticatedScope: scope, jobId }),
    /unsafe status row/,
  );
  assert.equal(invoked, false);
});

test('ERP status lookup rejects inherited identity and hidden receipt fields', async () => {
  for (const row of [
    Object.assign(Object.create({ tenant_id: 'tenant-a' }), Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== 'tenant_id'))),
    Object.defineProperty({ ...valid }, 'status', { value: 'queued', enumerable: false }),
  ]) {
    const db = { async query() { return { rows: [row] }; } };
    await assert.rejects(
      readErpOperationJobStatus({ db, authenticatedScope: scope, jobId }),
      /unsafe status (row|field)/,
    );
  }
});

test('ERP status lookup retains ordinary tenant-bound queued receipt', async () => {
  const db = { async query() { return { rows: [{ ...valid }] }; } };
  const result = await readErpOperationJobStatus({ db, authenticatedScope: scope, jobId });
  assert.equal(result.status, 'queued');
  assert.equal(result.tenantId, 'tenant-a');
});
