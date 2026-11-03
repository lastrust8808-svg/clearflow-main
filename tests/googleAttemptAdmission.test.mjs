import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult, isCurrentGoogleAttempt } from '../src/domain/googleAttemptAdmission.mjs';

const pending = (id) => Object.freeze({ status: 'pending-gsi', googleAttemptId: id, token: null });
const advance = (state) => ({ ...state, status: 'pending-drive-check', token: 'verified-test-token' });

test('only the matching pending attempt can advance', () => {
  const current = pending('attempt-B');
  assert.equal(isCurrentGoogleAttempt(current, 'attempt-A'), false);
  assert.equal(admitGoogleAttemptResult(current, 'attempt-A', advance), current);
  const next = admitGoogleAttemptResult(current, 'attempt-B', advance);
  assert.equal(next.status, 'pending-drive-check');
  assert.equal(next.token, 'verified-test-token');
  assert.equal(current.token, null);
});

test('stale failures cannot reject a newer attempt', () => {
  const current = pending('attempt-B');
  const reject = (state) => ({ ...state, status: 'unauthenticated' });
  assert.equal(admitGoogleAttemptResult(current, 'attempt-A', reject), current);
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', reject).status, 'unauthenticated');
});

test('timeout, logout, completion and missing attempt identities fail closed', () => {
  for (const status of ['unauthenticated', 'authenticated', 'pending-drive-check', 'pending-profile-setup']) {
    const current = Object.freeze({ ...pending('attempt-B'), status });
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance), current);
  }
  for (const id of [null, '', undefined, 'attempt-A']) {
    assert.equal(admitGoogleAttemptResult(pending('attempt-B'), id, advance).status, 'pending-gsi');
  }
  assert.equal(isCurrentGoogleAttempt({ status: 'pending-gsi' }, 'attempt-B'), false);
});

test('Drive-stage results require matching attempt and expected status', () => {
  const current = Object.freeze({ status: 'pending-drive-check', googleAttemptId: 'attempt-B' });
  assert.equal(admitGoogleAttemptResult(current, 'attempt-A', advance, 'pending-drive-check'), current);
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance, 'pending-drive-check').token, 'verified-test-token');
});
