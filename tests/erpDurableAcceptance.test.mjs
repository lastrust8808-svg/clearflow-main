import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Load the actual ERP route source with dependency-free Express/provider doubles.
// No SMTP, bank, network, or database calls are made.
const directory = mkdtempSync(join(tmpdir(), 'clearflow-erp-route-'));
const source = readFileSync(new URL('../server/routes/erp.js', import.meta.url), 'utf8');
writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
writeFileSync(join(directory, 'express.mjs'), `
const routes = new Map();
export default {
  Router: () => ({
    routes,
    post(path, handler) { routes.set('POST ' + path, handler); },
    get(path, handler) { routes.set('GET ' + path, handler); },
  }),
};
`);
writeFileSync(join(directory, 'paymentExecution.mjs'), `
export function buildExecutionCapabilities() { return { testOnly: true, provider: 'mercury', executionMode: 'staged', mercuryApprovalReady: true, achOriginationReady: true, wireOriginationReady: true, liveBankExecutionReady: true, printableCheckReady: true, positivePayReady: true, supportedMethods: ['ach', 'wire', 'check'], notes: ['token configured'] }; }
export async function buildSettlementExecution() { throw new Error('unexpected settlement execution'); }
`);
writeFileSync(join(directory, 'erp.mjs'), source
  .replace("from 'express'", "from './express.mjs'")
  .replace("from '../services/paymentExecution.js'", "from './paymentExecution.mjs'"));
const router = (await import(pathToFileURL(join(directory, 'erp.mjs')).href)).default;

async function invoke(method, path, body = {}, params = {}) {
  const handler = router.routes.get(method + ' ' + path);
  assert.equal(typeof handler, 'function', 'expected registered ERP route');
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await handler({ body, params }, response);
  return response;
}

