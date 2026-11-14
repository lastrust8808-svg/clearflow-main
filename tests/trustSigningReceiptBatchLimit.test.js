import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// A forged Proxy length must not permit an oversized receipt batch to pass
// structural admission, nor should receipt index getters execute.
test('oversized signing receipt list fails before reading any receipt', () => {
  let reads = 0;
  const receipts = Array(10_001).fill(null);
  const malicious = new Proxy(receipts, {
    get(target, key, receiver) {
      if (key === 'length') return 1;
      if (key === '0') reads++;
      return Reflect.get(target, key, receiver);
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
    versionRegistry: {}, attestations: malicious,
  };
  assert.throws(() => assessTrustDocumentSigningPacket(packet),
    /Signature attestations exceed the 10000-record review limit/);
  assert.equal(reads, 0);
});
