/**
 * A callback may advance only the OAuth attempt that initiated it.
 * These guards do not validate Google tokens or replace provider-side state
 * verification. They prevent an older asynchronous result from mutating a
 * newer UI attempt after a retry, cancellation or timeout.
 */
export function isCurrentGoogleAttempt(current, attemptId, expectedStatus = 'pending-gsi') {
  return Boolean(
    current &&
    current.status === expectedStatus &&
    typeof attemptId === 'string' &&
    attemptId.length > 0 &&
    typeof current.googleAttemptId === 'string' &&
    current.googleAttemptId === attemptId
  );
}

export function admitGoogleAttemptResult(current, attemptId, reducer, expectedStatus = 'pending-gsi') {
  if (!isCurrentGoogleAttempt(current, attemptId, expectedStatus)) return current;
  return reducer(current);
}
