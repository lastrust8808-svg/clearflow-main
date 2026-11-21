import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// Symbol-keyed metadata must not be silently discarded from signing evidence.
// Fail before reading receipt values, even when the symbol carries a getter.
test('signing receipt arrays reject symbol-keyed metadata before receipt reads', () => {
  let receiptReads = 0;
  let symbolReads = 0;
  const receipts = new Proxy([null], {
    get(target, key, receiver) {
      if (key === '0') receiptReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  const marker = Symbol('unreviewed signing receipt metadata');
  Object.defineProperty(receipts, marker, {
    enumerable: true,
    get() { symbolReads++; throw new Error('symbol getter executed'); },
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
    /Signature attestations must contain only array indices/);
  assert.equal(receiptReads, 0);
  assert.equal(symbolReads, 0);
});
