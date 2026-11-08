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
  { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1', deliveryMethod: 'email', recipientEmail: 'alice@example.invalid' },
  { invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1' },
  { reconciliationId: 'rec-1', bankAccountId: 'bank-1', statementEndingBalance: 100, statementFileName: 'test.csv', exceptionNotes: '' },
  { reconciliationId: 'rec-1', closeSummary: 'Reviewed' },
];
const operations = [api.queueInvoiceDelivery, api.queueInvoiceExport, api.importReconciliationStatement, api.closeReconciliationJob];
const accepted = [
  { success: true, job: { id: '123e4567-e89b-42d3-a456-426614174000', invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1', operation: 'send', status: 'sent', queuedAt: '2026-10-28T00:00:00Z', persistence: 'durable', persistedAt: '2026-10-28T00:00:01Z', sentAt: '2026-10-28T00:00:02Z', deliveryChannel: 'smtp', deliveryReceiptId: 'smtp-msg-1', recipientEmail: 'alice@example.invalid' } },
  { success: true, job: { id: '123e4567-e89b-42d3-a456-426614174001', invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1', operation: 'export', status: 'queued', queuedAt: '2026-10-28T00:00:00Z', persistence: 'durable', persistedAt: '2026-10-28T00:00:01Z' } },
  { success: true, importJob: { id: '123e4567-e89b-42d3-a456-426614174002', reconciliationId: 'rec-1', bankAccountId: 'bank-1', operation: 'statement_import', status: 'processed',
    queuedAt: '2026-10-28T00:00:00Z', persistedAt: '2026-10-28T00:00:01Z',
    persistence: 'durable', importedAt: '2026-10-28T00:00:02Z',
    completionReceiptId: '123e4567-e89b-42d3-a456-426614174102', completionPersistedAt: '2026-10-28T00:00:03Z' } },
  { success: true, closeJob: { id: '123e4567-e89b-42d3-a456-426614174003', reconciliationId: 'rec-1', operation: 'reconciliation_close', status: 'processed',
    queuedAt: '2026-10-28T00:00:00Z', persistedAt: '2026-10-28T00:00:01Z',
    persistence: 'durable', closedAt: '2026-10-28T00:00:02Z',
    completionReceiptId: '123e4567-e89b-42d3-a456-426614174103', completionPersistedAt: '2026-10-28T00:00:03Z' } },
];
try {
  for (let i = 0; i < operations.length; i++) {
    await test(`ERP operation ${i + 1} treats lost network response as unknown, not rejected`, async () => {
      globalThis.fetch = async () => { throw new Error('offline'); };
      await assert.rejects(operations[i](payloads[i]), /outcome unknown.*Verify operation status before retrying/);
    });
    await test(`ERP operation ${i + 1} treats HTTP 503 as an unknown outcome`, async () => {
      globalThis.fetch = async () => ({ ok: false, status: 503 });
      await assert.rejects(operations[i](payloads[i]), /outcome unknown \(HTTP 503\).*Verify operation status before retrying/);
    });
    await test(`ERP operation ${i + 1} distinguishes transient from explicit client rejection`, async () => {
      // Some custom fetch adapters expose redirect/opaque responses instead
      // of throwing despite redirect: 'error'. Neither proves a rejected write.
      for (const status of [0, 301, 302, 303, 307, 308, 408, 409, 425, 429, 502, 504]) {
        globalThis.fetch = async () => ({ ok: false, status });
        await assert.rejects(operations[i](payloads[i]), /outcome unknown.*Verify operation status before retrying/);
      }
      for (const status of [400, 401, 403, 422]) {
        globalThis.fetch = async () => ({ ok: false, status });
        await assert.rejects(operations[i](payloads[i]), /was rejected by the server.*Resolve the error before retrying/);
      }
    });
    await test(`ERP operation ${i + 1} rejects unconfirmed response`, async () => {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
      await assert.rejects(operations[i](payloads[i]), /not confirmed/);
    });
    await test(`ERP operation ${i + 1} accepts confirmed response`, async () => {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => accepted[i] });
      assert.deepEqual(await operations[i](payloads[i]), accepted[i]);
    });
  }
  await test('all financial operation requests bypass cached acknowledgements', async () => {
    for (let index = 0; index < operations.length; index++) {
      let request;
      globalThis.fetch = async (url, options) => {
        request = { url, options };
        return { ok: true, status: 200, json: async () => accepted[index] };
      };
      await operations[index](payloads[index]);
      assert.equal(request.options.method, 'POST');
      assert.equal(request.options.cache, 'no-store');
      assert.equal(request.options.redirect, 'error', 'financial POSTs must never follow redirects');
      assert.equal(request.options.headers['Cache-Control'], 'no-store');
    }
  });
  await test('fetch error response types never confirm a financial operation', async () => {
    // A custom adapter can return an apparently successful status/body while
    // reporting a network error response type. Never promote its receipt.
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async () => ({
        type: 'error', ok: true, status: 200, json: async () => accepted[index],
      });
      await assert.rejects(operations[index](payloads[index]),
        /outcome unknown: opaque financial response.*Verify operation status before retrying/);
    }
  });
  await test('redirect failures remain indeterminate and never imply a rejected financial write', async () => {
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async (_url, options) => {
        assert.equal(options.redirect, 'error');
        throw new TypeError('redirect mode is set to error');
      };
      await assert.rejects(operations[index](payloads[index]),
        /outcome unknown: no server confirmation was received.*Verify operation status before retrying/);
    }
  });
  await test('response URL must match the requested ERP endpoint', async () => {
    const paths = [
      '/api/erp/invoice-deliveries',
      '/api/erp/invoice-exports',
      '/api/erp/reconciliations/rec-1/statement-import',
      '/api/erp/reconciliations/rec-1/close',
    ];
    for (let index = 0; index < operations.length; index++) {
      const expectedUrl = 'https://erp.test' + paths[index];
      for (const url of ['https://other.test' + paths[index],
        expectedUrl + '/wrong', 'https://erp.test/api/erp/invoice-exports']) {
        if (url === expectedUrl) continue;
        globalThis.fetch = async () => ({
          ok: true, status: 200, redirected: false, url,
          json: async () => accepted[index],
        });
        await assert.rejects(operations[index](payloads[index]),
          /outcome unknown: mismatched financial response URL/);
      }
      globalThis.fetch = async () => ({
        ok: true, status: 200, redirected: false, url: expectedUrl,
        json: async () => accepted[index],
      });
      assert.deepEqual(await operations[index](payloads[index]), accepted[index]);
    }
  });
  await test('native Fetch responses without a final URL cannot confirm financial writes', async () => {
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async () => new Response(JSON.stringify(accepted[index]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
      await assert.rejects(operations[index](payloads[index]),
        /outcome unknown: missing financial response URL.*Verify operation status before retrying/);
    }
  });
  await test('followed redirects cannot confirm financial writes even with a valid receipt', async () => {
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async () => ({
        ok: true, status: 200, redirected: true,
        json: async () => accepted[index],
      });
      await assert.rejects(operations[index](payloads[index]),
        /outcome unknown: redirected financial response.*Verify operation status before retrying/);
    }
  });
  await test('opaque fetch responses never confirm financial operations', async () => {
    for (let index = 0; index < operations.length; index++) {
      for (const type of ['opaque', 'opaqueredirect']) {
        // Deliberately inconsistent adapter: a plausible success body and
        // HTTP 200 must not override an opaque response classification.
        globalThis.fetch = async () => ({
          ok: true, status: 200, type, redirected: false,
          json: async () => accepted[index],
        });
        await assert.rejects(operations[index](payloads[index]),
          /outcome unknown: opaque financial response.*Verify operation status before retrying/);
      }
    }
  });
  await test('only complete untransformed HTTP success can confirm a financial operation', async () => {
    for (let index = 0; index < operations.length; index++) {
      for (const status of [203, 204, 205, 206, 207, 208, 226]) {
        globalThis.fetch = async () => ({ ok: true, status, json: async () => accepted[index] });
        await assert.rejects(operations[index](payloads[index]),
          /unverified server acknowledgement.*Verify operation status before retrying/);
      }
      for (const status of [200, 201, 202]) {
        globalThis.fetch = async () => ({ ok: true, status, json: async () => accepted[index] });
        assert.deepEqual(await operations[index](payloads[index]), accepted[index]);
      }
    }
  });
  await test('explicit durable-store 503 confirms no ERP job was accepted', async () => {
    const names = ['invoice_delivery', 'invoice_export', 'statement_import', 'reconciliation_close'];
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async () => ({
        ok: false, status: 503, json: async () => ({
          success: false, code: 'ERP_DURABLE_JOB_STORE_REQUIRED',
          operation: names[index], error: 'This operation is unavailable until authenticated durable job storage is implemented. No job was queued and no message was sent.',
        }),
      });
      await assert.rejects(operations[index](payloads[index]),
        /is unavailable: durable job storage is not enabled. No operation was queued or completed/,
        names[index]);
    }
  });

  await test('untrusted or malformed 503 response remains indeterminate', async () => {
    const validFailure = {
      success: false, code: 'ERP_DURABLE_JOB_STORE_REQUIRED',
      operation: 'invoice_delivery',
    };
    for (const failure of [
      { ...validFailure, operation: 'invoice_export' },
      { ...validFailure, code: 'OTHER_ERROR' },
      { ...validFailure, success: true },
      { ...validFailure, job: { id: 'maybe-accepted' } },
      { ...validFailure, importJob: {} },
      { ...validFailure, closeJob: {} },
      { ...validFailure, error: 'No job was queued and no message was sent.' },
      { ...validFailure, error: 'This operation is unavailable until authenticated durable job storage is implemented. No job was queued and no message was sent.', receiptId: 'untrusted' },
    ]) {
      globalThis.fetch = async () => ({
        ok: false, status: 503, json: async () => failure,
      });
      await assert.rejects(api.queueInvoiceDelivery(payloads[0]),
        /outcome unknown \(HTTP 503\).*Verify operation status before retrying/);
    }
    globalThis.fetch = async () => ({
      ok: false, status: 503, json: async () => { throw new SyntaxError('invalid JSON'); },
    });
    await assert.rejects(api.queueInvoiceDelivery(payloads[0]),
      /outcome unknown \(HTTP 503\).*Verify operation status before retrying/);
    globalThis.fetch = async () => ({
      ok: false, status: 502, json: async () => validFailure,
    });
    await assert.rejects(api.queueInvoiceDelivery(payloads[0]),
      /outcome unknown \(HTTP 502\).*Verify operation status before retrying/);
  });

  await test('future-dated durable acceptance and completion receipts never confirm an operation', async () => {
    const future = '2099-01-01T00:00:00Z';
    for (let index = 0; index < operations.length; index++) {
      const key = index < 2 ? 'job' : index === 2 ? 'importJob' : 'closeJob';
      const valid = accepted[index][key];
      const completion = index === 0 ? 'sentAt' : index === 2 ? 'importedAt' : index === 3 ? 'closedAt' : null;
      const fields = ['queuedAt', 'persistedAt', ...(completion ? [completion] : [])];
      for (const field of fields) {
        globalThis.fetch = async () => ({
          ok: true, status: 200, json: async () => ({ success: true, [key]: { ...valid, [field]: future } }),
        });
        await assert.rejects(operations[index](payloads[index]), /not confirmed/, `${index}: ${field}`);
      }
    }
  });
  await test('statement imports reject lossy balances before contacting the API', async () => {
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('unexpected request'); };
    for (const balance of [NaN, Infinity, -Infinity, -0, 1.005, -2.999, Number.MAX_SAFE_INTEGER,
      // A floating-point tolerance previously let these sub-cent values
      // reach the backend, potentially changing the recorded amount.
      1.0000000001, -0.0000000001, 1e-11, 0.1 + 0.2, 2.0000000000001,
      90071992547409.92, '100.00', null, undefined]) {
      await assert.rejects(
        api.importReconciliationStatement({ ...payloads[2], statementEndingBalance: balance }),
        /Invalid statement ending balance/,
        String(balance),
      );
    }
    assert.equal(requests, 0, 'invalid accounting amounts must never reach the server');
    // Negative overdrafts and ordinary cent-denominated balances remain valid.
    for (const balance of [-23.45, 0, 0.07, 0.29, 0.57, 100.25]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => accepted[2] });
      assert.deepEqual(await api.importReconciliationStatement({
        ...payloads[2], statementEndingBalance: balance,
      }), accepted[2]);
    }
  });
  await test('malformed JSON does not become success', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } });
    await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /invalid server response/);
  });
  await test('mismatched operation cannot be accepted', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => accepted[1] });
    await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
  });
  await test('invoice delivery and export acknowledgements must match invoice ID, entity and invoice number', async () => {
    for (const index of [0, 1]) {
      for (const changes of [
        { invoiceId: undefined }, { invoiceId: 'inv-other' },
        { entityId: undefined }, { entityId: 'ent-other' },
        { invoiceNumber: undefined }, { invoiceNumber: 'INV-OTHER' },
        { invoiceId: 1 }, { entityId: 1 }, { invoiceNumber: 1 },
      ]) {
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
          success: true, job: { ...accepted[index].job, ...changes },
        }) });
        await assert.rejects(operations[index](payloads[index]), /not confirmed/);
      }
    }
  });
  await test('invoice number cannot be substituted even with matching invoice and entity IDs', async () => {
    for (const index of [0, 1]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => accepted[index] });
      await assert.rejects(operations[index]({ ...payloads[index], invoiceNumber: 'INV-CHANGED' }), /not confirmed/);
    }
  });
  await test('statement-import receipt must match reconciliation and bank account', async () => {
    for (const changes of [
      { reconciliationId: undefined }, { reconciliationId: 'rec-other' },
      { bankAccountId: undefined }, { bankAccountId: 'bank-other' },
      { reconciliationId: 1 }, { bankAccountId: 1 },
    ]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true, importJob: { ...accepted[2].importJob, ...changes },
      }) });
      await assert.rejects(api.importReconciliationStatement(payloads[2]), /not confirmed/);
    }
  });
  await test('reconciliation-close receipt must match requested reconciliation', async () => {
    for (const reconciliationId of [undefined, 'rec-other', 1]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true, closeJob: { ...accepted[3].closeJob, reconciliationId },
      }) });
      await assert.rejects(api.closeReconciliationJob(payloads[3]), /not confirmed/);
    }
  });
  await test('a valid identity-bound receipt remains accepted for each ERP operation', async () => {
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => accepted[index] });
      assert.deepEqual(await operations[index](payloads[index]), accepted[index]);
    }
  });
  await test('synthetic or malformed job IDs cannot be treated as durable ERP receipts', async () => {
    // Even otherwise well-formed server responses must not revive the old
    // process-local queue convention of fabricated job identifiers.
    const invalidIds = [
      undefined, null, '', 'job-1', 'sent-job', '123e4567-e89b-42d3-a456-426614174000'.toUpperCase(),
      '123e4567-e89b-02d3-a456-426614174000',
      '123e4567-e89b-42d3-7456-426614174000',
    ];
    for (let index = 0; index < operations.length; index++) {
      const key = index < 2 ? 'job' : index === 2 ? 'importJob' : 'closeJob';
      for (const id of invalidIds) {
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
          success: true, [key]: { ...accepted[index][key], id },
        }) });
        await assert.rejects(operations[index](payloads[index]), /not confirmed/,
          `operation ${index + 1} accepted malformed job ID ${String(id)}`);
      }
    }
  });
  await test('manual fallback is not a confirmed invoice delivery or export', async () => {
    for (const [index, operation] of [[0, 'send'], [1, 'export']]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
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
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true,
        job: { id: '123e4567-e89b-42d3-a456-426614174004', operation: 'send', status: 'sent',
          queuedAt: '2026-10-29T00:00:00Z', persistence: 'durable',
          persistedAt: '2026-10-29T00:00:01Z', ...metadata },
      }) });
      await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
    }
  });
  await test('sent delivery with explicit SMTP completion metadata remains accepted', async () => {
    const confirmation = { success: true, job: { id: '123e4567-e89b-42d3-a456-426614174004', invoiceId: 'inv-1', entityId: 'ent-1', invoiceNumber: 'INV-1', operation: 'send',
      status: 'sent', queuedAt: '2026-10-29T00:00:00Z',
      persistence: 'durable', persistedAt: '2026-10-29T00:00:01Z',
      sentAt: '2026-10-29T00:01:00Z', deliveryChannel: 'smtp', deliveryReceiptId: 'smtp-msg-1', recipientEmail: 'alice@example.invalid' } };
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => confirmation });
    assert.deepEqual(await api.queueInvoiceDelivery(payloads[0]), confirmation);
  });
  await test('completed delivery requires an actual transport receipt identifier', async () => {
    const valid = accepted[0].job;
    for (const deliveryReceiptId of [undefined, null, '', '  ', 42, 'x'.repeat(256),
      'provider\nreceipt', 'provider\u200breceipt', '\u200b', 'provider\u0000receipt']) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true, job: { ...valid, deliveryReceiptId },
      }) });
      await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
    }
    // A nonempty provider receipt ID is required in addition to matching
    // invoice/entity/recipient, durable persistence and sent timestamp.
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
      success: true, job: { ...valid, deliveryReceiptId: 'provider-receipt-42' },
    }) });
    assert.equal((await api.queueInvoiceDelivery(payloads[0])).job.deliveryReceiptId, 'provider-receipt-42');
  });

  await test('export cannot claim sent-delivery status', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
      success: true, job: { id: 'export-sent', operation: 'export', status: 'sent',
        queuedAt: '2026-10-29T00:00:00Z', sentAt: '2026-10-29T00:01:00Z',
        deliveryChannel: 'smtp' },
    }) });
    await assert.rejects(api.queueInvoiceExport(payloads[1]), /not confirmed/);
  });
  await test('queued jobs require a valid durable persistence receipt', async () => {
    for (const index of [0, 1]) {
      const valid = accepted[index].job;
      for (const changes of [
        { persistence: undefined },
        { persistence: 'memory' },
        { persistedAt: undefined },
        { persistedAt: 'not-a-date' },
        { persistedAt: '2026-02-30T00:00:01Z' },
        { persistedAt: '2026-10-27T23:59:59Z' },
        { queuedAt: 'not-a-date' },
      ]) {
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
          success: true, job: { ...valid, ...changes },
        }) });
        await assert.rejects(operations[index](payloads[index]), /not confirmed/);
      }
    }
  });
  await test('statement imports reject unbound, non-durable or chronologically invalid completion receipts', async () => {
    const valid = accepted[2].importJob;
    for (const changes of [
      { operation: undefined }, { operation: 'reconciliation_close' },
      { persistence: undefined }, { persistence: 'memory' },
      { queuedAt: undefined }, { queuedAt: '2026-02-30T00:00:00Z' },
      { persistedAt: undefined }, { persistedAt: '2026-10-27T23:59:59Z' },
      { importedAt: undefined }, { importedAt: 'not-a-date' },
      { importedAt: '2026-10-28T00:00:00Z' },
      { status: 'queued' },
    ]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true, importJob: { ...valid, ...changes },
      }) });
      await assert.rejects(api.importReconciliationStatement(payloads[2]), /not confirmed/);
    }
  });
  await test('reconciliation close rejects unbound, non-durable or chronologically invalid completion receipts', async () => {
    const valid = accepted[3].closeJob;
    for (const changes of [
      { operation: undefined }, { operation: 'statement_import' },
      { persistence: undefined }, { persistence: 'memory' },
      { queuedAt: undefined }, { queuedAt: 'not-a-date' },
      { persistedAt: undefined }, { persistedAt: '2026-02-30T00:00:01Z' },
      { closedAt: undefined }, { closedAt: '2026-02-30T00:00:02Z' },
      { closedAt: '2026-10-28T00:00:00Z' },
      { status: 'queued' },
    ]) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true, closeJob: { ...valid, ...changes },
      }) });
      await assert.rejects(api.closeReconciliationJob(payloads[3]), /not confirmed/);
    }
  });
  await test('processed accounting jobs require a separate persisted completion receipt', async () => {
    // A durable queued job is not proof of statement posting or ledger closure.
    // A timestamp alone, synthetic receipt, or receipt reusing the reservation
    // UUID must never cause AccountingPage to apply a processed transition.
    for (const index of [2, 3]) {
      const key = index === 2 ? 'importJob' : 'closeJob';
      const job = accepted[index][key];
      for (const changes of [
        { completionReceiptId: undefined },
        { completionReceiptId: '' },
        { completionReceiptId: 'in-memory-completion-1' },
        { completionReceiptId: job.id },
        { completionReceiptId: job.completionReceiptId.toUpperCase() },
        { completionPersistedAt: undefined },
        { completionPersistedAt: 'not-a-date' },
        { completionPersistedAt: '2026-10-28T00:00:01Z' },
        { completionPersistedAt: '2099-01-01T00:00:00Z' },
      ]) {
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
          success: true, [key]: { ...job, ...changes },
        }) });
        await assert.rejects(operations[index](payloads[index]), /not confirmed/,
          `operation ${index + 1} accepted invalid completion evidence ${JSON.stringify(changes)}`);
      }
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => accepted[index] });
      assert.deepEqual(await operations[index](payloads[index]), accepted[index]);
    }
  });
  await test('sent acknowledgement must occur after durable acceptance', async () => {
    for (const sentAt of ['not-a-date', '2026-10-28T23:59:59Z', '2026-02-30T00:00:02Z']) {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
        success: true, job: {
          id: '123e4567-e89b-42d3-a456-426614174004', operation: 'send', status: 'sent',
          queuedAt: '2026-10-29T00:00:00Z',
          persistence: 'durable', persistedAt: '2026-10-29T00:00:01Z',
          sentAt, deliveryChannel: 'smtp',
        },
      }) });
      await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
    }
  });

  // AccountingPage currently marks accepted internal delivery as "sent" and
  // accepted email delivery as SMTP-sent. Queued or wrong-destination receipts
  // must therefore reject before that UI state transition.
  const sentDelivery = {
    ...accepted[0].job,
    status: 'sent',
    sentAt: '2026-10-28T00:00:02Z',
  };
  const emailRequest = {
    ...payloads[0], deliveryMethod: 'email', recipientEmail: 'alice@example.invalid',
  };
  const internalRequest = {
    ...payloads[0], deliveryMethod: 'internal_user', internalDeliveryTarget: 'member-a',
  };
  const replyWith = (job) => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, job }) });
  };

  await test('delivery without a declared channel cannot be reported as sent', async () => {
    const completed = { ...accepted[0].job };
    replyWith(completed);
    for (const deliveryMethod of [undefined, '', 'manual', 'unknown']) {
      await assert.rejects(
        api.queueInvoiceDelivery({ ...payloads[0], deliveryMethod }),
        /not confirmed/,
      );
    }
  });

  await test('delivery cannot confirm missing intended recipient even with a sent receipt', async () => {
    replyWith({ ...accepted[0].job });
    await assert.rejects(
      api.queueInvoiceDelivery({ ...payloads[0], recipientEmail: undefined }),
      /not confirmed/,
    );
    await assert.rejects(
      api.queueInvoiceDelivery({ ...payloads[0], deliveryMethod: 'internal_user', internalDeliveryTarget: undefined }),
      /not confirmed/,
    );
  });

  await test('email delivery cannot acknowledge queued work as already sent', async () => {
    replyWith({ ...accepted[0].job, status: 'queued', recipientEmail: emailRequest.recipientEmail });
    await assert.rejects(api.queueInvoiceDelivery(emailRequest), /not confirmed/);
  });

  await test('internal delivery cannot acknowledge queued work as already sent', async () => {
    replyWith({ ...accepted[0].job, status: 'queued', internalDeliveryTarget: internalRequest.internalDeliveryTarget });
    await assert.rejects(api.queueInvoiceDelivery(internalRequest), /not confirmed/);
  });

  await test('email sent receipt requires SMTP and the exact intended recipient', async () => {
    for (const changes of [
      { deliveryChannel: 'internal', recipientEmail: emailRequest.recipientEmail },
      { deliveryChannel: 'smtp', recipientEmail: 'wrong@example.invalid' },
      { deliveryChannel: 'smtp', recipientEmail: undefined },
    ]) {
      replyWith({ ...sentDelivery, ...changes });
      await assert.rejects(api.queueInvoiceDelivery(emailRequest), /not confirmed/);
    }
    const receipt = { ...sentDelivery, deliveryChannel: 'smtp', recipientEmail: emailRequest.recipientEmail };
    replyWith(receipt);
    assert.deepEqual((await api.queueInvoiceDelivery(emailRequest)).job, receipt);
  });

  await test('internal sent receipt requires internal channel and exact member target', async () => {
    for (const changes of [
      { deliveryChannel: 'smtp', internalDeliveryTarget: internalRequest.internalDeliveryTarget },
      { deliveryChannel: 'internal', internalDeliveryTarget: 'other-member' },
      { deliveryChannel: 'internal', internalDeliveryTarget: undefined },
    ]) {
      replyWith({ ...sentDelivery, ...changes });
      await assert.rejects(api.queueInvoiceDelivery(internalRequest), /not confirmed/);
    }
    const receipt = { ...sentDelivery, deliveryChannel: 'internal', internalDeliveryTarget: internalRequest.internalDeliveryTarget };
    replyWith(receipt);
    assert.deepEqual((await api.queueInvoiceDelivery(internalRequest)).job, receipt);
  });

} finally {
  globalThis.fetch = originalFetch;
  rmSync(directory, { recursive: true, force: true });
}
