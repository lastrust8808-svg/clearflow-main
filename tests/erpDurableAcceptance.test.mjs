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
export function buildExecutionCapabilities() { return { testOnly: true }; }
export async function buildSettlementExecution() { throw new Error('unexpected settlement execution'); }
`);
writeFileSync(join(directory, 'erp.mjs'), source
  .replace("from 'express'", "from './express.mjs'")
  .replace("from '../services/paymentExecution.js'", "from './paymentExecution.mjs'"));
const router = (await import(pathToFileURL(join(directory, 'erp.mjs')).href)).default;

async function invoke(method, path, body = {}) {
  const handler = router.routes.get(method + ' ' + path);
  assert.equal(typeof handler, 'function', 'expected registered ERP route');
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await handler({ body, params: {} }, response);
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

  await test('read-only settlement capabilities route remains available', async () => {
    const response = await invoke('GET', '/settlements/execution-capabilities');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capabilities.testOnly, true);
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
