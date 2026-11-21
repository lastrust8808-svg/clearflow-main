import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('processed ERP accounting receipts reject contradictory completion or fallback fields', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'clearflow-erp-processed-'));
  const previousFetch = globalThis.fetch;
  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    writeFileSync(join(directory, 'runtimeConfig.service.ts'), "export const getApiBaseUrl = () => 'https://erp.test';\n");
    const source = readFileSync(new URL('../src/services/erpOperations.service.ts', import.meta.url), 'utf8');
    writeFileSync(join(directory, 'erpOperations.service.ts'),
      source.replace("from './runtimeConfig.service'", "from './runtimeConfig.service.ts'"));
    const { importReconciliationStatement, closeReconciliationJob } =
      await import(pathToFileURL(join(directory, 'erpOperations.service.ts')).href);
    const common = {
      id: '123e4567-e89b-42d3-a456-426614174001',
      reconciliationId: 'recon-1', status: 'processed',
      queuedAt: '2026-10-28T00:00:00Z',
      persistedAt: '2026-10-28T00:00:01Z', persistence: 'durable',
      completionReceiptId: '123e4567-e89b-42d3-a456-426614174002',
      completionPersistedAt: '2026-10-28T00:00:03Z',
    };
    const cases = [
      {
        invoke: () => importReconciliationStatement({
          reconciliationId: 'recon-1', bankAccountId: 'bank-1',
          statementEndingBalance: 1, statementFileName: 'test.csv', exceptionNotes: '',
        }),
        key: 'importJob',
        job: { ...common, bankAccountId: 'bank-1', operation: 'statement_import',
          importedAt: '2026-10-28T00:00:02Z' },
      },
      {
        invoke: () => closeReconciliationJob({
          reconciliationId: 'recon-1', closeSummary: 'Test close', exceptionNotes: '',
        }),
        key: 'closeJob',
        job: { ...common, operation: 'reconciliation_close',
          closedAt: '2026-10-28T00:00:02Z' },
      },
    ];
    for (const { invoke, key, job } of cases) {
      const valid = { success: true, [key]: job };
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => valid });
      assert.deepEqual(await invoke(), valid, key + ' valid baseline');
      for (const field of ['fallbackRequired', 'fallbackReason', 'errorCode',
        'failedAt', 'cancelledAt', 'retryRequired', 'sentAt', 'futureCompletionMarker']) {
        const contradiction = { success: true, [key]: { ...job, [field]: 'contradiction' } };
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => contradiction });
        await assert.rejects(invoke(), /not confirmed/, key + ': ' + field);
      }
    }
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
