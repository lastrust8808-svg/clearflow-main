import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Node 22 strips TypeScript types without installing dependencies or contacting a backend.
const directory = mkdtempSync(join(tmpdir(), 'clearflow-erp-test-'));
const original = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
writeFileSync(join(directory, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
writeFileSync(join(directory, 'erpOperations.service.ts'),
  original.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
const api = await import(pathToFileURL(join(directory, 'erpOperations.service.ts')).href);
const originalFetch = globalThis.fetch;
const payloads = [
  { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' },
  { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' },
  { reconciliationId: 'rec-1', bankAccountId: 'bank-1', statementEndingBalance: 100, statementFileName: 'test.csv', exceptionNotes: '' },
  { reconciliationId: 'rec-1', closeSummary: 'Reviewed' },
];
const operations = [api.queueInvoiceDelivery, api.queueInvoiceExport, api.importReconciliationStatement, api.closeReconciliationJob];
const accepted = [
  { success: true, job: { id: 'j1', operation: 'send', status: 'queued', queuedAt: '2026-10-28T00:00:00Z' } },
  { success: true, job: { id: 'j2', operation: 'export', status: 'queued', queuedAt: '2026-10-28T00:00:00Z' } },
  { success: true, importJob: { id: 'j3', status: 'processed', importedAt: '2026-10-28T00:00:00Z' } },
  { success: true, closeJob: { id: 'j4', status: 'processed', closedAt: '2026-10-28T00:00:00Z' } },
];
try {
  for (let i = 0; i < operations.length; i++) {
    await test(`ERP operation ${i + 1} rejects network failure`, async () => {
      globalThis.fetch = async () => { throw new Error('offline'); };
      await assert.rejects(operations[i](payloads[i]), /offline/);
    });
    await test(`ERP operation ${i + 1} rejects HTTP failure`, async () => {
      globalThis.fetch = async () => ({ ok: false, status: 503 });
      await assert.rejects(operations[i](payloads[i]), /HTTP 503/);
    });
    await test(`ERP operation ${i + 1} rejects unconfirmed response`, async () => {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
      await assert.rejects(operations[i](payloads[i]), /not confirmed/);
    });
    await test(`ERP operation ${i + 1} accepts confirmed response`, async () => {
      globalThis.fetch = async () => ({ ok: true, json: async () => accepted[i] });
      assert.deepEqual(await operations[i](payloads[i]), accepted[i]);
    });
  }
  await test('malformed JSON does not become success', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } });
    await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /invalid server response/);
  });
  await test('mismatched operation cannot be accepted', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => accepted[1] });
    await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
  });
} finally {
  globalThis.fetch = originalFetch;
  rmSync(directory, { recursive: true, force: true });
}
