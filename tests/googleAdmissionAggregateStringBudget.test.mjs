import test from 'node:test';
import assert from 'node:assert/strict';
import { admitGoogleAttemptResult } from '../src/domain/googleAttemptAdmission.mjs';

const attemptId = 'aggregate-string-budget';
const current = { status: 'pending-gsi', googleAttemptId: attemptId };
const admit = (payload) => admitGoogleAttemptResult(current, attemptId, (snapshot) => ({
  ...snapshot, status: 'pending-drive-check', workspace: payload,
}));

test('OAuth admission rejects aggregate strings over 1 Mi UTF-16 units', () => {
  const result = admit({ first: 'a'.repeat(600000), second: 'b'.repeat(500000) });
  assert.equal(result, current, 'oversized aggregate must not advance authentication');
});

test('OAuth admission permits bounded aggregate string data', () => {
  const result = admit({ first: 'a'.repeat(400000), second: 'b'.repeat(400000) });
  assert.notEqual(result, current);
  assert.equal(result.status, 'pending-drive-check');
  assert.equal(result.workspace.first.length, 400000);
});

test('OAuth admission counts nested strings toward the same budget', () => {
  const result = admit({ items: [{ value: 'a'.repeat(500000) }, { value: 'b'.repeat(600000) }] });
  assert.equal(result, current);
});
