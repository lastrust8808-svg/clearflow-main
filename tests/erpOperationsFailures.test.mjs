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
  await test('manual fallback is not a confirmed invoice delivery or export', async () => {
    for (const [index, operation] of [[0, 'send'], [1, 'export']]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
        success: true,
        job: { id: 'fallback-job', operation, status: 'fallback_required',
          queuedAt: '2026-10-29T00:00:00Z', fallbackReason: 'SMTP unavailable' },
      }) });
      await assert.rejects(operations[index](payloads[index]), /not confirmed/);
    }
  });
  await test('sent acknowledgement without completion evidence is rejected', async () => {
    for (const metadata of [{}, { sentAt: '2026-10-29T00:01:00Z' },
      { sentAt: ' ', deliveryChannel: 'smtp' },
      { sentAt: '2026-10-29T00:01:00Z', deliveryChannel: 'manual' }]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
        success: true,
        job: { id: 'sent-job', operation: 'send', status: 'sent',
          queuedAt: '2026-10-29T00:00:00Z', ...metadata },
      }) });
      await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
    }
  });
  await test('sent delivery with explicit SMTP completion metadata remains accepted', async () => {
    const confirmation = { success: true, job: { id: 'sent-job', operation: 'send',
      status: 'sent', queuedAt: '2026-10-29T00:00:00Z',
      sentAt: '2026-10-29T00:01:00Z', deliveryChannel: 'smtp' } };
    globalThis.fetch = async () => ({ ok: true, json: async () => confirmation });
    assert.deepEqual(await api.queueInvoiceDelivery(payloads[0]), confirmation);
  });
  await test('export cannot claim sent-delivery status', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      success: true, job: { id: 'export-sent', operation: 'export', status: 'sent',
        queuedAt: '2026-10-29T00:00:00Z', sentAt: '2026-10-29T00:01:00Z',
        deliveryChannel: 'smtp' },
    }) });
    await assert.rejects(api.queueInvoiceExport(payloads[1]), /not confirmed/);
  });
} finally {
  globalThis.fetch = originalFetch;
  rmSync(directory, { recursive: true, force: true });
}
