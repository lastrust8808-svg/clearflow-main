import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'clearflow-erp-contradictory-rejection-'));
const source = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
  writeFileSync(join(dir, 'erpOperations.service.ts'), source.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
  const api = await import(pathToFileURL(join(dir, 'erpOperations.service.ts')).href);
  const payload = { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' };

  await test('contradictory 4xx financial receipts require status reconciliation without retry', async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      for (const body of [
        { success: true },
        { success: false, job: { id: 'job-1' } },
        { success: false, importJob: {} },
        { success: false, closeJob: {} },
      ]) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          return { ok: false, status, json: async () => body };
        };
        await assert.rejects(api.queueInvoiceExport(payload), /outcome unknown.*Verify operation status before retrying/);
        assert.equal(calls, 1);
      }
    }
  });

  await test('unreadable 4xx rejection evidence is indeterminate, not safe to retry', async () => {
    for (const status of [400, 403, 422]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return { ok: false, status, json: async () => { throw new SyntaxError('invalid JSON'); } };
      };
      await assert.rejects(api.queueInvoiceExport(payload), /outcome unknown.*Verify operation status before retrying/);
      assert.equal(calls, 1);
    }
  });

  await test('only explicit failure envelopes classify 4xx as rejected', async () => {
    for (const body of [{ success: false, code: 'INVALID_REQUEST', error: 'Invalid request' }]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return { ok: false, status: 422, json: async () => body }; };
      await assert.rejects(api.queueInvoiceExport(payload), /was rejected by the server/);
      assert.equal(calls, 1);
    }
  });

  await test('missing failure evidence on 4xx requires reconciliation', async () => {
    for (const body of [null, {}, [], 'rejected', { success: false, code: 'INVALID_REQUEST' },
      { success: false, error: '  ' }, { error: 'Invalid request' }]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return { ok: false, status: 422, json: async () => body }; };
      await assert.rejects(api.queueInvoiceExport(payload), /outcome unknown.*Verify operation status before retrying/);
      assert.equal(calls, 1);
    }
  });
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
