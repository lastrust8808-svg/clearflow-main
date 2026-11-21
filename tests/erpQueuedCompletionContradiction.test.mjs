import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('queued invoice export rejects contradictory completion receipts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'clearflow-erp-queued-'));
  const previousFetch = globalThis.fetch;
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    writeFileSync(join(directory, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
    const source = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
    writeFileSync(join(directory, 'erpOperations.service.ts'),
      source.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
    const { queueInvoiceExport } = await import(pathToFileURL(join(directory, 'erpOperations.service.ts')).href);
    const payload = { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' };
    const receipt = {
      success: true,
      job: {
        id: '123e4567-e89b-42d3-a456-426614174001',
        ...payload, operation: 'export', status: 'queued',
        queuedAt: '2026-10-28T00:00:00Z',
        persistedAt: '2026-10-28T00:00:01Z', persistence: 'durable',
      },
    };
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => receipt });
    assert.deepEqual(await queueInvoiceExport(payload), receipt);
    for (const field of ['sentAt', 'deliveryReceiptId', 'deliveryChannel',
      'completionReceiptId', 'completionPersistedAt', 'importedAt', 'closedAt',
      'fallbackReason']) {
      const contradictory = { ...receipt, job: { ...receipt.job, [field]: 'forged-completion' } };
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => contradictory });
      await assert.rejects(queueInvoiceExport(payload), /not confirmed/, field);
    }
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
