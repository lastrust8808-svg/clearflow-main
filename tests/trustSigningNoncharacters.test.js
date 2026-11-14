import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTrustDocumentSigningPacket } from '../server/services/trustDocumentSigningEvidence.js';

test('signing scope rejects reserved Unicode noncharacters before reading evidence', () => {
  const invalid = [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF];
  for (const point of invalid) {
    const value = 'tenant-' + String.fromCodePoint(point);
    const packet = {
      tenantId: value, entityId: 'entity-a', trustId: 'trust-a',
      documentId: 'doc-a', versionId: 'version-a',
      finalizedAt: '2026-10-28T09:00:00.000Z',
      evaluatedAt: '2026-10-29T09:00:00.000Z',
      content: Buffer.from('finalized'), governance: null,
      versionRegistry: null, attestations: [],
    };
    assert.throws(() => assessTrustDocumentSigningPacket(packet),
      /tenantId.*Unicode noncharacters/, 'U+' + point.toString(16));
  }
});
