import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

test('OAuth workspace admission refuses non-enumerable array elements before reducer execution', () => {
  const workspace = [{ id: 'owner', role: 'admin' }];
  Object.defineProperty(workspace, '0', {
    value: workspace[0], enumerable: false, configurable: true, writable: true,
  });
  const current = {
    status: 'pending-gsi',
    googleAttemptId: 'attempt-B',
    workspaces: workspace,
  };
  let called = false;
  const result = admitGoogleAttemptResult(current, 'attempt-B', () => {
    called = true;
    return { ...current, status: 'authenticated' };
  });
  assert.equal(result, current);
  assert.equal(called, false);
  assert.equal(current.status, 'pending-gsi');

  const ordinary = {
    ...current,
    workspaces: [{ id: 'owner', role: 'admin' }],
  };
  const accepted = admitGoogleAttemptResult(ordinary, 'attempt-B', snapshot => ({
    ...snapshot, status: 'pending-drive-check',
  }));
  assert.equal(accepted.status, 'pending-drive-check');
  assert.deepEqual(accepted.workspaces.map(item => item.id), ['owner']);
});
