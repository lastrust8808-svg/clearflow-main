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
export function buildExecutionCapabilities() { throw new Error('provider capability probe must not run'); }
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
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
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
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(response.body.error, /No job was queued and no message was sent/);
    assert.equal(response.body.job, undefined);
  });

  await test('valid invoice export fails closed without durable acceptance', async () => {
    const response = await invoke('POST', '/invoice-exports', invoice);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.operation, 'invoice_export');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.job, undefined);
  });

  await test('invalid ERP financial requests cannot be cached or claim accepted work', async () => {
    const cases = [
      ['POST', '/invoice-deliveries', { invoiceId: 'inv-test' }, {}],
      ['POST', '/invoice-exports', { entityId: 'entity-test' }, {}],
      ['POST', '/settlements/execute', { entityId: 'entity-test' }, {}],
      ['POST', '/reconciliations/:reconciliationId/statement-import',
        { bankAccountId: 'bank-test', statementEndingBalance: 1.001 },
        { reconciliationId: 'recon-test' }],
      ['POST', '/reconciliations/:reconciliationId/close', {},
        { reconciliationId: 'bad id' }],
    ];
    for (const [method, path, body, params] of cases) {
      const response = await invoke(method, path, body, params);
      assert.equal(response.statusCode, 400, path);
      assert.equal(response.headers['cache-control'], 'no-store', path);
      assert.equal(response.body.success, false, path);
      for (const key of ['job', 'importJob', 'closeJob', 'execution']) {
        assert.equal(response.body[key], undefined, path + ': ' + key);
      }
    }
  });

  await test('every valid financial mutation remains non-cacheable and unacknowledged', async () => {
    const cases = [
      ['/invoice-deliveries', { ...invoice, deliveryMethod: 'email', recipientEmail: 'recipient@example.invalid' }, {}],
      ['/invoice-exports', invoice, {}],
      ['/settlements/execute', {
        entityId: 'entity-test', paymentId: 'pay-test', settlementId: 'settle-test', amount: 0.01,
      }, {}],
      ['/reconciliations/:reconciliationId/statement-import', {
        bankAccountId: 'bank-test', statementEndingBalance: 0.01,
      }, { reconciliationId: 'recon-test' }],
      ['/reconciliations/:reconciliationId/close', {}, { reconciliationId: 'recon-test' }],
    ];
    for (const [path, body, params] of cases) {
      const response = await invoke('POST', path, body, params);
      assert.equal(response.statusCode, 503, path);
      assert.equal(response.headers['cache-control'], 'no-store', path);
      assert.equal(response.body.success, false, path);
      assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED', path);
      assert.match(response.body.error, /No job was queued and no message was sent/, path);
      for (const key of ['job', 'importJob', 'closeJob', 'execution', 'receipt', 'queuedAt']) {
        assert.equal(response.body[key], undefined, path + ': ' + key);
      }
    }
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

  await test('invisible Unicode whitespace cannot enter ERP accounting identifiers', async () => {
    const hidden = ['\u00a0', '\u2007', '\u2028', '\u2029', '\u3000'];
    for (const character of hidden) {
      for (const field of ['invoiceId', 'entityId', 'invoiceNumber']) {
        const response = await invoke('POST', '/invoice-deliveries', {
          ...invoice, [field]: 'a' + character + 'b',
        });
        assert.equal(response.statusCode, 400, field + ': ' + JSON.stringify(character));
        assert.equal(response.body.success, false);
        assert.equal(response.body.job, undefined);
      }
      const settlement = await invoke('POST', '/settlements/execute', {
        entityId: 'entity' + character + 'test',
        paymentId: 'pay-test', settlementId: 'settle-test', amount: 1,
      });
      assert.equal(settlement.statusCode, 400, JSON.stringify(character));
      assert.equal(settlement.body.execution, undefined);
    }
  });

  await test('default-ignorable identifiers fail closed across ERP HTTP mutations', async () => {
    // Combining grapheme joiner and variation selector are not caught by
    // Unicode whitespace/format-control checks alone.
    for (const invisible of ['\\u034f', '\\ufe0f']) {
      const bad = 'entity' + invisible + '-test';
      const cases = [
        ['/invoice-deliveries', { ...invoice, entityId: bad }, {}],
        ['/invoice-exports', { ...invoice, entityId: bad }, {}],
        ['/settlements/execute', {
          entityId: bad, paymentId: 'pay-test', settlementId: 'settle-test', amount: 1,
        }, {}],
        ['/reconciliations/:reconciliationId/statement-import', {
          bankAccountId: bad, statementEndingBalance: 1,
        }, { reconciliationId: 'recon-test' }],
        ['/reconciliations/:reconciliationId/close', {}, { reconciliationId: bad }],
      ];
      for (const [path, body, params] of cases) {
        const response = await invoke('POST', path, body, params);
        assert.equal(response.statusCode, 400, path + ': ' + JSON.stringify(invisible));
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.body.success, false);
        assert.equal(response.body.job, undefined);
        assert.equal(response.body.execution, undefined);
      }
    }
  });

  await test('embedded ASCII spaces cannot alias ERP operation identifiers', async () => {
    for (const field of ['invoiceId', 'entityId', 'invoiceNumber']) {
      for (const route of ['/invoice-deliveries', '/invoice-exports']) {
        const response = await invoke('POST', route, {
          ...invoice, [field]: 'part one',
        });
        assert.equal(response.statusCode, 400, route + ': ' + field);
        assert.equal(response.body.success, false);
        assert.equal(response.body.job, undefined);
      }
    }
    const settlement = await invoke('POST', '/settlements/execute', {
      entityId: 'entity test', paymentId: 'pay-test', settlementId: 'settle-test', amount: 1,
    });
    assert.equal(settlement.statusCode, 400);
    assert.equal(settlement.body.execution, undefined);
    const close = await invoke('POST', '/reconciliations/:reconciliationId/close',
      {}, { reconciliationId: 'recon test' });
    assert.equal(close.statusCode, 400);
    assert.equal(close.body.closeJob, undefined);
  });

  await test('ops status explicitly declares invoice delivery/export unavailable', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.capabilities.invoiceDeliveries.available, false);
    assert.equal(response.body.capabilities.invoiceExports.available, false);
    assert.equal(response.body.counts.invoiceDeliveries, null);
    assert.equal(response.body.counts.invoiceExports, null);
  });

  await test('settlement capability probe is non-cacheable and cannot advertise executable payment methods', async () => {
    const response = await invoke('GET', '/settlements/execution-capabilities');
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.capabilities.executionMode, 'disabled');
    assert.equal(response.body.capabilities.settlementExecutionAvailable, false);
    assert.deepEqual(response.body.capabilities.supportedMethods, []);
  });

  await test('disabled ERP operations never fabricate empty queue counts', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.countsAvailable, false);
    assert.equal(response.body.countsUnavailableReason, 'durable_job_store_required');
    assert.deepEqual(Object.keys(response.body.counts).sort(), [
      'invoiceDeliveries', 'invoiceExports', 'statementImports',
      'reconciliationCloses', 'settlementExecutions',
    ].sort());
    for (const [operation, count] of Object.entries(response.body.counts)) {
      assert.equal(count, null, operation + ' count is unknown, not zero');
      assert.equal(Object.values(response.body.capabilities)
        .some(capability => capability.available === true), false);
    }
    assert.doesNotMatch(JSON.stringify(response.body), /"(?:invoiceDeliveries|invoiceExports|statementImports|reconciliationCloses|settlementExecutions)":0/);
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

  await test('settlement amounts must be exact positive cents before durable execution is considered', async () => {
    const base = { entityId: 'entity-test', paymentId: 'pay-test', settlementId: 'settle-test' };
    const invalid = [undefined, null, '', '100', {}, [], true, NaN, Infinity,
      -Infinity, -0, 0, -0.01, 0.001, 1.005, 1.0000000001,
      0.1 + 0.2, Number.MAX_SAFE_INTEGER, 90071992547409.92];
    for (const amount of invalid) {
      const response = await invoke('POST', '/settlements/execute', { ...base, amount });
      assert.equal(response.statusCode, 400, String(amount));
      assert.equal(response.body.success, false);
      assert.equal(response.body.execution, undefined);
      assert.equal(response.body.job, undefined);
    }
    for (const amount of [0.01, 0.07, 0.29, 1.25, 100, 123.45]) {
      const response = await invoke('POST', '/settlements/execute', { ...base, amount });
      assert.equal(response.statusCode, 503, String(amount));
      assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
      assert.equal(response.body.execution, undefined);
      assert.equal(response.body.job, undefined);
    }
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
    assert.equal(response.body.counts.settlementExecutions, null);
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
    assert.equal(response.body.capabilities.testOnly, undefined);
    assert.equal(response.body.capabilities.token, undefined);
    assert.doesNotMatch(JSON.stringify(response.body), /token configured|provider capability probe must not run/);
    assert.doesNotMatch(source, /buildExecutionCapabilities/, 'disabled route must not consult provider configuration');
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
    assert.equal(response.body.counts.reconciliationCloses, null);
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

  await test('statement import rejects mismatched route and body reconciliation identities', async () => {
    const base = { bankAccountId: 'bank-test', statementEndingBalance: 100 };
    for (const reconciliationId of ['other-reconciliation', '', null, 42]) {
      const response = await invoke('POST', '/reconciliations/:reconciliationId/statement-import',
        { ...base, reconciliationId }, { reconciliationId: 'recon-test' });
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.code, 'ERP_RECONCILIATION_ID_MISMATCH');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.body.importJob, undefined);
    }
    const matching = await invoke('POST', '/reconciliations/:reconciliationId/statement-import',
      { ...base, reconciliationId: 'recon-test' }, { reconciliationId: 'recon-test' });
    assert.equal(matching.statusCode, 503);
    assert.equal(matching.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
  });

  await test('statement import retains required identifier validation', async () => {
    const response = await invoke('POST', '/reconciliations/:reconciliationId/statement-import',
      { statementEndingBalance: 100 }, { reconciliationId: 'recon-test' });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
  });

  await test('server statement import rejects lossy, sub-cent and nonnumeric balances', async () => {
    const invalid = [undefined, null, '100.00', NaN, Infinity, -Infinity, -0,
      1.005, -2.999, 1.0000000001, -0.0000000001, 1e-11,
      0.1 + 0.2, 2.0000000000001, Number.MAX_SAFE_INTEGER,
      90071992547409.92];
    for (const statementEndingBalance of invalid) {
      const response = await invoke('POST', '/reconciliations/:reconciliationId/statement-import', {
        bankAccountId: 'bank-test', statementEndingBalance,
        statementFileName: 'test-statement.csv',
      }, { reconciliationId: 'recon-test' });
      assert.equal(response.statusCode, 400, String(statementEndingBalance));
      assert.equal(response.body.success, false);
      assert.equal(response.body.code, 'ERP_INVALID_STATEMENT_BALANCE');
      assert.equal(response.body.importJob, undefined);
    }
  });

  await test('valid server-side cent balances remain unavailable until durable persistence', async () => {
    for (const statementEndingBalance of [-23.45, 0, 0.07, 0.29, 0.57, 100.25]) {
      const response = await invoke('POST', '/reconciliations/:reconciliationId/statement-import', {
        bankAccountId: 'bank-test', statementEndingBalance,
        statementFileName: 'test-statement.csv',
      }, { reconciliationId: 'recon-test' });
      assert.equal(response.statusCode, 503, String(statementEndingBalance));
      assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
      assert.equal(response.body.importJob, undefined);
    }
  });

  await test('statement imports report unavailable and cannot accumulate in memory', async () => {
    const response = await invoke('GET', '/ops-status');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capabilities.statementImports.available, false);
    assert.equal(response.body.capabilities.statementImports.reason, 'durable_job_store_required');
    assert.equal(response.body.counts.statementImports, null);
    assert.doesNotMatch(source, /statementImportJobs|randomUUID/);
  });

  await test('ERP HTTP routes reject ambiguous accounting identities before durable-job admission', async () => {
    const invalid = [null, 0, true, {}, [], '', ' ', ' padded', 'padded ',
      'line\nbreak', 'zero\u200bwidth', 'bidi\u202ealias',
      'cafe\u0301', 'embedded space', '\ud800', '\ufdd0', '\ufdef', '\ufffe', '\uffff',
      String.fromCodePoint(0x1fffe), String.fromCodePoint(0x10ffff),
      'x'.repeat(256)];
    const requests = [
      { method: 'POST', path: '/invoice-deliveries',
        body: { ...invoice, deliveryMethod: 'email', recipientEmail: 'recipient@example.invalid' },
        fields: ['invoiceId', 'entityId', 'invoiceNumber'] },
      { method: 'POST', path: '/invoice-exports',
        body: invoice, fields: ['invoiceId', 'entityId', 'invoiceNumber'] },
      { method: 'POST', path: '/settlements/execute',
        body: { entityId: 'entity-test', paymentId: 'pay-test', settlementId: 'settle-test', amount: 100 },
        fields: ['entityId', 'paymentId', 'settlementId'] },
      { method: 'POST', path: '/reconciliations/:reconciliationId/statement-import',
        body: { bankAccountId: 'bank-test', statementEndingBalance: 100 },
        params: { reconciliationId: 'recon-test' }, fields: ['bankAccountId', 'reconciliationId'] },
      { method: 'POST', path: '/reconciliations/:reconciliationId/close',
        body: { closeSummary: 'balanced' }, params: { reconciliationId: 'recon-test' },
        fields: ['reconciliationId'] },
    ];
    for (const request of requests) {
      for (const field of request.fields) {
        for (const value of invalid) {
          const body = { ...request.body };
          const params = { ...request.params };
          if (field === 'reconciliationId') params[field] = value;
          else body[field] = value;
          const response = await invoke(request.method, request.path, body, params);
          assert.equal(response.statusCode, 400,
            request.path + ' ' + field + ' ' + JSON.stringify(value));
          assert.equal(response.body.success, false);
          assert.equal(response.body.job, undefined);
          assert.equal(response.body.importJob, undefined);
          assert.equal(response.body.closeJob, undefined);
        }
      }
      // Composed international identifiers without embedded spaces remain valid,
      // but cannot queue or execute without durable persistence.
      const body = { ...request.body };
      const params = { ...request.params };
      for (const field of request.fields) {
        if (field === 'reconciliationId') params[field] = 'recon-2026-Q4';
        else body[field] = 'caf\u00e9-2026';
      }
      const acceptedShape = await invoke(request.method, request.path, body, params);
      assert.equal(acceptedShape.statusCode, 503, request.path);
      assert.equal(acceptedShape.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED');
    }
  });
  await test('all durable-store rejections are non-cacheable and never claim queued work', async () => {
    const cases = [
      ['POST', '/invoice-deliveries', invoice, {}],
      ['POST', '/invoice-exports', invoice, {}],
      ['POST', '/settlements/execute', {
        entityId: 'entity-test', paymentId: 'payment-test',
        settlementId: 'settlement-test', amount: 12.34,
      }, {}],
      ['POST', '/reconciliations/:reconciliationId/statement-import', {
        bankAccountId: 'bank-test', statementEndingBalance: 12.34,
      }, { reconciliationId: 'recon-test' }],
      ['POST', '/reconciliations/:reconciliationId/close', {},
        { reconciliationId: 'recon-test' }],
    ];
    for (const [method, path, body, params] of cases) {
      const response = await invoke(method, path, body, params);
      assert.equal(response.statusCode, 503, path);
      assert.equal(response.headers['cache-control'], 'no-store', path);
      assert.equal(response.body.success, false, path);
      assert.equal(response.body.code, 'ERP_DURABLE_JOB_STORE_REQUIRED', path);
      for (const key of ['job', 'importJob', 'closeJob', 'execution']) {
        assert.equal(response.body[key], undefined, path + ': ' + key);
      }
    }
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
