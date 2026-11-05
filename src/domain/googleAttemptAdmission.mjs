/**
 * A callback may advance only the OAuth attempt that initiated it.
 * These guards do not validate Google tokens or replace provider-side state
 * verification. They prevent an older asynchronous result from mutating a
 * newer UI attempt after a retry, cancellation or timeout.
 */
export function isCurrentGoogleAttempt(current, attemptId, expectedStatus = 'pending-gsi') {
  // A malformed or proxied state can throw while its fields are read.
  // Never let that exception advance or crash an OAuth callback.
  try {
    return Boolean(
      current &&
      current.status === expectedStatus &&
      typeof attemptId === 'string' &&
      attemptId.length > 0 &&
      typeof current.googleAttemptId === 'string' &&
      current.googleAttemptId === attemptId
    );
  } catch {
    return false;
  }
}

export function admitGoogleAttemptResult(current, attemptId, reducer, expectedStatus = 'pending-gsi') {
  if (!isCurrentGoogleAttempt(current, attemptId, expectedStatus)) return current;
  // A reducer must preserve the originating attempt identity. Refuse malformed
  // or cross-attempt results rather than committing an ambiguous auth state.
  // A failed asynchronous admission reducer must not crash the callback path
  // or replace the active attempt with a partial authentication result.
  let next;
  try {
    next = reducer(current);
  } catch {
    return current;
  }
  // Accessors on untrusted reducer results can throw during validation.
  // Keep admission fail-closed even when a property getter is hostile.
  try {
    if (!next || typeof next !== 'object' || Array.isArray(next) ||
        typeof next.then === 'function' ||
        typeof next.status !== 'string' || !next.status ||
        next.googleAttemptId !== attemptId) return current;
  } catch {
    return current;
  }
  return next;
}
