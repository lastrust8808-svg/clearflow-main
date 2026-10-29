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
  { success: true, job: { id: 'j1', invoiceId: 'inv-1', entityId: 'ent-1', operation: 'send', status: 'sent', queuedAt: '2026-10-28T00:00:00Z', persistence: 'durable', persistedAt: '2026-10-28T00:00:01Z', sentAt: '2026-10-28T00:00:02Z', deliveryChannel: 'smtp', recipientEmail: 'alice@example.invalid' } },
  { success: true, job: { id: 'j2', invoiceId: 'inv-1', entityId: 'ent-1', operation: 'export', status: 'queued', queuedAt: '2026-10-28T00:00:00Z', persistence: 'durable', persistedAt: '2026-10-28T00:00:01Z' } },
  { success: true, importJob: { id: 'j3', reconciliationId: 'rec-1', bankAccountId: 'bank-1', operation: 'statement_import', status: 'processed',
    queuedAt: '2026-10-28T00:00:00Z', persistedAt: '2026-10-28T00:00:01Z',
    persistence: 'durable', importedAt: '2026-10-28T00:00:02Z' } },
  { success: true, closeJob: { id: 'j4', reconciliationId: 'rec-1', operation: 'reconciliation_close', status: 'processed',
    queuedAt: '2026-10-28T00:00:00Z', persistedAt: '2026-10-28T00:00:01Z',
    persistence: 'durable', closedAt: '2026-10-28T00:00:02Z' } },
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
  await test('invoice delivery and export acknowledgements must match requested invoice and entity', async () => {
    for (const index of [0, 1]) {
      for (const changes of [
        { invoiceId: undefined }, { invoiceId: 'inv-other' },
        { entityId: undefined }, { entityId: 'ent-other' },
        { invoiceId: 1 }, { entityId: 1 },
      ]) {
        globalThis.fetch = async () => ({ ok: true, json: async () => ({
          success: true, job: { ...accepted[index].job, ...changes },
        }) });
        await assert.rejects(operations[index](payloads[index]), /not confirmed/);
      }
    }
  });
  await test('statement-import receipt must match reconciliation and bank account', async () => {
    for (const changes of [
      { reconciliationId: undefined }, { reconciliationId: 'rec-other' },
      { bankAccountId: undefined }, { bankAccountId: 'bank-other' },
      { reconciliationId: 1 }, { bankAccountId: 1 },
    ]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
        success: true, importJob: { ...accepted[2].importJob, ...changes },
      }) });
      await assert.rejects(api.importReconciliationStatement(payloads[2]), /not confirmed/);
    }
  });
  await test('reconciliation-close receipt must match requested reconciliation', async () => {
    for (const reconciliationId of [undefined, 'rec-other', 1]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
        success: true, closeJob: { ...accepted[3].closeJob, reconciliationId },
      }) });
      await assert.rejects(api.closeReconciliationJob(payloads[3]), /not confirmed/);
    }
  });
  await test('a valid identity-bound receipt remains accepted for each ERP operation', async () => {
    for (let index = 0; index < operations.length; index++) {
      globalThis.fetch = async () => ({ ok: true, json: async () => accepted[index] });
      assert.deepEqual(await operations[index](payloads[index]), accepted[index]);
    }
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
          queuedAt: '2026-10-29T00:00:00Z', persistence: 'durable',
          persistedAt: '2026-10-29T00:00:01Z', ...metadata },
      }) });
      await assert.rejects(api.queueInvoiceDelivery(payloads[0]), /not confirmed/);
    }
  });
  await test('sent delivery with explicit SMTP completion metadata remains accepted', async () => {
    const confirmation = { success: true, job: { id: 'sent-job', invoiceId: 'inv-1', entityId: 'ent-1', operation: 'send',
      status: 'sent', queuedAt: '2026-10-29T00:00:00Z',
      persistence: 'durable', persistedAt: '2026-10-29T00:00:01Z',
      sentAt: '2026-10-29T00:01:00Z', deliveryChannel: 'smtp', recipientEmail: 'alice@example.invalid' } };
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
        globalThis.fetch = async () => ({ ok: true, json: async () => ({
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
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
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
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
        success: true, closeJob: { ...valid, ...changes },
      }) });
      await assert.rejects(api.closeReconciliationJob(payloads[3]), /not confirmed/);
    }
  });
  await test('sent acknowledgement must occur after durable acceptance', async () => {
    for (const sentAt of ['not-a-date', '2026-10-28T23:59:59Z', '2026-02-30T00:00:02Z']) {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({
        success: true, job: {
          id: 'sent-job', operation: 'send', status: 'sent',
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
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, job }) });
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
