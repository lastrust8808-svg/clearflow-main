import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the real client service without connecting to a live ERP backend.
const dir = mkdtempSync(join(tmpdir(), 'clearflow-erp-unverified-http-'));
const source = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
  writeFileSync(join(dir, 'erpOperations.service.ts'), source.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
  const api = await import(pathToFileURL(join(dir, 'erpOperations.service.ts')).href);
  const payload = { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' };
  const plausibleReceipt = {
    success: true,
    job: {
      id: '123e4567-e89b-42d3-a456-426614174001',
      invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1',
      operation: 'export', status: 'queued', persistence: 'durable',
      queuedAt: '2026-10-28T00:00:00Z', persistedAt: '2026-10-28T00:00:01Z',
    },
  };
  await test('transformed and empty-success statuses cannot acknowledge financial work', async () => {
    for (const status of [203, 204, 205]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return { ok: true, status, json: async () => plausibleReceipt };
      };
      await assert.rejects(api.queueInvoiceExport(payload), /outcome unknown.*Verify operation status before retrying/);
      assert.equal(calls, 1, 'do not automatically retry an ambiguous financial POST');
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
