import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult, isCurrentGoogleAttempt } from '../src/domain/googleAttemptAdmission.mjs';

test('default-ignorable OAuth attempt IDs cannot advance authentication', () => {
  for (const hidden of ['\u034f', '\ufe0f', '\u00ad', '\u2060']) {
    const id = 'attempt-' + hidden + 'B';
    const current = Object.freeze({ status: 'pending-gsi', googleAttemptId: id });
    let called = false;
    assert.equal(isCurrentGoogleAttempt(current, id), false, JSON.stringify(id));
    assert.equal(admitGoogleAttemptResult(current, id, () => {
      called = true;
      return { status: 'authenticated', googleAttemptId: id };
    }), current);
    assert.equal(called, false);
  }
  const id = 'attempt-B';
  assert.equal(isCurrentGoogleAttempt({ status: 'pending-gsi', googleAttemptId: id }, id), true);
});
