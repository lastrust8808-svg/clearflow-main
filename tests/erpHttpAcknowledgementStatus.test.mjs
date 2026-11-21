import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run the real TypeScript service with Node 22 type stripping, no network.
const dir = mkdtempSync(join(tmpdir(), 'clearflow-erp-http-status-'));
const source = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
writeFileSync(join(dir, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
writeFileSync(join(dir, 'erpOperations.service.ts'), source.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
const originalFetch = globalThis.fetch;
try {
  const api = await import(pathToFileURL(join(dir, 'erpOperations.service.ts')).href);
  const payload = { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' };
  const receipt = {
    success: true,
    job: {
      id: '123e4567-e89b-42d3-a456-426614174001',
      invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1',
      operation: 'export', status: 'queued', persistence: 'durable',
      queuedAt: '2026-10-28T00:00:00Z', persistedAt: '2026-10-28T00:00:01Z',
    },
  };
  await test('transformed, bodyless, partial and multi-status responses cannot confirm ERP work', async () => {
    for (const status of [203, 204, 205, 206, 207, 208, 226]) {
      globalThis.fetch = async () => ({ ok: true, status, json: async () => receipt });
      await assert.rejects(api.queueInvoiceExport(payload), /outcome unknown.*Verify operation status before retrying/);
    }
  });
  await test('contradictory ok=false with 2xx status is indeterminate, not a safe rejection', async () => {
    for (const status of [200, 201, 202, 204]) {
      globalThis.fetch = async () => ({ ok: false, status, json: async () => receipt });
      await assert.rejects(api.queueInvoiceExport(payload), /outcome unknown.*Verify operation status before retrying/);
    }
  });
  await test('queued export cannot claim completed delivery transport evidence', async () => {
    for (const field of ['sentAt', 'deliveryReceiptId', 'deliveryChannel']) {
      const contradictory = structuredClone(receipt);
      contradictory.job[field] = field === 'sentAt' ? '2026-10-28T00:00:02Z' : 'smtp-receipt-1';
      globalThis.fetch = async () => ({ ok: true, status: 202, json: async () => contradictory });
      await assert.rejects(api.queueInvoiceExport(payload), /not confirmed by the server/);
    }
  });
  await test('full acknowledgement status codes preserve durable acceptance', async () => {
    for (const status of [200, 201, 202]) {
      globalThis.fetch = async () => ({ ok: true, status, json: async () => receipt });
      assert.deepEqual(await api.queueInvoiceExport(payload), receipt);
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
