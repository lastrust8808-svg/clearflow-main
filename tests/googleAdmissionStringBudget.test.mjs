import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

test('oversized workspace values fail closed before reducer execution', () => {
  const current = {
    status: 'pending-gsi', googleAttemptId: 'bounded-attempt',
    workspace: { description: 'x'.repeat(1048577) },
  };
  let invoked = false;
  assert.equal(admitGoogleAttemptResult(current, 'bounded-attempt', () => {
    invoked = true;
    return { ...current, status: 'authenticated' };
  }), current);
  assert.equal(invoked, false);
});

test('oversized reducer results cannot advance authenticated state', () => {
  const current = { status: 'pending-gsi', googleAttemptId: 'bounded-attempt' };
  const rejected = admitGoogleAttemptResult(current, 'bounded-attempt', () => ({
    ...current, status: 'authenticated', workspace: { description: 'x'.repeat(1048577) },
  }));
  assert.equal(rejected, current);
  const admitted = admitGoogleAttemptResult(current, 'bounded-attempt', () => ({
    ...current, status: 'pending-drive-check',
    workspace: { description: 'x'.repeat(1048576) },
  }));
  assert.equal(admitted.status, 'pending-drive-check');
  assert.equal(admitted.workspace.description.length, 1048576);
});
