import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

// This is an identifier admission gate, not signer authentication or receipt verification.
const packet = (tenantId) => ({
  tenantId, entityId: 'entity-a', trustId: 'trust-a',
  documentId: 'document-a', versionId: 'version-a',
  finalizedAt: '2026-10-28T09:00:00.000Z',
  evaluatedAt: '2026-10-29T09:00:00.000Z',
  content: Buffer.from('finalized'), governance: null,
  versionRegistry: null, attestations: [],
});

test('signing scope rejects Unicode whitespace before accessing untrusted governance', () => {
  for (const whitespace of ['\u00a0', '\u2003', '\u2028', '\u3000']) {
    let accessed = false;
    const input = packet('tenant' + whitespace + 'a');
    Object.defineProperty(input, 'governance', {
      enumerable: true, get() { accessed = true; throw new Error('untrusted governance read'); },
    });
    assert.throws(() => assessTrustDocumentSigningPacket(input),
      /Signing packet fields must be enumerable own data properties/);
    assert.equal(accessed, false);
    assert.throws(() => assessTrustDocumentSigningPacket(packet('tenant' + whitespace + 'a')),
      /tenantId.*whitespace/);
  }
});