const invoice = { invoiceId: 'inv-test', entityId: 'entity-test', invoiceNumber: 'INV-TEST' };
try {
  await test('valid invoice delivery fails closed without durable acceptance', async () => {
    const response = await invoke('POST', '/invoice-deliveries', {
      ...invoice, deliveryMethod: 'email', recipientEmail: 'recipient@example.invalid',
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
    assert.equal(response.body.operation, 'invoice_delivery');
    assert.match(response.body.error, /No job was queued and no message was sent/);
    assert.equal(response.body.job, undefined);
  });

  await test('valid invoice export fails closed without durable acceptance', async () => {
    const response = await invoke('POST', '/invoice-exports', invoice);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.operation, 'invoice_export');
    assert.equal(response.body.job, undefined);
  });

  await test('missing delivery fields remain a 400 validation error', async () => {
    const response = await invoke('POST', '/invoice-deliveries', { invoiceId: 'inv-test' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  });

  await test('missing export fields remain a 400 validation error', async () => {
    const response = await invoke('POST', '/invoice-exports', { entityId: 'entity-test' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  });

  await test('ops status explicitly declares invoice delivery/export unavailable', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capabilities.invoiceDeliveries.available, false);
    assert.equal(response.body.capabilities.invoiceExports.available, false);
    assert.equal(response.body.counts.invoiceDeliveries, 0);
    assert.equal(response.body.counts.invoiceExports, 0);
  });

  await test('route has no in-memory invoice queue or SMTP send-before-persist path', () => {
    assert.doesNotMatch(source, /invoiceDeliveryJobs|invoiceExportJobs|sendInvoiceEmail/);
    assert.match(source, /ERP_DURABLE_JOB_STORE_REQUIRED/);
  });

  await test('valid settlement execution fails closed without provider invocation', async () => {
    const response = await invoke('POST', '/settlements/execute', {
      entityId: 'entity-test', paymentId: 'pay-test', settlementId: 'settle-test', amount: 100,
      method: 'ach', sourceBankAccount: { institutionName: 'Mercury' },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
    assert.equal(response.body.operation, 'settlement_execution');
    assert.equal(response.body.execution, undefined);
  });

  await test('missing settlement fields remain a 400 validation error', async () => {
    const response = await invoke('POST', '/settlements/execute', { paymentId: 'pay-test' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  });

  await test('settlement execution capability and in-memory count are disabled', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capabilities.settlementExecutions.available, false);
    assert.equal(response.body.capabilities.settlementExecutions.reason, 'durable_job_store_required');
    assert.equal(response.body.counts.settlementExecutions, 0);
    assert.equal(source.includes('buildSettlementExecution('), false);
    assert.doesNotMatch(source, /settlementExecutionJobs/);
  });

  await test('settlement capability probe cannot advertise executable rails while POST is disabled', async () => {
    // The mocked provider advertises every rail as ready, as it could when
    // credentials exist. Route readiness must reflect the disabled endpoint,
    // not the presence of credentials or a staged provider adapter.
    const response = await invoke('GET', '/settlements/execution-capabilities');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true); // read-only probe succeeded
    assert.equal(response.body.capabilities.testOnly, true);
    assert.equal(response.body.capabilities.provider, 'manual');
    assert.equal(response.body.capabilities.executionMode, 'disabled');
    assert.equal(response.body.capabilities.settlementExecutionAvailable, false);
    assert.equal(response.body.capabilities.unavailableReason, 'durable_job_store_required');
    for (const flag of [
      'liveBankExecutionReady', 'mercuryApprovalReady', 'achOriginationReady',
      'wireOriginationReady', 'billerDirectReady', 'printableCheckReady',
      'positivePayReady',
    ]) {
      assert.equal(response.body.capabilities[flag], false, flag);
    }
    assert.deepEqual(response.body.capabilities.supportedMethods, []);
    assert.match(response.body.capabilities.notes.join(' '), /No payment request can be queued/);
    const post = await invoke('POST', '/settlements/execute', {
      entityId: 'entity-test', paymentId: 'pay-test', settlementId: 'settle-test', amount: 100,
    });
    assert.equal(post.statusCode, 503);
    assert.equal(post.body.operation, 'settlement_execution');
  });
  await test('reconciliation close fails closed without durable approval and audit persistence', async () => {
    const response = await invoke('POST', '/reconciliations/:reconciliationId/close', {
      closeSummary: 'balanced', exceptionNotes: 'test-only',
    }, { reconciliationId: 'recon-test' });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
    assert.equal(response.body.operation, 'reconciliation_close');
    assert.equal(response.body.closeJob, undefined);
  });

  await test('reconciliation close preserves missing-id validation', async () => {
    const response = await invoke('POST', '/reconciliations/:reconciliationId/close');
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  });

  await test('reconciliation close reports unavailable with no in-memory queue', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capabilities.reconciliationCloses.available, false);
    assert.equal(response.body.capabilities.reconciliationCloses.reason, 'durable_job_store_required');
    assert.equal(response.body.counts.reconciliationCloses, 0);
    assert.doesNotMatch(source, /reconciliationCloseJobs/);
  });
  await test('statement import fails closed without durable persistence', async () => {
    const response = await invoke('POST', '/reconciliations/:reconciliationId/statement-import', {
      bankAccountId: 'bank-test',
      statementEndingBalance: 100,
      statementFileName: 'test-statement.csv',
      exceptionNotes: 'test-only',
    }, { reconciliationId: 'recon-test' });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
    assert.equal(response.body.operation, 'statement_import');
    assert.equal(response.body.importJob, undefined);
  });

  await test('statement import retains required identifier validation', async () => {
    const response = await invoke('POST', '/reconciliations/:reconciliationId/statement-import',
      { statementEndingBalance: 100 }, { reconciliationId: 'recon-test' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  });

  await test('statement imports report unavailable and cannot accumulate in memory', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capabilities.statementImports.available, false);
    assert.equal(response.body.capabilities.statementImports.reason, 'durable_job_store_required');
    assert.equal(response.body.counts.statementImports, 0);
    assert.doesNotMatch(source, /statementImportJobs|randomUUID/);
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
