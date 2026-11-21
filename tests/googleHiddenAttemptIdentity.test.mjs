import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentGoogleAttempt, admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

test('hidden OAuth attempt identity fields cannot authorize callback advancement', () => {
  for (const field of ['status', 'googleAttemptId']) {
    const current = { status: 'pending-gsi', googleAttemptId: 'attempt-B', token: null };
    Object.defineProperty(current, field, {
      value: current[field],
      enumerable: false,
      configurable: true,
    });
    let reducerCalled = false;
    assert.equal(isCurrentGoogleAttempt(current, 'attempt-B'), false);
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => {
      reducerCalled = true;
      return { status: 'authenticated', googleAttemptId: 'attempt-B' };
    }), current);
    assert.equal(reducerCalled, false);
    assert.equal(current.token, null);
  }
  const visible = { status: 'pending-gsi', googleAttemptId: 'attempt-B' };
  assert.equal(isCurrentGoogleAttempt(visible, 'attempt-B'), true);
});
