import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

const pending = (workspace) => ({
  status: 'pending-gsi',
  googleAttemptId: 'test-attempt',
  workspace,
});
const advance = (snapshot) => ({ ...snapshot, status: 'pending-drive-check' });

test('oversized workspace property names fail closed before reducer invocation', () => {
  const current = pending({ ['k'.repeat(16385)]: 'small' });
  let called = false;
  assert.equal(admitGoogleAttemptResult(current, 'test-attempt', (snapshot) => {
    called = true;
    return advance(snapshot);
  }), current);
  assert.equal(called, false);
});

test('aggregate property-name budget applies across nested workspace records', () => {
  const workspace = {};
  for (let i = 0; i < 70; i++) {
    workspace['k'.repeat(16000) + String(i).padStart(3, '0')] = i;
  }
  const current = pending(workspace);
  let called = false;
  assert.equal(admitGoogleAttemptResult(current, 'test-attempt', (snapshot) => {
    called = true;
    return advance(snapshot);
  }), current);
  assert.equal(called, false);
});

test('normal workspace keys remain admissible and detached', () => {
  const current = pending({ owner: { name: 'Test entity' } });
  const admitted = admitGoogleAttemptResult(current, 'test-attempt', advance);
  assert.equal(admitted.status, 'pending-drive-check');
  assert.equal(admitted.workspace.owner.name, 'Test entity');
  assert.notEqual(admitted.workspace, current.workspace);
});
