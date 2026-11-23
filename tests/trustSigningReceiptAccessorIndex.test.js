import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// Indexed accessors must never execute during signing receipt admission.
test('signing receipts reject accessor-backed array slots before reading receipt values', () => {
  let getterCalls = 0;
  let indexReads = 0;
  const receipts = new Proxy([null], {
    get(target, key, receiver) {
      if (key === '0') indexReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  Object.defineProperty(receipts, '0', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls++;
      throw new Error('receipt accessor executed');
    },
  });
  const packet = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version',
    content: Buffer.from('finalized document'),
    finalizedAt: '2026-10-28T09:00:00.000Z',
    evaluatedAt: '2026-10-29T09:00:00.000Z',
    governance: {
      tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
      mode: 'independent', appointments: [],
    },
    versionRegistry: {}, attestations: receipts,
  };
  assert.throws(() => assessTrustDocumentSigningPacket(packet),
    /Signature attestations must contain enumerable data elements/);
  assert.equal(getterCalls, 0);
  assert.equal(indexReads, 0);
});
