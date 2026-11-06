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


test('invisible control and formatting characters cannot identify an OAuth attempt', () => {
  for (const id of ['attempt-\u200bB', 'attempt-\u202eB', 'attempt-\u0000B', 'attempt-\u2028B', 'attempt-\ud800B']) {
    const current = pending(id);
    let invoked = false;
    assert.equal(isCurrentGoogleAttempt(current, id), false);
    assert.equal(admitGoogleAttemptResult(current, id, () => {
      invoked = true;
      return { status: 'authenticated', googleAttemptId: id };
    }), current);
    assert.equal(invoked, false);
  }
  assert.equal(admitGoogleAttemptResult(pending('attempt-B'), 'attempt-B', advance).status, 'pending-drive-check');
});

test('inherited and accessor-backed OAuth identity results fail closed', () => {
  const current = pending('attempt-B');
  const inherited = Object.create({ googleAttemptId: 'attempt-B' });
  inherited.status = 'authenticated';
  const inheritedStatus = Object.create({ status: 'authenticated' });
  inheritedStatus.googleAttemptId = 'attempt-B';
  const accessor = { status: 'authenticated' };
  Object.defineProperty(accessor, 'googleAttemptId', {
    enumerable: true,
    get() { return 'attempt-B'; },
  });
  const accessorStatus = { googleAttemptId: 'attempt-B' };
  Object.defineProperty(accessorStatus, 'status', {
    enumerable: true,
    get() { return 'authenticated'; },
  });
  for (const result of [inherited, inheritedStatus, accessor, accessorStatus]) {
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => result), current);
  }
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance).status, 'pending-drive-check');
});

test('inherited and accessor-backed active OAuth identities cannot admit callbacks', () => {
  const inheritedId = Object.create({ googleAttemptId: 'attempt-B' });
  inheritedId.status = 'pending-gsi';
  const inheritedStatus = Object.create({ status: 'pending-gsi' });
  inheritedStatus.googleAttemptId = 'attempt-B';
  const accessorId = { status: 'pending-gsi' };
  Object.defineProperty(accessorId, 'googleAttemptId', {
    enumerable: true, get() { return 'attempt-B'; },
  });
  const accessorStatus = { googleAttemptId: 'attempt-B' };
  Object.defineProperty(accessorStatus, 'status', {
    enumerable: true, get() { return 'pending-gsi'; },
  });
  for (const current of [inheritedId, inheritedStatus, accessorId, accessorStatus]) {
    let called = false;
    assert.equal(isCurrentGoogleAttempt(current, 'attempt-B'), false);
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => {
      called = true;
      return { status: 'authenticated', googleAttemptId: 'attempt-B' };
    }), current);
    assert.equal(called, false);
  }
  assert.equal(admitGoogleAttemptResult(pending('attempt-B'), 'attempt-B', advance).status, 'pending-drive-check');
});

