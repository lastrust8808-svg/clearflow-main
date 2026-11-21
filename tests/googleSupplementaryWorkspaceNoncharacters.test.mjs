import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

test('supplementary-plane noncharacter workspace keys fail closed before OAuth reducer admission', () => {
  const id = 'attempt-supplementary';
  const pending = { status: 'pending-gsi', googleAttemptId: id };
  for (const codePoint of [0x1fffe, 0x2ffff, 0x10ffff]) {
    const unsafeKey = 'workspace' + String.fromCodePoint(codePoint);
    const unsafePending = { ...pending, workspaces: { [unsafeKey]: { id: 'one' } } };
    let reducerCalled = false;
    assert.equal(admitGoogleAttemptResult(unsafePending, id, () => {
      reducerCalled = true;
      return { ...pending, status: 'authenticated' };
    }), unsafePending);
    assert.equal(reducerCalled, false);
    assert.equal(admitGoogleAttemptResult(pending, id, () => ({
      ...pending, status: 'authenticated', workspaces: { [unsafeKey]: { id: 'one' } },
    })), pending);
  }
  const safe = admitGoogleAttemptResult(pending, id, () => ({
    ...pending, status: 'pending-drive-check', workspaces: { 'workspace-1': { id: 'one' } },
  }));
  assert.equal(safe.status, 'pending-drive-check');
});
