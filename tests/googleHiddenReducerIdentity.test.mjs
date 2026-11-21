import test from 'node:test';
import assert from 'node:assert/strict';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

test('hidden reducer identity fields cannot silently disappear during OAuth state persistence', () => {
  for (const field of ['status', 'googleAttemptId']) {
    const current = { status: 'pending-gsi', googleAttemptId: 'attempt-visible' };
    const result = { status: 'authenticated', googleAttemptId: 'attempt-visible', profile: { name: 'Tester' } };
    Object.defineProperty(result, field, { value: result[field], enumerable: false, configurable: true });
    assert.equal(admitGoogleAttemptResult(current, 'attempt-visible', () => result), current);
    assert.equal(current.status, 'pending-gsi');
  }
});

test('visible reducer identity fields remain admissible', () => {
  const current = { status: 'pending-gsi', googleAttemptId: 'attempt-visible' };
  const admitted = admitGoogleAttemptResult(current, 'attempt-visible', () => ({
    status: 'authenticated', googleAttemptId: 'attempt-visible', profile: { name: 'Tester' },
  }));
  assert.notEqual(admitted, current);
  assert.equal(admitted.status, 'authenticated');
});
