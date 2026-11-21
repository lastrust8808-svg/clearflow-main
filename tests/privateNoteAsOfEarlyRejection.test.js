import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = {
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a',
};

test('invalid as-of timestamp rejects before reading hostile journal proxy metadata', () => {
  let traps = 0;
  const events = new Proxy([], {
    getPrototypeOf() { traps++; throw new Error('history prototype inspected'); },
    getOwnPropertyDescriptor() { traps++; throw new Error('history descriptor inspected'); },
    ownKeys() { traps++; throw new Error('history keys inspected'); },
  });
  assert.throws(
    () => projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-11-15', events }),
    /asOfAt must be a canonical UTC ISO timestamp/,
  );
  assert.equal(traps, 0);
});

test('invalid as-of rejects before touching history with accessor-backed elements', () => {
  let reads = 0;
  const events = [null];
  Object.defineProperty(events, '0', {
    enumerable: true, configurable: true,
    get() { reads++; throw new Error('history accessor executed'); },
  });
  assert.throws(
    () => projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-02-30T00:00:00.000Z', events }),
    /asOfAt must be a canonical UTC ISO timestamp/,
  );
  assert.equal(reads, 0);
});

test('valid empty snapshot still projects a draft lifecycle', () => {
  assert.deepEqual(
    projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-11-15T12:00:00.000Z', events: [] }),
    { status: 'draft', eventCount: 0, lastEventId: null, lastEventAt: null },
  );
});
