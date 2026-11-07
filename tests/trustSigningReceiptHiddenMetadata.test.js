import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// An apparently ordinary receipt array can carry a hidden own property.
// Reject it before consulting any receipt, including accessor-backed values.
test('signing receipt arrays reject non-enumerable metadata without executing getters', () => {
  let receiptReads = 0;
  let metadataReads = 0;
  const receipts = new Proxy([null], {
    get(target, key, receiver) {
      if (key === '0') receiptReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  Object.defineProperty(receipts, 'hiddenReceiptAuthority', {
    configurable: true,
    enumerable: false,
    get() { metadataReads++; throw new Error('hidden getter executed'); },
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
  assert.equal(metadataReads, 0);
});
