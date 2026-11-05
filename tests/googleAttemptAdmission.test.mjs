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


test('malformed and cross-attempt reducer results fail closed', () => {
  const current = pending('attempt-B');
  for (const result of [null, undefined, false, [], { status: 'authenticated' },
    { ...current, googleAttemptId: 'attempt-A', status: 'authenticated' }]) {
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => result), current);
  }
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance).googleAttemptId, 'attempt-B');
});


test('throwing admission reducers cannot mutate or reject the current attempt', () => {
  const current = pending('attempt-B');
  const thrown = new Error('simulated asynchronous admission failure');
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => { throw thrown; }), current);
  assert.equal(current.status, 'pending-gsi');
  assert.equal(current.token, null);
  // Stale callbacks never invoke the reducer at all.
  let called = false;
  assert.equal(admitGoogleAttemptResult(current, 'attempt-A', () => {
    called = true;
    throw thrown;
  }), current);
  assert.equal(called, false);
});

test('async reducers and statusless results cannot be admitted as authenticated sessions', () => {
  const current = pending('attempt-B');
  for (const result of [
    Promise.resolve({ ...current, status: 'authenticated' }),
    { ...current, status: undefined },
    { ...current, status: '' },
    { ...current, status: 123 },
  ]) {
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => result), current);
  }
  assert.equal(current.status, 'pending-gsi');
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance).status, 'pending-drive-check');
});

test('throwing result accessors fail closed without crashing OAuth callbacks', () => {
  const current = pending('attempt-B');
  for (const key of ['then', 'status', 'googleAttemptId']) {
    const hostile = { status: 'authenticated', googleAttemptId: 'attempt-B' };
    Object.defineProperty(hostile, key, {
      get() { throw new Error('simulated hostile ' + key + ' getter'); },
    });
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => hostile), current);
  }
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance).status, 'pending-drive-check');
});

test('throwing current-state accessors fail closed before invoking reducers', () => {
  for (const key of ['status', 'googleAttemptId']) {
    const hostile = { status: 'pending-gsi', googleAttemptId: 'attempt-B' };
    Object.defineProperty(hostile, key, {
      get() { throw new Error('simulated hostile current ' + key + ' getter'); },
    });
    let called = false;
    assert.equal(isCurrentGoogleAttempt(hostile, 'attempt-B'), false);
    assert.equal(admitGoogleAttemptResult(hostile, 'attempt-B', () => {
      called = true;
      return { status: 'authenticated', googleAttemptId: 'attempt-B' };
    }), hostile);
    assert.equal(called, false);
  }
  assert.equal(admitGoogleAttemptResult(pending('attempt-B'), 'attempt-B', advance).status, 'pending-drive-check');
});

test('blank-only OAuth attempt identities never admit a callback', () => {
  for (const id of [' ', '\t', '\n', '\u00a0', '\u2003']) {
    const current = pending(id);
    let called = false;
    assert.equal(isCurrentGoogleAttempt(current, id), false);
    assert.equal(admitGoogleAttemptResult(current, id, () => {
      called = true;
      return { status: 'authenticated', googleAttemptId: id };
    }), current);
    assert.equal(called, false);
  }
  assert.equal(admitGoogleAttemptResult(pending('attempt-B'), 'attempt-B', advance).status, 'pending-drive-check');
});