test('OAuth identity reads use own descriptors rather than contradictory Proxy get traps', () => {
  const current = new Proxy({ status: 'pending-gsi', googleAttemptId: 'attempt-B' }, {
    get(target, key, receiver) {
      if (key === 'googleAttemptId') return 'attempt-A';
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(isCurrentGoogleAttempt(current, 'attempt-B'), true);
  assert.equal(isCurrentGoogleAttempt(current, 'attempt-A'), false);

  const spoofedCurrent = new Proxy({ status: 'pending-gsi', googleAttemptId: 'attempt-A' }, {
    get(target, key, receiver) {
      if (key === 'googleAttemptId') return 'attempt-B';
      return Reflect.get(target, key, receiver);
    },
  });
  let called = false;
  assert.equal(admitGoogleAttemptResult(spoofedCurrent, 'attempt-B', () => {
    called = true;
    return { status: 'authenticated', googleAttemptId: 'attempt-B' };
  }), spoofedCurrent);
  assert.equal(called, false);

  const spoofedResult = new Proxy({ status: 'authenticated', googleAttemptId: 'attempt-A' }, {
    get(target, key, receiver) {
      if (key === 'googleAttemptId') return 'attempt-B';
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(admitGoogleAttemptResult(pending('attempt-B'), 'attempt-B', () => spoofedResult).status, 'pending-gsi');
  assert.equal(admitGoogleAttemptResult(pending('attempt-B'), 'attempt-B', advance).status, 'pending-drive-check');
});

test('caller-supplied expected status cannot reopen a completed OAuth session', () => {
  for (const status of ['authenticated', 'unauthenticated', 'pending-profile-setup']) {
    const current = Object.freeze({ status, googleAttemptId: 'attempt-B' });
    let called = false;
    assert.equal(isCurrentGoogleAttempt(current, 'attempt-B', status), false);
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => {
      called = true;
      return { ...current, status: 'authenticated' };
    }, status), current);
    assert.equal(called, false);
  }
  assert.equal(isCurrentGoogleAttempt(pending('attempt-B'), 'attempt-B'), true);
  assert.equal(isCurrentGoogleAttempt(
    { status: 'pending-drive-check', googleAttemptId: 'attempt-B' },
    'attempt-B', 'pending-drive-check'
  ), true);
});


test('OAuth admission never executes then accessors on reducer results', () => {
  const current = pending('attempt-B');
  let getterCalls = 0;
  const hostile = { status: 'authenticated', googleAttemptId: 'attempt-B' };
  Object.defineProperty(hostile, 'then', { get() { getterCalls++; return undefined; } });
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => hostile), current);
  assert.equal(getterCalls, 0);
  const inherited = Object.create({ get then() { getterCalls++; return undefined; } });
  inherited.status = 'authenticated';
  inherited.googleAttemptId = 'attempt-B';
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => inherited), current);
  assert.equal(getterCalls, 0);
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance).status, 'pending-drive-check');
});

test('embedded Unicode spaces cannot identify an OAuth attempt', () => {
  for (const id of ['attempt B', 'attempt\u00a0B', 'attempt\u2003B', 'attempt\u3000B']) {
    const current = pending(id);
    let invoked = false;
    assert.equal(isCurrentGoogleAttempt(current, id), false);
    assert.equal(admitGoogleAttemptResult(current, id, () => {
      invoked = true;
      return { status: 'authenticated', googleAttemptId: id };
    }), current);
    assert.equal(invoked, false);
  }
  assert.equal(isCurrentGoogleAttempt(pending('attempt-B'), 'attempt-B'), true);
});


test('oversized OAuth attempt identities cannot advance authentication', () => {
  for (const id of ['a'.repeat(129), 'a'.repeat(4096)]) {
    const current = pending(id);
    let called = false;
    assert.equal(isCurrentGoogleAttempt(current, id), false);
    assert.equal(admitGoogleAttemptResult(current, id, () => {
      called = true;
      return { status: 'authenticated', googleAttemptId: id };
    }), current);
    assert.equal(called, false);
  }
  assert.equal(isCurrentGoogleAttempt(pending('a'.repeat(128)), 'a'.repeat(128)), true);
});


test('non-NFC OAuth attempt identifiers cannot alias canonical attempt state', () => {
  const decomposed = 'cafe\u0301-attempt';
  const composed = decomposed.normalize('NFC');
  assert.notEqual(decomposed, composed);
  let called = false;
  const current = pending(decomposed);
  assert.equal(isCurrentGoogleAttempt(current, decomposed), false);
  assert.equal(admitGoogleAttemptResult(current, decomposed, () => {
    called = true;
    return { status: 'authenticated', googleAttemptId: decomposed };
  }), current);
  assert.equal(called, false);
  assert.equal(isCurrentGoogleAttempt(pending(composed), composed), true);
  assert.equal(admitGoogleAttemptResult(pending(composed), composed, advance).status, 'pending-drive-check');
});


test('unknown OAuth reducer statuses fail closed without changing the active attempt', () => {
  const current = pending('attempt-B');
  for (const status of ['verified', 'pending-payment', 'AUTHENTICATED', ' ', 'pending-gsi-extra']) {
    assert.equal(admitGoogleAttemptResult(current, 'attempt-B', () => ({
      ...current, status,
    })), current);
  }
  assert.equal(admitGoogleAttemptResult(current, 'attempt-B', advance).status, 'pending-drive-check');
});
