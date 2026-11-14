import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

test('signing packet rejects symbol-keyed accessor claims without invoking them', () => {
  let invoked = 0;
  const packet = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    documentId: 'document', versionId: 'version',
    content: Buffer.from('final'), finalizedAt: '2026-01-01T00:00:00.000Z',
    evaluatedAt: '2026-01-02T00:00:00.000Z',
    governance: {}, versionRegistry: {}, attestations: [],
  };
  Object.defineProperty(packet, Symbol('unreviewed-signature-claim'), {
    enumerable: false,
    get() { invoked++; throw new Error('untrusted symbol getter executed'); },
  });
  assert.throws(() => assessTrustDocumentSigningPacket(packet),
    /Signing packet contains unsupported fields/);
  assert.equal(invoked, 0);
});
