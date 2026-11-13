import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

test('non-NFC workspace keys cannot be admitted from pending state or reducer output', () => {
  const id = 'attempt-B';
  const pending = { status: 'pending-gsi', googleAttemptId: id };
  const decomposed = 'cafe\u0301';
  const composed = decomposed.normalize('NFC');
  assert.notEqual(decomposed, composed);
  let called = false;
  const unsafe = { ...pending, workspaces: { [decomposed]: { id: 'one' } } };
  assert.equal(admitGoogleAttemptResult(unsafe, id, () => {
    called = true;
    return { ...pending, status: 'authenticated' };
  }), unsafe);
  assert.equal(called, false);
  assert.equal(admitGoogleAttemptResult(pending, id, () => ({
    ...pending, status: 'authenticated', workspaces: { [decomposed]: { id: 'one' } },
  })), pending);
  const accepted = admitGoogleAttemptResult(pending, id, () => ({
    ...pending, status: 'pending-drive-check', workspaces: { [composed]: { id: 'one' } },
  }));
  assert.equal(accepted.status, 'pending-drive-check');
  assert.equal(accepted.workspaces[composed].id, 'one');
});
