import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Synthetic fetch responses only. Never connects to a bank or production ERP.
const dir = mkdtempSync(join(tmpdir(), 'clearflow-erp-503-evidence-'));
const source = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
  writeFileSync(join(dir, 'erpOperations.service.ts'), source.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
  const api = await import(pathToFileURL(join(dir, 'erpOperations.service.ts')).href);
  const payload = { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' };
  const refusal = {
    success: false,
    code: 'ERP_DURABLE_JOB_STORE_REQUIRED',
    operation: 'invoice_export',
    error: 'This operation is unavailable until authenticated durable job storage is implemented. No job was queued and no message was sent.',
  };
  await test('only exact operation-bound 503 no-op evidence permits definitive rejection', async () => {
    const cases = [
      { body: refusal, definitive: true },
      { body: { ...refusal, operation: 'invoice_delivery' } },
      { body: { ...refusal, job: { id: 'fabricated' } } },
      { body: { ...refusal, success: true } },
      { body: { ...refusal, code: 'OTHER' } },
      { body: { ...refusal, error: refusal.error + ' ' } },
      { body: { ...refusal, retryable: true } },
      { body: null },
    ];
    for (const { body, definitive } of cases) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return { ok: false, status: 503, json: async () => body };
      };
      await assert.rejects(api.queueInvoiceExport(payload), definitive
        ? /is unavailable: durable job storage is not enabled.*No operation was queued/
        : /outcome unknown.*Verify operation status before retrying/);
      assert.equal(calls, 1, 'never automatically replay a financial POST');
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
